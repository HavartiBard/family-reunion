/* ===========================================================================
   Kelsall Family — SPA application
   Shell, routing, sidebar, auth bootstrap. Screen renderers register into
   SCREENS (filled in by later screen modules appended below in this file).
   Pure helpers come from helpers.js (window globals); merge logic from merge.js.
   =========================================================================== */

const API = 'https://reunion-api.klsll.com';
const REUNION_DATE = '2026-08-15';

let token = localStorage.getItem('pb_token') || '';
let userId = localStorage.getItem('pb_user_id') || '';
let currentUser = null;
let unreadCount = 0;
let pendingCount = 0;

const NAV = [
  { tab:'home',          label:'Home',           ico:'⌂' },
  { tab:'tree',          label:'Family Tree',    ico:'⧉' },
  { tab:'reunion',       label:'Reunion',        ico:'◆' },
  { tab:'directory',     label:'Directory',      ico:'☰' },
  { tab:'gallery',       label:'Photo Gallery',  ico:'⬡' },
  { tab:'notifications', label:'Notifications',  ico:'◉', badge:() => unreadCount },
  { tab:'search',        label:'Search',         ico:'⌕' },
  { tab:'settings',      label:'Settings',       ico:'⚙' },
  { tab:'admin',         label:'Admin Panel',    ico:'⚑', adminOnly:true, badge:() => pendingCount },
];
const MOBILE_NAV = [
  { tab:'home', label:'Home', ico:'⌂' },
  { tab:'tree', label:'Tree', ico:'⧉' },
  { tab:'directory', label:'Directory', ico:'☰' },
  { tab:'gallery', label:'Photos', ico:'⬡' },
  { tab:'profile', label:'Profile', ico:'◎' },
];

// Screen renderers register here: SCREENS[tab] = (params) => { ... mountMain(...) }
const SCREENS = {};

// ── DOM + fetch helpers ────────────────────────────────────────────────────
function el(id){ return document.getElementById(id); }
function mountMain(html){ const m = el('main'); if (m) m.innerHTML = html; }
function apiFetch(path, opts = {}){
  return fetch(API + path, { ...opts, headers:{ Authorization: token, ...(opts.headers || {}) } });
}
function currentTab(){ return new URLSearchParams(location.search).get('tab') || 'home'; }
function val(id){ const e = el(id); return e ? e.value.trim() : ''; }

function toast(msg, kind = 'info'){
  const t = el('toast');
  t.textContent = msg; t.className = `toast toast-${kind}`; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 3200);
}

// ── Modal ───────────────────────────────────────────────────────────────────
function openModal(html){ el('modal-box').innerHTML = html; el('modal-backdrop').hidden = false; }
function closeModal(){ el('modal-backdrop').hidden = true; el('modal-box').innerHTML = ''; }

// ── Routing ─────────────────────────────────────────────────────────────────
function navigate(tab, params = {}){
  if (tab === 'admin' && !(currentUser && currentUser.family_admin)) tab = 'home';
  const usp = new URLSearchParams();
  usp.set('tab', tab);
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') usp.set(k, v);
  history.replaceState({}, '', `${location.pathname}?${usp}`);
  renderSidebar();
  const fn = SCREENS[tab] || SCREENS.home;
  if (fn) fn(Object.fromEntries(usp)); else mountMain('<div class="screen-pad"><div class="empty-state"><p>Coming soon.</p></div></div>');
  if (el('main')) el('main').scrollTop = 0;
}

// ── App entry ─────────────────────────────────────────────────────────────────
async function init(){
  // OAuth / Apple callback handling (unchanged behavior from prior version).
  if (location.search.includes('apple_oauth_done=') || location.search.includes('apple_oauth_error=') ||
      location.search.includes('handoff=')) {
    return handleAppleAuthCallback();
  }
  if (location.search.includes('code=') || location.hash.includes('code=')) return handleOAuthCallback();

  if (!token) return showAuth();
  try {
    const res = await apiFetch(`/api/collections/users/records/${userId}`);
    if (!res.ok) throw new Error('session expired');
    currentUser = await res.json();
    if (!currentUser.approved) return showPending();
    enterApp();
  } catch {
    clearSession();
    showAuth();
  }
}

async function enterApp(){
  clearInterval(rollerTimer);
  el('app').innerHTML = `
    <div id="app-shell">
      <aside id="sidebar"><div class="sidebar-texture"></div><div id="sidebar-inner"></div></aside>
      <main id="main"></main>
    </div>
    <nav id="bottom-nav"></nav>`;
  await Promise.all([refreshUnread(), refreshPending()]);
  renderSidebar();
  const dl = new URLSearchParams(location.search).get('person');
  if (dl) navigate('tree', { person: dl });
  else navigate(currentTab());
}

async function refreshUnread(){
  try {
    const f = encodeURIComponent(`(user="${userId}" && read=false)`);
    const res = await apiFetch(`/api/collections/notifications/records?filter=${f}&perPage=1`);
    const data = await res.json();
    unreadCount = res.ok ? (data.totalItems || 0) : 0;
  } catch { unreadCount = 0; }
}

async function refreshPending(){
  if (!(currentUser && currentUser.family_admin)) { pendingCount = 0; return; }
  try {
    const f = encodeURIComponent('(approved=false)');
    const res = await apiFetch(`/api/collections/users/records?filter=${f}&perPage=1`);
    const data = await res.json();
    pendingCount = res.ok ? (data.totalItems || 0) : 0;
  } catch { pendingCount = 0; }
}

// ── Sidebar ─────────────────────────────────────────────────────────────────
function renderSidebar(){
  const inner = el('sidebar-inner');
  if (!inner) return;
  const active = currentTab();
  const items = NAV.filter(n => !n.adminOnly || (currentUser && currentUser.family_admin));
  const navHtml = items.map(n => {
    const count = n.badge ? n.badge() : 0;
    const badge = count > 0 ? `<span class="sb-badge">${count}</span>` : '';
    return `<button class="sb-item${n.tab === active ? ' active' : ''}" onclick="navigate('${n.tab}')">
      <span class="ico">${n.ico}</span><span class="lbl">${esc(n.label)}</span>${badge}</button>`;
  }).join('');

  const branch = (currentUser && currentUser.family_name) || 'Kelsall family';
  inner.innerHTML = `
    <div class="sb-brand">
      <div class="sb-logo">K</div>
      <div><div class="name">Kelsall</div><div class="sub">Family Portal</div></div>
    </div>
    <nav class="sb-nav">${navHtml}</nav>
    <div class="sb-user">
      <div class="avatar">${userInitials(currentUser || {})}</div>
      <div class="meta"><div class="nm">${esc((currentUser && currentUser.name) || 'Member')}</div>
        <div class="br">${esc(branch)}</div></div>
      <button class="out" title="Sign out" onclick="logout()">⏻</button>
    </div>`;

  const bn = el('bottom-nav');
  if (bn) bn.innerHTML = MOBILE_NAV.map(n => {
    const dot = n.tab === 'home' && unreadCount > 0
      ? `<span class="bn-dot"></span>` : '';
    return `<button class="bn-item${n.tab === active ? ' active' : ''}" onclick="navigate('${n.tab}')" style="position:relative">
      ${dot}<span class="ico">${n.ico}</span><span>${esc(n.label)}</span></button>`;
  }).join('');
}

// ── Auth screens ─────────────────────────────────────────────────────────────
const FALLBACK_SURNAMES = ['Kelsall', 'Warfel', 'Flannigan', 'Hubber'];
let rollerTimer = null;

function showAuth(mode = 'signin'){
  clearInterval(rollerTimer);
  const brand = `
    <div class="texture"></div>
    <div class="inner">
      <div class="roller-stack">
        <div class="roller-fixed">The</div>
        <div class="roller-window"><div id="roller-track" class="roller-track"><div class="roller-word">Kelsall</div></div></div>
        <div class="roller-fixed">Family</div>
      </div>
      <p class="roller-tag">Every branch, one root.</p>
      <div class="roller-branches" id="roller-branches"></div>
    </div>`;
  const form = mode === 'signup' ? signUpForm() : signInForm();
  el('app').innerHTML = `<div class="auth-wrap"><div class="auth-brand">${brand}</div>
    <div class="auth-form"><div class="box">${form}</div></div></div>`;
  startSurnameRoller();
}

async function startSurnameRoller(){
  let names = FALLBACK_SURNAMES;
  try {
    const res = await fetch(`${API}/api/collections/persons/records?perPage=500&fields=family_name`);
    if (res.ok) {
      const items = (await res.json()).items || [];
      const distinct = [...new Set(items.map(p => (p.family_name || '').trim()).filter(Boolean))];
      if (distinct.length >= 2) names = distinct;
    }
  } catch { /* keep fallback */ }

  const track = el('roller-track');
  const branches = el('roller-branches');
  if (!track) return;
  // Render each surname plus a repeat of the first for a seamless wrap.
  track.innerHTML = [...names, names[0]].map(n => `<div class="roller-word">${esc(n)}</div>`).join('');
  if (branches) branches.textContent = names.join(' · ');

  let i = 0;
  clearInterval(rollerTimer);
  rollerTimer = setInterval(() => {
    i++;
    track.style.transition = 'transform .85s cubic-bezier(.7,0,.2,1)';
    track.style.transform = `translateY(-${i * 1.1}em)`;
    if (i === names.length) {
      // After the duplicated first word shows, snap back to the real first without animating.
      setTimeout(() => { track.style.transition = 'none'; track.style.transform = 'translateY(0)'; i = 0; }, 870);
    }
  }, 2000);
}

function signInForm(){
  return `
    <h1>Welcome back</h1>
    <p class="sub">Sign in to the family portal.</p>
    <div id="auth-error" class="alert alert-error" style="display:none"></div>
    <button class="btn btn-outline btn-full" style="height:52px;margin-bottom:.6rem" onclick="doGoogleAuth()">Continue with Google</button>
    <button class="btn btn-primary btn-full" style="height:52px" onclick="doAppleAuth()">Continue with Apple</button>
    <div class="auth-divider">or with email</div>
    <div class="form-group"><label>Email</label><input id="login-email" type="email" style="height:52px" /></div>
    <div class="form-group"><label>Password</label><input id="login-password" type="password" style="height:52px" /></div>
    <button class="btn btn-primary btn-full" style="height:54px;font-weight:700;margin-top:.4rem" onclick="doLogin()">Sign in</button>
    <p class="auth-foot">New to the family page? <span class="link" onclick="showAuth('signup')">Create your account</span></p>`;
}

function signUpForm(){
  return `
    <h1>Join the family</h1>
    <p class="sub">Create your account — an admin will approve it.</p>
    <div id="auth-error" class="alert alert-error" style="display:none"></div>
    <div class="row-2">
      <div class="form-group"><label>First name</label><input id="reg-first" /></div>
      <div class="form-group"><label>Last name</label><input id="reg-last" /></div>
    </div>
    <div class="form-group"><label>Email</label><input id="reg-email" type="email" /></div>
    <div class="row-2">
      <div class="form-group"><label>Phone</label><input id="reg-phone" /></div>
      <div class="form-group"><label>Birthday</label><input id="reg-birthday" type="date" /></div>
    </div>
    <div class="row-2">
      <div class="form-group"><label>Password</label><input id="reg-password" type="password" /></div>
      <div class="form-group"><label>Confirm</label><input id="reg-password2" type="password" /></div>
    </div>
    <button class="btn btn-primary btn-full" style="height:54px;font-weight:700;margin-top:.4rem" onclick="doRegister()">Create account</button>
    <p class="auth-foot">Already have an account? <span class="link" onclick="showAuth('signin')">Sign in</span></p>
    <p class="auth-foot" style="font-size:.75rem;color:var(--text-muted);margin-top:.6rem">Your details are visible only to verified family members.</p>`;
}

function showPending(){
  clearInterval(rollerTimer);
  el('app').innerHTML = `<div class="auth-wrap"><div class="auth-form"><div class="box" style="text-align:center">
    <div style="font-size:2.5rem">⏳</div>
    <h1 style="font-family:var(--font-display);font-size:1.8rem;margin:.5rem 0">Awaiting approval</h1>
    <p class="sub">Your account was created and is waiting for a family admin to approve it.
      You'll get access once approved.</p>
    <button class="btn btn-outline" onclick="logout()">Sign out</button>
  </div></div></div>`;
}

function authError(msg){
  const e = el('auth-error');
  if (e) { e.textContent = msg; e.style.display = ''; }
  else toast(msg, 'error');
}

// ── Auth actions (ported, behavior unchanged) ────────────────────────────────
async function doLogin(){
  const email = val('login-email'), pw = val('login-password');
  if (!email || !pw) return authError('Email and password are required.');
  try {
    const res = await fetch(`${API}/api/collections/users/auth-with-password`, {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ identity: email, password: pw })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Login failed');
    setSession(data.token, data.record);
    if (!currentUser.approved) return showPending();
    enterApp();
  } catch (e) { authError(e.message); }
}

async function doRegister(){
  const first = val('reg-first'), last = val('reg-last'), email = val('reg-email'),
        phone = val('reg-phone'), birthday = val('reg-birthday'),
        pw = val('reg-password'), pw2 = val('reg-password2');
  if (!first || !last || !email || !pw) return authError('Please fill in all required fields.');
  if (pw !== pw2) return authError('Passwords do not match.');
  if (pw.length < 8) return authError('Password must be at least 8 characters.');
  try {
    const body = { name: `${first} ${last}`, email, phone, password: pw, passwordConfirm: pw2, approved: false };
    if (birthday) body.birthday = birthday;
    const res = await fetch(`${API}/api/collections/users/records`, {
      method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Registration failed');
    // Sign in to obtain a token so the pending screen can show.
    const authRes = await fetch(`${API}/api/collections/users/auth-with-password`, {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ identity: email, password: pw })
    });
    if (authRes.ok) { const ad = await authRes.json(); setSession(ad.token, ad.record); }
    showPending();
  } catch (e) { authError(e.message); }
}

async function doGoogleAuth(){
  try {
    const res = await fetch(`${API}/api/collections/users/auth-methods`);
    const data = await res.json();
    const google = (data.authProviders || []).find(p => p.name === 'google');
    if (!google) return authError('Google sign-in is not configured.');
    sessionStorage.setItem('pb_oauth_state', google.state);
    sessionStorage.setItem('pb_oauth_verifier', google.codeVerifier);
    sessionStorage.setItem('pb_oauth_provider', 'google');
    location.href = google.authUrl + encodeURIComponent(location.origin + location.pathname);
  } catch (e) { authError('Could not start Google sign-in: ' + e.message); }
}

function doAppleAuth(){
  const redirect = encodeURIComponent(location.origin + location.pathname);
  location.href = `${API}/auth/apple/start?redirect=${redirect}`;
}

async function handleAppleAuthCallback(){
  const params = new URLSearchParams(location.search);
  const handoff = params.get('handoff');
  const error = params.get('apple_oauth_error');
  history.replaceState({}, '', location.pathname);
  if (error) { showAuth(); return authError(error); }
  if (!handoff) { showAuth(); return authError('Apple sign-in could not be completed.'); }
  try {
    const res = await fetch(`${API}/auth/apple/finalize?handoff=${encodeURIComponent(handoff)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Apple sign-in failed');
    setSession(data.token, data.record);
    if (!currentUser.approved) return showPending();
    enterApp();
  } catch (e) { showAuth(); authError(e.message); }
}

async function handleOAuthCallback(){
  const params = location.hash.includes('code=')
    ? new URLSearchParams(location.hash.slice(1))
    : new URLSearchParams(location.search);
  const code = params.get('code'), state = params.get('state');
  if (!code || !state) return showAuth();
  if (state !== sessionStorage.getItem('pb_oauth_state')) return showAuth();
  const verifier = sessionStorage.getItem('pb_oauth_verifier');
  history.replaceState({}, '', location.pathname);
  try {
    const provider = sessionStorage.getItem('pb_oauth_provider') || 'google';
    const res = await fetch(`${API}/api/collections/users/auth-with-oauth2`, {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ provider, code, codeVerifier: verifier,
        redirectUrl: location.origin + location.pathname })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'OAuth failed');
    setSession(data.token, data.record);
    if (!currentUser.approved) return showPending();
    enterApp();
  } catch (e) { showAuth(); authError(e.message); }
}

// ── Session ─────────────────────────────────────────────────────────────────
function setSession(tok, record){
  token = tok; userId = record.id; currentUser = record;
  localStorage.setItem('pb_token', token);
  localStorage.setItem('pb_user_id', userId);
}
function clearSession(){
  token = ''; userId = ''; currentUser = null;
  localStorage.removeItem('pb_token'); localStorage.removeItem('pb_user_id');
}
function logout(){ clearSession(); showAuth(); }

// ═══════════════════════════════════════════════════════════════════════════
//  SCREENS
// ═══════════════════════════════════════════════════════════════════════════

// ── Home / news feed ─────────────────────────────────────────────────────────
SCREENS.home = async function(){
  mountMain('<div class="screen-pad"><div class="spinner"></div></div>');
  const days = daysUntil(REUNION_DATE, new Date());
  const reunionDate = new Date(REUNION_DATE + 'T00:00:00')
    .toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });

  let news = [], members = [], memberTotal = 0, branches = 0;
  try {
    const [nRes, uRes, pRes] = await Promise.all([
      apiFetch('/api/collections/news/records?sort=-created&perPage=50&expand=author'),
      apiFetch('/api/collections/users/records?filter=(approved=true)&perPage=200'),
      apiFetch('/api/collections/persons/records?perPage=500&fields=family_name'),
    ]);
    if (nRes.ok) news = (await nRes.json()).items || [];
    if (uRes.ok) { const u = await uRes.json(); members = u.items || []; memberTotal = u.totalItems || members.length; }
    if (pRes.ok) {
      const persons = (await pRes.json()).items || [];
      branches = new Set(persons.map(p => (p.family_name || '').trim()).filter(Boolean)).size;
    }
  } catch { /* render with whatever loaded */ }

  mountMain(`<div class="screen-pad">
    <div class="reunion-hero">
      <div class="texture"></div>
      <div class="rh-left">
        <div class="rh-label">Next gathering</div>
        <div class="rh-name">Kelsall Family Reunion</div>
        <div class="rh-detail">${reunionDate}</div>
        <button class="btn btn-gold" style="margin-top:18px" onclick="navigate('reunion')">RSVP now</button>
      </div>
      <div class="rh-count">
        <div class="rh-num">${days}</div><div class="rh-days">days to go</div>
      </div>
    </div>

    <div class="home-grid">
      <div>
        <div class="home-head">
          <span class="section-label">Announcements</span>
          <button class="btn btn-outline btn-sm" onclick="openNewsComposer()">Post update</button>
        </div>
        <div id="news-list">${renderNewsCards(news)}</div>
      </div>
      <aside class="home-rail">
        <div class="card">
          <div class="section-label" style="margin-bottom:.9rem">Upcoming birthdays</div>
          ${renderBirthdays(members)}
        </div>
        <div class="card">
          <div class="section-label" style="margin-bottom:.9rem">Family at a glance</div>
          <div class="glance"><span class="g-num">${memberTotal}</span><span class="g-lbl">members</span></div>
          <div class="glance"><span class="g-num">${branches || '—'}</span><span class="g-lbl">branches</span></div>
          <button class="btn btn-outline btn-full" style="margin-top:1rem" onclick="navigate('tree')">Open the family tree →</button>
        </div>
      </aside>
    </div>
  </div>`);
};

function renderNewsCards(news){
  if (!news.length) return '<div class="card"><div class="empty-state"><div class="emoji">📭</div><p>No updates yet.</p></div></div>';
  return news.map(post => {
    const author = (post.expand && post.expand.author && post.expand.author.name) || 'Family member';
    const date = new Date(post.created).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
    return `<article class="news-card card">
      <div class="news-tag"><span class="pill"><span class="dot"></span>Update</span>
        <span class="news-time">${date}</span></div>
      <h2 class="news-title">${esc(post.title)}</h2>
      <div class="news-meta">${esc(author)}</div>
      <p class="news-body">${esc(post.body)}</p>
    </article>`;
  }).join('');
}

function renderBirthdays(members){
  const now = new Date();
  const withBday = members.filter(m => m.birthday).map(m => {
    const bd = new Date(m.birthday);
    const next = new Date(now.getFullYear(), bd.getMonth(), bd.getDate());
    if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) next.setFullYear(now.getFullYear() + 1);
    const turns = bd.getFullYear() ? (next.getFullYear() - bd.getFullYear()) : null;
    return { m, next, turns, label: next.toLocaleDateString('en-US', { month:'short', day:'numeric' }) };
  }).sort((a, b) => a.next - b.next).slice(0, 4);
  if (!withBday.length) return '<p style="color:var(--text-muted);font-size:.86rem">No birthdays on file.</p>';
  return withBday.map(({ m, label, turns }, i) =>
    `<div class="bday-row">
      <div class="avatar" style="width:38px;height:38px;font-size:.8rem;background:${avatarTint(i)};color:var(--text-primary)">${userInitials(m)}</div>
      <div class="bday-info"><div class="bday-name">${esc(m.name)}</div><div class="bday-date">${label}</div></div>
      ${turns ? `<div class="bday-turns">turns ${turns}</div>` : ''}
    </div>`).join('');
}

function openNewsComposer(){
  openModal(`<h2 class="card-title">Post an update</h2>
    <div id="nc-error" class="alert alert-error" style="display:none"></div>
    <div class="form-group"><label>Title</label><input id="nc-title" /></div>
    <div class="form-group"><label>Message</label><textarea id="nc-body"></textarea></div>
    <div style="display:flex;gap:.6rem;margin-top:.5rem">
      <button class="btn btn-primary" onclick="postNews()">Post</button>
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
    </div>`);
}

async function postNews(){
  const title = val('nc-title'), body = val('nc-body');
  const err = el('nc-error');
  if (!title || !body) { if (err) { err.textContent = 'Title and message are required.'; err.style.display = ''; } return; }
  try {
    const res = await apiFetch('/api/collections/news/records', {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ title, body, author: userId })
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Could not post'); }
    closeModal();
    toast('Update posted.', 'success');
    SCREENS.home();
  } catch (e) { if (err) { err.textContent = e.message; err.style.display = ''; } }
}

// ── Family tree ──────────────────────────────────────────────────────────────
let treeFocusId = null;
let treeTrail = [];
const personCache = new Map();

SCREENS.tree = function(params){
  mountMain(`<div class="tree-screen">
    <div class="tree-header">
      <div><h1 class="tree-title">Family Tree</h1>
        <div id="tree-breadcrumb" class="tree-breadcrumb" style="display:none"></div></div>
      <button class="btn btn-outline btn-sm" onclick="openPersonForm()">Add person</button>
    </div>
    <div id="tree-canvas" class="tree-canvas"><div class="spinner"></div></div>
  </div>`);
  openTree((params && params.person) || null);
};

async function getPerson(id){
  if (!id) return null;
  if (personCache.has(id)) return personCache.get(id);
  const res = await apiFetch(`/api/collections/persons/records/${id}`);
  if (!res.ok) return null;
  const p = await res.json();
  personCache.set(id, p);
  return p;
}
async function getChildren(parentId){
  const res = await apiFetch(`/api/collections/persons/records?perPage=200&filter=` +
    encodeURIComponent(`(father="${parentId}" || mother="${parentId}")`));
  if (!res.ok) return [];
  const data = await res.json();
  data.items.forEach(p => personCache.set(p.id, p));
  return data.items;
}
async function getCouplesFor(personId){
  const res = await apiFetch(`/api/collections/couples/records?perPage=50&filter=` +
    encodeURIComponent(`(partner_a="${personId}" || partner_b="${personId}")`));
  if (!res.ok) return [];
  return (await res.json()).items;
}
function dedupeById(arr){
  const seen = new Set(); const out = [];
  for (const x of arr) if (x && !seen.has(x.id)) { seen.add(x.id); out.push(x); }
  return out;
}
async function fetchNeighborhood(focusId){
  const focus = await getPerson(focusId);
  if (!focus) return null;
  const parents = [await getPerson(focus.father), await getPerson(focus.mother)].filter(Boolean);
  const couples = await getCouplesFor(focusId);
  const partnerIds = couples.map(c => c.partner_a === focusId ? c.partner_b : c.partner_a);
  const partners = (await Promise.all(partnerIds.map(getPerson))).filter(Boolean);
  const children = await getChildren(focusId);
  let siblings = [];
  for (const par of parents) (await getChildren(par.id)).forEach(k => { if (k.id !== focusId) siblings.push(k); });
  siblings = dedupeById(siblings);
  let grandparents = [];
  for (const par of parents) grandparents.push(await getPerson(par.father), await getPerson(par.mother));
  grandparents = grandparents.filter(Boolean);
  let grandchildren = [];
  for (const ch of children) grandchildren.push(...await getChildren(ch.id));
  grandchildren = dedupeById(grandchildren);
  return { focus, parents, partners, siblings, children, grandparents, grandchildren, couples };
}

function nodeHtml(p, depth, isFocus, idx){
  const years = depth === 2 ? '' : `<div class="tn-years">${personYears(p)}</div>`;
  return `<button class="tree-node${isFocus ? ' focus' : ''}" data-depth="${depth}" onclick="focusPerson('${p.id}')">
    <div class="avatar tn-av" style="background:${avatarTint(idx || 0)};color:var(--text-primary)">${personInitials(p)}</div>
    <div class="tn-name">${esc(p.display_name)}</div>${years}</button>`;
}
function renderTree(n){
  const row = (nodes, depth) => nodes.length
    ? `<div class="tree-row">${nodes.map((p, i) => nodeHtml(p, depth, false, i)).join('')}</div>` : '';
  const conn = (nodes) => nodes.length ? '<div class="tree-conn"></div>' : '';
  const focusRow = `<div class="tree-row">` +
    n.siblings.map((p, i) => nodeHtml(p, 1, false, i)).join('') +
    nodeHtml(n.focus, 0, true, 0) +
    n.partners.map((p, i) => nodeHtml(p, 1, false, i + 3)).join('') + `</div>`;
  const html =
    row(n.grandparents, 2) + conn(n.grandparents) +
    row(n.parents, 1) + conn(n.parents) +
    focusRow +
    conn(n.children) + row(n.children, 1) +
    conn(n.grandchildren) + row(n.grandchildren, 2) +
    treeActionsHtml(n.focus);
  el('tree-canvas').innerHTML = html ||
    '<div class="empty-state"><div class="emoji">🌱</div><p>No relatives linked yet.</p></div>';
}
function treeActionsHtml(focus){
  const claim = focus.linked_user
    ? (focus.linked_user === userId ? '<span class="pill">This is you</span>' : '')
    : `<button class="btn btn-outline btn-sm" onclick="claimPerson('${focus.id}')">This is me</button>`;
  return `<div class="tree-actions">
    <button class="btn btn-primary btn-sm" onclick="openPersonForm('${focus.id}')">Edit</button>
    <button class="btn btn-outline btn-sm" onclick="openAddRelative('${focus.id}')">Add relative</button>
    <button class="btn btn-outline btn-sm" onclick="navigate('profile',{id:'${focus.id}'})">View profile</button>
    ${claim}</div>`;
}
async function focusPerson(id, fromTrail){
  if (!id) return;
  if (!fromTrail) {
    if (treeFocusId && treeFocusId !== id) treeTrail.push(treeFocusId);
    if (treeTrail.length > 12) treeTrail.shift();
  }
  treeFocusId = id;
  history.replaceState({}, '', `${location.pathname}?tab=tree&person=${id}`);
  el('tree-canvas').innerHTML = '<div class="spinner"></div>';
  const n = await fetchNeighborhood(id);
  if (!n) { el('tree-canvas').innerHTML = '<div class="alert alert-error">Person not found.</div>'; return; }
  renderBreadcrumb();
  renderTree(n);
}
function renderBreadcrumb(){
  const e = el('tree-breadcrumb');
  if (!e) return;
  if (!treeTrail.length) { e.style.display = 'none'; return; }
  e.style.display = ''; e.innerHTML = '<span class="link" onclick="treeBack()">‹ Back</span>';
}
async function treeBack(){ const prev = treeTrail.pop(); if (prev) await focusPerson(prev, true); }

async function openTree(personId){
  const target = personId || treeFocusId || (currentUser && await myPersonId()) || null;
  if (!target) {
    el('tree-canvas').innerHTML =
      `<div class="empty-state"><div class="emoji">🌳</div>
        <p>No one in the tree yet. Add people, or use "Add relative".</p>
        <button class="btn btn-primary" style="margin-top:1rem" onclick="openPersonForm()">Add a person</button></div>`;
    return;
  }
  await focusPerson(target);
}
async function myPersonId(){
  const res = await apiFetch(`/api/collections/persons/records?perPage=1&filter=` +
    encodeURIComponent(`(linked_user="${userId}")`));
  if (!res.ok) return null;
  return ((await res.json()).items[0] || {}).id || null;
}
async function viewUserInTree(uid){
  const res = await apiFetch(`/api/collections/persons/records?perPage=1&filter=` +
    encodeURIComponent(`(linked_user="${uid}")`));
  const pid = res.ok ? ((await res.json()).items[0] || {}).id : null;
  navigate('tree', pid ? { person: pid } : {});
}

function formErr(id, msg){ const e = el(id); if (e) { e.textContent = msg; e.style.display = ''; } }

async function openPersonForm(id){
  const p = id ? await getPerson(id) : {};
  openModal(`<h2 class="card-title">${id ? 'Edit person' : 'Add person'}</h2>
    <div id="pf-error" class="alert alert-error" style="display:none"></div>
    <div class="form-group"><label>Name</label><input id="pf-name" value="${esc(p.display_name || '')}" /></div>
    <div class="form-group"><label>Gender</label>
      <select id="pf-gender">${['unknown','male','female','other'].map(g =>
        `<option value="${g}" ${p.gender === g ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
    <div class="row-2">
      <div class="form-group"><label>Birth</label><input id="pf-birth" value="${esc(p.birth_date || '')}" placeholder="1947 or 1947-03-12" /></div>
      <div class="form-group"><label>Death</label><input id="pf-death" value="${esc(p.death_date || '')}" placeholder="blank if living" /></div>
    </div>
    <div class="form-group"><label>Bio</label><textarea id="pf-bio">${esc(p.bio || '')}</textarea></div>
    <div class="form-group"><label>Photo</label><input id="pf-photo" type="file" accept="image/*" /></div>
    <div style="display:flex;gap:.6rem;margin-top:.5rem">
      <button class="btn btn-primary" onclick="savePerson('${id || ''}')">Save</button>
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
    </div>`);
}
async function savePerson(id){
  const name = val('pf-name');
  if (!name) return formErr('pf-error', 'Name is required.');
  const fd = new FormData();
  fd.append('display_name', name);
  const parts = name.split(' ');
  fd.append('given_name', parts[0] || '');
  fd.append('family_name', parts.slice(1).join(' ') || '');
  fd.append('gender', el('pf-gender').value);
  fd.append('birth_date', val('pf-birth'));
  fd.append('death_date', val('pf-death'));
  fd.append('living', val('pf-death') ? 'false' : 'true');
  fd.append('bio', val('pf-bio'));
  fd.append('updated_by', userId);
  const photo = el('pf-photo').files[0];
  if (photo) fd.append('photo', photo);
  try {
    let res;
    if (id) res = await apiFetch(`/api/collections/persons/records/${id}`, { method:'PATCH', body: fd });
    else { fd.append('created_by', userId); res = await apiFetch('/api/collections/persons/records', { method:'POST', body: fd }); }
    if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Save failed'); }
    const saved = await res.json();
    personCache.set(saved.id, saved);
    closeModal();
    await focusPerson(saved.id, true);
  } catch (e) { formErr('pf-error', e.message); }
}

function openAddRelative(focusId){
  openModal(`<h2 class="card-title">Add relative</h2>
    <p style="font-size:.88rem;color:var(--text-secondary);margin-bottom:1rem">How is this person related to the focused person?</p>
    <div class="tree-actions" style="margin-top:0">
      ${['parent','partner','child','sibling'].map(r =>
        `<button class="btn btn-outline btn-sm" onclick="pickRelative('${focusId}','${r}')">${r[0].toUpperCase() + r.slice(1)}</button>`).join('')}
    </div>
    <div style="margin-top:1rem"><button class="btn btn-outline" onclick="closeModal()">Cancel</button></div>`);
}
function pickRelative(focusId, rel){
  openModal(`<h2 class="card-title">Add ${esc(rel)}</h2>
    <div id="rel-error" class="alert alert-error" style="display:none"></div>
    <div class="form-group"><label>Search existing</label>
      <input id="rel-search" placeholder="Type a name…" oninput="searchPersons('${focusId}','${rel}')" /></div>
    <div id="rel-results" style="display:flex;flex-direction:column;gap:.4rem;margin-bottom:1rem"></div>
    <button class="btn btn-primary btn-full" onclick="createAndLink('${focusId}','${rel}')">Create new person &amp; link</button>
    <div style="margin-top:.6rem"><button class="btn btn-outline" onclick="closeModal()">Cancel</button></div>`);
}
let relSearchTimer = null;
function searchPersons(focusId, rel){
  clearTimeout(relSearchTimer);
  relSearchTimer = setTimeout(async () => {
    const q = val('rel-search'); const e = el('rel-results');
    if (!q) { e.innerHTML = ''; return; }
    const res = await apiFetch(`/api/collections/persons/records?perPage=8&filter=` + encodeURIComponent(`(display_name~"${q}")`));
    const items = res.ok ? (await res.json()).items : [];
    e.innerHTML = items.length
      ? items.map(p => `<button class="row-card" onclick="linkExisting('${focusId}','${rel}','${p.id}')">
          <div class="avatar" style="width:36px;height:36px;font-size:.8rem">${personInitials(p)}</div>
          <div><div class="rc-name">${esc(p.display_name)}</div><div class="rc-sub">${personYears(p)}</div></div></button>`).join('')
      : '<p style="font-size:.82rem;color:var(--text-muted)">No matches — create new below.</p>';
  }, 250);
}
async function applyRelationship(focusId, rel, otherId){
  const focus = await getPerson(focusId);
  if (rel === 'parent') {
    const slot = (await getPerson(otherId)).gender === 'female' ? 'mother' : 'father';
    return patchPerson(focusId, { [slot]: otherId });
  }
  if (rel === 'child') {
    const slot = focus.gender === 'female' ? 'mother' : 'father';
    return patchPerson(otherId, { [slot]: focusId });
  }
  if (rel === 'sibling') return patchPerson(otherId, { father: focus.father || '', mother: focus.mother || '' });
  if (rel === 'partner') {
    const res = await apiFetch('/api/collections/couples/records', {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ partner_a: focusId, partner_b: otherId, status:'married', created_by: userId, updated_by: userId }) });
    if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Link failed'); }
  }
}
async function patchPerson(id, fields){
  const res = await apiFetch(`/api/collections/persons/records/${id}`, {
    method:'PATCH', headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ ...fields, updated_by: userId }) });
  if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Update failed'); }
  const p = await res.json(); personCache.set(p.id, p); return p;
}
async function linkExisting(focusId, rel, otherId){
  try { await applyRelationship(focusId, rel, otherId); closeModal(); personCache.delete(focusId); await focusPerson(focusId, true); }
  catch (e) { formErr('rel-error', e.message); }
}
async function createAndLink(focusId, rel){
  const q = val('rel-search');
  if (!q) return formErr('rel-error', 'Enter a name to create a new person.');
  try {
    const res = await apiFetch('/api/collections/persons/records', {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ display_name: q, given_name: q.split(' ')[0], family_name: q.split(' ').slice(1).join(' '),
        living: true, created_by: userId, updated_by: userId }) });
    if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Create failed'); }
    const created = await res.json(); personCache.set(created.id, created);
    await applyRelationship(focusId, rel, created.id);
    closeModal(); personCache.delete(focusId); await focusPerson(focusId, true);
  } catch (e) { formErr('rel-error', e.message); }
}
async function claimPerson(personId){
  const p = await getPerson(personId);
  if (p.linked_user && p.linked_user !== userId) { toast('Already linked to another account.', 'error'); return; }
  const prior = await myPersonId();
  try {
    if (prior && prior !== personId) await patchPerson(prior, { linked_user: '' });
    await patchPerson(personId, { linked_user: userId });
    personCache.delete(personId); await focusPerson(personId, true);
  } catch (e) { toast('Could not claim: ' + e.message, 'error'); }
}

// duplicates + merge (uses merge.js computeMergeWrites)
function normName(s){ return (s || '').toLowerCase().replace(/[^a-z]/g, ''); }
async function openDuplicates(){
  openModal('<h2 class="card-title">Possible duplicates</h2><div class="spinner"></div>');
  const res = await apiFetch('/api/collections/persons/records?perPage=500&sort=family_name');
  const items = res.ok ? (await res.json()).items : [];
  const groups = {};
  for (const p of items) {
    const key = normName(p.display_name) + '|' + (p.birth_date || '').slice(0, 4);
    (groups[key] = groups[key] || []).push(p);
  }
  const dupes = Object.values(groups).filter(g => g.length > 1);
  const body = dupes.length ? dupes.map(g => `
    <div class="card" style="margin-bottom:.6rem;padding:1rem"><div class="rc-name">${esc(g[0].display_name)}
      ${g[0].birth_date ? '· ' + g[0].birth_date.slice(0, 4) : ''}</div>
      <div class="rc-sub">${g.length} records</div>
      <button class="btn btn-outline btn-sm" style="margin-top:.5rem" onclick='openMerge(${JSON.stringify(g.map(p => p.id))})'>Merge these</button>
    </div>`).join('') : '<p style="color:var(--text-muted)">No duplicates found 🎉</p>';
  openModal(`<h2 class="card-title">Possible duplicates</h2>${body}
    <div style="margin-top:.6rem"><button class="btn btn-outline" onclick="closeModal()">Close</button></div>`);
}
async function openMerge(ids){
  const people = await Promise.all(ids.map(getPerson));
  openModal(`<h2 class="card-title">Merge duplicates</h2>
    <div id="merge-error" class="alert alert-error" style="display:none"></div>
    <p style="font-size:.86rem;color:var(--text-secondary);margin-bottom:.75rem">Pick the record to KEEP. The others' children, partners, and account link move onto it, then they're deleted.</p>
    ${people.map(p => `<label class="row-card" style="cursor:pointer">
      <input type="radio" name="survivor" value="${p.id}" style="width:auto;height:auto;margin-right:.5rem">
      <div class="avatar" style="width:36px;height:36px;font-size:.8rem">${personInitials(p)}</div>
      <div><div class="rc-name">${esc(p.display_name)}</div><div class="rc-sub">${personYears(p)} · id ${p.id.slice(0, 6)}</div></div></label>`).join('')}
    <div style="display:flex;gap:.6rem;margin-top:1rem">
      <button class="btn btn-danger" onclick='runMerge(${JSON.stringify(ids)})'>Merge</button>
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button></div>`);
}
async function runMerge(ids){
  const sel = document.querySelector('input[name=survivor]:checked');
  if (!sel) return formErr('merge-error', 'Choose which record to keep.');
  const survivorId = sel.value;
  const survivor = await getPerson(survivorId);
  try {
    for (const dupId of ids.filter(id => id !== survivorId)) {
      const duplicate = await getPerson(dupId);
      const children = await getChildren(dupId);
      const couples = await getCouplesFor(dupId);
      const w = computeMergeWrites(survivor, duplicate, children, couples);
      for (const it of w.persons) await patchPerson(it.id, it.fields);
      for (const it of w.couples) await apiFetch(`/api/collections/couples/records/${it.id}`, {
        method:'PATCH', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ ...it.fields, updated_by: userId }) });
      if (Object.keys(w.survivorFields).length) await patchPerson(survivorId, w.survivorFields);
      await apiFetch(`/api/collections/persons/records/${w.deletePersonId}`, { method:'DELETE' });
      personCache.delete(dupId);
    }
    personCache.delete(survivorId);
    closeModal();
    await focusPerson(survivorId, true);
  } catch (e) { formErr('merge-error', e.message); }
}

// ── Reunion RSVP ─────────────────────────────────────────────────────────────
const REUNION_SCHEDULE = [
  { day:'Friday',   title:'Welcome & campfire',   detail:'6:00 PM · Lakeside lawn' },
  { day:'Saturday', title:'Family photo & picnic', detail:'11:00 AM · Main pavilion' },
  { day:'Saturday', title:'Games & talent show',   detail:'2:00 PM · Field' },
  { day:'Sunday',   title:'Farewell brunch',       detail:'10:00 AM · Dining hall' },
];

SCREENS.reunion = async function(){
  mountMain('<div class="screen-pad" style="max-width:920px"><div class="spinner"></div></div>');
  const when = new Date(REUNION_DATE + 'T00:00:00').toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });
  let going = 0;
  try {
    const res = await apiFetch(`/api/collections/users/records?filter=${encodeURIComponent('(rsvp="going")')}&perPage=1`);
    if (res.ok) going = (await res.json()).totalItems || 0;
  } catch { /* ignore */ }
  const cur = (currentUser && currentUser.rsvp) || '';
  const opt = (key, label) => `<button class="rsvp-opt${cur === key ? ' active' : ''}" onclick="setRsvp('${key}')">${label}</button>`;

  mountMain(`<div class="screen-pad" style="max-width:920px">
    <div class="venue-hero"></div>
    <div class="venue-bar card">
      <div><div class="vb-label">When</div><div class="vb-val">${when}</div></div>
      <div><div class="vb-label">Where</div><div class="vb-val">Kelsall Family Camp</div></div>
      <div><div class="vb-label">Headcount</div><div class="vb-val">${going} going</div></div>
    </div>

    <div class="card" style="margin-top:24px">
      <div class="section-label" style="margin-bottom:1rem">Will you be there?</div>
      <div class="rsvp-row">${opt('going', "I'm going")}${opt('maybe', 'Maybe')}${opt('no', "Can't make it")}</div>
    </div>

    <div class="card" style="margin-top:24px">
      <div class="section-label" style="margin-bottom:1rem">Schedule</div>
      ${REUNION_SCHEDULE.map(s => `<div class="sched-row">
        <div class="sched-day">${s.day}</div>
        <div><div class="sched-title">${esc(s.title)}</div><div class="sched-detail">${esc(s.detail)}</div></div>
      </div>`).join('')}
    </div>
  </div>`);
};

async function setRsvp(value){
  try {
    const res = await apiFetch(`/api/collections/users/records/${userId}`, {
      method:'PATCH', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ rsvp: value }) });
    if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Could not save RSVP'); }
    currentUser = await res.json();
    toast('RSVP saved.', 'success');
    SCREENS.reunion();
  } catch (e) { toast(e.message, 'error'); }
}

// ── Directory ────────────────────────────────────────────────────────────────
SCREENS.directory = async function(){
  mountMain('<div class="screen-pad"><h1 class="card-title">Directory</h1><div class="spinner"></div></div>');
  let members = [];
  try {
    const res = await apiFetch('/api/collections/users/records?filter=(approved=true)&sort=name&perPage=200');
    if (res.ok) members = (await res.json()).items || [];
  } catch { /* ignore */ }

  const cards = members.map((m, i) => {
    const bday = m.birthday ? new Date(m.birthday).toLocaleDateString('en-US', { month:'long', day:'numeric' }) : '';
    const msg = m.email ? `<a class="btn btn-outline btn-sm btn-full" href="mailto:${esc(m.email)}">Message</a>` :
      '<button class="btn btn-outline btn-sm btn-full" disabled>Message</button>';
    const call = m.phone ? `<a class="btn btn-outline btn-sm btn-full" href="tel:${esc(m.phone)}">Call</a>` :
      '<button class="btn btn-outline btn-sm btn-full" disabled>Call</button>';
    return `<div class="dir-card card">
      <div class="avatar" style="width:46px;height:46px;background:${avatarTint(i)};color:var(--text-primary)">${userInitials(m)}</div>
      <div class="dir-name">${esc(m.name || 'Family member')}</div>
      <div class="dir-sub">${esc(m.email || '')}</div>
      ${bday ? `<div class="dir-sub">🎂 ${bday}</div>` : ''}
      <div class="dir-actions">${msg}${call}</div>
      <div class="link dir-tree" onclick="viewUserInTree('${m.id}')">View in tree →</div>
    </div>`;
  }).join('');

  mountMain(`<div class="screen-pad"><h1 class="card-title">Directory</h1>
    ${members.length ? `<div class="dir-grid">${cards}</div>`
      : '<div class="empty-state"><div class="emoji">👋</div><p>No approved members yet.</p></div>'}</div>`);
};

// ── Member profile ───────────────────────────────────────────────────────────
function fileUrl(collection, rec, field){
  return rec && rec[field] ? `${API}/api/files/${collection}/${rec.id}/${rec[field]}` : '';
}

SCREENS.profile = async function(params){
  mountMain('<div class="screen-pad" style="max-width:1100px"><div class="spinner"></div></div>');
  let id = (params && params.id) || null;
  if (!id) id = await myPersonId();
  if (!id) { mountMain('<div class="screen-pad"><div class="empty-state"><div class="emoji">👤</div><p>No profile linked yet. Open the tree and use "This is me".</p></div></div>'); return; }

  let p, couples = [], partners = [], children = [], photos = [];
  try {
    const res = await apiFetch(`/api/collections/persons/records/${id}?expand=father,mother,linked_user`);
    if (!res.ok) throw new Error('not found');
    p = await res.json();
    couples = await getCouplesFor(id);
    const partnerIds = couples.map(c => c.partner_a === id ? c.partner_b : c.partner_a);
    partners = (await Promise.all(partnerIds.map(getPerson))).filter(Boolean);
    children = await getChildren(id);
    const phRes = await apiFetch(`/api/collections/photos/records?perPage=12&filter=` + encodeURIComponent(`(tagged_persons~"${id}")`));
    if (phRes.ok) photos = (await phRes.json()).items || [];
  } catch { mountMain('<div class="screen-pad"><div class="empty-state"><p>Could not load this profile.</p></div></div>'); return; }

  const ex = p.expand || {};
  const linked = ex.linked_user;
  const avatar = fileUrl('persons', p, 'photo');
  const branch = p.family_name ? `${p.family_name} branch` : '';
  const parentNames = [ex.father, ex.mother].filter(Boolean).map(x => x.display_name).join(' & ');
  const sub = [parentNames && `Child of ${parentNames}`, personYears(p)].filter(Boolean).join(' · ');

  const conn = (label, person) => person ? `<div class="conn-row" onclick="navigate('profile',{id:'${person.id}'})">
      <div class="avatar" style="width:34px;height:34px;font-size:.78rem">${personInitials(person)}</div>
      <div class="conn-meta"><div class="conn-name">${esc(person.display_name)}</div><div class="conn-rel">${esc(label)}</div></div>
      <span class="conn-chev">›</span></div>` : '';

  const events = [];
  if (p.birth_date) events.push({ year: p.birth_date.slice(0, 4), title: 'Born' });
  if (p.death_date) events.push({ year: p.death_date.slice(0, 4), title: 'Passed away' });

  mountMain(`<div class="screen-pad" style="max-width:1100px">
    <div class="breadcrumb"><span class="link" onclick="navigate('directory')">Directory</span> › ${esc(p.display_name)}</div>
    <div class="profile-hero card">
      <div class="ph-avatar">${avatar ? `<img src="${avatar}" alt="">` : personInitials(p)}</div>
      <div class="ph-main">
        <h1 class="ph-name">${esc(p.display_name)}</h1>
        <div class="ph-sub">${esc(sub)}</div>
        <div class="ph-pills">${branch ? `<span class="pill">${esc(branch)}</span>` : ''}
          ${p.birth_date ? `<span class="pill">Born ${esc(p.birth_date.slice(0, 4))}</span>` : ''}
          ${linked ? '<span class="pill">Has account</span>' : ''}</div>
      </div>
      <div class="ph-actions">
        ${linked && linked.email ? `<a class="btn btn-primary btn-sm" href="mailto:${esc(linked.email)}">Message</a>` : ''}
        ${linked && linked.phone ? `<a class="btn btn-outline btn-sm" href="tel:${esc(linked.phone)}">Call</a>` : ''}
        <button class="btn btn-outline btn-sm" onclick="navigate('tree',{person:'${p.id}'})">View in tree →</button>
        ${linked && linked.id === userId ? `<button class="btn btn-outline btn-sm" onclick="navigate('settings')">Edit profile</button>` : ''}
      </div>
    </div>

    <div class="profile-grid">
      <div class="profile-col">
        <div class="card"><div class="section-label" style="margin-bottom:.7rem">About</div>
          <p class="about-text">${p.bio ? esc(p.bio) : '<span style="color:var(--text-muted)">No bio yet.</span>'}</p></div>
        ${linked ? `<div class="card"><div class="section-label" style="margin-bottom:.7rem">Contact</div>
          ${linked.email ? `<div class="contact-row"><span>✉</span><span>${esc(linked.email)}</span></div>` : ''}
          ${linked.phone ? `<div class="contact-row"><span>☎</span><span>${esc(linked.phone)}</span></div>` : ''}
          ${!linked.email && !linked.phone ? '<p style="color:var(--text-muted);font-size:.86rem">No contact details shared.</p>' : ''}</div>` : ''}
        <div class="card"><div class="section-label" style="margin-bottom:.7rem">Family connections</div>
          ${conn('Father', ex.father)}${conn('Mother', ex.mother)}
          ${partners.map(pt => conn('Partner', pt)).join('')}
          ${children.map(ch => conn('Child', ch)).join('')}
          ${!ex.father && !ex.mother && !partners.length && !children.length ? '<p style="color:var(--text-muted);font-size:.86rem">No connections linked yet.</p>' : ''}</div>
      </div>
      <aside class="profile-col">
        <div class="card"><div class="section-label" style="margin-bottom:.9rem">Life events</div>
          ${events.length ? `<div class="timeline">${events.map(e => `<div class="tl-item"><div class="tl-dot"></div>
            <div><div class="tl-title">${esc(e.title)}</div><div class="tl-year">${esc(e.year)}</div></div></div>`).join('')}</div>`
            : '<p style="color:var(--text-muted);font-size:.86rem">No dated events.</p>'}</div>
        <div class="card"><div class="section-label" style="margin-bottom:.9rem">Photos</div>
          ${photos.length ? `<div class="photo-mini">${photos.slice(0, 6).map(ph =>
            `<img src="${fileUrl('photos', ph, 'image')}" alt="">`).join('')}</div>
            <div class="link" style="margin-top:.6rem;font-size:.82rem" onclick="navigate('gallery')">See all →</div>`
            : '<p style="color:var(--text-muted);font-size:.86rem">No tagged photos.</p>'}</div>
      </aside>
    </div>
  </div>`);
};

// ── Gallery ──────────────────────────────────────────────────────────────────
SCREENS.gallery = async function(params){
  if (params && params.album) { await renderAlbum(params.album); return; }
  await renderAlbums();
};

async function renderAlbums(){
  mountMain('<div class="screen-pad"><div class="spinner"></div></div>');
  let albums = [];
  try {
    const res = await apiFetch('/api/collections/albums/records?sort=-created&perPage=100');
    if (res.ok) albums = (await res.json()).items || [];
  } catch { /* ignore */ }

  const isAdmin = currentUser && currentUser.family_admin;
  const nowMs = Date.now();
  const cards = albums.map(a => {
    const thumb = fileUrl('albums', a, 'cover_photo');
    const isNew = a.created && (nowMs - new Date(a.created).getTime()) < 30 * 86400000;
    return `<div class="album-card" onclick="navigate('gallery',{album:'${a.id}'})">
      <div class="album-thumb">${thumb ? `<img src="${esc(thumb)}" alt="">` : '<div class="album-thumb-placeholder"></div>'}</div>
      <div class="album-meta">
        <div class="album-name">${esc(a.name)}${isNew ? '<span class="pill" style="margin-left:.4rem;font-size:.66rem">New</span>' : ''}</div>
        ${a.year ? `<div class="album-year">${esc(String(a.year))}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  mountMain(`<div class="screen-pad">
    <div class="gallery-header">
      <h1 class="card-title" style="margin:0">Albums <span style="font-family:var(--font-ui);font-size:1rem;font-weight:400;color:var(--text-muted)">(${albums.length})</span></h1>
      ${isAdmin ? '<button class="btn btn-primary btn-sm" onclick="openNewAlbum()">+ New album</button>' : ''}
    </div>
    ${albums.length
      ? `<div class="album-grid">${cards}</div>`
      : '<div class="empty-state"><div class="emoji">📷</div><p>No albums yet. Ask a family admin to create the first one.</p></div>'}
  </div>`);
}

async function renderAlbum(albumId){
  mountMain('<div class="screen-pad"><div class="spinner"></div></div>');
  let album = null, photos = [];
  try {
    const [aRes, pRes] = await Promise.all([
      apiFetch(`/api/collections/albums/records/${albumId}`),
      apiFetch(`/api/collections/photos/records?filter=${encodeURIComponent(`(album="${albumId}"`)}&sort=-created&perPage=200`)
    ]);
    if (aRes.ok) album = await aRes.json();
    if (pRes.ok) photos = (await pRes.json()).items || [];
  } catch { /* ignore */ }
  if (!album) { mountMain('<div class="screen-pad"><div class="empty-state"><p>Album not found.</p></div></div>'); return; }

  const photoItems = photos.map((ph, i) => {
    const url = fileUrl('photos', ph, 'image');
    const span = (i + 1) % 5 === 0 ? ' pg-span' : '';
    return `<div class="pg-item${span}" onclick="openLightbox(${i})" data-src="${esc(url)}">
      ${url ? `<img src="${esc(url)}" alt="${esc(ph.caption || '')}">` : '<div class="pg-placeholder"></div>'}
    </div>`;
  }).join('');

  mountMain(`<div class="screen-pad">
    <div class="breadcrumb"><span class="link" onclick="navigate('gallery')">Albums</span> › ${esc(album.name)}</div>
    <div class="gallery-header" style="margin-top:.75rem">
      <h1 class="card-title" style="margin:0">${esc(album.name)}${album.year ? ` <span style="font-family:var(--font-ui);font-size:1rem;font-weight:400;color:var(--text-muted)">${album.year}</span>` : ''}</h1>
      <button class="btn btn-primary btn-sm" onclick="openUploadPhoto('${albumId}')">Upload photo</button>
    </div>
    ${photos.length
      ? `<div class="photo-grid">${photoItems}</div>`
      : '<div class="empty-state"><div class="emoji">📷</div><p>No photos yet — be the first to upload.</p></div>'}
  </div>`);
}

function openNewAlbum(){
  openModal(`<h2 class="card-title">New album</h2>
    <div id="alb-error" class="alert alert-error" style="display:none"></div>
    <div class="form-group"><label>Name</label><input id="alb-name" placeholder="Summer 2026" /></div>
    <div class="row-2">
      <div class="form-group"><label>Year</label><input id="alb-year" type="number" placeholder="2026" /></div>
    </div>
    <div class="form-group"><label>Description</label><textarea id="alb-desc"></textarea></div>
    <div class="form-group"><label>Cover photo</label><input id="alb-cover" type="file" accept="image/*" /></div>
    <div style="display:flex;gap:.6rem;margin-top:.5rem">
      <button class="btn btn-primary" onclick="saveAlbum()">Create</button>
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
    </div>`);
}

async function saveAlbum(){
  const name = val('alb-name');
  if (!name) { formErr('alb-error', 'Name is required.'); return; }
  const fd = new FormData();
  fd.append('name', name);
  const yr = val('alb-year'); if (yr) fd.append('year', yr);
  const desc = val('alb-desc'); if (desc) fd.append('description', desc);
  const cover = el('alb-cover').files[0]; if (cover) fd.append('cover_photo', cover);
  try {
    const res = await apiFetch('/api/collections/albums/records', { method:'POST', body: fd });
    if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Create failed'); }
    const a = await res.json();
    closeModal();
    navigate('gallery', { album: a.id });
  } catch (e) { formErr('alb-error', e.message); }
}

function openUploadPhoto(albumId){
  openModal(`<h2 class="card-title">Upload photo</h2>
    <div id="upl-error" class="alert alert-error" style="display:none"></div>
    <div class="form-group"><label>Photo</label><input id="upl-file" type="file" accept="image/*" /></div>
    <div class="form-group"><label>Caption</label><input id="upl-caption" placeholder="Optional" /></div>
    <div class="form-group"><label>Date taken</label><input id="upl-date" placeholder="2026-08-15" /></div>
    <div style="display:flex;gap:.6rem;margin-top:.5rem">
      <button class="btn btn-primary" onclick="doUploadPhoto('${albumId}')">Upload</button>
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
    </div>`);
}

async function doUploadPhoto(albumId){
  const file = el('upl-file').files[0];
  if (!file) { formErr('upl-error', 'Please select a photo.'); return; }
  const fd = new FormData();
  fd.append('album', albumId);
  fd.append('image', file);
  fd.append('uploader', userId);
  const cap = val('upl-caption'); if (cap) fd.append('caption', cap);
  const dt = val('upl-date'); if (dt) fd.append('taken_date', dt);
  try {
    const res = await apiFetch('/api/collections/photos/records', { method:'POST', body: fd });
    if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Upload failed'); }
    closeModal();
    await renderAlbum(albumId);
  } catch (e) { formErr('upl-error', e.message); }
}

let _lbPhotos = [];
function openLightbox(index){
  const items = document.querySelectorAll('.pg-item[data-src]');
  _lbPhotos = Array.from(items).map(n => n.dataset.src).filter(Boolean);
  showLightboxAt(index);
}
function showLightboxAt(i){
  i = Math.max(0, Math.min(i, _lbPhotos.length - 1));
  const src = _lbPhotos[i];
  const hasP = i > 0, hasN = i < _lbPhotos.length - 1;
  openModal(`<div class="lightbox">
    <button class="lb-close btn btn-outline btn-sm" onclick="closeModal()">✕ Close</button>
    <div class="lb-img-wrap"><img src="${esc(src)}" alt="" /></div>
    <div class="lb-nav">
      ${hasP ? `<button class="btn btn-outline btn-sm" onclick="showLightboxAt(${i-1})">‹ Prev</button>` : '<span></span>'}
      <span style="font-size:.82rem;color:var(--text-muted)">${i+1} / ${_lbPhotos.length}</span>
      ${hasN ? `<button class="btn btn-outline btn-sm" onclick="showLightboxAt(${i+1})">Next ›</button>` : '<span></span>'}
    </div>
  </div>`);
}

// ── Notifications ────────────────────────────────────────────────────────────
SCREENS.notifications = async function(){
  mountMain('<div class="screen-pad" style="max-width:720px"><div class="spinner"></div></div>');
  let notes = [];
  try {
    const res = await apiFetch(`/api/collections/notifications/records?sort=-created&perPage=100&filter=${encodeURIComponent(`(user="${userId}"`)}`);
    if (res.ok) notes = (await res.json()).items || [];
  } catch { /* ignore */ }

  const groups = groupNotifications(notes, new Date());

  function relTime(iso){
    const ms = Date.now() - new Date(String(iso).replace(' ', 'T')).getTime();
    const m = Math.floor(ms / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  function noteRow(n){
    const read = n.read ? ' read' : '';
    return `<div class="notif-row${n.read ? '' : ' unread'}">
      <div class="notif-dot${read}"></div>
      <div class="notif-body">
        <div class="notif-title">${esc(n.title)}</div>
        ${n.body ? `<div class="notif-text">${esc(n.body)}</div>` : ''}
        <div class="notif-time">${relTime(n.created)}</div>
      </div>
    </div>`;
  }

  function section(label, items){
    if (!items.length) return '';
    return `<div class="notif-group-label">${label}</div>${items.map(noteRow).join('')}`;
  }

  const unread = notes.filter(n => !n.read);
  const markAllBtn = unread.length
    ? `<button class="btn btn-outline btn-sm" onclick="markAllRead()">Mark all read</button>` : '';

  const body = [
    section('Today', groups.today),
    section('This week', groups.week),
    section('Earlier', groups.earlier)
  ].join('') || '<div class="empty-state"><div class="emoji">🔔</div><p>No notifications yet.</p></div>';

  mountMain(`<div class="screen-pad" style="max-width:720px">
    <div class="notif-header">
      <h1 class="card-title" style="margin:0">Notifications${unread.length ? ` <span class="sb-badge" style="margin-left:.5rem">${unread.length}</span>` : ''}</h1>
      ${markAllBtn}
    </div>
    ${body}
  </div>`);
};

async function markAllRead(){
  try {
    const res = await apiFetch(`/api/collections/notifications/records?filter=${encodeURIComponent(`(user="${userId}" && read=false)`)}&perPage=200`);
    if (!res.ok) return;
    const items = (await res.json()).items || [];
    await Promise.all(items.map(n =>
      apiFetch(`/api/collections/notifications/records/${n.id}`, {
        method:'PATCH', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ read: true }) })
    ));
    unreadCount = 0;
    renderSidebar();
    SCREENS.notifications();
  } catch { /* ignore */ }
}

// ── Search ───────────────────────────────────────────────────────────────────
let _searchPeople = [], _searchNews = [];
let _searchLoaded = false;

SCREENS.search = async function(params){
  const q = (params && params.q) || '';
  mountMain(`<div class="screen-pad" style="max-width:720px">
    <h1 class="card-title" style="margin-bottom:.75rem">Search</h1>
    <div class="search-bar-wrap">
      <input id="search-input" placeholder="Search members, news…" value="${esc(q)}"
        oninput="runSearch()" />
    </div>
    <div class="search-tabs">
      <button class="search-tab active" id="stab-all" onclick="switchSearchTab('all')">All</button>
      <button class="search-tab" id="stab-people" onclick="switchSearchTab('people')">Members</button>
      <button class="search-tab" id="stab-news" onclick="switchSearchTab('news')">News</button>
    </div>
    <div id="search-recent"></div>
    <div id="search-results"></div>
  </div>`);

  if (!_searchLoaded) await loadSearchData();
  renderRecentSearches();
  if (q) { el('search-input').value = q; runSearch(); }
};

async function loadSearchData(){
  try {
    const [pRes, nRes] = await Promise.all([
      apiFetch('/api/collections/persons/records?perPage=500&sort=family_name'),
      apiFetch('/api/collections/news/records?perPage=200&sort=-created')
    ]);
    if (pRes.ok) _searchPeople = (await pRes.json()).items || [];
    if (nRes.ok) _searchNews = (await nRes.json()).items || [];
    _searchLoaded = true;
  } catch { /* ignore */ }
}

let _searchTab = 'all';
function switchSearchTab(tab){
  _searchTab = tab;
  ['all','people','news'].forEach(t => {
    const btn = el(`stab-${t}`);
    if (btn) btn.className = `search-tab${t === tab ? ' active' : ''}`;
  });
  runSearch();
}

let _searchTimer = null;
function runSearch(){
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(() => {
    const q = val('search-input');
    renderSearchResults(q);
    if (q.trim().length > 1) saveRecentSearch(q.trim());
  }, 180);
}

function renderSearchResults(q){
  const container = el('search-results');
  const recent = el('search-recent');
  if (!container) return;
  if (!q.trim()) { container.innerHTML = ''; if (recent) recent.style.display = ''; return; }
  if (recent) recent.style.display = 'none';

  const people = (_searchTab === 'news') ? [] : filterPeople(_searchPeople, q);
  const news   = (_searchTab === 'people') ? [] : filterNews(_searchNews, q);

  const peopleHtml = people.map(p =>
    `<div class="search-result" onclick="navigate('tree',{person:'${p.id}'})">
      <div class="avatar" style="width:36px;height:36px;font-size:.8rem">${personInitials(p)}</div>
      <div><div class="sr-name">${esc(p.display_name)}</div>
           <div class="sr-sub">${esc(personYears(p) || p.family_name || '')}</div></div>
    </div>`).join('');

  const newsHtml = news.map(n =>
    `<div class="search-result" onclick="navigate('home')">
      <div class="avatar" style="width:36px;height:36px;font-size:.8rem;background:var(--accent-green)">📰</div>
      <div><div class="sr-name">${esc(n.title)}</div>
           <div class="sr-sub">${esc((n.body || '').slice(0, 80))}${(n.body || '').length > 80 ? '…' : ''}</div></div>
    </div>`).join('');

  const empty = !peopleHtml && !newsHtml
    ? '<div class="empty-state" style="padding:2rem 0"><p>No results for "' + esc(q) + '"</p></div>' : '';

  container.innerHTML = [
    people.length && _searchTab !== 'news' ? `<div class="notif-group-label">Members (${people.length})</div>${peopleHtml}` : '',
    news.length && _searchTab !== 'people' ? `<div class="notif-group-label">News (${news.length})</div>${newsHtml}` : '',
    empty
  ].join('');
}

function renderRecentSearches(){
  const recent = el('search-recent');
  if (!recent) return;
  const recents = getRecentSearches();
  if (!recents.length) { recent.innerHTML = ''; return; }
  recent.innerHTML = `<div class="search-recent-label">Recent</div>
    ${recents.map(r => `<span class="search-recent-pill" onclick="applyRecentSearch('${esc(r)}')">${esc(r)}</span>`).join('')}`;
}

function getRecentSearches(){
  try { return JSON.parse(localStorage.getItem('kf_searches') || '[]'); } catch { return []; }
}
function saveRecentSearch(q){
  try {
    const list = [q, ...getRecentSearches().filter(r => r !== q)].slice(0, 8);
    localStorage.setItem('kf_searches', JSON.stringify(list));
  } catch { /* ignore */ }
}
function applyRecentSearch(q){
  const inp = el('search-input');
  if (inp) { inp.value = q; runSearch(); }
}

// ── Settings ─────────────────────────────────────────────────────────────────
let _settingsTab = 'profile';

SCREENS.settings = function(params){
  _settingsTab = (params && params.tab) || 'profile';
  renderSettings();
};

function renderSettings(){
  const tabs = [
    { id:'profile',       label:'Profile' },
    { id:'privacy',       label:'Privacy' },
    { id:'notifications', label:'Notifications' },
    { id:'account',       label:'Account' },
  ];
  const nav = tabs.map(t =>
    `<button class="sn-item${t.id === _settingsTab ? ' active' : ''}" onclick="switchSettingsTab('${t.id}')">${t.label}</button>`
  ).join('');

  const u = currentUser || {};
  const priv = Object.assign(defaultPrivacy(), u.privacy_settings || {});
  const notif = Object.assign(defaultNotifPrefs(), u.notification_prefs || {});

  let panel = '';
  if (_settingsTab === 'profile'){
    panel = `<div class="settings-panel">
      <div class="card">
        <div class="section-label" style="margin-bottom:1rem">Personal info</div>
        <div id="prof-error" class="alert alert-error" style="display:none"></div>
        <div class="form-group"><label>Name</label><input id="s-name" value="${esc(u.name || '')}" /></div>
        <div class="form-group"><label>Phone</label><input id="s-phone" value="${esc(u.phone || '')}" placeholder="+1 555 000 0000" /></div>
        <div class="form-group"><label>Birthday</label><input id="s-bday" value="${esc(u.birthday || '')}" placeholder="1990-06-15" /></div>
        <div class="form-group"><label>Profile photo</label><input id="s-photo" type="file" accept="image/*" /></div>
        <button class="btn btn-primary btn-sm" onclick="saveProfile()">Save changes</button>
      </div>
    </div>`;
  } else if (_settingsTab === 'privacy'){
    const privOpt = (id, label, sub, field, val) => `<div class="toggle-row">
      <div><div class="toggle-label">${label}</div><div class="toggle-sub">${sub}</div></div>
      <select style="width:auto;padding:.25rem .5rem;font-size:.82rem" onchange="updatePrivacy('${field}',this.value)">
        ${['family','admins','only_me'].map(o =>
          `<option value="${o}" ${val === o ? 'selected' : ''}>${o === 'family' ? 'All family' : o === 'admins' ? 'Admins only' : 'Only me'}</option>`
        ).join('')}
      </select>
    </div>`;
    panel = `<div class="settings-panel"><div class="card">
      <div class="section-label" style="margin-bottom:1rem">Who can see your info</div>
      ${privOpt('phone','Phone number','Visible to…','phone',priv.phone)}
      ${privOpt('address','Home address','Visible to…','address',priv.address)}
      ${privOpt('directory','Directory listing','Visible to…','directory',priv.directory)}
    </div></div>`;
  } else if (_settingsTab === 'notifications'){
    const tog = (id, label, sub, checked) => `<div class="toggle-row">
      <div><div class="toggle-label">${label}</div><div class="toggle-sub">${sub}</div></div>
      <label class="toggle-switch">
        <input type="checkbox" ${checked ? 'checked' : ''} onchange="updateNotifPref('${id}',this.checked)" />
        <div class="toggle-track"></div>
      </label>
    </div>`;
    panel = `<div class="settings-panel"><div class="card">
      <div class="section-label" style="margin-bottom:1rem">Notify me about</div>
      ${tog('birthdays','Birthdays','Upcoming family birthdays',notif.birthdays)}
      ${tog('new_members','New members','When someone joins the family site',notif.new_members)}
      ${tog('photos','Photos','New photos added to the gallery',notif.photos)}
      ${tog('reunion','Reunion updates','Announcements about the reunion',notif.reunion)}
    </div></div>`;
  } else if (_settingsTab === 'account'){
    panel = `<div class="settings-panel">
      <div class="card">
        <div class="section-label" style="margin-bottom:1rem">Account</div>
        <div class="toggle-row" style="border:none;padding:0">
          <div><div class="toggle-label">Email</div><div class="toggle-sub">${esc(u.email || '')}</div></div>
        </div>
      </div>
      <div class="card">
        <div class="section-label" style="margin-bottom:1rem">Change password</div>
        <div id="pw-error" class="alert alert-error" style="display:none"></div>
        <div class="form-group"><label>Old password</label><input id="s-pw-old" type="password" /></div>
        <div class="form-group"><label>New password</label><input id="s-pw-new" type="password" /></div>
        <div class="form-group"><label>Confirm new</label><input id="s-pw-conf" type="password" /></div>
        <button class="btn btn-primary btn-sm" onclick="changePassword()">Update password</button>
      </div>
      <div class="card">
        <button class="btn btn-outline btn-full" onclick="logout()">Sign out</button>
      </div>
    </div>`;
  }

  mountMain(`<div class="screen-pad" style="max-width:900px">
    <h1 class="card-title" style="margin-bottom:1.25rem">Settings</h1>
    <div class="settings-layout">
      <nav class="settings-nav">${nav}</nav>
      <main>${panel}</main>
    </div>
  </div>`);
}

function switchSettingsTab(tab){
  _settingsTab = tab;
  renderSettings();
}

async function saveProfile(){
  const fd = new FormData();
  fd.append('name', val('s-name'));
  const ph = val('s-phone'); if (ph) fd.append('phone', ph);
  const bd = val('s-bday'); if (bd) fd.append('birthday', bd);
  const photo = el('s-photo').files[0]; if (photo) fd.append('avatar', photo);
  try {
    const res = await apiFetch(`/api/collections/users/records/${userId}`, { method:'PATCH', body: fd });
    if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Save failed'); }
    currentUser = await res.json();
    renderSidebar();
    toast('Profile saved.', 'success');
    renderSettings();
  } catch (e) { formErr('prof-error', e.message); }
}

async function updatePrivacy(field, value){
  const priv = Object.assign(defaultPrivacy(), (currentUser && currentUser.privacy_settings) || {});
  priv[field] = value;
  try {
    const res = await apiFetch(`/api/collections/users/records/${userId}`, {
      method:'PATCH', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ privacy_settings: priv }) });
    if (res.ok) currentUser = await res.json();
  } catch { /* ignore */ }
}

async function updateNotifPref(field, value){
  const prefs = Object.assign(defaultNotifPrefs(), (currentUser && currentUser.notification_prefs) || {});
  prefs[field] = value;
  try {
    const res = await apiFetch(`/api/collections/users/records/${userId}`, {
      method:'PATCH', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ notification_prefs: prefs }) });
    if (res.ok) currentUser = await res.json();
  } catch { /* ignore */ }
}

async function changePassword(){
  const oldPw = val('s-pw-old'), newPw = val('s-pw-new'), conf = val('s-pw-conf');
  if (!oldPw || !newPw) return formErr('pw-error', 'All fields required.');
  if (newPw !== conf) return formErr('pw-error', 'New passwords do not match.');
  try {
    const res = await apiFetch(`/api/collections/users/records/${userId}`, {
      method:'PATCH', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ oldPassword: oldPw, password: newPw, passwordConfirm: conf }) });
    if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Update failed'); }
    toast('Password updated. Please sign in again.', 'success');
    setTimeout(logout, 1500);
  } catch (e) { formErr('pw-error', e.message); }
}

// ── Admin panel ──────────────────────────────────────────────────────────────
SCREENS.admin = async function(){
  if (!(currentUser && currentUser.family_admin)) { navigate('home'); return; }
  mountMain('<div class="screen-pad" style="max-width:1100px"><div class="spinner"></div></div>');

  let pending = [], members = [], albumCount = 0, newsCount = 0;
  try {
    const [pRes, mRes, aRes, nRes] = await Promise.all([
      apiFetch('/api/collections/users/records?filter=(approved=false)&perPage=100&sort=created'),
      apiFetch('/api/collections/users/records?filter=(approved=true)&perPage=200&sort=name'),
      apiFetch('/api/collections/albums/records?perPage=1'),
      apiFetch('/api/collections/news/records?perPage=1')
    ]);
    if (pRes.ok) pending = (await pRes.json()).items || [];
    if (mRes.ok) { const d = await mRes.json(); members = d.items || []; }
    if (aRes.ok) albumCount = (await aRes.json()).totalItems || 0;
    if (nRes.ok) newsCount  = (await nRes.json()).totalItems || 0;
  } catch { /* ignore */ }

  const stat = (v, l) => `<div class="stat-card"><div class="stat-val">${v}</div><div class="stat-label">${l}</div></div>`;

  const pendingRows = pending.length
    ? pending.map(u => `<tr>
        <td>${esc(u.name || '—')}</td>
        <td>${esc(u.email || '—')}</td>
        <td>${u.created ? new Date(u.created).toLocaleDateString() : '—'}</td>
        <td>
          <button class="btn btn-primary btn-sm" onclick="adminApprove('${u.id}')">Approve</button>
          <button class="btn btn-danger btn-sm" style="margin-left:.3rem" onclick="adminDeny('${u.id}')">Deny</button>
        </td>
      </tr>`).join('')
    : '<tr><td colspan="4" style="color:var(--text-muted);text-align:center;padding:1rem">No pending requests.</td></tr>';

  const memberRows = members.map(u => `<tr>
    <td>${esc(u.name || '—')}</td>
    <td>${esc(u.email || '—')}</td>
    <td>${u.created ? new Date(u.created).toLocaleDateString() : '—'}</td>
    <td>${u.family_admin ? '<span class="pill">Admin</span>' : ''}</td>
    <td>${u.id !== userId
      ? `<button class="btn btn-outline btn-sm" onclick="adminToggleAdmin('${u.id}',${!u.family_admin})">${u.family_admin ? 'Remove admin' : 'Make admin'}</button>`
      : '<span style="color:var(--text-muted);font-size:.82rem">You</span>'}</td>
  </tr>`).join('');

  mountMain(`<div class="screen-pad" style="max-width:1100px">
    <h1 class="card-title" style="margin-bottom:1.25rem">Admin Panel</h1>
    <div class="admin-stats">
      ${stat(members.length, 'Approved members')}
      ${stat(pending.length, 'Pending approvals')}
      ${stat(albumCount, 'Albums')}
      ${stat(newsCount, 'News posts')}
    </div>

    ${pending.length ? `<div class="admin-section">Pending approvals</div>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>Name</th><th>Email</th><th>Signed up</th><th>Actions</th></tr></thead>
        <tbody>${pendingRows}</tbody>
      </table>
    </div>` : ''}

    <div class="admin-section">All members</div>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>Name</th><th>Email</th><th>Joined</th><th>Role</th><th></th></tr></thead>
        <tbody>${memberRows}</tbody>
      </table>
    </div>
  </div>`);
};

async function adminApprove(id){
  try {
    const res = await apiFetch(`/api/collections/users/records/${id}`, {
      method:'PATCH', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ approved: true }) });
    if (!res.ok) throw new Error('Could not approve');
    toast('Member approved.', 'success');
    await fetchPendingCount();
    renderSidebar();
    SCREENS.admin();
  } catch (e) { toast(e.message, 'error'); }
}

async function adminDeny(id){
  if (!confirm('Delete this pending account? This cannot be undone.')) return;
  try {
    const res = await apiFetch(`/api/collections/users/records/${id}`, { method:'DELETE' });
    if (!res.ok) throw new Error('Could not delete');
    toast('Account removed.', 'success');
    await fetchPendingCount();
    renderSidebar();
    SCREENS.admin();
  } catch (e) { toast(e.message, 'error'); }
}

async function adminToggleAdmin(id, makeAdmin){
  try {
    const res = await apiFetch(`/api/collections/users/records/${id}`, {
      method:'PATCH', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ family_admin: makeAdmin }) });
    if (!res.ok) throw new Error('Could not update');
    toast(makeAdmin ? 'Made admin.' : 'Admin removed.', 'success');
    SCREENS.admin();
  } catch (e) { toast(e.message, 'error'); }
}

// ── Placeholder screens (replaced by screen modules appended below) ──────────
for (const n of NAV) if (!SCREENS[n.tab]) SCREENS[n.tab] = () =>
  mountMain(`<div class="screen-pad"><h1 class="card-title">${esc(n.label)}</h1>
    <div class="empty-state"><p>Coming soon.</p></div></div>`);
if (!SCREENS.profile) SCREENS.profile = () =>
  mountMain('<div class="screen-pad"><div class="empty-state"><p>Coming soon.</p></div></div>');

init();
