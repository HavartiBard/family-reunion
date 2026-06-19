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
  if (bn) bn.innerHTML = MOBILE_NAV.map(n =>
    `<button class="bn-item${n.tab === active ? ' active' : ''}" onclick="navigate('${n.tab}')">
       <span class="ico">${n.ico}</span><span>${esc(n.label)}</span></button>`).join('');
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

// ── Placeholder screens (replaced by screen modules appended below) ──────────
for (const n of NAV) if (!SCREENS[n.tab]) SCREENS[n.tab] = () =>
  mountMain(`<div class="screen-pad"><h1 class="card-title">${esc(n.label)}</h1>
    <div class="empty-state"><p>Coming soon.</p></div></div>`);
if (!SCREENS.profile) SCREENS.profile = () =>
  mountMain('<div class="screen-pad"><div class="empty-state"><p>Coming soon.</p></div></div>');

init();
