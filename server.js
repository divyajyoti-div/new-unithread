/* ═══════════════════════════════════════════════════════════════
   UNITHREAD — server.js  (OTP Auth Edition)
═══════════════════════════════════════════════════════════════ */
require("dotenv").config();
const express   = require("express");
const path      = require("path");
const fs        = require("fs");
const crypto    = require("crypto");
const nodemailer = require("nodemailer");
const { createClient } = require("@supabase/supabase-js");

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

/* ── Supabase clients ─────────────────────────────────────── */
const SUPABASE_URL      = process.env.SUPABASE_URL      || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";

const supabaseConfigured =
  SUPABASE_URL && SUPABASE_URL.startsWith("https://") &&
  SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes("your-anon") &&
  SUPABASE_SERVICE_KEY && !SUPABASE_SERVICE_KEY.includes("your-service");

// Public client (anon key) — for normal queries
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Admin client (service key) — bypasses RLS, for server-only operations
const adminDb = supabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : null;

if (!supabaseConfigured) {
  console.warn("\n⚠️  Supabase not fully configured. Check .env for SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY\n");
} else {
  console.log("✅  Supabase connected:", SUPABASE_URL);
}

/* ── Email transporter ────────────────────────────────────── */
const emailConfigured =
  process.env.SMTP_USER && !process.env.SMTP_USER.includes("your-email") &&
  process.env.SMTP_PASS && !process.env.SMTP_PASS.includes("your-app-password");

const transporter = emailConfigured
  ? nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,  // Gmail App Password (not your regular password)
      },
    })
  : null;

if (!emailConfigured) {
  console.warn("⚠️  SMTP not configured — OTPs will be printed to console instead of emailed.\n");
} else {
  console.log("✅  Email configured:", process.env.SMTP_USER);
}

/* ── Config injector ──────────────────────────────────────── */
function injectConfig(html) {
  const script = `<script>
  window.__UNITHREAD_CONFIG__ = {
    supabaseUrl:  ${JSON.stringify(supabaseConfigured ? SUPABASE_URL      : "")},
    supabaseAnon: ${JSON.stringify(supabaseConfigured ? SUPABASE_ANON_KEY : "")},
    configured:   ${supabaseConfigured}
  };
</script>`;
  return html.replace("</head>", script + "\n</head>");
}

function serveFile(filename, res) {
  const fp = path.join(__dirname, "public", filename);
  fs.readFile(fp, "utf8", (err, html) => {
    if (err) { console.error("Cannot read:", fp); return res.status(500).send("Cannot load " + filename); }
    res.setHeader("Content-Type", "text/html");
    res.send(injectConfig(html));
  });
}

/* ═══════════════════════════════════════════════════════════
   API — STEP 1: Verify student exists in allowed_students
═══════════════════════════════════════════════════════════ */
app.post("/api/send-otp", async (req, res) => {
  const { email, regNo } = req.body;

  if (!email || !regNo) {
    return res.status(400).json({ error: "Email and registration number are required." });
  }

  if (!adminDb) {
    /* ── DEMO MODE: skip DB check, always succeed ── */
    const demoOtp = "123456";
    console.log(`\n📧 DEMO MODE — OTP for ${email}: ${demoOtp}\n`);
    return res.json({ success: true, demo: true, demoOtp });
  }

  try {
    /* 1. Check allowed_students table */
    const { data: student, error: lookupErr } = await adminDb
      .from("allowed_students")
      .select("*")
      .eq("email", email.toLowerCase().trim())
      .eq("reg_no", regNo.trim())
      .single();

    if (lookupErr || !student) {
      return res.status(401).json({
        error: "No student found with this email and registration number. Please contact your administrator."
      });
    }

    /* 2. Generate 6-digit OTP */
    const otp      = String(Math.floor(100000 + Math.random() * 900000));
    const otpHash  = crypto.createHash("sha256").update(otp).digest("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    /* 3. Invalidate any existing OTPs for this email */
    await adminDb.from("otp_codes").update({ used: true }).eq("email", email.toLowerCase().trim()).eq("used", false);

    /* 4. Store new OTP */
    const { error: insertErr } = await adminDb.from("otp_codes").insert([{
      email: email.toLowerCase().trim(),
      otp_hash: otpHash,
      expires_at: expiresAt.toISOString(),
      used: false,
    }]);

    if (insertErr) throw insertErr;

    /* 5. Send email */
    if (transporter) {
      await transporter.sendMail({
        from: `"UniThread" <${process.env.SMTP_USER}>`,
        to: email,
        subject: "Your UniThread OTP Code",
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0d1221;color:#f0f4ff;padding:32px;border-radius:16px;border:1px solid #1a2640">
            <div style="text-align:center;margin-bottom:28px">
              <h1 style="font-size:1.6rem;margin:0">Uni<span style="color:#a78bfa">Thread</span></h1>
              <p style="color:#7588a8;margin-top:6px">Your Campus, Your Voice</p>
            </div>
            <p style="color:#c8d3eb;margin-bottom:20px">Hi <strong>${student.name || student.reg_no}</strong>,</p>
            <p style="color:#c8d3eb;margin-bottom:24px">Your one-time password is:</p>
            <div style="background:#111827;border:1px solid #243352;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
              <span style="font-size:2.5rem;font-weight:800;letter-spacing:12px;color:#a78bfa">${otp}</span>
            </div>
            <p style="color:#7588a8;font-size:0.85rem">This OTP expires in <strong style="color:#f0f4ff">10 minutes</strong>. Do not share it with anyone.</p>
            <p style="color:#334155;font-size:0.75rem;margin-top:24px;text-align:center">UniThread — ${student.course}, ${student.year}</p>
          </div>`,
      });
      console.log(`📧 OTP emailed to ${email}`);
    } else {
      /* No email setup — print to console for testing */
      console.log(`\n📧 OTP for ${email}: ${otp}\n`);
    }

    res.json({ success: true, studentName: student.name });

  } catch (err) {
    console.error("send-otp error:", err);
    res.status(500).json({ error: "Server error. Please try again." });
  }
});

/* ═══════════════════════════════════════════════════════════
   API — STEP 2: Verify OTP → create/login Supabase account
═══════════════════════════════════════════════════════════ */
app.post("/api/verify-otp", async (req, res) => {
  const { email, otp, regNo } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: "Email and OTP are required." });
  }

  if (!adminDb) {
    /* ── DEMO MODE ── */
    if (otp === "123456") {
      return res.json({
        success: true,
        student: { name: "Demo User", course: "BCA", year: "3rd Year", reg_no: regNo || "DEMO" },
        demo: true,
      });
    }
    return res.status(401).json({ error: "Wrong OTP. (Demo: use 123456)" });
  }

  try {
    const otpHash = crypto.createHash("sha256").update(otp.trim()).digest("hex");

    /* 1. Find valid OTP */
    const { data: otpRow, error: otpErr } = await adminDb
      .from("otp_codes")
      .select("*")
      .eq("email", email.toLowerCase().trim())
      .eq("otp_hash", otpHash)
      .eq("used", false)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (otpErr || !otpRow) {
      return res.status(401).json({ error: "Invalid or expired OTP. Please request a new one." });
    }

    /* 2. Mark OTP as used */
    await adminDb.from("otp_codes").update({ used: true }).eq("id", otpRow.id);

    /* 3. Get student data */
    const { data: student } = await adminDb
      .from("allowed_students")
      .select("*")
      .eq("email", email.toLowerCase().trim())
      .single();

    /* 4. Create Supabase auth user (or sign in if already exists) */
    const password = `UT_${otpHash.slice(0,16)}_${student.reg_no}`;  // deterministic strong password

    let session = null;

    // Try to sign in first
    const { data: signInData, error: signInErr } = await db.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password,
    });

    if (!signInErr && signInData?.session) {
      session = signInData.session;
    } else {
      // User doesn't exist yet — create them
      const { data: newUser, error: createErr } = await adminDb.auth.admin.createUser({
        email: email.toLowerCase().trim(),
        password,
        email_confirm: true,  // skip email verification
        user_metadata: { username: student.reg_no, course: student.course, year: student.year },
      });

      if (createErr) throw createErr;

      // Sign in the newly created user
      const { data: newSignIn, error: newSignInErr } = await db.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password,
      });

      if (newSignInErr) throw newSignInErr;
      session = newSignIn.session;

      // Upsert profile in public.users
      await adminDb.from("users").upsert({
        id: newUser.user.id,
        email: email.toLowerCase().trim(),
        username: student.reg_no,
        course: student.course,
        year: student.year,
        points: 0,
      });
    }

    res.json({
      success: true,
      session,
      student: { name: student.name, course: student.course, year: student.year, reg_no: student.reg_no },
    });

  } catch (err) {
    console.error("verify-otp error:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

/* ── HTML routes FIRST ────────────────────────────────────── */
app.get("/",        (req, res) => serveFile("landing.html", res));
app.get("/feed",    (req, res) => serveFile("index.html",   res));

/* ── Static files ─────────────────────────────────────────── */
app.use(express.static(path.join(__dirname, "public"), { index: false }));

/* ── 404 fallback ─────────────────────────────────────────── */
/* API routes that aren't found return JSON (not HTML redirect) */
app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "API route not found: " + req.path });
  }
  res.redirect("/");
});

app.listen(PORT, () => {
  console.log(`
🚀  UniThread running!
    Landing  → http://localhost:${PORT}/
    Feed     → http://localhost:${PORT}/feed
    API test → http://localhost:${PORT}/api/send-otp  (should return JSON)
  `);
});