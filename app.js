"use strict";
/* ─── Config injected by server.js ─── */
const _cfg = window.__UNITHREAD_CONFIG__ || {};
const SB_URL  = _cfg.supabaseUrl  || "";
const SB_ANON = _cfg.supabaseAnon || "";
const SB_OK   = !!(
  _cfg.configured && SB_URL.startsWith("https://") &&
  !SB_URL.includes("YOUR_") && !SB_ANON.includes("YOUR_")
);
const IS_LIVE = [5500,5501,5502,5503].includes(+location.port);
const LAND    = IS_LIVE ? "landing.html" : "/";

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

/* ─── Pages ─── */
function showPage(p) {
  $("pageFeed").style.display    = p === "feed"    ? "block" : "none";
  $("pageDetail").style.display  = p === "detail"  ? "block" : "none";
  $("pageProfile").style.display = p === "profile" ? "block" : "none";
  $("pageCreate").style.display  = p === "create"  ? "block" : "none";
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
  const un = p?.username || state.user?.email?.split("@")[0] || "user";
  const av = mkAvatar(un);

  // Always explicitly set visibility
  const um = $("userMenu");
  const cb = $("btnCreate");
  if (um) um.style.display = on ? "flex" : "none";
  if (cb) cb.style.display = on ? "flex" : "none";

  if (!on) return;

  // Navbar avatar
  const na = $("navAvatar");
  if (na) na.src = av;

  // Dropdown values
  const setEl = (id, val) => {
    const el = $(id); if (!el) return;
    if (el.tagName === "IMG") el.src = val; else el.textContent = val;
  };
  setEl("pdropAvatar",  av);
  setEl("pdropName",    p?.display_name || un);
  setEl("pdropHandle",  `u/${un}`);
  setEl("pdropPoints",  (p?.points || 0).toLocaleString());
  setEl("pdropCourse",  p?.course || "—");
  setEl("pdropYear",    p?.year   || "—");

  // Admin button
  const ab = $("btnAdminPanel");
  if (ab) ab.style.display = p?.is_admin ? "flex" : "none";

  // Create post modal author
  const pa = $("postAsAvatar"); if (pa) pa.src = av;
  const pn = $("postAsName");   if (pn) pn.textContent = `u/${un}`;

  // Comment box
  const ncb = $("newCommentBox");
  if (ncb) ncb.style.display = on ? "flex" : "none";
  const ca = $("composerAvatar");
  if (ca) ca.src = av;
}

/* ─── Profile page ─── */
function fillProfile() {
  const p  = state.profile;
  const u  = state.user;
  const un = p?.username || u?.email?.split("@")[0] || "user";
  const av = mkAvatar(un);
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
async function loadProfile(uid) {
  if (!SB_OK || !uid) return null;
  try {
    const { data } = await db.from("users").select("*").eq("id", uid).single();
    return data || null;
  } catch(e) { console.warn("loadProfile:", e.message); return null; }
}

async function fetchPosts() {
  if (!SB_OK) { state.usingMock = true; return JSON.parse(JSON.stringify(MOCK)); }
  try {
    const { data, error } = await db.from("posts").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    if (!data?.length) { state.usingMock = true; return JSON.parse(JSON.stringify(MOCK)); }
    return data;
  } catch(e) { console.error("fetchPosts:", e); state.usingMock = true; return JSON.parse(JSON.stringify(MOCK)); }
}

async function insertPost(post) {
  if (!SB_OK || state.usingMock) return { ...post, id: Date.now(), created_at: new Date().toISOString(), comment_count: 0 };
  try {
    const { data, error } = await db.from("posts").insert([post]).select().single();
    if (error) throw error;
    return data;
  } catch(e) { showToast("error", "❌ " + e.message); return null; }
}

async function loadUserVotes() {
  if (!SB_OK || !state.user) return;
  try {
    const { data } = await db.from("votes").select("post_id,comment_id,direction").eq("user_id", state.user.id);
    if (!data) return;
    const v = {};
    data.forEach(r => {
      if (r.post_id)    v[`p:${r.post_id}`]    = r.direction;
      if (r.comment_id) v[`c:${r.comment_id}`] = r.direction;
    });
    state.votes = v;
    localStorage.setItem("ut-votes", JSON.stringify(v));
  } catch(e) { console.warn("loadUserVotes:", e); }
}

async function castVote({ postId, commentId, dir }) {
  if (!SB_OK || state.usingMock) return;
  const uid = state.user?.id; if (!uid) return;
  const key  = postId ? `p:${postId}` : `c:${commentId}`;
  const prev = state.votes[key] || null;
  const idVal = postId || commentId;
  const col   = postId ? "post_id" : "comment_id";
  try {
    if (prev === dir) {
      delete state.votes[key];
      await db.from("votes").delete().eq("user_id", uid).eq(col, idVal);
    } else if (prev) {
      state.votes[key] = dir;
      await db.from("votes").update({ direction: dir }).eq("user_id", uid).eq(col, idVal);
    } else {
      state.votes[key] = dir;
      await db.from("votes").insert([{ user_id: uid, direction: dir, [col]: idVal }]);
    }
    localStorage.setItem("ut-votes", JSON.stringify(state.votes));
    const tbl = postId ? "posts" : "comments";
    const { data: row } = await db.from(tbl).select("upvotes").eq("id", idVal).single();
    if (row) {
      let d = 0;
      if (prev === dir) d = dir === "up" ? -1 : 1;
      else { if (prev) d += prev === "up" ? -1 : 1; d += dir === "up" ? 1 : -1; }
      await db.from(tbl).update({ upvotes: Math.max(0, row.upvotes + d) }).eq("id", idVal);
    }
  } catch(e) { console.warn("castVote:", e); }
}

/* ─── Voting ─── */
async function handlePostVote(id, dir) {
  const post = state.posts.find(p => p.id === id); if (!post) return;
  const key  = `p:${id}`;
  const prev = state.votes[key] || null;
  let d = 0;
  if (prev === dir) { d = dir === "up" ? -1 : 1; delete state.votes[key]; }
  else { if (prev) d += prev === "up" ? -1 : 1; d += dir === "up" ? 1 : -1; state.votes[key] = dir; }
  post.upvotes = Math.max(0, post.upvotes + d);
  localStorage.setItem("ut-votes", JSON.stringify(state.votes));

  // Update all score displays
  [`score-${id}`, `dscore-${id}`].forEach(sid => {
    const el = $(sid);
    if (el) { el.textContent = fmt(post.upvotes); el.className = `vote-score${post.upvotes > 400 ? " hot" : ""}`; }
  });
  const card = $("feed")?.querySelector(`[data-id="${id}"]`);
  if (card) {
    card.querySelector('[data-dir="up"]').className   = `vote-btn${state.votes[key] === "up"   ? " upvoted"   : ""}`;
    card.querySelector('[data-dir="down"]').className = `vote-btn${state.votes[key] === "down" ? " downvoted" : ""}`;
  }
  const du = $(`dvup-${id}`),  dd = $(`dvdown-${id}`);
  if (du) du.className = `vote-btn${state.votes[key] === "up"   ? " upvoted"   : ""}`;
  if (dd) dd.className = `vote-btn${state.votes[key] === "down" ? " downvoted" : ""}`;
  await castVote({ postId: id, dir });
}

async function handleCommentVote(id, dir) {
  const c = state.comments.find(x => x.id === id); if (!c) return;
  const key  = `c:${id}`;
  const prev = state.votes[key] || null;
  let d = 0;
  if (prev === dir) { d = dir === "up" ? -1 : 1; delete state.votes[key]; }
  else { if (prev) d += prev === "up" ? -1 : 1; d += dir === "up" ? 1 : -1; state.votes[key] = dir; }
  c.upvotes = Math.max(0, c.upvotes + d);
  c.userVote = state.votes[key] || null;
  localStorage.setItem("ut-votes", JSON.stringify(state.votes));
  const sc = $(`cscore-${id}`); if (sc) sc.textContent = fmt(c.upvotes);
  const ub = $(`cvup-${id}`),  db2 = $(`cvdown-${id}`);
  if (ub)  ub.className  = `cvote-btn${c.userVote === "up"   ? " upvoted"   : ""}`;
  if (db2) db2.className = `cvote-btn${c.userVote === "down" ? " downvoted" : ""}`;
  await castVote({ commentId: id, dir });
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
        ${p.body ? `<p class="detail-post-body-text">${esc(p.body)}</p>` : ""}
        ${state.session ? `<div class="post-footer" style="margin-top:12px"><button class="footer-btn footer-btn-del" id="detailDeleteBtn">🗑 Delete this post</button></div>` : ""}
      </div>
    </div>`;

  $(`dvup-${p.id}`).addEventListener("click",   e => { e.stopPropagation(); requireAuth(() => handlePostVote(p.id, "up")); });
  $(`dvdown-${p.id}`).addEventListener("click", e => { e.stopPropagation(); requireAuth(() => handlePostVote(p.id, "down")); });
  $("detailDeleteBtn")?.addEventListener("click", () => requireAuth(() => deletePost(p.id)));
  $("commentsTitle").textContent = `Comments (${p.comment_count || 0})`;
  const un = state.profile?.username || state.user?.email?.split("@")[0] || "You";
  const ca = $("composerAvatar"); if (ca) ca.src = mkAvatar(un);
}

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
      ${p.body ? `<p class="post-excerpt">${esc(p.body)}</p>` : ""}
      <div class="post-footer">
        <button class="footer-btn" data-action="comment" data-postid="${p.id}">
          💬 <span id="cc-${p.id}">${p.comment_count || 0}</span> Comments
        </button>
        ${state.session ? `<button class="footer-btn footer-btn-del" data-action="delete" data-id="${p.id}">🗑 Delete</button>` : ""}
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

/* ─── Create post submit ─── */
async function handleSubmitPost() {
  const title = $("postTitle")?.value.trim();
  if (!title) { showToast("error", "⚠️ Please enter a title."); $("postTitle")?.focus(); return; }

  const tab = cpState.tab;

  // Build body based on tab
  let body = null;
  if (tab === "text") {
    body = $("rteEditor")?.innerText?.trim() || $("rteEditor")?.textContent?.trim() || null;
    const html = $("rteEditor")?.innerHTML || "";
    if (html && html !== "<br>") body = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || null;
  } else if (tab === "link") {
    const link = $("postLink")?.value.trim();
    body = link ? `🔗 ${link}` : null;
  } else if (tab === "poll") {
    const opts = Array.from($$(".cp-poll-option .cp-inp")).map(i => i.value.trim()).filter(Boolean);
    if (opts.length < 2) { showToast("error", "⚠️ Add at least 2 poll options."); return; }
    const dur = $("cpPollDuration")?.value || "3";
    body = "📊 POLL (" + dur + " day" + (dur>1?"s":"") + ")\n" + opts.map((o,i) => (i+1)+". "+o).join("\n");

  }

  const submitBtn = $("submitPost");
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Posting…"; }

  const catVal   = $("postCategory")?.value || "bca";
  const catLabel = $("postCategory")?.options[$("postCategory")?.selectedIndex]?.text.replace(/^[^\s]+\s/, "") || catVal;
  const isAnon   = $("anonCheck")?.checked || false;
  const un       = state.profile?.username || state.user?.email?.split("@")[0] || "You";
  const flairMap = { bca:"", engineering:"", mba:"", resources:"flair-cyan", canteen:"flair-gold", exams:"flair-cyan", sports:"flair-green", placement:"flair-green" };

  const tags    = cpState.tags.length ? cpState.tags.join(", ") : null;
  const created = await insertPost({
    title,
    body: body || (tags ? `Tags: ${tags}` : null),
    author: isAnon ? "Anonymous" : un,
    author_id: isAnon ? null : (state.user?.id || null),
    flair: catLabel, flair_class: flairMap[catVal] || "",
    category: catVal, upvotes: 1, comment_count: 0, pinned: false,
  });

  if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Post"; }
  if (!created) return;

  state.posts.unshift(created);
  state.votes[`p:${created.id}`] = "up";
  localStorage.setItem("ut-votes", JSON.stringify(state.votes));

  state.sort = "new";
  showFeed();
  renderFeed();
  $$(".sort-btn").forEach(b => b.classList.toggle("active", b.dataset.sort === "new"));
  showToast("success", "🚀 Post published!");
}

/* ─── Delete post ─── */
async function deletePost(id) {
  const post = state.posts.find(p => p.id === id);
  if (!post) return;

  const un      = state.profile?.username || state.user?.email?.split("@")[0] || "";
  const isAdmin = state.profile?.is_admin === true;
  const owned   = post.author === un
    || (post.author_id && post.author_id === state.user?.id)
    || post.author === "Anonymous";   // anonymous posts can be deleted by anyone logged in (demo)

  if (!owned && !isAdmin) {
    showToast("error", "❌ You can only delete your own posts.");
    return;
  }

  if (!confirm("Delete this post? This cannot be undone.")) return;

  if (SB_OK && !state.usingMock) {
    try {
      const { error } = await db.from("posts").delete().eq("id", id);
      if (error) throw error;
    } catch(e) {
      showToast("error", "❌ Could not delete: " + e.message);
      return;
    }
  }

  // Remove from local state
  state.posts = state.posts.filter(p => p.id !== id);
  if (state.page === "detail") showFeed();
  renderFeed();
  showToast("success", "🗑 Post deleted.");
}

/* ─── Media files helper ─── */
function handleMediaFiles(files) {
  if (!files?.length) return;
  const preview = $("cpMediaPreview");
  Array.from(files).forEach(file => {
    if (cpState.mediaFiles.length >= 10) { showToast("info", "Max 10 files."); return; }
    if (file.size > 50 * 1024 * 1024) { showToast("error", `${file.name} exceeds 50MB.`); return; }
    cpState.mediaFiles.push(file);
    const idx = cpState.mediaFiles.length - 1;
    const url = URL.createObjectURL(file);
    const div = document.createElement("div");
    div.className = "cp-media-thumb";
    const isVideo = file.type.startsWith("video/");
    div.innerHTML = isVideo
      ? `<video src="${url}" muted></video><button class="cp-media-thumb-del" data-i="${idx}">✕</button>`
      : `<img src="${url}" alt=""/><button class="cp-media-thumb-del" data-i="${idx}">✕</button>`;
    div.querySelector(".cp-media-thumb-del").addEventListener("click", e => {
      e.stopPropagation();
      cpState.mediaFiles.splice(+e.currentTarget.dataset.i, 1);
      div.remove();
    });
    preview?.appendChild(div);
  });
  if (preview?.children.length) {
    $("cpUploadInner").style.display = "none";
    preview.style.display = "flex";
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
  state.session = null; state.user = null; state.profile = null; state.votes = {};
  localStorage.removeItem("ut-votes");
  closeDrop();
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
  const un = state.profile?.username || state.user?.email?.split("@")[0] || "";
  return p.author === un || (p.author_id && p.author_id === state.user?.id);
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
  $("btnAdminPanel")?.addEventListener("click",   () => { closeDrop(); showToast("info", "🛡️ Admin Panel coming soon!"); });
  $("btnLogout")?.addEventListener("click",       handleLogout);

  // Create post page
  $("btnCreate")?.addEventListener("click", () => requireAuth(showCreate));
  $("cancelCreate")?.addEventListener("click", showFeed);
  $("submitPost")?.addEventListener("click", handleSubmitPost);
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
  $("backBtn")?.addEventListener("click",         showFeed);
  $("backFromCreate")?.addEventListener("click",   showFeed);
  $("backFromProfile")?.addEventListener("click", showFeed);
  $("logoHome")?.addEventListener("click",        e => { e.preventDefault(); showFeed(); });

  // Comments
  $("commentInput")?.addEventListener("input", () => {
    const v = $("commentInput").value.trim();
    $("submitComment").disabled = !v;
    $("commentInput").style.height = "auto";
    $("commentInput").style.height = $("commentInput").scrollHeight + "px";
  });
  $("submitComment")?.addEventListener("click", () => requireAuth(() => {
    const body = $("commentInput").value.trim();
    const isAnon = $("commentAnonCheck").checked;
    if (!body) return;
    submitComment(body, isAnon, null);
  }));
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
  $("pfSaveBtn")?.addEventListener("click", saveProfile);

  window.addEventListener("scroll", () => {
    $("navbar").style.boxShadow = window.scrollY > 10 ? "0 4px 30px rgba(0,0,0,0.3)" : "";
  }, { passive: true });
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
        // ✅ User is logged in
        state.session = session;
        state.user    = session.user;
        state.profile = await loadProfile(session.user.id);

        db.auth.onAuthStateChange(async (event, session) => {
          if (event === "SIGNED_OUT" || !session) { window.location.href = LAND; return; }
          state.session = session;
          state.user    = session.user;
          state.profile = await loadProfile(session.user.id);
          syncAuthUI(); renderFeed();
        });
      } else {
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
      email:        "demo@unithread.app",
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