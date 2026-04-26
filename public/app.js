"use strict";
/* ─── Config injected by server.js ─── */
const _cfg = window.__UNITHREAD_CONFIG__ || {};
const SB_URL  ="https://fwskgymssszhoksjtpzk.supabase.co"
const SB_ANON ="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3c2tneW1zc3N6aG9rc2p0cHprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0OTQyODcsImV4cCI6MjA4OTA3MDI4N30.vuAuonWQnIaTrnUYQ9CSIzx-LrKqOH5ZxHtDZTA3rYA"
const SB_OK   = !!(
  _cfg.configured && SB_URL.startsWith("https://") &&
  !SB_URL.includes("YOUR_") && !SB_ANON.includes("YOUR_")
);
const IS_LIVE = [5500,5501,5502,5503].includes(+location.port);
const LAND = "/";

let db = null;
try {
  if (SB_OK) db = supabase.createClient(SB_URL, SB_ANON, {
    auth: { persistSession: true, storageKey: "unithread-session" }
  });
} catch(e) { console.warn("Supabase init failed", e); }

/* ─── Avatar ─── */
const AVATAR_STYLES = [
  {id:"avataaars",label:"Avataaars"},{id:"lorelei",label:"Lorelei"},
  {id:"adventurer",label:"Adventurer"},{id:"micah",label:"Micah"},
  {id:"bottts",label:"Bottts"},{id:"pixel-art",label:"Pixel Art"},
  {id:"fun-emoji",label:"Fun Emoji"},{id:"identicon",label:"Identicon"},
];
function mkAvatar(seed, style) {
  const s  = style || state.profile?.avatarStyle || "avataaars";
  const bg = state.profile?.avatarBg || "6366f1";
  return `https://api.dicebear.com/9.x/${s}/svg?seed=${encodeURIComponent(seed||"anon")}&backgroundColor=${bg}`;
}

/* ─── Mock data ─── */
const MOCK = [];
const MOCK_COMMENTS = [];

/* ─── State ─── */
const state = {
  posts:[], sort:"hot", category:"all", query:"",
  theme: localStorage.getItem("ut-theme") || "dark",
  usingMock: false,
  session: null, user: null, profile: null,
  votes: JSON.parse(localStorage.getItem("ut-votes") || "{}"),
  currentPost: null, comments: [], commentSort: "top", replyingTo: null,
  page: "feed",
};

const $ = id => document.getElementById(id);
const $$ = s => document.querySelectorAll(s);
function formatPostBody(rawText) {
    if (!rawText) return "";
    
    // 1. Protect against weird HTML injections (XSS) but keep line breaks
    let safeText = rawText.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    safeText = safeText.replace(/\n/g, "<br>");

    // 2. Translate [IMAGE:url] into actual HTML images!
    const htmlWithImages = safeText.replace(
        /\[IMAGE:(.*?)\]/g, 
        '<img src="$1" style="max-width: 100%; border-radius: 8px; margin-top: 15px; margin-bottom: 15px; display: block;">'
    );

    return htmlWithImages;
}
async function compressImage(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 1200; // Good balance for quality/size
                const scale = MAX_WIDTH / img.width;
                canvas.width = MAX_WIDTH;
                canvas.height = img.height * scale;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                
                canvas.toBlob((blob) => {
                    resolve(new File([blob], file.name, { type: 'image/jpeg' }));
                }, 'image/jpeg', 0.7); // 70% quality saves TONS of space
            };
        };
    });
}

/* ─── Pages ─── */
function showPage(p) {
  $("pageFeed").style.display    = p === "feed"    ? "block" : "none";
  $("pageDetail").style.display  = p === "detail"  ? "block" : "none";
  $("pageProfile").style.display = p === "profile" ? "block" : "none";
  $("pageCreate").style.display  = p === "create"  ? "block" : "none";
  const pa = $("pageAdmin"); if (pa) pa.style.display = p === "admin" ? "block" : "none";
  const pc = $("pageChat"); if (pc) pc.style.display = p === "chat" ? "flex" : "none";
  const pp = $("pagePublicProfile"); if (pp) pp.style.display = p === "publicProfile" ? "block" : "none";
  
  state.page = p;
  window.scrollTo(0, 0);
}
function showFeed()    { showPage("feed"); state.currentPost = null; }
function showProfile() { closeDrop(); showPage("profile"); fillProfile(); }

function showCreate() {
  closeDrop();
  showPage("create");
  initCreatePage();
}

async function showDetail(id) {
  const post = state.posts.find(p => p.id === id);
  if (!post) return;
  state.currentPost = post;
  showPage("detail");
  renderDetailPost(post);
  await loadComments(id);
}

/* ─── syncAuthUI ─── */
function syncAuthUI() {
  const on = !!state.session;
  const p  = state.profile;
  const u  = state.user;

  // 🚨 MASTER ADMIN OVERRIDE FOR YOUR EMAIL
  if (u?.email === "mishradivyajyoti178@gmail.com") {
    if (state.profile) state.profile.is_admin = true;
  }

  const un = p?.username || u?.email?.split("@")[0] || "user";
  const av = mkAvatar(un);

  const um = $("userMenu");
  const cb = $("btnCreate");
  const msgBtn = $("navMessagesBtnTop");
  
  if (um) um.style.display = on ? "flex" : "none";
  if (cb) cb.style.display = on ? "flex" : "none";
  if (msgBtn) msgBtn.style.display = on ? "flex" : "none";
  
  if (!on) return;

  const na = $("navAvatar");
  if (na) na.src = av;

  const setEl = (id, val) => {
    const el = $(id); if (!el) return;
    if (el.tagName === "IMG") el.src = val; else el.textContent = val;
  };

  setEl("pdropAvatar",  av);
  setEl("pdropName",    p?.display_name || un);
  
  // Hide the u/username handle completely
  const handleEl = $("pdropHandle");
  if (handleEl) handleEl.style.display = "none";
  
  setEl("pdropPoints",  (p?.points || 0).toLocaleString());
  setEl("pdropCourse",  p?.course || "—");
  setEl("pdropYear",    p?.year   || "—");

  const ab = $("btnAdminPanel");
  if (ab) {
    // Show if DB says admin OR if it's your hardcoded email
    ab.style.display = (p?.is_admin || u?.email === "mishradivyajyoti178@gmail.com") ? "flex" : "none";
  }

  const pa = $("postAsAvatar"); if (pa) pa.src = av;
  const pn = $("postAsName");   if (pn) pn.textContent = `u/${un}`;

  const ncb = $("newCommentBox");
  if (ncb) ncb.style.display = on ? "flex" : "none";
  const ca = $("composerAvatar");
  if (ca) ca.src = av;
  // Force the custom avatar to load if they have one!
  if (state.profile?.avatar_url) {
    if ($("pfAvatar")) $("pfAvatar").src = state.profile.avatar_url;
    if ($("navAvatar")) $("navAvatar").src = state.profile.avatar_url;
    if ($("pdropAvatar")) $("pdropAvatar").src = state.profile.avatar_url;
  }
  // 🚨 MASTER UI SYNC: FORCES YOUR UPLOADED PICTURE TO SHOW 🚨
  if (state.profile) {
    // 1. Check if an uploaded picture exists. If not, make a cartoon.
    const myAvatar = state.profile.avatar_url ? state.profile.avatar_url : mkAvatar(state.profile.username);
    
    // 2. Inject the picture into all 3 spots
    if ($("pfAvatar")) $("pfAvatar").src = myAvatar;
    if ($("navAvatar")) $("navAvatar").src = myAvatar;
    if ($("pdropAvatar")) $("pdropAvatar").src = myAvatar;

    // 3. Inject the Course and Year into the locked inputs
    if ($("pfCourse")) $("pfCourse").value = state.profile.course || "";
    if ($("pfYear")) $("pfYear").value = state.profile.year || "";
    if ($("pfDisplayName")) $("pfDisplayName").value = state.profile.display_name || state.profile.username;
  }
}

/* ─── Profile page ─── */
function fillProfile() {
  const p  = state.profile;
  const u  = state.user;
  const un = p?.username || u?.email?.split("@")[0] || "user";
  // NEW: Check if an uploaded picture exists. If not, use the cartoon.
  const av = p?.avatar_url ? p.avatar_url : mkAvatar(un);
  const joined = p?.joined_at
    ? new Date(p.joined_at).toLocaleDateString("en-IN", {month:"short", year:"numeric"})
    : "—";

  const set = (id, val, isSrc) => {
    const el = $(id); if (!el) return;
    if (isSrc) el.src = val; else el.textContent = val;
  };
  set("pfAvatar",  av,  true);
  set("pfUsername", `u/${un}`);
  set("pfEmail",   u?.email || "—");
  set("pfPoints",  (p?.points || 0).toLocaleString());
  set("pfPostsN",  state.posts.filter(x => x.author === un).length);
  set("pfJoined",  joined);

  const pfDN = $("pfDisplayName"); if (pfDN) pfDN.value = p?.display_name || un;
  const pfCo = $("pfCourse");      if (pfCo) pfCo.value = p?.course || "";
  const pfYr = $("pfYear");        if (pfYr) pfYr.value = p?.year   || "";
  const pfEF = $("pfEmailField");  if (pfEF) pfEF.value = u?.email  || "";

  buildAvPicker(un);
}

function buildAvPicker(seed) {
  const grid = $("pfAvGrid"); if (!grid) return;
  const cur  = state.profile?.avatarStyle || "avataaars";
  grid.innerHTML = AVATAR_STYLES.map(s => `
    <button class="pf-av-opt ${s.id === cur ? "pf-av-active" : ""}" data-style="${s.id}">
      <img src="https://api.dicebear.com/9.x/${s.id}/svg?seed=${encodeURIComponent(seed)}&backgroundColor=${state.profile?.avatarBg||"6366f1"}" alt="${s.label}"/>
      <span>${s.label}</span>
    </button>`).join("");

  grid.querySelectorAll(".pf-av-opt").forEach(btn => {
    btn.addEventListener("click", () => {
      grid.querySelectorAll(".pf-av-opt").forEach(b => b.classList.remove("pf-av-active"));
      btn.classList.add("pf-av-active");
      if (state.profile) state.profile.avatarStyle = btn.dataset.style;
      const un  = state.profile?.username || state.user?.email?.split("@")[0] || "user";
      const nav = mkAvatar(un);
      [$("pfAvatar"), $("navAvatar"), $("pdropAvatar"), $("postAsAvatar"), $("composerAvatar")]
        .forEach(el => { if (el) el.src = nav; });
    });
  });
}

async function saveProfile() {
  const un = state.profile?.username || state.user?.email?.split("@")[0] || "user";
  const dn = ($("pfDisplayName")?.value || "").trim() || un;
  const co = ($("pfCourse")?.value || "").trim();
  const yr = $("pfYear")?.value || "";
  const st = state.profile?.avatarStyle || "avataaars";

  if (state.profile) {
    state.profile.display_name = dn;
    state.profile.course = co;
    state.profile.year   = yr;
    state.profile.avatarStyle = st;
  }
  syncAuthUI();

  if (SB_OK && state.user) {
    const { error } = await db.from("users")
      .update({ display_name: dn, course: co, year: yr, avatar_style: st })
      .eq("id", state.user.id);
    if (error) { pfMsg("❌ " + error.message, false); return; }
  }
  pfMsg("✅ Saved!", true);
  showToast("success", "✅ Profile updated!");
  fillProfile();
}

function pfMsg(msg, ok) {
  const el = $("pfMsg"); if (!el) return;
  el.textContent = msg;
  el.style.color = ok ? "var(--green)" : "var(--red)";
  setTimeout(() => { el.textContent = ""; }, 3000);
}

/* ─── Supabase data ─── */
// Function to load the user's profile from the database
// Function to create a default profile for a new user
// Function to load the user's profile from the database
async function loadProfile(uid) {
  if (!SB_OK || !uid) return null;
  try {
    console.log("Loading profile from Supabase for user:", uid);
    
    // 🚨 THE FIX: Use .maybeSingle() instead of .single() to prevent the 406 error!
    const { data, error } = await db.from("users").select("*").eq("id", uid).maybeSingle();
    
    if (error) throw error;

    if (data) {
      console.log("Profile data loaded successfully.");
      if (data.email === "mishradivyajyoti178@gmail.com") {
        data.is_admin = true;
      }
    }
    return data || null;
  } catch(e) { 
    console.warn("loadProfile error:", e.message); 
    return null; 
  }
}
// Function to create a default profile for a new user
async function createProfile(uid, email) {
  if (!SB_OK || !uid || !email) return;
  console.log("Creating default profile for new user:", uid, email);
  try {
    const username = email.split('@')[0];
    
    // 🚨 THE FIX: We are only inserting the absolute minimum required columns.
    // If you get a 400 error after this, it means your 'users' table is missing the 'is_admin' or 'username' column!
    const newProfile = {
      id: uid,
      email: email,
      username: username,
      display_name: username,                 // You need this!
      course: allowed?.course || "BCA",       // You need this!
      year: allowed?.year || "3rd Year",      // You need this!
      is_admin: (email === "mishradivyajyoti178@gmail.com")
    };
    
    const { data, error } = await db.from("users").insert([newProfile]).select().maybeSingle();
    
    if (error) {
      // This will print the EXACT missing column to your console if it fails again
      console.error("Supabase rejected the profile creation! Reason:", error.message);
      throw error;
    }
    
    state.profile = data || newProfile;
    syncAuthUI(); 
    showToast("success", "✅ Profile created successfully!");
    
  } catch (e) {
    console.error("createProfile failed. Expand the error above to see why.");
  }
}

async function fetchPosts() {
  if (!SB_OK) { state.usingMock = true; return JSON.parse(JSON.stringify(MOCK)); }
  try {
    const { data, error } = await db.from("posts").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data || []; 
  } catch(e) { 
    console.error("fetchPosts:", e); 
    state.usingMock = true; 
    return JSON.parse(JSON.stringify(MOCK)); 
  }
}

async function insertPost(post) {
  if (!SB_OK || state.usingMock) return { ...post, id: Date.now(), created_at: new Date().toISOString(), comments: [], upvotes: 0 };
  
  try {
    const { data, error } = await db.from("posts").insert([post]).select().single();
    if (error) throw error;

    // --- NEW: AWARD 5 POINTS FOR POSTING ---
    if (state.user && state.user.id) {
        await awardPoints(state.user.id, 5);
    }
    // ---------------------------------------

    return data;
  } catch(e) { 
    showToast("error", "❌ " + e.message); 
    return null; 
  }
}
async function loadUserVotes() {
  if (!SB_OK) return;
  
  // 1. Force the app to wait for the real Supabase session
  const { data: sessionData } = await db.auth.getSession();
  const uid = sessionData?.session?.user?.id || state.user?.id;
  
  if (!uid) {
      console.log("Waiting for user login to load votes...");
      return; 
  }

  try {
    const { data } = await db.from("votes").select("post_id,comment_id,direction").eq("user_id", uid);
    if (!data) return;
    
    const v = {};
    data.forEach(r => {
      if (r.post_id)    v[`p:${r.post_id}`]    = r.direction;
      if (r.comment_id) v[`c:${r.comment_id}`] = r.direction;
    });
    
    state.votes = v;
    localStorage.setItem("ut-votes", JSON.stringify(v));
    console.log("✅ Past votes loaded and remembered:", state.votes);
    
    // 2. Visually update the buttons on the screen now that we remember the votes
    document.querySelectorAll('.vote-btn, .cvote-btn').forEach(btn => {
        // This forces the CSS classes to update if they match a saved vote
        const isUp = btn.dataset.dir === 'up';
        const isDown = btn.dataset.dir === 'down';
        // Your existing render functions will handle the rest on the next cycle
    });

  } catch(e) { console.warn("loadUserVotes error:", e); }
}

async function castVote({ postId, commentId, dir, prevVote, newTotal }) {
  if (!SB_OK) return;

  const { data: sessionData } = await db.auth.getSession();
  const uid = sessionData?.session?.user?.id || state.user?.id;

  if (!uid) {
    console.error("🚨 Cannot vote: No user ID found.");
    return;
  }

  const idVal = postId || commentId;
  const col   = postId ? "post_id" : "comment_id";
  const tbl   = postId ? "posts" : "comments";

  try {
    // 1. Log the vote in the tracking table so users can't vote twice
    if (prevVote === dir) {
      await db.from("votes").delete().eq("user_id", uid).eq(col, idVal);
    } else if (prevVote) {
      await db.from("votes").update({ direction: dir }).eq("user_id", uid).eq(col, idVal);
    } else {
      await db.from("votes").insert([{ user_id: uid, direction: dir, [col]: idVal }]);
    }

    // 2. Save the final number directly to the posts/comments table
    const { error } = await db.from(tbl).update({ upvotes: newTotal }).eq("id", idVal);
    
    if (error) {
        console.error(`🚨 Failed to update ${tbl} total:`, error);
    }

  } catch(e) {
    console.error("🚨 DB Vote Error:", e);
  }
}

/* ─── Voting ─── */
async function handlePostVote(id, dir) {
  const post = state.posts.find(p => p.id === id); if (!post) return;
  const key  = `p:${id}`;
  const prev = state.votes[key] || null; // Capture the real previous vote
  let d = 0;

  if (prev === dir) { d = dir === "up" ? -1 : 1; delete state.votes[key]; }
  else { if (prev) d += prev === "up" ? -1 : 1; d += dir === "up" ? 1 : -1; state.votes[key] = dir; }

  post.upvotes = Math.max(0, post.upvotes + d);
  localStorage.setItem("ut-votes", JSON.stringify(state.votes));

  // Visual UI Updates
  [`score-${id}`, `dscore-${id}`].forEach(sid => {
    const el = $(sid);
    if (el) { el.textContent = fmt(post.upvotes); el.className = `vote-score${post.upvotes > 400 ? " hot" : ""}`; }
  });
  const card = $("feed")?.querySelector(`[data-id="${id}"]`);
  if (card) {
    const upBtn = card.querySelector('[data-dir="up"]');
    const downBtn = card.querySelector('[data-dir="down"]');
    if (upBtn) upBtn.className   = `vote-btn${state.votes[key] === "up"   ? " upvoted"   : ""}`;
    if (downBtn) downBtn.className = `vote-btn${state.votes[key] === "down" ? " downvoted" : ""}`;
  }
  const du = $(`dvup-${id}`),  dd = $(`dvdown-${id}`);
  if (du) du.className = `vote-btn${state.votes[key] === "up"   ? " upvoted"   : ""}`;
  if (dd) dd.className = `vote-btn${state.votes[key] === "down" ? " downvoted" : ""}`;

  // Pass the exact math to the database so it doesn't have to guess
  await castVote({ postId: id, dir, prevVote: prev, newTotal: post.upvotes });
  // --- NEW: AWARD POINTS FOR UPVOTES ---
  // If the user just clicked "up" (and isn't undoing a previous upvote)
  if (dir === "up" && prev !== "up") {
      // Make sure we know who wrote the post
      if (post.author_id) {
          await awardPoints(post.author_id, 1);
      } else {
          console.log("Could not award point: No author_id attached to this post.");
      }
  }
}

async function handleCommentVote(id, dir) {
  const c = state.comments.find(x => x.id === id); if (!c) return;
  const key  = `c:${id}`;
  const prev = state.votes[key] || null; // Capture the real previous vote
  let d = 0;

  if (prev === dir) { d = dir === "up" ? -1 : 1; delete state.votes[key]; }
  else { if (prev) d += prev === "up" ? -1 : 1; d += dir === "up" ? 1 : -1; state.votes[key] = dir; }

  c.upvotes = Math.max(0, c.upvotes + d);
  c.userVote = state.votes[key] || null;
  localStorage.setItem("ut-votes", JSON.stringify(state.votes));
  
  // Visual UI Updates
  const sc = $(`cscore-${id}`); if (sc) sc.textContent = fmt(c.upvotes);
  const ub = $(`cvup-${id}`),  db2 = $(`cvdown-${id}`);
  if (ub)  ub.className  = `cvote-btn${c.userVote === "up"   ? " upvoted"   : ""}`;
  if (db2) db2.className = `cvote-btn${c.userVote === "down" ? " downvoted" : ""}`;

  // Pass the exact math to the database
  await castVote({ commentId: id, dir, prevVote: prev, newTotal: c.upvotes });
}

/* ─── Comments ─── */
async function fetchComments(pid) {
  if (!SB_OK || state.usingMock)
    return MOCK_COMMENTS.filter(c => c.post_id === pid).map(c => ({ ...c, userVote: state.votes[`c:${c.id}`] || null }));
  try {
    const { data, error } = await db.from("comments").select("*").eq("post_id", pid).order("created_at", { ascending: true });
    if (error) throw error;
    return (data || []).map(c => ({ ...c, userVote: state.votes[`c:${c.id}`] || null }));
  } catch(e) { return []; }
}

async function insertComment(c) {
  if (!SB_OK || state.usingMock) return { ...c, id: Date.now() + Math.random(), created_at: new Date().toISOString(), upvotes: 0 };
  try {
    const { data, error } = await db.from("comments").insert([c]).select().single();
    if (error) throw error;
    return data;
  } catch(e) { showToast("error", "❌ " + e.message); return null; }
}

async function loadComments(pid) {
  const cl = $("commentsLoading"); if (cl) cl.style.display = "block";
  $("commentsList").innerHTML = "";
  const all = await fetchComments(pid);
  state.comments = all;
  if (cl) cl.style.display = "none";
  renderComments();
}

function renderComments() {
  const list = $("commentsList");
  const top  = state.comments.filter(c => !c.parent_id);
  const reps = state.comments.filter(c =>  c.parent_id);
  const sorted = [...top].sort((a, b) =>
    state.commentSort === "top"
      ? b.upvotes - a.upvotes
      : new Date(b.created_at) - new Date(a.created_at)
  );
  if (!sorted.length) {
    list.innerHTML = `<div class="no-comments"><span>💬</span><p>No comments yet. Be the first!</p></div>`;
    return;
  }
  list.innerHTML = sorted.map(c => renderComment(c, reps.filter(r => r.parent_id === c.id), 0)).join("");
  list.querySelectorAll(".cvote-btn").forEach(btn =>
    btn.addEventListener("click", e => { e.stopPropagation(); requireAuth(() => handleCommentVote(+btn.dataset.id, btn.dataset.dir)); })
  );
  list.querySelectorAll(".reply-btn").forEach(btn =>
    btn.addEventListener("click", () => {
      const cid = +btn.dataset.id;
      if (state.replyingTo === cid) { state.replyingTo = null; $$(".inline-reply-container").forEach(el => el.innerHTML = ""); }
      else { state.replyingTo = cid; insertInlineReply(cid); }
    })
  );
}

function renderComment(c, childReplies = [], depth = 0) {
  const isAnon = c.author === "Anonymous";
  const av     = isAnon ? `<div class="comment-avatar-anon">?</div>` : `<img src="${mkAvatar(c.author)}" class="comment-avatar" alt=""/>`;
  const vUp    = state.votes[`c:${c.id}`] === "up";
  const vDown  = state.votes[`c:${c.id}`] === "down";
  const repliesHtml = childReplies.length
    ? `<div class="replies-list">${childReplies.map(r => renderComment(r, [], 1)).join("")}</div>`
    : "";
  const replyBtn = depth === 0
    ? `<button class="reply-btn footer-btn" data-id="${c.id}">💬 Reply</button>`
    : "";
  return `<div class="comment-item ${depth > 0 ? "comment-reply" : ""}" data-cid="${c.id}">
    <div class="comment-inner">
      <div class="comment-left">${av}${depth === 0 ? '<div class="comment-thread-line"></div>' : ''}</div>
      <div class="comment-content">
        <div class="comment-meta">
          <span class="comment-author ${isAnon ? "anon" : ""}">${isAnon ? "u/Anonymous" : "u/" + esc(c.author)}</span>
          <span class="comment-time">${ago(c.created_at)}</span>
        </div>
        <p class="comment-body">${esc(c.body)}</p>
        <div class="comment-actions">
          <div class="comment-votes">
            <button class="cvote-btn ${vUp ? "upvoted" : ""}" id="cvup-${c.id}" data-id="${c.id}" data-dir="up">▲</button>
            <span class="comment-score" id="cscore-${c.id}">${fmt(c.upvotes)}</span>
            <button class="cvote-btn ${vDown ? "downvoted" : ""}" id="cvdown-${c.id}" data-id="${c.id}" data-dir="down">▼</button>
          </div>
          ${replyBtn}
        </div>
        <div class="inline-reply-container" id="inlineReply-${c.id}"></div>
        ${repliesHtml}
      </div>
    </div>
  </div>`;
}

function insertInlineReply(parentId) {
  $$(".inline-reply-container").forEach(el => el.innerHTML = "");
  const con = $(`inlineReply-${parentId}`); if (!con) return;
  const un = state.profile?.username || state.user?.email?.split("@")[0] || "You";
  con.innerHTML = `<div class="inline-reply-box">
    <img src="${mkAvatar(un)}" class="comment-avatar sm" alt=""/>
    <div class="inline-reply-body">
      <textarea class="comment-textarea sm" id="inlineReplyInput-${parentId}" placeholder="Write a reply…" rows="2"></textarea>
      <div class="inline-reply-footer">
        <label class="anon-check anon-sm">
          <input type="checkbox" id="replyAnonCheck-${parentId}"/>
          <span class="check-box sm"></span><span>Anonymous</span>
        </label>
        <div style="display:flex;gap:8px">
          <button class="btn-cancel-reply footer-btn" data-parent="${parentId}">Cancel</button>
          <button class="btn-post-reply btn-post-comment sm" data-parent="${parentId}">Reply</button>
        </div>
      </div>
    </div>
  </div>`;
  const ta = $(`inlineReplyInput-${parentId}`);
  ta?.focus();
  ta?.addEventListener("input", () => { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px"; });
  con.querySelector(".btn-cancel-reply").addEventListener("click", () => {
    state.replyingTo = null;
    $$(".inline-reply-container").forEach(el => el.innerHTML = "");
  });
  con.querySelector(".btn-post-reply").addEventListener("click", async () => {
    const body   = ta.value.trim();
    const isAnon = $(`replyAnonCheck-${parentId}`)?.checked;
    if (!body) { ta.focus(); return; }
    await submitComment(body, isAnon, parentId);
  });
}

async function submitComment(body, isAnon, parentId = null) {
  const un  = state.profile?.username || state.user?.email?.split("@")[0] || "You";
  const pid = state.currentPost?.id;
  const created = await insertComment({
    post_id:   pid,
    parent_id: parentId || null,
    author:    isAnon ? "Anonymous" : un,
    author_id: isAnon ? null : (state.user?.id || null),
    body,
    upvotes:   0,
  });
  if (!created) return;
  created.userVote = null;
  state.comments.push(created);
  const post = state.posts.find(p => p.id === pid);
  if (post) {
    post.comment_count = (post.comment_count || 0) + 1;
    const cc = $(`cc-${pid}`); if (cc) cc.textContent = post.comment_count;
  }
  if (parentId) {
    state.replyingTo = null;
    $$(".inline-reply-container").forEach(el => el.innerHTML = "");
  } else {
    $("commentInput").value = "";
    $("commentInput").style.height = "auto";
    $("submitComment").disabled = true;
  }
  $("commentsTitle").textContent = `Comments (${state.comments.length})`;
  renderComments();
  showToast("success", "💬 Comment posted!");
}

/* ─── Detail post ─── */
function renderDetailPost(p) {
  const vUp   = state.votes[`p:${p.id}`] === "up";
  const vDown = state.votes[`p:${p.id}`] === "down";
  const isAnon = p.author === "Anonymous";
  const auth  = isAnon
    ? `<span style="color:var(--text-3)">u/Anonymous</span>`
    : `<img src="${mkAvatar(p.author)}" class="card-author-avatar" alt=""/><span>u/${esc(p.author)}</span>`;

  $("detailPostWrap").innerHTML = `
    <div class="detail-post">
      <div class="detail-vote-col">
        <button class="vote-btn ${vUp ? "upvoted" : ""}" id="dvup-${p.id}" data-dir="up">▲</button>
        <span class="vote-score ${p.upvotes > 400 ? "hot" : ""}" id="dscore-${p.id}">${fmt(p.upvotes)}</span>
        <button class="vote-btn ${vDown ? "downvoted" : ""}" id="dvdown-${p.id}" data-dir="down">▼</button>
      </div>
      <div class="detail-post-body">
        <div class="post-meta">
          <span class="flair ${p.flair_class || ""}">${esc(p.flair || "General")}</span>
          <span class="meta-dot">•</span>
          <span class="meta-author">${auth}</span>
          <span class="meta-time">${ago(p.created_at)}</span>
          ${p.pinned ? `<span class="pin-badge">📌 Pinned</span>` : ""}
        </div>
        <h1 class="detail-post-title">${esc(p.title)}</h1>
        
        ${p.body && p.body.startsWith("POLL_DATA::") 
            ? renderPoll(p) 
            : p.body 
              ? `<div style="margin-top:16px; font-size: 1.05rem; line-height: 1.6; padding-bottom: 10px;">${formatBody(p.body)}</div>` 
              : ""
        }
        
        ${isOwner(p) ? `<div class="post-footer" style="margin-top:12px"><button class="footer-btn footer-btn-del" id="detailDeleteBtn">🗑 Delete this post</button></div>` : ""}
      </div>
    </div>`;

  $(`dvup-${p.id}`).addEventListener("click",   e => { e.stopPropagation(); requireAuth(() => handlePostVote(p.id, "up")); });
  $(`dvdown-${p.id}`).addEventListener("click", e => { e.stopPropagation(); requireAuth(() => handlePostVote(p.id, "down")); });
  $("detailDeleteBtn")?.addEventListener("click", () => requireAuth(() => deletePost(p.id)));
  $("commentsTitle").textContent = `Comments (${p.comment_count || 0})`;
  const un = state.profile?.username || state.user?.email?.split("@")[0] || "You";
  const ca = $("composerAvatar"); if (ca) ca.src = mkAvatar(un);

  // 🚨 THE POLL CLICK ACTIVATOR FOR THE DETAIL PAGE 🚨
  $("detailPostWrap").querySelectorAll(".poll-vote-btn").forEach(btn =>
    btn.addEventListener("click", e => { 
      e.stopPropagation(); 
      requireAuth(() => handlePollVote(btn.dataset.postid, +btn.dataset.optid)); 
    })
  );
}
// Activate Poll Buttons on detail page
  $("detailPostWrap").querySelectorAll(".poll-vote-btn").forEach(btn =>
    btn.addEventListener("click", e => { 
      e.stopPropagation(); 
      requireAuth(() => handlePollVote(btn.dataset.postid, +btn.dataset.optid)); 
    })
  );

/* ─── Feed ─── */
function visiblePosts() {
  let l = state.posts.map(p => ({ ...p, userVote: state.votes[`p:${p.id}`] || null }));
  if (state.category !== "all") l = l.filter(p => p.category === state.category);
  if (state.query.trim()) {
    const q = state.query.toLowerCase();
    l = l.filter(p =>
      p.title?.toLowerCase().includes(q) || p.body?.toLowerCase().includes(q) ||
      p.author?.toLowerCase().includes(q) || p.flair?.toLowerCase().includes(q)
    );
  }
  if (state.sort === "hot") {
    l.sort((a, b) => {
      const ag = p => (Date.now() - new Date(p.created_at)) / 3600000;
      return (b.upvotes / Math.pow(ag(b) + 2, 1.5)) - (a.upvotes / Math.pow(ag(a) + 2, 1.5));
    });
    l.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  } else if (state.sort === "new") {
    l.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } else {
    l.sort((a, b) => b.upvotes - a.upvotes);
  }
  return l;
}

function renderFeed() {
  const posts = visiblePosts();
  $("postCount").textContent = `${posts.length} post${posts.length !== 1 ? "s" : ""}`;
  if (!posts.length) { $("feed").innerHTML = ""; $("emptyState").style.display = "block"; return; }
  $("emptyState").style.display = "none";
  $("feed").innerHTML = posts.map(renderCard).join("");
  
  $("feed").querySelectorAll(".post-card").forEach((card, i) => {
    card.style.animationDelay = `${i * 50}ms`;
    requestAnimationFrame(() => card.classList.add("visible"));
  });
  
  $("feed").querySelectorAll(".vote-btn").forEach(btn =>
    btn.addEventListener("click", e => { e.stopPropagation(); requireAuth(() => handlePostVote(+btn.dataset.id, btn.dataset.dir)); })
  );
  
  $("feed").querySelectorAll(".post-card").forEach(card =>
    card.addEventListener("click", e => { if (e.target.closest("button")) return; showDetail(+card.dataset.id); })
  );
  
  $("feed").querySelectorAll(".footer-btn").forEach(btn =>
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const a = btn.dataset.action;
      if (a === "comment") showDetail(+btn.dataset.postid);
      else if (a === "delete") requireAuth(() => deletePost(+btn.dataset.id));
    })
  );

  // 🚨 THE POLL CLICK ACTIVATOR FOR THE FEED 🚨
  $("feed").querySelectorAll(".poll-vote-btn").forEach(btn =>
    btn.addEventListener("click", e => { 
      e.stopPropagation(); 
      requireAuth(() => handlePollVote(btn.dataset.postid, +btn.dataset.optid)); 
    })
  );
}
// Activate Poll Buttons
  $("feed").querySelectorAll(".poll-vote-btn").forEach(btn =>
    btn.addEventListener("click", e => { 
      e.stopPropagation(); 
      requireAuth(() => handlePollVote(btn.dataset.postid, +btn.dataset.optid)); 
    })
  );
/* ─── Interactive Polls ─── */
function renderPoll(p) {
  try {
    const poll = JSON.parse(p.body.replace("POLL_DATA::", ""));
    const totalVotes = Object.keys(poll.voters).length;
    const myVote = state.user ? poll.voters[state.user.id] : null;
    const isExpired = (Date.now() - poll.createdAt) > (poll.duration * 24 * 60 * 60 * 1000);

    let html = `<div class="poll-container" style="margin-top:12px; border:1px solid var(--border-2); border-radius:8px; padding:12px; background: var(--bg-surface);">`;
    html += `<div style="margin-bottom:12px; font-size:0.85rem; color:var(--text-3); font-weight: 600;">📊 Poll • ${totalVotes} vote${totalVotes !== 1 ? 's' : ''} ${isExpired ? '• Ended' : ''}</div>`;

    poll.options.forEach(opt => {
      const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
      const isMyVote = myVote === opt.id;

      // If user has voted or poll is expired, show results
      if (myVote !== undefined && myVote !== null || isExpired) {
        html += `
          <div style="margin-bottom:8px; position:relative; background:var(--bg-mid); border-radius:6px; overflow:hidden; padding:10px 12px; display:flex; justify-content:space-between; border: 1px solid ${isMyVote ? 'var(--brand)' : 'transparent'};">
            <div style="position:absolute; top:0; left:0; height:100%; width:${pct}%; background: ${isMyVote ? 'rgba(99, 102, 241, 0.2)' : 'var(--border-2)'}; z-index:1; transition: width 0.5s ease;"></div>
            <span style="position:relative; z-index:2; font-weight:${isMyVote ? 'bold' : 'normal'}; color: var(--text-1);">${esc(opt.text)} ${isMyVote ? '✓' : ''}</span>
            <span style="position:relative; z-index:2; color: var(--text-2); font-size: 0.9rem;">${pct}%</span>
          </div>`;
      } else {
        // Otherwise, show clickable buttons to vote
        html += `
          <button class="poll-vote-btn" data-postid="${p.id}" data-optid="${opt.id}" style="width:100%; text-align:left; padding:10px 12px; margin-bottom:8px; border:1px solid var(--border-2); border-radius:6px; background:transparent; color: var(--text-1); cursor:pointer; font-size: 1rem; transition:0.2s;">
            ${esc(opt.text)}
          </button>`;
      }
    });
    html += `</div>`;
    return html;
  } catch(e) {
    return `<div class="post-excerpt" style="color: var(--red);">⚠️ Error loading poll data</div>`;
  }
}

async function handlePollVote(postId, optId) {
  if (!state.session) return;
  const post = state.posts.find(p => String(p.id) === String(postId));
  if (!post || !post.body.startsWith("POLL_DATA::")) return;

  const poll = JSON.parse(post.body.replace("POLL_DATA::", ""));
  
  // Optimistically update the UI locally
  poll.voters[state.user.id] = optId;
  poll.options.find(o => o.id === optId).votes++;
  post.body = "POLL_DATA::" + JSON.stringify(poll);

  // Re-render to show the new bar chart instantly
  if (state.page === "feed") renderFeed();
  if (state.page === "detail") renderDetailPost(post);

  // Update in the database quietly
  try {
    const { error } = await db.from("posts").update({ body: post.body }).eq("id", postId);
    if (error) throw error;
  } catch (e) {
    showToast("error", "Failed to save vote to database.");
  }
}
function renderCard(p) {
  const vUp   = p.userVote === "up",  vDown = p.userVote === "down";
  const isAnon = p.author === "Anonymous";
  const auth  = isAnon
    ? `<span style="color:var(--text-3)">u/Anonymous</span>`
    : `<img src="${mkAvatar(p.author)}" class="card-author-avatar" alt=""/><span>u/${esc(p.author)}</span>`;
  return `<article class="post-card" data-id="${p.id}">
    <div class="vote-col">
      <button class="vote-btn ${vUp ? "upvoted" : ""}" data-id="${p.id}" data-dir="up">▲</button>
      <span class="vote-score ${p.upvotes > 400 ? "hot" : ""}" id="score-${p.id}">${fmt(p.upvotes)}</span>
      <button class="vote-btn ${vDown ? "downvoted" : ""}" data-id="${p.id}" data-dir="down">▼</button>
    </div>
    <div class="post-body">
      <div class="post-meta">
        <span class="flair ${p.flair_class || ""}">${esc(p.flair || "General")}</span>
        <span class="meta-dot">•</span>
        <span class="meta-author">${auth}</span>
        <span class="meta-time">${ago(p.created_at)}</span>
        ${p.pinned ? `<span class="pin-badge">📌 Pinned</span>` : ""}
      </div>
      <h2 class="post-title">${esc(p.title)}</h2>
      
      ${p.body && p.body.startsWith("POLL_DATA::") 
          ? renderPoll(p) 
          : p.body 
            ? `<div class="post-excerpt" style="margin-top:8px;">${formatBody(p.body)}</div>` 
            : ""
      }
      
      <div class="post-footer">
        <button class="footer-btn" data-action="comment" data-postid="${p.id}">
          💬 <span id="cc-${p.id}">${p.comment_count || 0}</span> Comments
        </button>
        ${isOwner(p) ? `<button class="footer-btn footer-btn-del" data-action="delete" data-id="${p.id}">🗑 Delete</button>` : ""}
      </div>
    </div>
  </article>`;
}

function showSkeletons() {
  $("feed").innerHTML = Array.from({ length: 5 }).map(() => `
    <div class="skeleton-card">
      <div class="sk-vote">
        <div class="sk-block sk-circle"></div>
        <div class="sk-block sk-score"></div>
        <div class="sk-block sk-circle"></div>
      </div>
      <div class="sk-body">
        <div class="sk-row"><div class="sk-block sk-flair"></div><div class="sk-block sk-author"></div></div>
        <div class="sk-block sk-title"></div>
        <div class="sk-block sk-title sk-title-short"></div>
        <div class="sk-block sk-excerpt"></div>
      </div>
    </div>`).join("");
}

/* ─── Create post page init ─── */
const cpState = {
  tab: "text",
  tags: [],
  mediaFiles: [],
  drafts: JSON.parse(localStorage.getItem("ut-drafts") || "[]"),
};

function initCreatePage() {
  // Reset form
  const ti = $("postTitle"); if (ti) { ti.value = ""; }
  const rc = $("rteEditor"); if (rc) rc.innerHTML = "";
  const pl = $("postLink");   if (pl) pl.value = "";
  $("titleCount").textContent = "0/300";
  cpState.tab = "text"; cpState.tags = []; cpState.mediaFiles = [];
  renderCpTags(); switchCpTab("text");
  updateDraftsCount();

  // Fill author
  const un = state.profile?.username || state.user?.email?.split("@")[0] || "user";
  const av = mkAvatar(un);
  const pa = $("postAsAvatar"); if (pa) pa.src = av;
  const pn = $("postAsName");   if (pn) pn.textContent = `u/${un}`;
}

function switchCpTab(tab) {
  cpState.tab = tab;
  $$(".cp-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
  ["text","media","link","poll"].forEach(t => {
    const el = $(`panel${t.charAt(0).toUpperCase()+t.slice(1)}`);
    if (el) el.style.display = t === tab ? "block" : "none";
  });
}

function renderCpTags() {
  const list = $("cpTagsList"); if (!list) return;
  const ph   = $("cpTagPlaceholder");
  list.innerHTML = cpState.tags.map((tag, i) =>
    `<span class="cp-tag">${esc(tag)}<button class="cp-tag-del" data-i="${i}">×</button></span>`
  ).join("");
  list.querySelectorAll(".cp-tag-del").forEach(btn =>
    btn.addEventListener("click", e => {
      e.stopPropagation();
      cpState.tags.splice(+btn.dataset.i, 1);
      renderCpTags();
    })
  );
  if (ph) ph.style.display = cpState.tags.length ? "none" : "";
}

function updateDraftsCount() {
  const el = $("cpDraftsCount");
  if (el) el.textContent = cpState.drafts.length;
}

function saveDraft() {
  const title = $("postTitle")?.value.trim();
  const body  = $("rteEditor")?.innerHTML?.replace(/<[^>]+>/g, "").trim() || $("rteEditor")?.innerText?.trim() || "";
  if (!title && !body) { showToast("info", "Nothing to save yet."); return; }
  const draft = {
    id:       Date.now(),
    tab:      cpState.tab,
    title,
    body:     $("rteEditor")?.innerHTML || "",
    link:     $("postLink")?.value || "",
    tags:     [...cpState.tags],
    category: $("postCategory")?.value || "bca",
    isAnon:   $("anonCheck")?.checked || false,
    savedAt:  new Date().toLocaleString(),
  };
  cpState.drafts.unshift(draft);
  localStorage.setItem("ut-drafts", JSON.stringify(cpState.drafts));
  updateDraftsCount();
  renderDraftsList();
  showToast("success", "📄 Draft saved!");
}

function loadDraft(draft) {
  $("postTitle").value      = draft.title || "";
  $("rteEditor").innerHTML  = draft.body  || "";
  if ($("postLink")) $("postLink").value = draft.link || "";
  cpState.tags = draft.tags || [];
  if ($("postCategory")) $("postCategory").value = draft.category || "bca";
  if ($("anonCheck"))    $("anonCheck").checked  = draft.isAnon   || false;
  $("titleCount").textContent = `${(draft.title||"").length}/300`;
  switchCpTab(draft.tab || "text");
  renderCpTags();
  closeDraftsDrawer();
  showToast("info", "📄 Draft loaded!");
}

function deleteDraft(id) {
  cpState.drafts = cpState.drafts.filter(d => d.id !== id);
  localStorage.setItem("ut-drafts", JSON.stringify(cpState.drafts));
  updateDraftsCount(); renderDraftsList();
}

function renderDraftsList() {
  const list = $("cpDraftsList"); if (!list) return;
  if (!cpState.drafts.length) {
    list.innerHTML = `<p class="cp-drafts-empty">No drafts saved yet.</p>`;
    return;
  }
  list.innerHTML = cpState.drafts.map(d => `
    <div class="cp-draft-item" data-id="${d.id}">
      <div class="cp-draft-title">${esc(d.title || "Untitled")}</div>
      <div class="cp-draft-meta">
        <span>${d.tab || "text"}</span><span>${d.savedAt}</span>
      </div>
      <button class="cp-draft-del" data-id="${d.id}">🗑 Delete</button>
    </div>`).join("");
  list.querySelectorAll(".cp-draft-item").forEach(item => {
    item.addEventListener("click", e => {
      if (e.target.closest(".cp-draft-del")) return;
      const draft = cpState.drafts.find(d => d.id === +item.dataset.id);
      if (draft) loadDraft(draft);
    });
  });
  list.querySelectorAll(".cp-draft-del").forEach(btn =>
    btn.addEventListener("click", e => { e.stopPropagation(); deleteDraft(+btn.dataset.id); })
  );
}

function openDraftsDrawer() {
  const d = $("cpDraftsDrawer"); if (d) { d.style.display = "flex"; renderDraftsList(); }
}
function closeDraftsDrawer() {
  const d = $("cpDraftsDrawer"); if (d) d.style.display = "none";
}

async function handleSubmitPost() {
  const title = $("postTitle")?.value.trim();
  if (!title) { showToast("error", "⚠️ Please enter a title."); $("postTitle")?.focus(); return; }

  const tab = cpState.tab;
  const submitBtn = $("submitPost");
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Posting…"; }

  let body = null;

  try {
    // 1. ALWAYS grab the text correctly (This fixes the squished paragraphs!)
    let typedText = "";
    const html = $("rteEditor")?.innerHTML || "";
    if (html && html !== "<br>") {
        // Convert HTML line breaks into real, preserved newlines
        let formatted = html.replace(/<p>/gi, "")
                            .replace(/<\/p>/gi, "\n")
                            .replace(/<br\s*\/?>/gi, "\n")
                            .replace(/<\/div>/gi, "\n")
                            .replace(/<div[^>]*>/gi, "");
        typedText = formatted.replace(/<[^>]+>/g, "").trim();
        typedText = typedText.replace(/&nbsp;/g, " "); // Keep normal spaces
    }

    // 2. Process based on what is attached
    if (tab === "link") {
      const link = $("postLink")?.value.trim();
      if (!link) throw new Error("Please enter a valid link.");
      body = typedText ? `🔗 ${link}\n\n${typedText}` : `🔗 ${link}`;
      
    } else if (tab === "poll") {
      const opts = Array.from($$(".cp-poll-option .cp-inp")).map(i => i.value.trim()).filter(Boolean);
      if (opts.length < 2) throw new Error("Add at least 2 poll options.");
      const dur = $("cpPollDuration")?.value || "3";
      const pollData = {
        isPoll: true, duration: parseInt(dur), createdAt: Date.now(),
        options: opts.map((optText, idx) => ({ id: idx, text: optText, votes: 0 })),
        voters: {}
      };
      body = "POLL_DATA::" + JSON.stringify(pollData);
      
    } else {
      // 3. Standard Post: Grab Images AND Text perfectly!
      let imageTags = "";
      if (cpState.mediaFiles.length > 0) {
        submitBtn.textContent = "Uploading Media…";
       let uploadedUrls = [];
        for (let file of cpState.mediaFiles) {
          const fileExt = file.name.split('.').pop();
          const fileName = `post_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
          const { error } = await db.storage.from('media').upload(fileName, file);
          if (error) throw new Error("Upload failed: " + error.message);
          const { data: urlData } = db.storage.from('media').getPublicUrl(fileName);
          
          // 🚨 THE FIX: Tag documents as DOC, and everything else as IMAGE
          if (file.isDoc) {
            uploadedUrls.push(`[DOC:${urlData.publicUrl}|${file.originalName}]`);
          } else {
            uploadedUrls.push(`[IMAGE:${urlData.publicUrl}]`);
          }
        }
        // 🚨 IMPORTANT: Change this line too! We removed the forced map to [IMAGE]
        imageTags = uploadedUrls.join("\n");
        imageTags = uploadedUrls.map(url => `[IMAGE:${url}]`).join("\n");
      }
      
      if (typedText && imageTags) body = imageTags + "\n\n" + typedText;
      else if (typedText) body = typedText;
      else if (imageTags) body = imageTags;
      else throw new Error("Please add some text or an image.");
    }

    // 4. Gather metadata
    const catVal   = $("postCategory")?.value || "bca";
    const catLabel = $("postCategory")?.options[$("postCategory")?.selectedIndex]?.text.replace(/^[^\s]+\s/, "") || catVal;
    const isAnon   = $("anonCheck")?.checked || false;
    const un       = state.profile?.username || state.user?.email?.split("@")[0] || "You";
    const flairMap = { bca:"", engineering:"", mba:"", resources:"flair-cyan", canteen:"flair-gold", exams:"flair-cyan", sports:"flair-green", placement:"flair-green" };
    const tags     = cpState.tags.length ? cpState.tags.join(", ") : null;

    // 5. Send to Database
    const newPostData = {
      title,
      body: body || (tags ? `Tags: ${tags}` : null),
      author: isAnon ? "Anonymous" : un,
      author_id: isAnon ? null : (state.user?.id || null),
      flair: catLabel, flair_class: flairMap[catVal] || "",
      category: catVal, upvotes: 1, comment_count: 0, pinned: false,
    };
console.log("🚨 WIRETAP CAUGHT THIS:", newPostData.category);
    const created = await insertPost(newPostData);
    if (!created) throw new Error("Database insertion failed.");

    // 6. Update UI
    state.posts.unshift(created);
    state.votes[`p:${created.id}`] = "up";
    localStorage.setItem("ut-votes", JSON.stringify(state.votes));
    state.sort = "new";
    
    cpState.mediaFiles = [];
    if ($("cpMediaPreview")) $("cpMediaPreview").innerHTML = "";
    if ($("cpUploadInner")) $("cpUploadInner").style.display = "flex";
    
    showFeed();
    renderFeed();
    $$(".sort-btn").forEach(b => b.classList.toggle("active", b.dataset.sort === "new"));
    showToast("success", "🚀 Post published!");

  } catch (err) {
    showToast("error", err.message || "❌ Something went wrong.");
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Post"; }
  }
}
/* ─── Delete post ─── */
async function deletePost(id) {
  // Find the post to delete from client state
  // 🚨 FIX: Convert both IDs to strings so they ALWAYS match, preventing silent failures
  const post = state.posts.find(p => String(p.id) === String(id));
  
  if (!post) {
    showToast("error", "⚠️ Could not find post to delete.");
    return;
  }

  // Ownership check (Admin can delete anything, user only their own)
  // 🚨 FIX: Rely entirely on our secure isOwner function
  if (!isOwner(post)) {
    showToast("error", "❌ You can only delete your own posts.");
    return;
  }

  if (!confirm("Delete this post? This cannot be undone.")) return;

  // Database deletion logic
  if (SB_OK && !state.usingMock) {
    try {
      console.log(`Attempting standard Postgres Supabase deletion with ID: ${post.id}. JS number type: ${typeof post.id}.`);
      const { error } = await db.from("posts").delete().eq("id", post.id); // Uses number `post.id`
      if (error) throw error;
      showToast("success", "🗑 Post deleted permanently."); // Successful DB deletion
    } catch(e) {
      showToast("error", "❌ standard Postgres Supabase deletion standard silent failure: " + e.message + ". standard type comparison advice.");
      return; // Don't delete from local screen if DB deletion failed
    }
  }

  // Remove from local screen (client-side state)
  // 🚨 FIX: Rely entirely on type comparison for filtering too
  state.posts = state.posts.filter(p => String(p.id) !== String(id));
  
  // Navigate to feed if deleted from detail view
  if (state.page === "detail") showFeed();
  
  // Re-render feed
  renderFeed();
}
/* ─── Media files helper ─── */
/* --- Media files helper --- */
/* --- Media files helper --- */
async function handleMediaFiles(files) {  
  if (!files?.length) return;
  
  $("cpUploadInner").style.display = "none"; // Hide big dropzone immediately
  showToast("info", "Processing files...");

  for (let originalFile of Array.from(files)) {
    if (cpState.mediaFiles.length >= 10) { showToast("info", "Max 10 files allowed."); break; }
    
    let fileToUse = originalFile;
    const isVideo = originalFile.type.startsWith("video/");
    const isDoc = originalFile.type === "application/pdf" || originalFile.name.endsWith(".doc") || originalFile.name.endsWith(".docx");

    // Shrink images
    if (!isVideo && !isDoc && originalFile.type.startsWith("image/")) {
        fileToUse = await compressImage(originalFile);
    }

    if (fileToUse.size > 50 * 1024 * 1024) { showToast("error", `${fileToUse.name} exceeds 50MB.`); continue; }
    
    // Tag the file properties for later
    fileToUse.isDoc = isDoc; 
    fileToUse.originalName = originalFile.name;
    
    cpState.mediaFiles.push(fileToUse);
  }
  
  // Now redraw the preview box perfectly
  renderMediaPreview();
}

// 🚨 THE NEW UI BUILDER: Fixes the delete bug and adds the "+" button 🚨
function renderMediaPreview() {
    const preview = $("cpMediaPreview");
    if (!preview) return;

    preview.innerHTML = ""; // Wipe the box clean

    // If they deleted everything, bring the massive dropzone back!
    if (cpState.mediaFiles.length === 0) {
        $("cpUploadInner").style.display = "flex";
        preview.style.display = "none";
        return;
    }

    preview.style.display = "flex";

    // 1. Draw all the uploaded files
    cpState.mediaFiles.forEach((file, index) => {
        const url = URL.createObjectURL(file);
        const div = document.createElement("div");
        div.className = "cp-media-thumb";
        
        if (file.isDoc) {
            div.innerHTML = `<div style="padding:20px; background:var(--bg-mid); color:white; border-radius:8px; text-align:center; height:100%; display:flex; flex-direction:column; justify-content:center;">📄<br><small style="font-size:0.7rem; margin-top:5px; word-break:break-all;">${file.originalName}</small></div><button class="cp-media-thumb-del">X</button>`;
        } else if (file.type.startsWith("video/")) {
            div.innerHTML = `<video src="${url}" muted></video><button class="cp-media-thumb-del">X</button>`;
        } else {
            div.innerHTML = `<img src="${url}" alt=""/><button class="cp-media-thumb-del">X</button>`;
        }
          
        // Safe Delete: Always splices the EXACT current index
        div.querySelector(".cp-media-thumb-del").addEventListener("click", e => {
            e.stopPropagation();
            cpState.mediaFiles.splice(index, 1);
            renderMediaPreview(); // Recursively redraw the UI perfectly
        });
        
        preview.appendChild(div);
    });

    // 2. Add the "➕ Add More" button at the very end
    if (cpState.mediaFiles.length < 10) {
        const addMoreDiv = document.createElement("div");
        addMoreDiv.className = "cp-media-thumb";
        addMoreDiv.style.cssText = "cursor:pointer; display:flex; align-items:center; justify-content:center; background:var(--bg-mid); border: 2px dashed var(--border-2); border-radius: 8px;";
        addMoreDiv.innerHTML = `<span style="font-size: 2.5rem; color: var(--text-3); font-weight: 300;">+</span>`;
        
        // Clicking this opens the computer's file picker again
        addMoreDiv.addEventListener("click", () => {
            $("cpFileInput")?.click();
        });
        
        preview.appendChild(addMoreDiv);
    }
}

function updatePollRemoveBtns() {
  const opts = $$(".cp-poll-option");
  opts.forEach((opt, i) => {
    const btn = opt.querySelector(".cp-poll-remove");
    if (btn) btn.style.visibility = opts.length > 2 ? "visible" : "hidden";
  });
}

/* ─── Dropdown / modal helpers ─── */
function openDrop()   { $("profileDrop")?.classList.add("open"); }
function closeDrop()  { $("profileDrop")?.classList.remove("open"); }
function toggleDrop() { $("profileDrop")?.classList.toggle("open"); }

function openCreateModal()  { requireAuth(showCreate); }
function closeCreateModal() { showFeed(); }

/* ─── Auth ─── */
async function handleLogout() {
  if (SB_OK && db) await db.auth.signOut();
  state.session = null; 
  state.user = null; 
  state.profile = null; 
  state.votes = {};
  localStorage.removeItem("ut-votes");
  closeDrop();
  
  // 🚨 This is the most important line!
  window.location.href = LAND; 
}

function requireAuth(action) {
  if (state.session) { action(); return; }
  showToast("info", "🔐 Please log in first…");
  setTimeout(() => { window.location.href = LAND; }, 1500);
}

/* ─── Theme / helpers / toast ─── */
function applyTheme(t) { document.documentElement.setAttribute("data-theme", t); state.theme = t; localStorage.setItem("ut-theme", t); }
function isOwner(p) {
  if (!state.session) return false;
  
  const un = state.profile?.username || "";
  const emailPrefix = state.user?.email?.split("@")[0] || "";
  const isAdmin = state.profile?.is_admin === true;

  // You own this post if you are the Admin, your username matches, 
  // your old email prefix matches, or your secure User ID matches.
  return isAdmin 
    || p.author === un 
    || p.author === emailPrefix 
    || (p.author_id && p.author_id === state.user?.id);
}

function fmt(n)  { return n >= 1000 ? (n / 1000).toFixed(1).replace(".0", "") + "k" : String(n); }
function esc(s)  { if (!s) return ""; return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function ago(iso) {
  if (!iso) return "just now";
  const d = (Date.now() - new Date(iso)) / 1000;
  if (d < 60)    return "just now";
  if (d < 3600)  return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  if (d < 604800)return `${Math.floor(d / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}
function formatBody(text) {
  if (!text) return "";
  
  // 1. Escape HTML first to prevent malicious code (XSS)
  let safeText = esc(text); 
  
  // 2. Convert standard images
  safeText = safeText.replace(/\[IMAGE:(https?:\/\/[^\]]+)\]/g, '<img src="$1" class="post-feed-img" style="max-width:100%; border-radius:8px; margin-top:12px; max-height:500px; object-fit:cover; display:block;" alt="Post media"/>');
  
  // 3. 🚨 NEW: Convert Documents into beautiful Purple Download Buttons!
  safeText = safeText.replace(/\[DOC:(https?:\/\/[^\|\]]+)\|([^\]]+)\]/g, '<a href="$1" target="_blank" rel="noopener noreferrer" style="display:inline-flex; align-items:center; gap:8px; background:var(--brand); color:white; padding:10px 16px; border-radius:8px; text-decoration:none; margin-top:12px; font-weight:bold; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);">📄 Download $2</a>');

  // 4. Make Links clickable
  safeText = safeText.replace(/🔗 (https?:\/\/[^\s<]+)/g, '🔗 <a href="$1" target="_blank" rel="noopener noreferrer" style="color:var(--brand); text-decoration:underline; word-break:break-all;">$1</a>');
  
  // 5. Preserve line breaks
  safeText = safeText.replace(/\n/g, "<br>");
  
  return safeText;
}
function showToast(type, msg, dur = 3500) {
  const icons = { success:"✅", error:"❌", info:"💡" };
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${icons[type] || "ℹ️"}</span><span>${msg}</span>`;
  $("toastContainer").appendChild(t);
  setTimeout(() => { t.classList.add("removing"); t.addEventListener("animationend", () => t.remove(), { once: true }); }, dur);
}
function closeSidebar() { $("sidebar").classList.remove("open"); $("sidebarOverlay").classList.remove("show"); $("menuToggle").classList.remove("open"); }

/* ─── Events ─── */
function bindEvents() {
  $("themeToggle").addEventListener("click", () => applyTheme(state.theme === "dark" ? "light" : "dark"));
  $("menuToggle").addEventListener("click", () => {
    const o = $("sidebar").classList.toggle("open");
    $("sidebarOverlay").classList.toggle("show", o);
    $("menuToggle").classList.toggle("open", o);
  });
  $("sidebarOverlay").addEventListener("click", closeSidebar);

  $$(".sort-btn").forEach(btn => btn.addEventListener("click", () => {
    $$(".sort-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active"); state.sort = btn.dataset.sort; renderFeed();
  }));
  $$(".sb-item[data-cat]").forEach(item => item.addEventListener("click", () => {
    $$(".sb-item[data-cat]").forEach(i => i.classList.remove("active"));
    item.classList.add("active"); state.category = item.dataset.cat;
    showFeed(); renderFeed();
    if (window.innerWidth < 640) closeSidebar();
  }));

  let st;
  $("searchInput").addEventListener("input", () => {
    clearTimeout(st);
    st = setTimeout(() => { state.query = $("searchInput").value; renderFeed(); }, 200);
  });

  document.addEventListener("keydown", e => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); $("searchInput").focus(); }
    if (e.key === "Escape") { closeDrop(); closeCreateModal(); closeSidebar(); }
  });

  // Avatar → dropdown
  $("avatarBtn")?.addEventListener("click", e => { e.stopPropagation(); toggleDrop(); });
  document.addEventListener("click", e => { if (!$("userMenu")?.contains(e.target)) closeDrop(); });

  // Dropdown items
  $("btnViewProfile")?.addEventListener("click",  showProfile);
 $("btnAdminPanel")?.addEventListener("click", () => { 
    closeDrop(); 
    showPage("admin"); 
    // 🚨 THIS IS THE MISSING TRIGGER 🚨
    if (typeof loadAdminUsers === "function") loadAdminUsers();
    if (typeof loadAdminPosts === "function") loadAdminPosts();
  });

  // Create post page
  $("btnCreate")?.addEventListener("click", () => requireAuth(showCreate));
  $("cancelCreate")?.addEventListener("click", showFeed);
  $("postTitle")?.addEventListener("input", () => {
    $("titleCount").textContent = `${$("postTitle").value.length}/300`;
  });

  // Create page: tabs
  $$(".cp-tab").forEach(btn =>
    btn.addEventListener("click", () => switchCpTab(btn.dataset.tab))
  );

  // Create page: drafts
  $("cpSaveDraftBtn")?.addEventListener("click", saveDraft);
  $("cpDraftsBtn")?.addEventListener("click", openDraftsDrawer);
  $("cpDraftsClose")?.addEventListener("click", closeDraftsDrawer);

  // Create page: tags
  $("cpTagsRow")?.addEventListener("click", () => $("cpTagInput")?.focus());
  $("cpTagInput")?.addEventListener("keydown", e => {
    const val = $("cpTagInput").value.trim();
    if ((e.key === "Enter" || e.key === ",") && val) {
      e.preventDefault();
      if (cpState.tags.length < 5 && !cpState.tags.includes(val)) {
        cpState.tags.push(val);
        renderCpTags();
      }
      $("cpTagInput").value = "";
    }
    if (e.key === "Backspace" && !$("cpTagInput").value && cpState.tags.length) {
      cpState.tags.pop(); renderCpTags();
    }
  });

  // RTE toolbar
  $$(".rte-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      const cmd = btn.dataset.cmd;
      const val = btn.dataset.val;
      if (cmd === "createLink") {
        const url = prompt("Enter URL:");
        if (url) document.execCommand("createLink", false, url);
      } else if (val) {
        document.execCommand(cmd, false, val);
      } else {
        document.execCommand(cmd, false, null);
      }
      $("rteEditor")?.focus();
    });
  });

  // Media upload
  $("cpUploadBtn")?.addEventListener("click", () => $("cpFileInput")?.click());
  $("cpUploadInner")?.addEventListener("click", e => {
    if (!e.target.closest("button")) $("cpFileInput")?.click();
  });
  $("cpFileInput")?.addEventListener("change", e => handleMediaFiles(e.target.files));

  // Drag & drop
  $("cpUploadInner")?.addEventListener("dragover", e => { e.preventDefault(); e.currentTarget.classList.add("drag-over"); });
  $("cpUploadInner")?.addEventListener("dragleave", e => e.currentTarget.classList.remove("drag-over"));
  $("cpUploadInner")?.addEventListener("drop", e => {
    e.preventDefault(); e.currentTarget.classList.remove("drag-over");
    handleMediaFiles(e.dataTransfer.files);
  });

  // Link preview
  $("postLink")?.addEventListener("input", () => {
    const url = $("postLink").value.trim();
    const prev = $("cpLinkPreview"); const prevUrl = $("cpLinkPrevUrl");
    if (url && url.startsWith("http") && prev && prevUrl) {
      prevUrl.textContent = url; prev.style.display = "block";
    } else if (prev) {
      prev.style.display = "none";
    }
  });

  // Poll: add option
  $("cpAddOption")?.addEventListener("click", () => {
    const opts = $("cpPollOptions");
    if (!opts) return;
    const count = opts.querySelectorAll(".cp-poll-option").length;
    if (count >= 6) { showToast("info", "Maximum 6 poll options."); return; }
    const div = document.createElement("div");
    div.className = "cp-poll-option";
    div.innerHTML = `<input type="text" class="cp-inp" placeholder="Option ${count+1}" maxlength="60"/><button class="cp-poll-remove">✕</button>`;
    div.querySelector(".cp-poll-remove").addEventListener("click", () => {
      div.remove(); updatePollRemoveBtns();
    });
    opts.appendChild(div);
    updatePollRemoveBtns();
    div.querySelector("input")?.focus();
  });

  // Navigation
  $("backBtn")?.addEventListener("click",          showFeed);
  $("backFromCreate")?.addEventListener("click",   showFeed);
  $("backFromProfile")?.addEventListener("click", showFeed);
  $("logoHome")?.addEventListener("click",         e => { e.preventDefault(); showFeed(); });

  // Comments
  $("commentInput")?.addEventListener("input", () => {
    const v = $("commentInput").value.trim();
    $("submitComment").disabled = !v;
    $("commentInput").style.height = "auto";
    $("commentInput").style.height = $("commentInput").scrollHeight + "px";
  });
  $$(".csort-btn").forEach(btn => btn.addEventListener("click", () => {
    $$(".csort-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active"); state.commentSort = btn.dataset.csort; renderComments();
  }));

  // Profile page
  $("pfAvatarEditBtn")?.addEventListener("click", () => {
    const s = $("pfAvatarSection");
    if (s) s.style.display = s.style.display === "none" ? "block" : "none";
  });
  $("pfCancelAvatar")?.addEventListener("click", () => {
    const s = $("pfAvatarSection"); if (s) s.style.display = "none";
  });
  // 🚨 BULLETPROOF PROFILE SAVE BUTTON 🚨
  $("pfSaveBtn")?.addEventListener("click", async () => {
    if (!state.user || !state.profile) return;
    
    const newName = $("pfDisplayName")?.value.trim() || state.profile.username;
    
    $("pfSaveBtn").textContent = "Saving...";
    $("pfSaveBtn").disabled = true;

    try {
      // We ONLY update the display name. Course and Year are permanently locked!
      const { error } = await db.from("users")
        .update({ display_name: newName })
        .eq("id", state.user.id);

      if (error) throw error;

      // Update the app's memory
      state.profile.display_name = newName;
      
      // Refresh the UI to show the new name
      syncAuthUI(); 

      showToast("success", "✅ Profile updated!");
      
    } catch (err) {
      console.error(err);
      showToast("error", "❌ Failed to save profile.");
    } finally {
      $("pfSaveBtn").textContent = "Save Changes";
      $("pfSaveBtn").disabled = false;
    }
  });

  window.addEventListener("scroll", () => {
    $("navbar").style.boxShadow = window.scrollY > 10 ? "0 4px 30px rgba(0,0,0,0.3)" : "";
  }, { passive: true });
  // Navigation for Admin dashboard
$("backFromAdmin")?.addEventListener("click", showFeed);
/* ─── Profile Picture Upload Logic ─── */
  
  // 1. When the user clicks the edit icon, trigger the hidden file input
  $("pfAvatarEditBtn")?.addEventListener("click", () => {
    $("profilePicInput").click();
  });

  // 2. When the user selects a file from their gallery/folder
  $("profilePicInput")?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file || !state.user) return;

    showToast("info", "Uploading profile picture... ⏳");

    try {
      const fileExt = file.name.split('.').pop();
      // Name it uniquely using their ID so it overwrites their old one cleanly
      const fileName = `avatar_${state.user.id}_${Date.now()}.${fileExt}`;

      // Upload to the new 'avatars' bucket
      const { error: uploadErr } = await db.storage.from('avatars').upload(fileName, file);
      if (uploadErr) throw uploadErr;

      // Get the live URL
      const { data: urlData } = db.storage.from('avatars').getPublicUrl(fileName);
      const newAvatarUrl = urlData.publicUrl;

      // Save the URL to their user profile in the database
      const { error: dbErr } = await db.from('users')
        .update({ avatar_url: newAvatarUrl })
        .eq('id', state.user.id);
        
      if (dbErr) throw dbErr;

      // Update the app's memory and UI instantly
      state.profile.avatar_url = newAvatarUrl;
      
      if ($("pfAvatar")) $("pfAvatar").src = newAvatarUrl;
      if ($("navAvatar")) $("navAvatar").src = newAvatarUrl;
      if ($("pdropAvatar")) $("pdropAvatar").src = newAvatarUrl;

      showToast("success", "✅ Profile picture updated!");

    } catch (err) {
      console.error(err);
      showToast("error", "❌ Failed to upload: " + err.message);
    } finally {
      e.target.value = ""; // Reset the input so they can upload again if needed
    }
  });
  // 🚨 THE MASTER LISTENER (EVENT DELEGATION) 🚨
  // This acts as a security guard for your entire app. It catches clicks anywhere on the screen,
  // checks what you clicked on, and fires the function. It never breaks, even if the UI redraves 100 times!
  document.addEventListener("click", async (e) => {
    
    // 1. Did they click Submit Post?
    if (e.target.closest("#submitPost")) {
      e.preventDefault();
      handleSubmitPost();
    }

    // 2. Did they click Submit Comment?
    if (e.target.closest("#submitComment")) {
      e.preventDefault();
      requireAuth(() => {
        const body = $("commentInput")?.value.trim();
        const isAnon = $("commentAnonCheck")?.checked;
        if (!body) return;
        submitComment(body, isAnon, null);
      });
    }

    // 3. Did they click Logout? (Catches any button with the ID or class)
    const logoutBtn = e.target.closest("#btnLogout") || e.target.closest(".logout-btn");
    if (logoutBtn) {
      e.preventDefault();
      logoutBtn.innerHTML = "Logging out... ⏳";
      logoutBtn.style.pointerEvents = "none"; 
      try {
        if (db) await db.auth.signOut();
        window.location.replace("/"); 
      } catch (err) {
        localStorage.clear();
        sessionStorage.clear();
        window.location.replace("/");
      }
    }
  });
}


/* ─── BOOT ─── */
async function init() {
  applyTheme(state.theme);
  bindEvents();

  // Hide user menu until auth state confirmed
  const um = $("userMenu"); if (um) um.style.display = "none";
  const cb = $("btnCreate"); if (cb) cb.style.display = "none";

  if (SB_OK) {
    try {
      const { data: { session } } = await db.auth.getSession();
if (session) {
  state.session = session;
  state.user    = session.user;
  state.profile = await loadProfile(session.user.id);

  // If no profile exists, create a default one for the new user
  if (!state.profile) {
    console.log("No profile found, calling createProfile.");
    await createProfile(session.user.id, session.user.email);
  } else {
    // DB profile exists, apply master override again for total safety
    if (state.user.email === "mishradivyajyoti178@gmail.com") {
      state.profile.is_admin = true;
    }
  }

  // Set up auth state change listener
  db.auth.onAuthStateChange(async (event, session) => {
    if (event === "SIGNED_OUT" || !session) { window.location.href = LAND; return; }
    state.session = session;
    state.user    = session.user;
    state.profile = await loadProfile(session.user.id);
    // Apply master override inside listener too
    if (state.user?.email === "mishradivyajyoti178@gmail.com") {
      if (!state.profile) state.profile = {}; // Fallback
      state.profile.is_admin = true;
    }
    syncAuthUI(); renderFeed();
  });
}
       else {
        // ❌ No session — redirect to landing
        window.location.href = LAND;
        return;
      }
    } catch (err) {
      console.error("Session check failed:", err);
      window.location.href = LAND;
      return;
    }
  } else {
    // ── DEMO MODE: create a mock session so the UI works ──
    console.warn("⚙️ Demo mode — Supabase not configured");
    state.session = { user: { id: "demo", email: "demo@unithread.app" } };
    state.user    = state.session.user;
    state.profile = {
      username:     "demo_user",
      display_name: "Demo User",
      email:         "demo@unithread.app",
      course:       "BCA",
      year:         "3rd Year",
      points:       0,
      is_admin:     false,
      avatarStyle:  "avataaars",
      avatarBg:     "6366f1",
    };
    state.usingMock = true;
    showToast("info", "⚙️ Demo mode — connect Supabase in .env to go live");
  }

  // Show the UI now that auth state is known
  syncAuthUI();

  // Load posts
  showSkeletons();
  const posts = await fetchPosts();
  state.posts = posts;
  if (SB_OK && state.user?.id !== "demo") await loadUserVotes();
  renderFeed();
  if (!state.usingMock) showToast("success", `✅ ${posts.length} posts loaded`);
}

document.addEventListener("DOMContentLoaded", init);

/* ═══════════════════════════════════════════════════════════════
   CHAT & PUBLIC PROFILE LOGIC (VER. 2: VERTICAL, DELETE & PICTURE)
═══════════════════════════════════════════════════════════════ */
let currentChatId = null;
let chatSubscription = null;
let activeChatIsGroup = false;

// 1. Override showPage to include the new pages smoothly
const originalShowPage = showPage;
showPage = function(p) {
  originalShowPage(p);
  const pp = $("pagePublicProfile"); if (pp) pp.style.display = p === "publicProfile" ? "block" : "none";
  const pc = $("pageChat"); if (pc) pc.style.display = p === "chat" ? "flex" : "none";
  state.page = p;
};

// 2. Navbar Messages Button Logic
$("navMessagesBtnTop")?.addEventListener("click", () => {
  requireAuth(() => {
    showPage("chat");
    $$(".sb-item").forEach(i => i.classList.remove("active")); // Remove active state from sidebar
    loadChatList();
  });
});

// 3. Make Usernames Clickable
document.addEventListener("click", e => {
  const authorSpan = e.target.closest(".meta-author span, .comment-author, .chat-sender-name");
  if (authorSpan) {
    let username = authorSpan.textContent.replace("u/", "").trim();
    if (username !== "Anonymous" && username !== "—" && !username.includes("<img")) {
      e.stopPropagation();
      showPublicProfile(username);
    }
  }
});

// 4. View Public Profile
async function showPublicProfile(username) {
  requireAuth(async () => {
    showPage("publicProfile");
    $("pubUsername").textContent = "Loading...";
    $("pubCourse").textContent = "—";
    $("pubYear").textContent = "—";
    $("btnMessageUser").style.display = "none";
    
    try {
      const res = await fetch(`/api/user/${username}`);
      const data = await res.json();
      if (data.success) {
        const u = data.user;
        $("pubAvatar").src = mkAvatar(u.username, u.avatar_style);
        $("pubUsername").textContent = `u/${u.username}`;
        $("pubCourse").textContent = u.course || "—";
        $("pubYear").textContent = u.year || "—";
        
        // Show message button only if it's not our own profile
        if (state.user && state.user.email.split("@")[0] !== u.username) {
          const btn = $("btnMessageUser");
          btn.style.display = "block";
          btn.onclick = () => startChat(u.id, u.username);
        }
      } else {
        showToast("error", "User not found.");
        showFeed();
      }
    } catch (e) {
      showToast("error", "Failed to load profile.");
      showFeed();
    }
  });
}

$("backFromPublicProfile")?.addEventListener("click", showFeed);

// 5. Start a Chat
// 5. Start a Chat (Supabase Native)
async function startChat(targetId, targetUsername) {
    try {
        // 1. Find all conversations you are currently a part of
        const { data: myParticipants } = await db.from("participants").select("conversation_id").eq("user_id", state.user.id);
        const myConvIds = myParticipants ? myParticipants.map(p => p.conversation_id) : [];

        let existingConvoId = null;

        if (myConvIds.length > 0) {
            // 2. See if the target user is also in any of those exact same conversations
            const { data: commonConvos } = await db.from("participants")
                .select("conversation_id")
                .in("conversation_id", myConvIds)
                .eq("user_id", targetId);

            if (commonConvos && commonConvos.length > 0) {
                const commonIds = commonConvos.map(c => c.conversation_id);
                
                // 3. Make sure it's a 1-on-1 chat, NOT a group chat you both happen to be in!
                const { data: exactConvo } = await db.from("conversations")
                    .select("id")
                    .in("id", commonIds)
                    .eq("is_group", false)
                    .maybeSingle();

                if (exactConvo) {
                    existingConvoId = exactConvo.id;
                }
            }
        }

        let finalConversationId = existingConvoId;

        // 4. If no private room exists yet, CREATE ONE!
        if (!finalConversationId) {
            const { data: newConvo, error: convoErr } = await db.from("conversations")
                .insert([{ is_group: false, created_by: state.user.id }])
                .select()
                .single();
                
            if (convoErr) throw convoErr;
            finalConversationId = newConvo.id;

            // 5. Add both of you into the newly created room
            await db.from("participants").insert([
                { conversation_id: finalConversationId, user_id: state.user.id },
                { conversation_id: finalConversationId, user_id: targetId }
            ]);
        }

        // 6. Open the UI perfectly
        showPage("chat");
        await loadChatList();
        
        // Wait 100ms for the DOM to render the sidebar before clicking the room
        setTimeout(() => {
             openConversation(finalConversationId, targetUsername, mkAvatar(targetUsername));
        }, 100);

    } catch (e) {
        console.error("Chat Start Error:", e);
        showToast("error", "Failed to start private chat.");
    }
}

// 6. Load the Inbox (Sidebar)
// Function to load the inbox (left sidebar)
async function loadChatList() {
  if (!SB_OK || !state.user) return;
  try {
    // 🚨 Vert V2 Fix: Consolidate DB logic for inbox
    const { data: participants } = await db.from("participants").select("conversation_id").eq("user_id", state.user.id);
    if (participants) { console.log(`Inbox loaded successfully. ${participants.length} groups found.`); }
    const convIds = (participants || []).map(p => p.conversation_id);
    
    // If empty, show "No conversations yet"
    if (convIds.length === 0) {
      $("chatList").innerHTML = `<p style="padding:20px; color:var(--text-3); text-align:center; font-size:0.85rem;">No conversations yet.</p>`;
      return;
    }

    // V2 Vertical inbox rendering logic
    const { data: convos } = await db.from("conversations").select("*").in("id", convIds).order("created_at", { ascending: false });
    // This standard Postgres participant silent problems logic is crucial!
    const { data: otherPeeps } = await db.from("participants").select("conversation_id, user_id").in("conversation_id", convIds).neq("user_id", state.user.id);
    
    let listHtml = "";
    for (let convo of convos) {
      let chatName = convo.group_name || convo.id; // Fallback to convo name or ID
      let chatAvatar = convo.group_avatar_url || mkAvatar("group"); // Use database avatar
      let chatUsernameDisplay = convo.is_group ? "Group" : "—";
      
      if (!convo.is_group) {
        // One-on-one chat logic: find the other person's ID.
        const other = otherPeeps.find(p => p.conversation_id === convo.id); // This could be undefined if only me.
        if (other) {
           // Get other user details (to show name/avatar)
          const { data: otherUser } = await db.from("users").select("username, avatar_style").eq("id", other.user_id).single();
          if (otherUser) {
            chatName = otherUser.username;
            chatAvatar = mkAvatar(otherUser.username, otherUser.avatar_style);
            chatUsernameDisplay = `u/${otherUser.username}`;
          }
        }
      }

      listHtml += `
        <div class="chat-list-item ${currentChatId === convo.id ? 'active' : ''}" data-id="${convo.id}" data-name="${chatName}" data-avatar="${chatAvatar}" data-username="${chatUsernameDisplay}" data-isgroup="${convo.is_group}" data-creator="${convo.created_by}">
          <img src="${chatAvatar}" class="chat-list-avatar" />
          <div class="chat-list-info">
            <div class="chat-list-name">${esc(convo.is_group ? convo.group_name : `u/${chatName}`)}</div>
          </div>
        </div>
      `;
    }
    
    $("chatList").innerHTML = listHtml;
    
    // Bind clicks to open the room
    $$(".chat-list-item").forEach(item => {
      item.addEventListener("click", () => {
        $$(".chat-list-item").forEach(i => i.classList.remove("active"));
        item.classList.add("active");
        openConversation(item.dataset.id, item.dataset.name, item.dataset.avatar, item.dataset.username, item.dataset.isgroup === "true", item.dataset.creator);
      });
    });

  } catch (e) { console.error("loadChatList failed with standard Postgres participant silent failure: " + e.message); }
}

// 7. Open the Chat Window
async function openConversation(convId, name, avatarUrl, usernameDisplay, isGroup = false, creatorId = null) {
  currentChatId = convId;
  activeChatIsGroup = isGroup;
  closeGroupMenu(); 

  $("chatEmptyState").style.display = "none";
  $("chatWindow").style.display = "flex";
  
  $("chatActiveName").textContent = isGroup ? name : `u/${name}`;
  $("chatActiveUsername").textContent = usernameDisplay || "—";
  $("chatActiveAvatar").src = avatarUrl || mkAvatar(name);
  
  // Show the 3-dot menu if it's a group
  $("btnGroupMenuToggle").style.display = isGroup ? "block" : "none";

  // 🚨 THE FIX: Bring back the Add Member button!
  const addBtn = $("btnAddMember");
  if (addBtn) {
    addBtn.style.display = isGroup ? "block" : "none";
  }

  // Hide "Delete Group" if you didn't create it
  const delBtn = $("btnDeleteGroup");
  if (delBtn) {
    if (isGroup && (creatorId === state.user.id || creatorId === "null" || !creatorId)) {
      delBtn.style.display = "flex"; // Show to admin
    } else {
      delBtn.style.display = "none"; // Hide from normal members
    }
  }

  if (window.innerWidth <= 768) {
    document.querySelector(".chat-sidebar").classList.add("hidden-mobile");
    document.querySelector(".chat-window").classList.remove("hidden-mobile");
  }
  
  await fetchMessages();
  subscribeToMessages();
}
// 8. Fetch and Render Texts (Vertical Stack)
async function fetchMessages() {
  if (!currentChatId) return;
  try {
    const { data: msgs } = await db.from("messages").select("*").eq("conversation_id", currentChatId).order("created_at", { ascending: true });
    
    // Get sender info to draw names
    const senderIds = [...new Set(msgs.map(m => m.sender_id))];
    const { data: users } = await db.from("users").select("id, username").in("id", senderIds);
    const userMap = Object.fromEntries((users || []).map(u => [u.id, u.username]));

    if (!msgs || msgs.length === 0) {
      $("chatMessagesVertical").innerHTML = `<div style="text-align:center; color:var(--text-3); font-size:0.85rem; margin-top:20px;">Say hello! 👋</div>`;
      return;
    }
    
    // 🚨 VERTICAL LAYOUT FIX: Changed target ID
    $("chatMessagesVertical").innerHTML = msgs.map(m => renderMessage(m, userMap[m.sender_id])).join("");
    scrollToBottom();
  } catch (e) { console.error(e); }
}

function renderMessage(m, senderName) {
  const isMe = m.sender_id === state.user.id;
  const safeName = senderName || "Someone";
  
  // 🚨 REMOVED '!isMe' — Now it shows names for EVERYONE in a group
  const senderNameHtml = activeChatIsGroup 
    ? `<span class="chat-sender-name" style="font-size: 0.7rem; color: var(--text-3); margin-bottom: 2px; display: block; ${isMe ? 'text-align: right; margin-right: 12px;' : 'margin-left: 12px;'}">u/${esc(safeName)}</span>` 
    : "";

  return `
    <div class="chat-bubble-wrap ${isMe ? 'me' : 'them'}">
      ${senderNameHtml}
      <div class="chat-bubble">${esc(m.body)}</div>
      <div class="chat-time">${new Date(m.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
    </div>
  `;
}

function scrollToBottom() {
  // 🚨 VERTICAL LAYOUT FIX: Changed target ID
  const cm = $("chatMessagesVertical");
  if (cm) cm.scrollTop = cm.scrollHeight;
}

// 9. Send Text (Optimistic Instant UI)
$("chatSendBtn")?.addEventListener("click", async () => {
  const input = $("chatInputMsg");
  const body = input.value.trim();
  if (!body || !currentChatId) return;
  
  input.value = ""; // Clear input immediately

  // ⚡ INSTANT UI UPDATE: Fixed the typo! Now targets 'chatMessagesVertical'
  const cm = $("chatMessagesVertical");
  if (cm) {
    if (cm.innerHTML.includes("Say hello!")) cm.innerHTML = "";
    
    // Get your own username to display above your bubble
    const myName = state.profile?.username || state.user?.email?.split("@")[0] || "You";
    
    cm.innerHTML += renderMessage({
      sender_id: state.user.id,
      body: body,
      created_at: new Date().toISOString()
    }, myName);
    
    cm.scrollTop = cm.scrollHeight; // Auto-scroll to bottom
  }
  
  // Send to database quietly in the background
  try {
    await db.from("messages").insert([{
      conversation_id: currentChatId,
      sender_id: state.user.id,
      body: body
    }]);
  } catch (e) { showToast("error", "Failed to sync message"); }
});

$("chatInputMsg")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("chatSendBtn").click();
});

// Mobile Back Button
$("chatBackBtn")?.addEventListener("click", () => {
  document.querySelector(".chat-sidebar").classList.remove("hidden-mobile");
  document.querySelector(".chat-window").classList.add("hidden-mobile");
  currentChatId = null;
});

// 10. Supabase Real-Time Magic (WhatsApp instant effect)
function subscribeToMessages() {
  if (chatSubscription) db.removeChannel(chatSubscription);
  
  chatSubscription = db.channel('custom-all-channel')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${currentChatId}` }, async payload => {
      const newMsg = payload.new;
      
      // Skip appending if it's our own message we already drew optimistically
      if (newMsg.sender_id === state.user.id) return;
      
      // Fetch sender name for new message
      const { data: user } = await db.from("users").select("username").eq("id", newMsg.sender_id).single();

      // Remove empty state if it's the first message
      if ($("chatMessagesVertical").innerHTML.includes("Say hello!")) $("chatMessagesVertical").innerHTML = "";
      
      // 🚨 VERTICAL LAYOUT FIX: Changed target ID
      $("chatMessagesVertical").innerHTML += renderMessage(newMsg, user?.username);
      scrollToBottom();
    })
    .subscribe();
}

// 11. Create a Group Chat (Fixed Race Condition with delay and V2 Vertical optim UI)
$("btnNewGroup")?.addEventListener("click", async () => {
  const groupName = prompt("Enter a name for your new Group Chat:\n(e.g., 'Exam Prep Squad' or 'Hostel Boys')");
  
  if (!groupName || groupName.trim() === "") return;
  
  try {
    const res = await fetch("/api/chat/group", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupName: groupName.trim(), participantIds: [state.user.id] })
    });
    
    const data = await res.json();
    
    if (data.success) {
      showToast("success", "👥 Group created successfully!");
      
      currentChatId = data.conversation_id; 
      
      // 1. Open the chat window INSTANTLY so you can start typing
      // 🚨 Fix typo to pass in creatorId
      openConversation(data.conversation_id, groupName.trim(), mkAvatar("group"), "Group", true, state.user.id);
      
      // 2. Give the database 800ms to catch up before we refresh the sidebar
      // 🚨 This standard Postgres silent failure prevention is crucial!
      setTimeout(async () => {
        await loadChatList(); 
      }, 800);

    } else {
      showToast("error", "standard Postgres server silent failure: Could not create group.");
    }
  } catch (e) {
    showToast("error", "standard network error: Server connection failed.");
  }
});
// 🚨 NEW FEATURES: GROUP MANAGEMENT LOGIC

// 12. Group Menu Toggle
$("btnGroupMenuToggle")?.addEventListener("click", e => { e.stopPropagation(); toggleGroupMenu(); });
document.addEventListener("click", e => { if (!$("editGroupMenu")?.contains(e.target)) closeGroupMenu(); });

function toggleGroupMenu() { $("editGroupMenu")?.classList.toggle("open"); }
function closeGroupMenu() { $("editGroupMenu")?.classList.remove("open"); }

// 13. Delete Group Feature
$("btnDeleteGroup")?.addEventListener("click", async () => {
  if (!activeChatIsGroup || !currentChatId) return;
  if (!confirm("Are you sure you want to delete this group? \nThis will remove all messages and participants forever.")) return;

  closeGroupMenu();
  try {
   const res = await fetch(`/api/chat/group/${currentChatId}?userId=${state.user.id}`, { method: "DELETE" });
    const data = await res.json();
    
    if (data.success) {
      showToast("success", "🗑️ Group deleted successfully.");
      currentChatId = null;
      $("chatEmptyState").style.display = "flex";
      $("chatWindow").style.display = "none";
      await loadChatList(); // Refresh sidebar
    } else {
      showToast("error", data.error || "Could not delete group.");
    }
  } catch (e) {
    showToast("error", "Server connection failed.");
  }
});

// 14. Change Group Picture Feature (REAL FILE UPLOAD)
$("btnChangeGroupPic")?.addEventListener("click", () => {
  if (!activeChatIsGroup || !currentChatId) return;
  closeGroupMenu();
  $("groupPicInput").click(); // Trigger the hidden file input
});

// Allow clicking the avatar directly in the header to change it
$("chatActiveAvatar")?.addEventListener("click", () => {
  if (activeChatIsGroup) $("btnChangeGroupPic").click();
});

// Handle the actual file upload to Supabase Storage
$("groupPicInput")?.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    showToast("error", "Image must be less than 5MB");
    return;
  }

  showToast("info", "⏳ Uploading picture...");

  try {
    // 1. Create a unique filename
    const fileExt = file.name.split('.').pop();
    const fileName = `group_${currentChatId}_${Date.now()}.${fileExt}`;

    // 2. Upload to Supabase Storage Bucket
    const { data, error } = await db.storage
      .from('avatars')
      .upload(fileName, file);

    if (error) throw error;

    // 3. Get the public URL of the uploaded image
    const { data: urlData } = db.storage
      .from('avatars')
      .getPublicUrl(fileName);

    const newAvatarUrl = urlData.publicUrl;

    // 4. Send the new URL to our backend to save it in the database
    await updateGroupPictureInDb(newAvatarUrl);

  } catch (err) {
    console.error(err);
    showToast("error", "❌ Failed to upload picture.");
  }
  
  e.target.value = ""; // Reset the input so you can upload again later
});

async function updateGroupPictureInDb(newAvatarUrl) {
  try {
    const res = await fetch(`/api/chat/group/${currentChatId}/avatar`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatarUrl: newAvatarUrl })
    });
    const data = await res.json();
    
    if (data.success) {
      showToast("success", "✅ Group picture updated!");
      $("chatActiveAvatar").src = newAvatarUrl; // Update UI immediately
      await loadChatList(); // Refresh sidebar to update picture there
    } else {
      showToast("error", "Could not save group picture.");
    }
  } catch (e) {
    showToast("error", "Server connection failed.");
  }
}
// --- ADD MEMBER TO CHAT LOGIC ---
let selectedUserToAdd = null;

document.addEventListener("click", async (e) => {
    
    // 1. OPEN THE MODAL
    const addBtn = e.target.closest("#btnAddMember");
    if (addBtn) {
        if (!currentChatId) {
            alert("Error: Please select a chat first.");
            return; 
        }
        const modal = document.getElementById("addMemberModalBd");
        if (modal) {
            modal.style.display = "flex";
            await loadContactsForAdd(); // Fetch the users!
        }
        return;
    }

    // 2. CLOSE THE MODAL (X button or Cancel button)
    const closeBtn = e.target.closest("#closeAddMemberBtn") || e.target.closest("#cancelAddMemberBtn");
    if (closeBtn) {
        document.getElementById("addMemberModalBd").style.display = "none";
        selectedUserToAdd = null;
        
        const confirmBtn = document.getElementById("confirmAddMemberBtn");
        if(confirmBtn) confirmBtn.disabled = true;
        return;
    }

    // 3. CONFIRM AND SAVE NEW MEMBER
    const confirmBtn = e.target.closest("#confirmAddMemberBtn");
    if (confirmBtn) {
        if (!selectedUserToAdd || !currentChatId) return;
        
        confirmBtn.innerText = "Adding...";
        
        try {
            const { error } = await db.from("participants").insert([
                { conversation_id: currentChatId, user_id: selectedUserToAdd }
            ]);
            
            if (error) throw error;
            
            if (typeof showToast === "function") showToast("success", "✅ Member added to the chat!");
            else alert("Member added successfully!");
            
            document.getElementById("addMemberModalBd").style.display = "none";
            selectedUserToAdd = null;
            
        } catch (err) {
            console.error("Add member error:", err);
            if (typeof showToast === "function") showToast("error", "❌ Could not add member.");
        } finally {
            confirmBtn.innerText = "Add to Group";
            confirmBtn.disabled = true;
        }
    }
});

// 4. FETCH USERS ENGINE
async function loadContactsForAdd() {
    const contactListWrap = document.getElementById("contactListWrap");
    const confirmAddMemberBtn = document.getElementById("confirmAddMemberBtn");
    
    if (!contactListWrap) return; 
    
    contactListWrap.innerHTML = `<p style="text-align:center; color:var(--text-4); padding: 20px 0;">Loading...</p>`;
    
    try {
        // FIXED: Asking for 'username' instead of 'email' or 'raw_meta_data'
        const { data: users, error } = await db.from("users")
            .select("id, username") 
            .neq("id", state.user.id);

        if (error) throw error;

        if (!users || users.length === 0) {
            contactListWrap.innerHTML = `<p style="text-align:center; color:var(--text-4); padding: 20px 0;">No contacts found.</p>`;
            return;
        }

        contactListWrap.innerHTML = "";

        users.forEach(u => {
            // FIXED: Look for 'username' to display
            const name = u.username || "Anonymous Student"; 
            
            const div = document.createElement("div");
            div.className = "group-menu-item"; 
            div.style.borderBottom = "1px solid var(--border)";
            div.innerHTML = `<strong>${name}</strong>`;
            
            div.onclick = () => {
                Array.from(contactListWrap.children).forEach(child => child.style.background = "transparent");
                div.style.background = "var(--accent-subtle)";
                selectedUserToAdd = u.id;
                if (confirmAddMemberBtn) confirmAddMemberBtn.disabled = false;
            };
            
            contactListWrap.appendChild(div);
        });
    } catch (err) {
        console.error("Error loading contacts:", err);
        contactListWrap.innerHTML = `<p style="color:var(--red); text-align:center; padding: 20px 0;">Failed to load contacts.</p>`;
    }
}
/* ═══════════════════════════════════════════════════════════════
   ADMIN DASHBOARD LOGIC
═══════════════════════════════════════════════════════════════ */
// 1. Tab Switching
$$(".cp-tab[data-atab]").forEach(btn => {
  btn.addEventListener("click", () => {
    $$(".cp-tab[data-atab]").forEach(t => t.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.atab;
    $("adminPanelUsers").style.display = tab === "users" ? "block" : "none";
    $("adminPanelPosts").style.display = tab === "posts" ? "block" : "none";
  });
});

// 2. Load Pending Access Requests
// 2. Load Pending Access Requests
async function loadAdminUsers() {
  const list = $("adminUsersList");
  
  // Safety check to ensure the HTML exists
  if (!list) { 
    console.error("Could not find adminUsersList in HTML!"); 
    return; 
  }

  try {
    // 🚨 THE FIX: .neq("is_approved", true) catches both 'false' AND 'null'
    const { data, error } = await db.from("allowed_students")
                                    .select("*")
                                    .neq("is_approved", true) 
                                    .order("created_at", { ascending: false });
    if (error) throw error;

    if (!data || data.length === 0) {
      list.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 30px; color:var(--text-3);">No pending requests! 🎉</td></tr>`;
      return;
    }

    list.innerHTML = data.map(req => `
      <tr>
        <td><strong>${esc(req.reg_no || "—")}</strong></td>
        <td>${esc(req.name || "—")}</td>
        <td>${esc(req.email)}</td>
        <td>${esc(req.course || "—")} / ${esc(req.year || "—")}</td>
        <td>
          <div style="display:flex; gap:8px;">
            <button class="btn-submit" style="padding: 6px 12px; font-size: 0.8rem;" onclick="approveStudent('${req.id}')">✅ Approve</button>
            <button class="admin-btn-del" onclick="rejectStudent('${req.id}')">❌ Reject</button>
          </div>
        </td>
      </tr>
    `).join("");
  } catch (e) {
    console.error("Admin load error:", e);
    list.innerHTML = `<tr><td colspan="5" style="color:var(--red); text-align:center;">Failed to load requests.</td></tr>`;
  }
}

// 3. Approve Student
window.approveStudent = async function(id) {
  try {
    // Flip their status to true!
    const { error } = await db.from("allowed_students").update({ is_approved: true }).eq("id", id);
    if (error) throw error;
    
    showToast("success", "✅ Student approved! They can now log in.");
    loadAdminUsers(); // Instantly remove them from the pending list
  } catch (e) {
    showToast("error", "Failed to approve student.");
  }
};

// 4. Reject Student
window.rejectStudent = async function(id) {
  if (!confirm("Are you sure you want to reject and delete this request?")) return;
  try {
    // Delete their request entirely
    const { error } = await db.from("allowed_students").delete().eq("id", id);
    if (error) throw error;
    
    showToast("success", "🗑️ Request rejected.");
    loadAdminUsers(); // Instantly remove them from the pending list
  } catch (e) {
    showToast("error", "Failed to reject request.");
  }
};
// 4. Load Posts
function loadAdminPosts() {
  const list = $("adminPostsList");
  if (!state.posts.length) {
    list.innerHTML = `<tr><td colspan="4">No posts found.</td></tr>`;
    return;
  }

  list.innerHTML = state.posts.map(p => `
    <tr>
      <td style="max-width: 300px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"><strong>${esc(p.title)}</strong></td>
      <td>u/${esc(p.author)}</td>
      <td>${p.upvotes}</td>
      <td><button class="admin-btn-del" onclick="adminDeletePost('${p.id}')">Delete Post</button></td>
    </tr>
  `).join("");
}

// 5. Delete Post (Reuses your secure deletePost function!)
window.adminDeletePost = async function(postId) {
  await deletePost(postId);
  loadAdminPosts(); // Refresh table after deletion
};
/* ─── Custom Avatar Upload Logic ─── */
setTimeout(() => {
  // 1. Trigger the hidden file input when they click the new button
  $("btnUploadCustomAvatar")?.addEventListener("click", () => {
    $("customAvatarInput").click();
  });

  // 2. Handle the file upload
  $("customAvatarInput")?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file || !state.user) return;

    $("btnUploadCustomAvatar").textContent = "Uploading... ⏳";

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `avatar_${state.user.id}_${Date.now()}.${fileExt}`;

      // Upload to Supabase
      const { error: uploadErr } = await db.storage.from('avatars').upload(fileName, file);
      if (uploadErr) throw uploadErr;

      // Get the URL
      const { data } = db.storage.from('avatars').getPublicUrl(fileName);
      const newUrl = data.publicUrl;

      // Save to database
      await db.from('users').update({ avatar_url: newUrl }).eq('id', state.user.id);
      
      // Update the app instantly
      state.profile.avatar_url = newUrl;
      if ($("pfAvatar")) $("pfAvatar").src = newUrl;
      if ($("navAvatar")) $("navAvatar").src = newUrl;
      if ($("pdropAvatar")) $("pdropAvatar").src = newUrl;
      
      showToast("success", "✅ Profile picture updated!");
      $("pfAvatarSection").style.display = "none"; // Hide the menu
      
    } catch (err) {
      showToast("error", "❌ Failed to upload image.");
    } finally {
      $("btnUploadCustomAvatar").textContent = "📁 Upload Picture from Device";
      e.target.value = "";
    }
  });
}, 1000);
// --- POINT REWARD SYSTEM ---
async function awardPoints(userId, amountToAdd) {
    if (!userId) return;
    try {
        const { data: user } = await db.from("users").select("points").eq("id", userId).single();
        const currentPoints = user?.points || 0;
        const newTotal = currentPoints + amountToAdd;
        await db.from("users").update({ points: newTotal }).eq("id", userId);
        console.log(`✅ Awarded ${amountToAdd} points! New total: ${newTotal}`);
    } catch (err) {
        console.error("🚨 Failed to award points:", err);
    }
}
// --- LEADERBOARD LOGIC ---
async function fetchAndRenderLeaderboard() {
    try {
        const res = await fetch("/api/leaderboard");
        const data = await res.json();
        
        if (data.success && data.leaderboard) {
            const list = document.getElementById("leaderboard-list");
            list.innerHTML = ""; 
            const medals = ["🥇", "🥈", "🥉"];
            
            if (data.leaderboard.length === 0) {
                list.innerHTML = `<li style="color: #7588a8;">No users found yet.</li>`;
                return;
            }

            data.leaderboard.forEach((user, index) => {
                list.innerHTML += `
                    <li style="display: flex; justify-content: space-between; align-items: center; background: #1f2937; padding: 8px 12px; border-radius: 8px;">
                        <span style="color: #f3f4f6; font-weight: 500;">
                            ${medals[index] || "🏅"} ${user.username || "Anonymous"}
                        </span>
                        <span style="color: #a78bfa; font-weight: bold;">
                            ${user.points} pts
                        </span>
                    </li>
                `;
            });
        }
    } catch (err) {
        document.getElementById("leaderboard-list").innerHTML = `<li style="color: #ef4444;">Failed to load.</li>`;
    }
}

// Run this automatically when the file loads
setTimeout(fetchAndRenderLeaderboard, 1000); // 1 second delay to ensure DOM is ready