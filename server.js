/* ═══════════════════════════════════════════════════════════════
   UNITHREAD — server.js  (Bulletproof Auth & Chat Edition)
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
        pass: process.env.SMTP_PASS,  // Gmail App Password
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
    /* ── DEMO MODE ── */
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
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    /* 3. Invalidate existing OTPs */
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
            </div>
            <p style="color:#c8d3eb;margin-bottom:20px">Hi <strong>${student.name || student.reg_no}</strong>,</p>
            <p style="color:#c8d3eb;margin-bottom:24px">Your one-time password is:</p>
            <div style="background:#111827;border:1px solid #243352;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
              <span style="font-size:2.5rem;font-weight:800;letter-spacing:12px;color:#a78bfa">${otp}</span>
            </div>
            <p style="color:#7588a8;font-size:0.85rem">This OTP expires in 10 minutes.</p>
          </div>`,
      });
      console.log(`📧 OTP emailed to ${email}`);
    } else {
      console.log(`\n📧 OTP for ${email}: ${otp}\n`);
    }

    res.json({ success: true, studentName: student.name });

  } catch (err) {
    console.error("send-otp error:", err);
    res.status(500).json({ error: "Server error. Please try again." });
  }
});

/* ═══════════════════════════════════════════════════════════
   API — STEP 2: Verify OTP & Auto-Heal Supabase Accounts
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

    /* 4. THE FIX: Create a STATIC deterministic password */
    const staticPassword = crypto
      .createHash("sha256")
      .update(email.toLowerCase().trim() + (process.env.SUPABASE_ANON_KEY || "fallback"))
      .digest("hex")
      .slice(0, 32);

    let session = null;

    // Try to sign in normally
    const { data: signInData, error: signInErr } = await db.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password: staticPassword,
    });

    if (signInErr) {
      // If login fails, check the Supabase Vault directly.
      const { data: listData } = await adminDb.auth.admin.listUsers();
      const existingUser = listData?.users?.find(u => u.email === email.toLowerCase().trim());

      if (existingUser) {
        // AUTO-HEAL: User exists but password was wrong. Force reset it.
        await adminDb.auth.admin.updateUserById(existingUser.id, { password: staticPassword });
        
        // Sign in again with the corrected password
        const { data: retrySignIn, error: retryErr } = await db.auth.signInWithPassword({
          email: email.toLowerCase().trim(),
          password: staticPassword,
        });
        if (retryErr) throw retryErr;
        session = retrySignIn.session;
      } else {
        // User truly does not exist. Safely create a brand new account.
        const { data: newUser, error: createErr } = await adminDb.auth.admin.createUser({
          email: email.toLowerCase().trim(),
          password: staticPassword,
          email_confirm: true,
          user_metadata: { username: student.reg_no, course: student.course, year: student.year },
        });
        if (createErr) throw createErr;

        // Sign the new user in
        const { data: newSignIn, error: newSignInErr } = await db.auth.signInWithPassword({
          email: email.toLowerCase().trim(),
          password: staticPassword,
        });
        if (newSignInErr) throw newSignInErr;
        session = newSignIn.session;

        // Create their public profile
        await adminDb.from("users").upsert({
          id: newUser.user.id,
          email: email.toLowerCase().trim(),
          username: student.reg_no,
          course: student.course,
          year: student.year,
          points: 0,
        });
      }
    } else {
      // Normal login succeeded!
      session = signInData.session;
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

/* ═══════════════════════════════════════════════════════════
   API — CHAT & PROFILES
═══════════════════════════════════════════════════════════ */

// 1. Get Public Profile (When you click a username)
app.get("/api/user/:username", async (req, res) => {
  if (!adminDb) return res.status(500).json({ error: "DB not connected" });
  try {
    const searchTerm = req.params.username;
    
    // Search by Reg No OR old Email Prefix
    const { data, error } = await adminDb
      .from("users")
      .select("id, username, course, year")
      .or(`username.eq.${searchTerm},email.ilike.${searchTerm}@%`)
      .limit(1);
      
    if (error || !data || data.length === 0) return res.status(404).json({ error: "User not found" });
    res.json({ success: true, user: data[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Start or Get a 1-on-1 Chat
app.post("/api/chat/start", async (req, res) => {
  const { myId, targetId } = req.body;
  if (!adminDb) return res.status(500).json({ error: "DB not connected" });

  try {
    const { data: myChats } = await adminDb.from("participants").select("conversation_id").eq("user_id", myId);
    const myChatIds = myChats.map(c => c.conversation_id);

    if (myChatIds.length > 0) {
      const { data: sharedChats } = await adminDb
        .from("participants")
        .select("conversation_id")
        .eq("user_id", targetId)
        .in("conversation_id", myChatIds);

      if (sharedChats && sharedChats.length > 0) {
        return res.json({ success: true, conversation_id: sharedChats[0].conversation_id });
      }
    }

    const { data: newChat, error: chatErr } = await adminDb.from("conversations").insert([{ is_group: false }]).select().single();
    if (chatErr) throw chatErr;

    await adminDb.from("participants").insert([
      { conversation_id: newChat.id, user_id: myId },
      { conversation_id: newChat.id, user_id: targetId }
    ]);

    res.json({ success: true, conversation_id: newChat.id });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ error: "Failed to start chat" });
  }
});

// 3. Create a Group Chat (Tracks Creator)
app.post("/api/chat/group", async (req, res) => {
  const { groupName, participantIds } = req.body; 
  if (!adminDb) return res.status(500).json({ error: "DB not connected" });

  try {
    const { data: newGroup, error: grpErr } = await adminDb
      .from("conversations")
      .insert([{ is_group: true, group_name: groupName, created_by: participantIds[0] }])
      .select()
      .single();
    
    if (grpErr) throw grpErr;

    const inserts = participantIds.map(id => ({ conversation_id: newGroup.id, user_id: id }));
    await adminDb.from("participants").insert(inserts);

    res.json({ success: true, conversation_id: newGroup.id });
  } catch (err) {
    res.status(500).json({ error: "Failed to create group" });
  }
});

// 4. Add Member to Group Chat
app.post("/api/chat/add-member", async (req, res) => {
  const { conversation_id, username } = req.body;
  if (!adminDb) return res.status(500).json({ error: "DB not connected" });

  try {
    const { data: user, error: userErr } = await adminDb
      .from("users")
      .select("id")
      .eq("username", username.trim())
      .single();

    if (userErr || !user) return res.status(404).json({ error: "User not found" });

    const { error: insertErr } = await adminDb
      .from("participants")
      .insert([{ conversation_id, user_id: user.id }]);

    if (insertErr && insertErr.code === '23505') {
      return res.status(400).json({ error: "User is already in this group!" });
    } else if (insertErr) throw insertErr;

    res.json({ success: true, message: "User added!" });
  } catch (err) {
    res.status(500).json({ error: "Failed to add user" });
  }
});

// 5. Delete Group (Protected by Admin check)
app.delete("/api/chat/group/:id", async (req, res) => {
  if (!adminDb) return res.status(500).json({ error: "DB not connected" });
  try {
    const { userId } = req.query; 
    
    const { data: convo } = await adminDb.from("conversations").select("created_by").eq("id", req.params.id).single();
    
    if (convo.created_by && convo.created_by !== userId) {
        return res.status(403).json({ error: "Only the group admin can delete this group." });
    }

    const { error } = await adminDb.from("conversations").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete group" });
  }
});

// 6. Update Group Avatar
app.patch("/api/chat/group/:id/avatar", async (req, res) => {
  if (!adminDb) return res.status(500).json({ error: "DB not connected" });
  try {
    const { avatarUrl } = req.body;
    const { error } = await adminDb.from("conversations").update({ group_avatar_url: avatarUrl }).eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to update avatar" });
  }
});

/* ═══════════════════════════════════════════════════════════
   API — ADMIN DASHBOARD
═══════════════════════════════════════════════════════════ */
// Helper to check if a user is an admin
async function checkAdmin(userId) {
  if (!userId || !adminDb) return false;
  const { data } = await adminDb.from("users").select("is_admin").eq("id", userId).single();
  return data?.is_admin === true;
}

// 1. Get All Users
app.get("/api/admin/users", async (req, res) => {
  if (!(await checkAdmin(req.query.userId))) return res.status(403).json({ error: "Unauthorized" });
  
  try {
    const { data, error } = await adminDb.from("users").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ success: true, users: data });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// 2. Delete a User
app.delete("/api/admin/users/:id", async (req, res) => {
  if (!(await checkAdmin(req.query.userId))) return res.status(403).json({ error: "Unauthorized" });

  try {
    // Deleting from auth.admin automatically cascades and deletes their profile, posts, and comments!
    const { error } = await adminDb.auth.admin.deleteUser(req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete user" });
  }
});
/* ── HTML routes ──────────────────────────────────────────── */
app.get("/",        (req, res) => serveFile("landing.html", res));
app.get("/feed",    (req, res) => serveFile("index.html",   res));

/* ── Static files ─────────────────────────────────────────── */
app.use(express.static(path.join(__dirname, "public"), { index: false }));

/* ── 404 fallback ─────────────────────────────────────────── */
app.use((req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "API route not found" });
  res.redirect("/");
});

app.listen(PORT, () => {
  console.log(`
🚀  UniThread running!
    Landing  → http://localhost:${PORT}/
    Feed     → http://localhost:${PORT}/feed
  `);
});
module.exports = app;