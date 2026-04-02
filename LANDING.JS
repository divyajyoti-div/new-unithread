/* ═══════════════════════════════════════════════════════════════
   UNITHREAD — landing.js  (OTP Auth Edition)
═══════════════════════════════════════════════════════════════ */
"use strict";

/* ── Config ──────────────────────────────────────────────────── */
const _cfg = window.__UNITHREAD_CONFIG__ || {};
const SUPABASE_URL  = _cfg.supabaseUrl  || "";
const SUPABASE_ANON = _cfg.supabaseAnon || "";
const SUPABASE_READY = !!(
  _cfg.configured &&
  SUPABASE_URL  && !SUPABASE_URL.includes("YOUR_") &&
  SUPABASE_ANON && !SUPABASE_ANON.includes("YOUR_") &&
  SUPABASE_URL.startsWith("https://")
);

const IS_LIVE_SERVER = [5500,5501,5502,5503].includes(+location.port);
const FEED_URL = "feed.html";

/* Only init Supabase client if credentials are present */
let db = null;
try {
  if (SUPABASE_READY) {
    db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: { persistSession: true, storageKey: "unithread-session" }
    });
  }
} catch (e) {
  console.warn("Supabase client init failed:", e.message);
}

/* ── DOM helper ──────────────────────────────────────────────── */
const $ = id => document.getElementById(id);

/* ── State ───────────────────────────────────────────────────── */
let timerInterval = null;
let resendTimer   = null;
let currentEmail  = "";
let currentRegNo  = "";

/* ═══════════════════════════════════════════════════════════════
   MODAL
═══════════════════════════════════════════════════════════════ */
function openModal() {
  const backdrop = $("authModalBackdrop");
  if (!backdrop) { console.error("Modal backdrop not found"); return; }
  backdrop.classList.add("open");
  document.body.style.overflow = "hidden";
  goToStep(1);
  // Focus first input after animation
  setTimeout(() => $("authEmail")?.focus(), 300);
}

function closeModal() {
  $("authModalBackdrop")?.classList.remove("open");
  document.body.style.overflow = "";
  clearTimers();
}

/* ═══════════════════════════════════════════════════════════════
   STEP NAVIGATION
═══════════════════════════════════════════════════════════════ */
function goToStep(n) {
  $("step1Panel").style.display = n === 1 ? "block" : "none";
  $("step2Panel").style.display = n === 2 ? "block" : "none";
  $("step3Panel").style.display = n === 3 ? "block" : "none";

  [1,2,3].forEach(i => {
    const dot = $(`stepDot${i}`);
    if (!dot) return;
    dot.classList.toggle("active", i === n);
    dot.classList.toggle("done",   i < n);
  });
  [1,2].forEach(i => {
    $(`stepLine${i}`)?.classList.toggle("done", i < n);
  });
}

/* ═══════════════════════════════════════════════════════════════
   STEP 1 — SEND OTP
═══════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════
   STEP 1 — SEND OTP (WITH WAITLIST LOGIC)
═══════════════════════════════════════════════════════════════ */
async function handleSendOtp() {
  const email = ($("authEmail")?.value || "").trim().toLowerCase();
  const regNo = ($("authRegNo")?.value || "").trim();
  const name = ($("authName")?.value || "").trim();
  const course = $("authCourse")?.value || "";
  const year = $("authYear")?.value || "";

  setError("step1Error", "");

  if (!email)               { setError("step1Error", "Please enter your email address."); return; }
  if (!email.includes("@")) { setError("step1Error", "Please enter a valid email address."); return; }
  if (!regNo)               { setError("step1Error", "Please enter your registration number."); return; }

  setLoading("sendOtpBtn", true);

  try {
    // 🚨 1. THE GATEKEEPER & WAITLIST LOGIC 🚨
    if (db) {
      const { data: student, error: fetchError } = await db
        .from('allowed_students')
        .select('*')
        .eq('email', email)
        .eq('reg_no', regNo)
        .maybeSingle();

      if (fetchError) throw fetchError;

      // SCENARIO A: Student is NOT in database -> Add to Waitlist!
      if (!student) {
        // Force them to fill out the extra fields if they are new
        if (!name || !course || !year) {
          setLoading("sendOtpBtn", false);
          setError("step1Error", "⚠️ New Registration: Please fill out your Name, Course, and Year.");
          return;
        }

        const { error: insertError } = await db.from('allowed_students').insert([{
          email: email,
          reg_no: regNo,
          name: name,
          course: course,
          year: year,
          is_approved: false // Pending Admin Approval
        }]);
        
        if (insertError) throw insertError;

        setLoading("sendOtpBtn", false);
        closeModal();
        showToast("success", "📝 Access request sent! Please wait for an Admin to approve you.", 8000);
        
        // Clear the form
        $("authEmail").value = ""; $("authRegNo").value = ""; $("authName").value = ""; 
        $("authCourse").value = ""; $("authYear").value = "";
        return; 
      }

      // SCENARIO B: Student IS in database, but Admin hasn't approved them yet
      // ... (Keep the rest of your existing function exactly the same from here down!)

      // SCENARIO B: Student IS in database, but Admin hasn't approved them yet
      if (student.is_approved === false) {
        setLoading("sendOtpBtn", false);
        setError("step1Error", "⏳ Your account is pending Admin approval. Check back later!");
        return;
      }
    }

    // 🚨 2. SCENARIO C: Student IS approved -> Send the OTP! 🚨
    const res = await fetch("/api/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, regNo }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError("step1Error", data.error || "Something went wrong. Please try again.");
      setLoading("sendOtpBtn", false);
      return;
    }

    currentEmail = email;
    currentRegNo = regNo;

    if (data.demo) {
      showToast("info", `📧 Demo mode — OTP is: ${data.demoOtp}`, 8000);
    } else {
      showToast("success", `📧 OTP sent to ${email}! Check your inbox.`);
    }

    $("otpEmailDisplay").textContent = email;
    clearOtpBoxes();
    setLoading("sendOtpBtn", false);
    goToStep(2);
    startTimer(10 * 60);
    startResendTimer(60);

  } catch (err) {
    console.error("send-otp error:", err);
    setError("step1Error", "Could not verify identity. Please try again.");
    setLoading("sendOtpBtn", false);
  }
}

/* ═══════════════════════════════════════════════════════════════
   STEP 2 — VERIFY OTP
═══════════════════════════════════════════════════════════════ */
async function handleVerifyOtp() {
  const otp = getOtpValue();
  setError("step2Error", "");

  if (otp.length < 6) {
    setError("step2Error", "Please enter all 6 digits of your OTP.");
    shakeOtpBoxes();
    return;
  }

  setLoading("verifyOtpBtn", true);

  try {
    const res = await fetch("/api/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: currentEmail, otp, regNo: currentRegNo }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError("step2Error", data.error || "Invalid OTP. Please try again.");
      shakeOtpBoxes();
      setLoading("verifyOtpBtn", false);
      return;
    }

    clearTimers();
    setLoading("verifyOtpBtn", false);

    // Demo mode
    if (data.demo) {
      goToStep(3);
      $("welcomeMsg").textContent = "Welcome to UniThread!";
      $("sicName").textContent    = "Demo User";
      $("sicCourse").textContent  = "BCA";
      $("sicYear").textContent    = "3rd Year";
      $("sicRegNo").textContent   = currentRegNo || "DEMO";
      return;
    }

    // Set Supabase session
    if (data.session && db) {
      try {
        await db.auth.setSession({
          access_token:  data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      } catch (e) { console.warn("setSession error:", e); }
    }

    const s = data.student;
    goToStep(3);
    $("welcomeMsg").textContent = `Welcome, ${s.name || currentRegNo}!`;
    $("sicName").textContent    = s.name   || "—";
    $("sicCourse").textContent  = s.course || "—";
    $("sicYear").textContent    = s.year   || "—";
    $("sicRegNo").textContent   = s.reg_no || currentRegNo;
    showToast("success", "🎉 Access granted! Welcome to UniThread.");

  } catch (err) {
    console.error("verify-otp fetch error:", err);
    setError("step2Error", "Network error. Please try again.");
    setLoading("verifyOtpBtn", false);
  }
}

/* ═══════════════════════════════════════════════════════════════
   OTP BOX HELPERS
═══════════════════════════════════════════════════════════════ */
function getOtpValue() {
  return ($("otpSingleInput")?.value || "").replace(/\D/g, "").slice(0, 6);
}

function clearOtpBoxes() {
  const inp = $("otpSingleInput");
  if (inp) { inp.value = ""; inp.classList.remove("error"); }
  setTimeout(() => inp?.focus(), 100);
}

function shakeOtpBoxes() {
  const inp = $("otpSingleInput");
  if (!inp) return;
  inp.classList.add("error");
  setTimeout(() => inp.classList.remove("error"), 500);
}

function bindOtpBoxes() {
  const inp = $("otpSingleInput");
  if (!inp) return;

  inp.addEventListener("keypress", e => {
    if (!/[0-9]/.test(e.key)) e.preventDefault();
  });
  inp.addEventListener("input", () => {
    // Strip non-digits and cap at 6
    inp.value = inp.value.replace(/\D/g, "").slice(0, 6);
    if (inp.value.length === 6) setTimeout(handleVerifyOtp, 200);
  });
  inp.addEventListener("keydown", e => {
    if (e.key === "Enter") handleVerifyOtp();
  });
}

/* ═══════════════════════════════════════════════════════════════
   TIMER
═══════════════════════════════════════════════════════════════ */
function startTimer(seconds) {
  clearTimers();
  const el   = $("timerCount");
  const wrap = $("otpTimer");
  timerInterval = setInterval(() => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (el) el.textContent = `${m}:${String(s).padStart(2,"0")}`;
    if (seconds <= 60) wrap?.classList.add("expiring");
    if (seconds <= 0) {
      clearInterval(timerInterval);
      if (el) el.textContent = "Expired";
      setError("step2Error", "OTP has expired. Go back and request a new one.");
    }
    seconds--;
  }, 1000);
}

function startResendTimer(seconds) {
  const btn = $("resendOtpBtn");
  if (btn) btn.disabled = true;
  resendTimer = setInterval(() => {
    seconds--;
    if (seconds <= 0) { clearInterval(resendTimer); if (btn) btn.disabled = false; }
  }, 1000);
}

function clearTimers() {
  clearInterval(timerInterval);
  clearInterval(resendTimer);
  timerInterval = null;
  resendTimer   = null;
  $("otpTimer")?.classList.remove("expiring");
}

/* ═══════════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════════ */
function setError(id, msg) {
  const el = $(id);
  if (!el) return;
  el.textContent   = msg;
  el.style.display = msg ? "flex" : "none";
}

function setLoading(btnId, on) {
  const btn = $(btnId);
  if (!btn) return;
  btn.disabled = on;
  const lbl = btn.querySelector(".btn-label");
  const spn = btn.querySelector(".btn-spinner");
  if (lbl) lbl.style.opacity   = on ? "0" : "1";
  if (spn) spn.style.display   = on ? "inline-flex" : "none";
}

function showToast(type, msg, dur = 4000) {
  const icons = { success:"✅", error:"❌", info:"💡" };
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${icons[type]||"ℹ️"}</span><span>${msg}</span>`;
  $("toastContainer")?.appendChild(t);
  setTimeout(() => {
    t.classList.add("removing");
    t.addEventListener("animationend", () => t.remove(), { once: true });
  }, dur);
}

/* ═══════════════════════════════════════════════════════════════
   BOOT — bind everything first, then check session
═══════════════════════════════════════════════════════════════ */
function bindButtons() {
  /* Every button that should open the modal */
  ["navGetAccess","heroGetAccess","ctaGetAccess"].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener("click", openModal);
  });

  $("closeAuthModal")?.addEventListener("click", closeModal);
  $("authModalBackdrop")?.addEventListener("click", e => {
    if (e.target === $("authModalBackdrop")) closeModal();
  });

  $("sendOtpBtn")?.addEventListener("click", handleSendOtp);
  $("verifyOtpBtn")?.addEventListener("click", handleVerifyOtp);
  $("enterFeedBtn")?.addEventListener("click", () => { window.location.href = FEED_URL; });
  $("resendOtpBtn")?.addEventListener("click", handleSendOtp);
  $("backToStep1Btn")?.addEventListener("click", () => {
    clearTimers(); clearOtpBoxes(); setError("step2Error",""); goToStep(1);
  });

  ["authEmail","authRegNo"].forEach(id =>
    $(id)?.addEventListener("keydown", e => { if (e.key === "Enter") handleSendOtp(); })
  );

  document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
  bindOtpBoxes();
}

async function checkExistingSession() {
  if (!SUPABASE_READY || !db) return;
  try {
    const { data: { session } } = await db.auth.getSession();
    if (session) window.location.href = FEED_URL;
  } catch (e) {
    console.warn("Session check failed (non-fatal):", e.message);
    /* Don't crash — just stay on landing page */
  }
}

document.addEventListener("DOMContentLoaded", () => {
  /* 1. Bind all buttons FIRST — synchronous, always works */
  bindButtons();

  /* 2. Then async session check — if it crashes, buttons still work */
  checkExistingSession();
});