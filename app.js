/* ===========================================================================
   Kelsall Family — SPA application
   Shell, routing, sidebar, auth bootstrap. Screen renderers register into
   SCREENS (filled in by later screen modules appended below in this file).
   Pure helpers come from helpers.js (window globals); merge logic from merge.js.
   =========================================================================== */

const API = 'https://reunion-api.klsll.com';
const UPLOAD_URL = 'https://photo-upload.klsll.com/upload';

// ── Fact system definitions (GEDCOM-aligned) ─────────────────────────────────
const FACT_DEFS = {
  birth:             { label:'Birth',                cat:'vital',     icon:'◎' },
  death:             { label:'Death',                cat:'vital',     icon:'✦' },
  burial:            { label:'Burial',               cat:'vital',     icon:'▽' },
  cremation:         { label:'Cremation',            cat:'vital',     icon:'▽' },
  baptism:           { label:'Baptism',              cat:'religious', icon:'✝' },
  christening:       { label:'Christening',          cat:'religious', icon:'✝' },
  christening_adult: { label:'Adult Christening',    cat:'religious', icon:'✝' },
  bar_mitzvah:       { label:'Bar Mitzvah',          cat:'religious', icon:'✡' },
  bat_mitzvah:       { label:'Bat Mitzvah',          cat:'religious', icon:'✡' },
  confirmation:      { label:'Confirmation',         cat:'religious', icon:'✝' },
  first_communion:   { label:'First Communion',      cat:'religious', icon:'✝' },
  blessing:          { label:'Blessing',             cat:'religious', icon:'✝' },
  ordination:        { label:'Ordination',           cat:'religious', icon:'✝' },
  adoption:          { label:'Adoption',             cat:'life',      icon:'◇' },
  immigration:       { label:'Immigration',          cat:'life',      icon:'→' },
  emigration:        { label:'Emigration',           cat:'life',      icon:'←' },
  naturalization:    { label:'Naturalization',       cat:'life',      icon:'◇' },
  military:          { label:'Military Service',     cat:'life',      icon:'★' },
  graduation:        { label:'Graduation',           cat:'life',      icon:'◈' },
  retirement:        { label:'Retirement',           cat:'life',      icon:'◇' },
  census:            { label:'Census',               cat:'life',      icon:'◇' },
  will:              { label:'Will',                 cat:'life',      icon:'◇' },
  probate:           { label:'Probate',              cat:'life',      icon:'◇' },
  residence:         { label:'Residence',            cat:'life',      icon:'⌂', hasValue:true },
  property:          { label:'Property',             cat:'life',      icon:'⌂', hasValue:true },
  marriage:          { label:'Marriage',             cat:'family',    icon:'♥' },
  divorce:           { label:'Divorce',              cat:'family',    icon:'◇' },
  engagement:        { label:'Engagement',           cat:'family',    icon:'♦' },
  annulment:         { label:'Annulment',            cat:'family',    icon:'◇' },
  occupation:        { label:'Occupation',           cat:'attribute', icon:'◈', hasValue:true },
  education:         { label:'Education',            cat:'attribute', icon:'◈', hasValue:true },
  religion:          { label:'Religion',             cat:'attribute', icon:'◇', hasValue:true },
  nationality:       { label:'Nationality',          cat:'attribute', icon:'◇', hasValue:true },
  title:             { label:'Title / Nobility',     cat:'attribute', icon:'◇', hasValue:true },
  physical_description:{ label:'Physical Description',cat:'attribute',icon:'◇', hasValue:true },
  medical:           { label:'Medical Condition',    cat:'attribute', icon:'◇', hasValue:true },
  ssn:               { label:'Social Security #',   cat:'attribute', icon:'#', hasValue:true },
  national_id:       { label:'National ID',          cat:'attribute', icon:'#', hasValue:true },
  address:           { label:'Address',              cat:'attribute', icon:'⌂', hasValue:true },
  website:           { label:'Website',              cat:'attribute', icon:'◇', hasValue:true },
  email:             { label:'Email',                cat:'attribute', icon:'◇', hasValue:true },
  phone:             { label:'Phone',                cat:'attribute', icon:'◇', hasValue:true },
  note:              { label:'Note',                 cat:'attribute', icon:'◇', hasValue:true },
  other:             { label:'Other',                cat:'attribute', icon:'◇', hasValue:true },
};

const FACT_GROUPS = [
  { label:'Vital Events',       types:['birth','death','burial','cremation'] },
  { label:'Religious',          types:['baptism','christening','christening_adult','bar_mitzvah','bat_mitzvah','confirmation','first_communion','blessing','ordination'] },
  { label:'Life Events',        types:['adoption','immigration','emigration','naturalization','military','graduation','retirement','census','will','probate','residence','property'] },
  { label:'Family',             types:['marriage','divorce','engagement','annulment'] },
  { label:'Attributes & Details',types:['occupation','education','religion','nationality','title','physical_description','medical','ssn','national_id','address','website','email','phone','note','other'] },
];

function _factDef(type){ return FACT_DEFS[type] || { label: type, cat:'other', icon:'◇' }; }

function _parseYearFromDate(s){
  if (!s) return null;
  const m = (s+'').match(/\b(1[0-9]{3}|20[0-2][0-9])\b/);
  return m ? parseInt(m[1]) : null;
}

// ── Genealogy date picker ─────────────────────────────────────────────────────
const _DP_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const _DP_MONTH_ALT = {
  january:'Jan', february:'Feb', march:'Mar', april:'Apr', may:'May', june:'Jun',
  july:'Jul', august:'Aug', september:'Sep', october:'Oct', november:'Nov', december:'Dec'
};
const _DP_QUALS = { abt:'Abt', about:'Abt', bef:'Bef', before:'Bef', aft:'Aft', after:'Aft', cir:'Cir', circa:'Cir', ca:'Abt' };

function _parseDateText(s){
  if (!s) return { qual:'', day:'', month:'', year:'' };
  let rest = s.trim(), qual = '', day = '', month = '', year = '';
  for (const [k, v] of Object.entries(_DP_QUALS)){
    if (new RegExp('^' + k + '(?:\\s|$)', 'i').test(rest)){
      qual = v; rest = rest.slice(k.length).trim(); break;
    }
  }
  const yr = rest.match(/\b(\d{4})\b/);
  if (yr){ year = yr[1]; rest = (rest.slice(0, yr.index) + rest.slice(yr.index + 4)).trim(); }
  for (const m of _DP_MONTHS){
    if (new RegExp('\\b' + m + '\\b', 'i').test(rest)){ month = m; rest = rest.replace(new RegExp('\\b' + m + '\\b', 'i'), '').trim(); break; }
  }
  if (!month){
    for (const [k, v] of Object.entries(_DP_MONTH_ALT)){
      if (new RegExp('\\b' + k + '\\b', 'i').test(rest)){ month = v; rest = rest.replace(new RegExp('\\b' + k + '\\b', 'i'), '').trim(); break; }
    }
  }
  const dm = rest.match(/\b(\d{1,2})\b/);
  if (dm){ const d = parseInt(dm[1]); if (d >= 1 && d <= 31) day = String(d); }
  return { qual, day, month, year };
}

function _composeDateText(id){
  const qual  = (el(id + '-qual')  || {}).value || '';
  const day   = ((el(id + '-day')  || {}).value || '').trim();
  const month = (el(id + '-mon')   || {}).value || '';
  const year  = ((el(id + '-year') || {}).value || '').trim();
  if (!year && !month && !day) return '';
  const d = day && parseInt(day) > 0 ? String(parseInt(day)) : '';
  return [qual, d, month, year].filter(Boolean).join(' ');
}

function _datePicker(id, current){
  const { qual, day, month, year } = _parseDateText(current);
  const qualOpts = [['','Exact'],['Abt','About'],['Bef','Before'],['Aft','After'],['Cir','Circa']]
    .map(([v,l]) => `<option value="${v}"${v===qual?' selected':''}>${l}</option>`).join('');
  const monOpts = ['', ..._DP_MONTHS]
    .map(m => `<option value="${m}"${m===month?' selected':''}>${m||'Month'}</option>`).join('');
  return `<div class="date-picker-row">
    <select id="${id}-qual" class="dp-qual">${qualOpts}</select>
    <input  id="${id}-day"  class="dp-day"  type="number" min="1" max="31" placeholder="Day"  value="${esc(day)}" />
    <select id="${id}-mon"  class="dp-mon">${monOpts}</select>
    <input  id="${id}-year" class="dp-year" type="number" min="1" max="2099" placeholder="Year" value="${esc(year)}" />
  </div>`;
}

function _sortFacts(facts){
  const catPri = { vital:0, religious:1, life:2, family:3, attribute:4, other:5 };
  // Within vital, birth always first, then burial/cremation after death
  const vitalOrder = { birth:0, baptism:1, christening:1, christening_adult:1, death:8, burial:9, cremation:9 };
  return [...facts].sort((a,b) => {
    const ac = catPri[_factDef(a.fact_type).cat] ?? 5;
    const bc = catPri[_factDef(b.fact_type).cat] ?? 5;
    if (ac !== bc) return ac - bc;
    if (ac === 0) { // vital — use fixed order within category
      const ao = vitalOrder[a.fact_type] ?? 5;
      const bo = vitalOrder[b.fact_type] ?? 5;
      if (ao !== bo) return ao - bo;
    }
    const ay = a.sort_year || 9999, by = b.sort_year || 9999;
    return ay - by;
  });
}

let token = localStorage.getItem('pb_token') || '';
let userId = localStorage.getItem('pb_user_id') || '';
let currentUser = null;
let unreadCount = 0;
let pendingCount = 0;
let currentBranches = null;  // null = not loaded; [] = not branch admin; ['Kelsall'] = branch admin
let branchPendingCount = 0;

const NAV = [
  { tab:'home',          label:'Home',           ico:'⌂' },
  { tab:'tree',          label:'Family Tree',    ico:'⧉' },
  { tab:'events',        label:'Events',         ico:'◆' },
  { tab:'directory',     label:'Directory',      ico:'☰' },
  { tab:'gallery',       label:'Photo Gallery',  ico:'⬡' },
  { tab:'notifications', label:'Notifications',  ico:'◉', badge:() => unreadCount },
  { tab:'search',        label:'Search',         ico:'⌕' },
  { tab:'settings',      label:'Settings',       ico:'⚙' },
  { tab:'admin',         label:'Admin Panel',    ico:'⚑', adminOnly:true, badge:() => pendingCount },
  { tab:'branchadmin',   label:'Branch Admin',   ico:'⚐', branchAdminOnly:true, badge:() => branchPendingCount },
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
    // Refresh the token on every load — extends session and validates in one step.
    // PocketBase issues a fresh JWT; Google/Apple tokens are never involved (they're server-side only).
    const res = await apiFetch('/api/collections/users/auth-refresh', { method: 'POST' });
    if (!res.ok) throw new Error('session expired');
    const data = await res.json();
    token = data.token;
    localStorage.setItem('pb_token', token);
    currentUser = data.record;
    if (!currentUser.approved && !currentUser.family_admin) return showPending();
    enterApp();
  } catch {
    clearSession();
    showAuth();
  }
}

async function enterApp(){
  // If user has no linked person in the tree, run the claim/onboarding flow first
  const linkedId = await myPersonId().catch(() => null);
  if (!linkedId) {
    const nameParts = (currentUser.name || '').trim().split(/\s+/);
    await showTreeClaimStep(nameParts[0] || '', nameParts.slice(1).join(' ') || '');
    return;
  }
  _launchAppShell();
}

function _launchAppShell(){
  clearInterval(rollerTimer);
  el('app').innerHTML = `
    <div id="app-shell">
      <aside id="sidebar"><div class="sidebar-texture"></div><div id="sidebar-inner"></div></aside>
      <main id="main"></main>
    </div>
    <nav id="bottom-nav"></nav>`;
  Promise.all([refreshUnread(), refreshPending(), loadBranchAdminState()]).then(() => {
    renderSidebar();
    const dl = new URLSearchParams(location.search).get('person');
    if (dl) navigate('tree', { person: dl });
    else navigate(currentTab());
  });
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

function isBranchAdmin(){ return !!(currentBranches && currentBranches.length > 0); }

async function loadBranchAdminState(){
  if (!userId) { currentBranches = []; branchPendingCount = 0; return; }
  try {
    const res = await apiFetch(`/api/collections/branch_admins/records?filter=${encodeURIComponent(`(user="${userId}")`)}` + `&perPage=50`);
    currentBranches = res.ok ? (await res.json()).items.map(r => r.branch) : [];
  } catch { currentBranches = []; }

  if (currentBranches.length === 0) { branchPendingCount = 0; return; }
  try {
    const branchFilter = currentBranches.map(b => `person.family_name="${b}"`).join('||');
    const res = await apiFetch(`/api/collections/person_claims/records?filter=${encodeURIComponent(`(status="pending" && (${branchFilter}))`)}&perPage=1`);
    branchPendingCount = res.ok ? (await res.json()).totalItems || 0 : 0;
  } catch { branchPendingCount = 0; }
}

// ── Sidebar ─────────────────────────────────────────────────────────────────
function renderSidebar(){
  const inner = el('sidebar-inner');
  if (!inner) return;
  const active = currentTab();
  const items = NAV.filter(n => {
    if (n.adminOnly) return currentUser && currentUser.family_admin;
    if (n.branchAdminOnly) return isBranchAdmin() && !(currentUser && currentUser.family_admin);
    return true;
  });
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
const DEV_LOGIN_ORIGINS = new Set(['http://localhost:4173', 'http://192.168.20.60:4173']);
let rollerTimer = null;

function isLocalDevOrigin(){
  return DEV_LOGIN_ORIGINS.has(location.origin);
}

function getDevLoginConfig(){
  return {
    email: localStorage.getItem('kf_dev_login_email') || '',
    password: localStorage.getItem('kf_dev_login_password') || '',
  };
}

function saveDevLoginConfig(email, password){
  localStorage.setItem('kf_dev_login_email', email);
  localStorage.setItem('kf_dev_login_password', password);
}

function clearDevLoginConfig(){
  localStorage.removeItem('kf_dev_login_email');
  localStorage.removeItem('kf_dev_login_password');
}

function devLoginButtons(){
  if (!isLocalDevOrigin()) return '';
  const cfg = getDevLoginConfig();
  const hasCreds = !!(cfg.email && cfg.password);
  return `
    <div class="auth-divider">local dev</div>
    <div style="display:flex;gap:.55rem;margin-bottom:.9rem">
      <button class="btn btn-outline" style="flex:1;height:48px" onclick="doDevLogin()">${hasCreds ? 'Dev login' : 'Set dev login'}</button>
      ${hasCreds ? `<button class="btn btn-outline" style="height:48px" onclick="openDevLoginModal()">Edit</button>
      <button class="btn btn-outline" style="height:48px" onclick="clearDevLogin()">Clear</button>` : ''}
    </div>`;
}

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
    <button class="btn-google" onclick="doGoogleAuth()">
      <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
      Sign in with Google
    </button>
    <button class="btn-apple" onclick="doAppleAuth()">
      <svg width="17" height="20" viewBox="0 0 814 1000" fill="white"><path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-37.5-150.2-104.5C34.1 752.3 0 665.7 0 582.3c0-165.1 108.9-252.6 214.1-252.6 55.7 0 102.1 36.5 138.2 36.5 34.2 0 87.5-38.8 153.2-38.8 24.7 0 108.2 2.6 168.6 81.2zm-174.5-97.2c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"/></svg>
      Sign in with Apple
    </button>
    ${devLoginButtons()}
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
      <div class="form-group"><label>First name <span style="color:var(--accent-gold)">*</span></label><input id="reg-first" required /></div>
      <div class="form-group"><label>Last name <span style="color:var(--accent-gold)">*</span></label><input id="reg-last" required /></div>
    </div>
    <div class="form-group"><label>Email <span style="color:var(--accent-gold)">*</span></label><input id="reg-email" type="email" required /></div>
    <div class="form-group"><label>Username <span style="color:var(--accent-gold)">*</span> <span style="font-weight:400;font-size:.8rem;color:var(--text-muted)">visible to family members</span></label><input id="reg-username" placeholder="e.g. james_kelsall" /></div>
    <div class="row-2">
      <div class="form-group"><label>Phone</label><input id="reg-phone" /></div>
      <div class="form-group"><label>Birthday</label><input id="reg-birthday" type="date" /></div>
    </div>
    <div class="row-2">
      <div class="form-group"><label>Password <span style="color:var(--accent-gold)">*</span></label><input id="reg-password" type="password" required /></div>
      <div class="form-group"><label>Confirm <span style="color:var(--accent-gold)">*</span></label><input id="reg-password2" type="password" required /></div>
    </div>
    <button class="btn btn-primary btn-full" style="height:54px;font-weight:700;margin-top:.4rem" onclick="doRegister()">Create account</button>
    <p class="auth-foot">Already have an account? <span class="link" onclick="showAuth('signin')">Sign in</span></p>
    <p class="auth-foot" style="font-size:.75rem;color:var(--text-muted);margin-top:.6rem">Your details are visible only to verified family members.</p>`;
}

function showPending(msg){
  clearInterval(rollerTimer);
  const text = msg || "Your account was created and is waiting for a family admin to approve it. You'll get access once approved.";
  el('app').innerHTML = `<div class="auth-wrap"><div class="auth-form"><div class="box" style="text-align:center">
    <div style="font-size:2.5rem">⏳</div>
    <h1 style="font-family:var(--font-display);font-size:1.8rem;margin:.5rem 0">Awaiting approval</h1>
    <p class="sub">${esc(text)}</p>
    <button class="btn btn-outline" onclick="logout()">Sign out</button>
  </div></div></div>`;
}

function authError(msg){
  const e = el('auth-error');
  if (e) { e.textContent = msg; e.style.display = ''; }
  else toast(msg, 'error');
}

// ── Auth actions (ported, behavior unchanged) ────────────────────────────────
function openDevLoginModal(){
  const cfg = getDevLoginConfig();
  openModal(`<h2 class="card-title">Local dev login</h2>
    <div id="dev-login-error" class="alert alert-error" style="display:none"></div>
    <div class="form-group"><label>Email</label><input id="dev-login-email" type="email" value="${esc(cfg.email)}" /></div>
    <div class="form-group"><label>Password</label><input id="dev-login-password" type="password" value="${esc(cfg.password)}" /></div>
    <div style="display:flex;gap:.6rem;margin-top:.75rem">
      <button class="btn btn-primary" onclick="saveDevLogin()">Save</button>
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
    </div>`);
}

function saveDevLogin(){
  const email = val('dev-login-email');
  const password = val('dev-login-password');
  if (!email || !password) return formErr('dev-login-error', 'Email and password are required.');
  saveDevLoginConfig(email, password);
  closeModal();
  showAuth('signin');
}

function clearDevLogin(){
  clearDevLoginConfig();
  showAuth('signin');
}

async function doDevLogin(){
  const cfg = getDevLoginConfig();
  if (!cfg.email || !cfg.password) {
    openDevLoginModal();
    return;
  }
  try {
    const res = await fetch(`${API}/api/collections/users/auth-with-password`, {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ identity: cfg.email, password: cfg.password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Dev login failed');
    setSession(data.token, data.record);
    if (!currentUser.approved && !currentUser.family_admin) return showPending();
    enterApp();
  } catch (e) {
    authError(e.message);
    openDevLoginModal();
  }
}

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
    if (!currentUser.approved && !currentUser.family_admin) return showPending();
    enterApp();
  } catch (e) { authError(e.message); }
}

async function doRegister(){
  const first = val('reg-first'), last = val('reg-last'), email = val('reg-email'),
        usernameRaw = val('reg-username'),
        phone = val('reg-phone'), birthday = val('reg-birthday'),
        pw = val('reg-password'), pw2 = val('reg-password2');
  if (!first || !last) return authError('First and last name are required.');
  if (!email) return authError('Email is required.');
  if (!usernameRaw) return authError('Please choose a username.');
  if (pw !== pw2) return authError('Passwords do not match.');
  if (pw.length < 8) return authError('Password must be at least 8 characters.');
  const username = usernameRaw.trim().replace(/[^a-zA-Z0-9_]/g, '_');
  if (username.length < 3) return authError('Username must be at least 3 characters (letters, numbers, underscores only).');
  try {
    const body = { username, name: `${first} ${last}`, email, emailVisibility: true, phone, password: pw, passwordConfirm: pw2, approved: false };
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
    showTreeClaimStep(first, last);
  } catch (e) { authError(e.message); }
}

let _claimAllPersons = [];
let _claimSearchTimer = null;

async function showTreeClaimStep(first, last){
  try {
    const res = await apiFetch('/api/collections/persons/records?perPage=500&sort=family_name');
    if (res.ok) _claimAllPersons = (await res.json()).items || [];
  } catch { _claimAllPersons = []; }

  el('app').innerHTML = `<div class="claim-step">
    <div class="claim-box">
      <h2>Are you in the family tree?</h2>
      <p class="sub">Search for your name below. If you find yourself, click to claim that record.
        If not, we'll add you as a new entry.</p>
      <div class="form-group" style="margin-bottom:.75rem">
        <input id="claim-search" placeholder="Search by name…"
          value="${esc(first + ' ' + last)}"
          oninput="runClaimSearch()" />
      </div>
      <div id="claim-results"></div>
      <button class="btn btn-outline btn-full" style="margin-top:1rem"
        onclick="skipClaim()">
        I'm not in the tree yet — add me as new
      </button>
    </div>
  </div>`;

  runClaimSearch();
}

function runClaimSearch(){
  clearTimeout(_claimSearchTimer);
  _claimSearchTimer = setTimeout(() => {
    const q = (document.getElementById('claim-search') || {}).value || '';
    const results = filterPeople(_claimAllPersons, q).slice(0, 8);
    const container = document.getElementById('claim-results');
    if (!container) return;
    container.innerHTML = results.length
      ? results.map(p => {
          const already = !!p.linked_user;
          return `<div class="claim-result${already ? '" style="opacity:.5;cursor:default' : ''}" ${already ? '' : `onclick="submitClaim('${p.id}')"`}>
            <div class="avatar" style="width:36px;height:36px;font-size:.8rem">${personInitials(p)}</div>
            <div>
              <div class="cr-name">${esc(p.display_name)}${already ? ' <span style="font-size:.76rem;color:var(--text-muted)">(already linked)</span>' : ''}</div>
              <div class="cr-sub">${esc(personYears(p) || p.family_name || '')}</div>
            </div>
          </div>`;
        }).join('')
      : (q.trim() ? '<p style="font-size:.82rem;color:var(--text-muted)">No matches found.</p>' : '');
  }, 200);
}

async function submitClaim(personId){
  try {
    const res = await apiFetch('/api/collections/person_claims/records', {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ person: personId, user: userId, status: 'pending' })
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Could not submit claim'); }
    // Claim submitted — go to family wizard for the claimed person so they can fill in family info
    showFamilyWizard(personId);
  } catch (e) {
    const errEl = document.getElementById('claim-results');
    if (errEl) errEl.insertAdjacentHTML('afterbegin',
      `<div class="alert alert-error" style="margin-bottom:.5rem">${esc(e.message)}</div>`);
  }
}

async function skipClaim(){
  // Use whatever is in the search box — could have been edited by user
  const searchVal = (document.getElementById('claim-search') || {}).value || '';
  const parts = searchVal.trim().split(/\s+/).filter(Boolean);
  const first = parts[0] || '';
  const last = parts.slice(1).join(' ') || '';
  const displayName = `${first} ${last}`.trim();

  if (!displayName) {
    const errEl = document.getElementById('claim-results');
    if (errEl) errEl.innerHTML = '<div class="alert alert-error" style="margin-bottom:.5rem">Please enter your name in the search box above first.</div>';
    return;
  }

  let personId = null;
  try {
    const res = await apiFetch('/api/collections/persons/records', {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({
        display_name: displayName,
        given_name: first,
        family_name: last,
        living: true,
        linked_user: userId
      })
    });
    if (res.ok) { const p = await res.json(); personId = p.id; }
    else { const d = await res.json(); toast(d.message || 'Could not create your profile', 'error'); }
  } catch (e) { toast(e.message, 'error'); }
  if (personId) showFamilyWizard(personId);
}

// ── Family onboarding wizard ─────────────────────────────────────────────────

let _wiz = { personId: null, step: 0, gender: null, childrenAdded: 0 };
const _WIZ_STEPS = ['father', 'mother', 'children'];

async function showFamilyWizard(personId){
  _wiz = { personId, step: 0, gender: null, childrenAdded: 0 };
  if (personId) {
    try {
      const r = await apiFetch(`/api/collections/persons/records/${personId}?fields=gender`);
      if (r.ok) { const p = await r.json(); _wiz.gender = p.gender || null; }
    } catch { /* non-fatal */ }
  }
  _renderWizStep();
}

function _wizAfterDone(){
  if (!currentUser.approved && !currentUser.family_admin) showPending();
  else _launchAppShell();
}

function _renderWizStep(){
  const step = _WIZ_STEPS[_wiz.step];
  const total = _WIZ_STEPS.length;
  const pips = _WIZ_STEPS.map((_, i) =>
    `<div class="wiz-pip${i === _wiz.step ? ' active' : i < _wiz.step ? ' done' : ''}"></div>`
  ).join('');

  let heading, sub, body;
  if (step === 'father') {
    heading = 'Who is your father?';
    sub = 'Search for him in the family tree, or add him as a new entry.';
    body = _wizSearchHTML('father', 'Dad\'s name…');
  } else if (step === 'mother') {
    heading = 'Who is your mother?';
    sub = 'Search for her in the family tree, or add her as a new entry.';
    body = _wizSearchHTML('mother', 'Mom\'s name…');
  } else {
    heading = 'Any children?';
    sub = `Add your children one at a time. ${_wiz.childrenAdded ? `(${_wiz.childrenAdded} added so far)` : ''}`;
    body = _wizSearchHTML('child', 'Child\'s name…');
  }

  el('app').innerHTML = `<div class="claim-step">
    <div class="claim-box" style="max-width:520px">
      <div class="wiz-pips">${pips}</div>
      <div style="font-size:.78rem;color:var(--text-muted);margin-bottom:.5rem">Step ${_wiz.step + 1} of ${total}</div>
      <h2>${heading}</h2>
      <p class="sub">${sub}</p>
      ${body}
      <div style="display:flex;gap:.6rem;margin-top:1rem">
        ${step === 'children' && _wiz.childrenAdded > 0
          ? `<button class="btn btn-primary" onclick="_wizDoneStep()">Done adding children</button>`
          : `<button class="btn btn-outline" onclick="_wizSkipStep()">Skip</button>`}
        ${_wiz.step > 0 ? `<button class="btn btn-ghost btn-sm" onclick="_wizBack()" style="margin-left:auto">← Back</button>` : ''}
      </div>
    </div>
  </div>`;

  setTimeout(() => {
    const inp = document.getElementById('wiz-search');
    if (inp) inp.focus();
  }, 50);
}

function _wizSearchHTML(role, placeholder){
  return `<div class="form-group" style="margin-bottom:.5rem">
    <input id="wiz-search" placeholder="${placeholder}" oninput="_wizRunSearch(this.value,'${role}')" autocomplete="off" />
  </div>
  <div id="wiz-results" class="wiz-results"></div>`;
}

let _wizSearchTimer = null;
let _wizAllPersons = null;

async function _wizRunSearch(q, role){
  clearTimeout(_wizSearchTimer);
  _wizSearchTimer = setTimeout(async () => {
    const resEl = document.getElementById('wiz-results');
    if (!resEl) return;
    const query = q.trim();
    if (!query){ resEl.innerHTML = ''; return; }

    if (!_wizAllPersons) {
      const r = await apiFetch('/api/collections/persons/records?perPage=500&sort=family_name&fields=id,display_name,given_name,family_name,birth_date,linked_user');
      _wizAllPersons = r.ok ? (await r.json()).items || [] : [];
    }

    const lower = query.toLowerCase();
    const matches = _wizAllPersons.filter(p => {
      const name = (p.display_name || `${p.given_name} ${p.family_name}`).toLowerCase();
      return name.includes(lower);
    }).slice(0, 8);

    const rows = matches.map(p => {
      const name = p.display_name || `${p.given_name} ${p.family_name}`.trim();
      const yr = p.birth_date ? (_parseYearFromDate(p.birth_date) || '') : '';
      return `<div class="claim-result" onclick="_wizSelectPerson('${p.id}','${esc(name)}','${role}')">
        <div class="avatar" style="width:36px;height:36px;font-size:.8rem">${(name[0]||'?').toUpperCase()}</div>
        <div><div class="cr-name">${esc(name)}</div><div class="cr-sub">${yr ? 'b. ' + yr : ''}</div></div>
      </div>`;
    }).join('');

    const addNew = `<div class="claim-result" style="border-style:dashed;color:var(--accent-gold)"
        onclick="_wizCreateAndSelect('${esc(query)}','${role}')">
      <div class="avatar" style="width:36px;height:36px;font-size:.8rem;background:var(--bg-hover)">+</div>
      <div><div class="cr-name">Add "${esc(query)}" as new person</div>
           <div class="cr-sub">Create a new entry in the family tree</div></div>
    </div>`;

    resEl.innerHTML = rows + addNew;
  }, 200);
}

async function _wizSelectPerson(personId, name, role){
  await _wizLinkRelation(personId, role);
}

async function _wizCreateAndSelect(name, role){
  const parts = name.trim().split(/\s+/);
  const body = {
    display_name: name,
    given_name: parts[0] || name,
    family_name: parts.slice(1).join(' ') || '',
    living: true
  };
  if (role === 'father') body.gender = 'male';
  if (role === 'mother') body.gender = 'female';
  try {
    const r = await apiFetch('/api/collections/persons/records', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)
    });
    if (!r.ok){ const d = await r.json(); throw new Error(d.message || 'Could not create person'); }
    const p = await r.json();
    _wizAllPersons = null; // invalidate cache
    await _wizLinkRelation(p.id, role);
  } catch(e){ toast(e.message, 'error'); }
}

async function _wizLinkRelation(relatedId, role){
  if (!_wiz.personId) {
    _wizDoneStep(); // no user person record yet — still advance the step
    return;
  }
  try {
    if (role === 'father' || role === 'mother') {
      const r = await apiFetch(`/api/collections/persons/records/${_wiz.personId}`, {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ [role]: relatedId })
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.message || 'Could not link relation'); }
      toast(`${role === 'father' ? 'Father' : 'Mother'} added to your profile.`, 'success');
      _wizDoneStep();
    } else if (role === 'child') {
      const field = _wiz.gender === 'female' ? 'mother' : 'father';
      const r = await apiFetch(`/api/collections/persons/records/${relatedId}`, {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ [field]: _wiz.personId })
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.message || 'Could not link child'); }
      _wiz.childrenAdded++;
      _wizAllPersons = null;
      toast(`Child added.`, 'success');
      _renderWizStep();
    }
  } catch(e){ toast(e.message, 'error'); }
}

function _wizDoneStep(){
  _wizAllPersons = null;
  if (_wiz.step < _WIZ_STEPS.length - 1) {
    _wiz.step++;
    _renderWizStep();
  } else {
    _wizAfterDone();
  }
}

function _wizSkipStep(){
  _wizAllPersons = null;
  if (_wiz.step < _WIZ_STEPS.length - 1) {
    _wiz.step++;
    _renderWizStep();
  } else {
    _wizAfterDone();
  }
}

function _wizBack(){
  if (_wiz.step > 0) { _wiz.step--; _renderWizStep(); }
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
    if (!currentUser.approved && !currentUser.family_admin) return showPending();
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
    if (!currentUser.approved && !currentUser.family_admin) return showPending();
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
  let news = [], members = [], memberTotal = 0, branches = 0, nextEvent = null;
  try {
    const today = new Date().toISOString();
    const [nRes, uRes, pRes, eRes] = await Promise.all([
      apiFetch('/api/collections/news/records?sort=-created&perPage=50&expand=author'),
      apiFetch('/api/collections/users/records?filter=(approved=true)&perPage=200'),
      apiFetch('/api/collections/persons/records?perPage=500&fields=family_name'),
      apiFetch(`/api/collections/events/records?sort=start_date&perPage=1&filter=${encodeURIComponent(`(start_date>="${today}")`)}`)
    ]);
    if (nRes.ok) news = (await nRes.json()).items || [];
    if (uRes.ok) { const u = await uRes.json(); members = u.items || []; memberTotal = u.totalItems || members.length; }
    if (pRes.ok) {
      const persons = (await pRes.json()).items || [];
      branches = new Set(persons.map(p => (p.family_name || '').trim()).filter(Boolean)).size;
    }
    if (eRes.ok) { const ev = (await eRes.json()).items || []; nextEvent = ev[0] || null; }
  } catch { /* render with whatever loaded */ }

  const heroHtml = nextEvent
    ? (() => {
        const evDate = new Date(nextEvent.start_date).toLocaleDateString('en-US',
          { weekday:'long', month:'long', day:'numeric', year:'numeric' });
        const days = daysUntil(nextEvent.start_date.slice(0,10), new Date());
        return `<div class="reunion-hero">
          <div class="texture"></div>
          <div class="rh-left">
            <div class="rh-label">Next event</div>
            <div class="rh-name">${esc(nextEvent.name)}</div>
            <div class="rh-detail">${evDate}</div>
            <button class="btn btn-gold" style="margin-top:18px" onclick="navigate('events',{event:'${nextEvent.id}'})">View event</button>
          </div>
          <div class="rh-count">
            <div class="rh-num">${days}</div><div class="rh-days">days to go</div>
          </div>
        </div>`;
      })()
    : `<div class="reunion-hero">
        <div class="texture"></div>
        <div class="rh-left">
          <div class="rh-label">Welcome</div>
          <div class="rh-name">Kelsall Family</div>
          <div class="rh-detail">Explore the tree, photos, and more.</div>
          <button class="btn btn-gold" style="margin-top:18px" onclick="navigate('events')">See events</button>
        </div>
      </div>`;

  mountMain(`<div class="screen-pad">
    ${heroHtml}
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
const personCache = new Map();

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

// ── Canvas tree state ─────────────────────────────────────────────────────────
const _tS = {
  persons: new Map(), childrenOf: new Map(),
  focusId: null, focusPartners: [], partnersOf: new Map(),
  collapsed: new Set(),     // hides a node's parents (ancestor direction)
  descCollapsed: new Set(), // hides a node's children (descendant direction)
  siblings: [], sibsCollapsed: false, siblingCouples: new Map(),
  ancSiblings: new Map(),
  ancSibsCollapsed: new Set(),
  expandedRelated: new Set(),
  trees: [], storedTrees: [], activeTree: null,
  pan: {x:0,y:0}, zoom: 1,
  dragging: false, dragLast: {x:0,y:0},
  ctxId: null, _offset: null, loading: false,
};
// Surname-based tree color palette (earthy tones complementing the app's warm aesthetic)
const _TREE_COLORS = ['#7b5ea7','#2c6e49','#1a5276','#a04000','#7d6608','#6e2f1a','#0e6655','#4a235a'];
const _ANC_PAIR_CENTERS = {
  1: [0],
  2: [-282, 282],
  3: [-564, -188, 188, 564],
};
function _treeColorFor(surname){
  if (!surname) return null;
  const t = _tS.trees.find(t => t.name === surname);
  return t ? t.color : null;
}
// Stable hash → color index so the same surname always gets the same color
// regardless of which persons happen to be loaded in the current view.
function _surnameColorIdx(name){
  let h = 5381;
  for (let i = 0; i < name.length; i++) h = ((h << 5) + h + name.charCodeAt(i)) >>> 0;
  return h % _TREE_COLORS.length;
}
function _computeTrees(){
  const counts = new Map();
  for (const p of _tS.persons.values()){
    const s = (p.family_name||'').trim(); if (s) counts.set(s, (counts.get(s)||0)+1);
    // Also count birth surname so married-in persons anchor their birth lineage
    const bs = (p.birth_surname||'').trim();
    if (bs && bs !== s) counts.set(bs, (counts.get(bs)||0)+1);
  }
  const sorted = [...counts.entries()].sort((a,b)=>b[1]-a[1]);
  _tS.trees = sorted.map(([name,count]) => {
    const stored = _tS.storedTrees.find(t => (t.surname||t.name) === name);
    return {
      name,
      count,
      color: (stored && stored.color) || _TREE_COLORS[_surnameColorIdx(name)],
      rootPersonId: (stored && stored.root_person) || null,
      id: (stored && stored.id) || null,
    };
  });
}
async function tpLoadStoredTrees(){
  try {
    const res = await apiFetch('/api/collections/trees/records?perPage=100&sort=name');
    _tS.storedTrees = res.ok ? (await res.json()).items : [];
  } catch(e){ _tS.storedTrees = []; }
}
const _TW = 160, _TH = 88, _THG = 28, _TVG = 100; // node w/h, h-gap, v-gap

SCREENS.tree = function(params){
  mountMain(`<div class="tree-screen">
    <div class="tree-hdr">
      <h1 class="tree-title">Family Tree</h1>
      <div class="tree-hdr-right">
        <div id="tree-selector" class="tree-selector"></div>
        <button class="btn btn-outline btn-sm" onclick="openPersonForm()">+ Add person</button>
      </div>
    </div>
    <div class="tree-vp" id="tree-vp"
      onmousedown="tpDragStart(event)" onmousemove="tpDragMove(event)"
      onmouseup="tpDragEnd()" onmouseleave="tpDragEnd()"
      ontouchstart="tpTouchStart(event)" ontouchmove="tpTouchMove(event)" ontouchend="tpDragEnd()"
      onwheel="tpWheel(event)">
      <div class="tree-inner" id="tree-inner"></div>
      <div class="tree-controls">
        <button class="tc-btn" onclick="tpZoom(0.15)" title="Zoom in">+</button>
        <button class="tc-btn" onclick="tpZoom(-0.15)" title="Zoom out">−</button>
        <button class="tc-btn" onclick="tpResetView()" title="Fit to view">⊡</button>
      </div>
    </div>
  </div>`);
  _tS.persons.clear(); _tS.childrenOf.clear(); _tS.focusPartners = []; _tS.partnersOf.clear();
  _tS.collapsed.clear(); _tS.descCollapsed.clear(); _tS.ancSibsCollapsed.clear(); _tS.ctxId = null; _tS.trees = []; _tS.storedTrees = []; _tS.activeTree = null;
  _tS.pan = {x:0,y:0}; _tS.zoom = 1;
  tpLoad((params && params.person) || treeFocusId || null);
};

async function tpLoad(focusId){
  if (_tS.loading) return;
  _tS.loading = true;
  const inner = el('tree-inner');
  if (inner) inner.innerHTML = '<div class="spinner" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)"></div>';
  try {
    let startId = focusId;
    if (!startId && currentUser) startId = await myPersonId();
    if (!startId){
      const r = await apiFetch('/api/collections/persons/records?perPage=1');
      if (r.ok) startId = ((await r.json()).items[0]||{}).id || null;
    }
    if (!startId){
      if (inner) inner.innerHTML = `<div class="empty-state" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center">
        <div style="font-size:3rem">🌳</div><p>No one in the tree yet.</p>
        <button class="btn btn-primary" style="margin-top:1rem" onclick="openPersonForm()">Add a person</button></div>`;
      return;
    }
    _tS.focusId = startId; treeFocusId = startId;
    history.replaceState({}, '', `${location.pathname}?tab=tree&person=${startId}`);
    _tS.persons.clear(); _tS.childrenOf.clear(); _tS.focusPartners = []; _tS.partnersOf.clear();
    _tS.siblings = []; _tS.sibsCollapsed = false; _tS.siblingCouples = new Map();
    _tS.ancSiblings.clear();
    _tS.ancSibsCollapsed.clear();
    _tS.expandedRelated.clear();
    await Promise.all([
      tpFetchUp(startId, 0),
      tpFetchDown(startId, 0),
    ]);
    await tpFetchVisiblePartners(startId);
    // Fetch siblings (other children of focus's parents) and their first partners
    const focPerson = _tS.persons.get(startId);
    if (focPerson) {
      const sibParentId = focPerson.father || focPerson.mother;
      if (sibParentId) {
        const sibList = await getChildren(sibParentId);
        _tS.siblings = sibList.filter(s => s.id !== startId)
          .sort((a,b) => (parseInt(_parseYearFromDate(a.birth_date))||9999) - (parseInt(_parseYearFromDate(b.birth_date))||9999));
        _tS.siblings.forEach(s => _tS.persons.set(s.id, s));
        await Promise.all(_tS.siblings.map(async s => {
          const couples = await getCouplesFor(s.id);
          const pid = couples.length ? (couples[0].partner_a === s.id ? couples[0].partner_b : couples[0].partner_a) : null;
          if (pid) {
            const partner = await getPerson(pid);
            if (partner) { _tS.siblingCouples.set(s.id, partner); _tS.persons.set(partner.id, partner); }
          }
        }));
      }
    }
    await tpFetchAncSiblings(startId);
    await tpLoadStoredTrees();
    _computeTrees();
    tpRender(); tpCenterFocus();
  } finally { _tS.loading = false; }
}

async function tpFetchUp(id, depth){
  if (!id || depth > 3) return;
  const p = await getPerson(id); if (!p) return;
  _tS.persons.set(id, p);
  if (depth < 3) await Promise.all([tpFetchUp(p.father, depth+1), tpFetchUp(p.mother, depth+1)]);
}
async function tpFetchDown(id, depth){
  if (!id) return;
  if (depth > 0){ const p = await getPerson(id); if (p) _tS.persons.set(id, p); }
  if (depth >= 3) return;
  const ch = await getChildren(id);
  _tS.childrenOf.set(id, ch);
  ch.forEach(c => _tS.persons.set(c.id, c));
  await Promise.all(ch.map(c => tpFetchDown(c.id, depth+1)));
}

async function tpFetchVisiblePartners(focusId){
  const ids = [..._tS.persons.keys()];
  const entries = await Promise.all(ids.map(async (id) => {
    const couples = await getCouplesFor(id);
    const partnerIds = dedupeById(couples.map(c => ({ id: c.partner_a === id ? c.partner_b : c.partner_a }))).map(p => p.id);
    const partners = (await Promise.all(partnerIds.map(getPerson))).filter(Boolean);
    partners.forEach(p => _tS.persons.set(p.id, p));
    return [id, partners];
  }));
  _tS.partnersOf = new Map(entries);
  _tS.focusPartners = _tS.partnersOf.get(focusId) || [];
}

// Fetch siblings for all visible ancestors (everyone who appears as father/mother of a loaded person)
async function tpFetchAncSiblings(focusId){
  _tS.ancSiblings.clear();
  // Identify ancestors: persons who appear as father/mother of another loaded person
  const ancestorIds = new Set();
  for (const p of _tS.persons.values()){
    if (p.father && _tS.persons.has(p.father)) ancestorIds.add(p.father);
    if (p.mother && _tS.persons.has(p.mother)) ancestorIds.add(p.mother);
  }
  ancestorIds.delete(focusId); // focus siblings handled by _tS.siblings
  await Promise.all([...ancestorIds].map(async (ancId) => {
    const anc = _tS.persons.get(ancId); if (!anc) return;
    const parentId = anc.father || anc.mother; if (!parentId) return;
    const children = await getChildren(parentId);
    const sibs = children.filter(c => c.id !== ancId)
      .sort((a,b) => (parseInt(_parseYearFromDate(a.birth_date))||9999) - (parseInt(_parseYearFromDate(b.birth_date))||9999));
    if (sibs.length){
      _tS.ancSiblings.set(ancId, {parentId, sibs});
      sibs.forEach(s => _tS.persons.set(s.id, s));
    }
  }));
}

function _ancPairCenter(depth, slot){
  const row = _ANC_PAIR_CENTERS[depth] || [];
  return row[slot] ?? 0;
}

function _ancSibsVisible(id, depth){
  const toggled = _tS.ancSibsCollapsed.has(id);
  return depth === 1 ? !toggled : toggled;
}

function _ancBuildDirect(childId, depth, slot, childCX, childTopY, nodes, edges){
  if (depth >= 3 || _tS.collapsed.has(childId)) return;
  const child = _tS.persons.get(childId);
  if (!child) return;

  const nextDepth = depth + 1;
  const parentY = -nextDepth * (_TH + _TVG);
  const pairCX = _ancPairCenter(nextDepth, slot);
  const fatherCX = pairCX - (_TW + _THG) / 2;
  const motherCX = pairCX + (_TW + _THG) / 2;
  const father = child.father ? _tS.persons.get(child.father) : null;
  const mother = child.mother ? _tS.persons.get(child.mother) : null;

  const addParentNode = (person, role, cx, parentId) => {
    if (person) {
      nodes.push({ id: person.id, x: cx - _TW/2, y: parentY, person, role:'anc', d: nextDepth });
    } else {
      nodes.push({
        id: `ph:${parentId}:${role}`,
        x: cx - _TW/2,
        y: parentY,
        person: { display_name: role === 'father' ? 'Add father' : 'Add mother' },
        role:'anc-placeholder',
        d: nextDepth,
        placeholder: true,
        placeholderRole: role,
        childId: parentId,
      });
    }
  };

  addParentNode(father, 'father', fatherCX, childId);
  addParentNode(mother, 'mother', motherCX, childId);
  edges.push({ x1: fatherCX + _TW/2, y1: parentY + _TH/2, x2: motherCX - _TW/2, y2: parentY + _TH/2, type:'partner' });
  edges.push({ x1: pairCX, y1: parentY + _TH/2, x2: childCX, y2: childTopY, type:'straight' });

  if (father) _ancBuildDirect(father.id, nextDepth, slot * 2, fatherCX, parentY, nodes, edges);
  if (mother) _ancBuildDirect(mother.id, nextDepth, slot * 2 + 1, motherCX, parentY, nodes, edges);
}

// Descendant subtree width
function _descW(id, depth){
  if (!id || !_tS.persons.has(id)) return 0;
  if (depth >= 3 || _tS.descCollapsed.has(id)) return _TW;
  const ch = _tS.childrenOf.get(id) || [];
  if (!ch.length) return _TW;
  return Math.max(_TW, ch.reduce((s,c) => s + _descW(c.id, depth+1) + _THG, -_THG));
}
// Place descendant nodes recursively
// edgeStartY: if set, overrides the y1 of the edge from this parent to its children (first level only)
function _descPlace(id, depth, cx, nodes, edges, parentCX, parentY, edgeStartY){
  if (!id || !_tS.persons.has(id)) return;
  const p = _tS.persons.get(id);
  const y = depth * (_TH + _TVG);
  if (depth > 0){
    nodes.push({id, x: cx-_TW/2, y, person:p, role:'desc', d:depth});
    if (parentCX !== null)
      edges.push({x1:parentCX, y1:(edgeStartY !== undefined ? edgeStartY : parentY+_TH), x2:cx, y2:y});
  }
  if (depth >= 3 || _tS.descCollapsed.has(id)) return;
  const ch = _tS.childrenOf.get(id) || [];
  if (!ch.length) return;
  const ws = ch.map(c => _descW(c.id, depth+1));
  const total = ws.reduce((s,w) => s+w+_THG, -_THG);
  let x = cx - total/2;
  for (let i=0; i<ch.length; i++){
    // pass edgeStartY only one level deep (focus→child), not grandchild+
    _descPlace(ch[i].id, depth+1, x+ws[i]/2, nodes, edges, cx, y, depth===0 ? edgeStartY : undefined);
    x += ws[i] + _THG;
  }
}

// Orthogonal stepped connector path with rounded corners.
// Draws: down from (x1,y1) → elbow at mid-height → across → down to (x2,y2).
function _orthoPath(x1, y1, x2, y2, r=10){
  const dx = x2 - x1;
  if (Math.abs(dx) < 2) return `M${x1},${y1} L${x2},${y2}`;
  const ey = Math.round((y1 + y2) / 2);
  const s = dx > 0 ? 1 : -1;
  return `M${x1},${y1} L${x1},${ey-r} Q${x1},${ey} ${x1+s*r},${ey} L${x2-s*r},${ey} Q${x2},${ey} ${x2},${ey+r} L${x2},${y2}`;
}

function _descBirthYear(p){
  return parseInt(_parseYearFromDate(p && p.birth_date)) || 9999;
}

function _pairKey(a, b){
  const ids = [a, b].filter(Boolean).sort();
  return ids.length ? ids.join('|') : '';
}

function _partnersAround(personId){
  const person = _tS.persons.get(personId);
  if (!person) return { left: [], right: [], ordered: [] };
  const partners = (_tS.partnersOf.get(personId) || []).slice().sort((a, b) => _descBirthYear(a) - _descBirthYear(b));
  const left = [], right = [];
  for (const partner of partners){
    const pGender = partner.gender || 'unknown';
    const selfGender = person.gender || 'unknown';
    let goLeft;
    if      (pGender === 'male' && selfGender !== 'male') goLeft = true;
    else if (pGender !== 'male' && selfGender === 'male') goLeft = false;
    else goLeft = _descBirthYear(partner) < _descBirthYear(person);
    if (goLeft) left.push(partner);
    else right.push(partner);
  }
  return { left, right, ordered: [...left, person, ...right] };
}

function _childGroupsFor(personId){
  const children = ((_tS.childrenOf.get(personId) || []).slice())
    .sort((a, b) => _descBirthYear(a) - _descBirthYear(b));
  if (!children.length) return [];

  const partnerOrder = _partnersAround(personId).ordered
    .filter(p => p.id !== personId)
    .map((p, idx) => [p.id, idx]);
  const partnerIndex = new Map(partnerOrder);
  const groups = new Map();

  for (const child of children){
    const otherParentId = child.father === personId ? child.mother : child.mother === personId ? child.father : '';
    const key = otherParentId ? _pairKey(personId, otherParentId) : `single:${personId}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        partnerId: otherParentId || '',
        partner: otherParentId ? _tS.persons.get(otherParentId) || null : null,
        children: [],
      });
    }
    groups.get(key).children.push(child);
  }

  return [...groups.values()].sort((a, b) => {
    const ai = a.partnerId ? (partnerIndex.get(a.partnerId) ?? 999) : 500;
    const bi = b.partnerId ? (partnerIndex.get(b.partnerId) ?? 999) : 500;
    if (ai !== bi) return ai - bi;
    return _descBirthYear(a.children[0]) - _descBirthYear(b.children[0]);
  });
}

function _descFamilyW(id, depth){
  if (!id || !_tS.persons.has(id)) return 0;
  const rowCards = _partnersAround(id).ordered;
  const rowW = rowCards.length * _TW + Math.max(0, rowCards.length - 1) * _THG;
  if (depth >= 3 || _tS.descCollapsed.has(id)) return rowW;
  const groups = _childGroupsFor(id);
  if (!groups.length) return rowW;
  const groupGap = _THG * 2;
  const childW = groups.reduce((sum, group, idx) => {
    const w = Math.max(_TW, group.children.reduce((acc, child) => acc + _descFamilyW(child.id, depth+1), 0) + Math.max(0, group.children.length - 1) * _THG);
    return sum + w + (idx ? groupGap : 0);
  }, 0);
  return Math.max(rowW, childW);
}

function _descPlaceFamily(id, depth, leftX, nodes, edges, incomingCX, parentY, edgeStartY){
  if (!id || !_tS.persons.has(id)) return;
  const person = _tS.persons.get(id);
  const partners = _partnersAround(id);
  const rowCards = partners.ordered;
  const blockW = _descFamilyW(id, depth);
  const rowW = rowCards.length * _TW + Math.max(0, rowCards.length - 1) * _THG;
  const selfIdx = partners.left.length;
  const rowStart = depth === 0
    ? (-_TW/2) - selfIdx * (_TW + _THG)
    : leftX + (blockW - rowW) / 2;
  const y = depth * (_TH + _TVG);
  const partnerCX = new Map();
  let selfCX = 0;

  for (let i = 0; i < rowCards.length; i++){
    const p = rowCards[i];
    const x = rowStart + i * (_TW + _THG);
    if (p.id === id) {
      selfCX = x + _TW/2;
      if (depth > 0) nodes.push({ id: p.id, x, y, person: p, role:'desc', d: depth });
    } else {
      partnerCX.set(p.id, x + _TW/2);
      nodes.push({ id: p.id, x, y, person: p, role:'partner', d: depth });
    }
  }

  for (const partner of partners.left) {
    edges.push({ x1:partnerCX.get(partner.id)+_TW/2, y1:y+_TH/2, x2:selfCX-_TW/2, y2:y+_TH/2, type:'partner' });
  }
  for (const partner of partners.right) {
    edges.push({ x1:selfCX+_TW/2, y1:y+_TH/2, x2:partnerCX.get(partner.id)-_TW/2, y2:y+_TH/2, type:'partner' });
  }

  if (depth > 0 && incomingCX !== null) {
    edges.push({ x1: incomingCX, y1: (edgeStartY !== undefined ? edgeStartY : parentY + _TH), x2: selfCX, y2: y });
  }

  if (depth >= 3 || _tS.descCollapsed.has(id)) return;
  const groups = _childGroupsFor(id);
  if (!groups.length) return;

  const groupGap = _THG * 2;
  const groupWidths = groups.map(group =>
    Math.max(_TW, group.children.reduce((sum, child) => sum + _descFamilyW(child.id, depth+1), 0) + Math.max(0, group.children.length - 1) * _THG)
  );
  const totalChildrenW = groupWidths.reduce((sum, w, idx) => sum + w + (idx ? groupGap : 0), 0);
  let gx = leftX + (blockW - totalChildrenW) / 2;

  for (let i = 0; i < groups.length; i++){
    const group = groups[i];
    const groupW = groupWidths[i];
    const unionCX = group.partnerId && partnerCX.has(group.partnerId)
      ? (selfCX + partnerCX.get(group.partnerId)) / 2
      : selfCX;
    const unionStartY = group.partnerId && partnerCX.has(group.partnerId) ? y + _TH/2 : undefined;

    let childX = gx;
    for (const child of group.children){
      const childW = _descFamilyW(child.id, depth+1);
      _descPlaceFamily(child.id, depth+1, childX, nodes, edges, unionCX, y, unionStartY);
      childX += childW + _THG;
    }
    gx += groupW + groupGap;
  }
}

function tpComputeLayout(){
  const nodes=[], edges=[];
  const focusPerson = _tS.persons.get(_tS.focusId);
  if (focusPerson) nodes.push({ id:_tS.focusId, x:-_TW/2, y:0, person:focusPerson, role:'focus', d:0 });
  _ancBuildDirect(_tS.focusId, 0, 0, 0, 0, nodes, edges);

  const foc = nodes.find(n => n.id === _tS.focusId);
  const focCX = foc ? (foc.x + _TW/2) : 0;
  const descBlockW = _descFamilyW(_tS.focusId, 0);
  _descPlaceFamily(_tS.focusId, 0, -descBlockW/2, nodes, edges, null, null, undefined);

  // Siblings of focus render on the outer side of the focus person's own branch,
  // not on the spouse side. This keeps the row hierarchy closer to Ancestry's layout.
  if (_tS.siblings.length && !_tS.sibsCollapsed && foc){
    const focPerson = _tS.persons.get(_tS.focusId);
    const parNode = focPerson && (
      nodes.find(n => n.id === focPerson.father) ||
      nodes.find(n => n.id === focPerson.mother)
    );
    const focusPartners = _partnersAround(_tS.focusId);
    const rowNodes = nodes.filter(n => n.y === 0);
    const putRight = focusPartners.left.length > 0 && focusPartners.right.length === 0;
    let sx = putRight
      ? Math.max(...rowNodes.map(n => n.x + _TW))
      : Math.min(...rowNodes.map(n => n.x));
    const sibCXs = [];
    for (let i = _tS.siblings.length - 1; i >= 0; i--){
      const s = _tS.siblings[i];
      if (putRight) sx += _THG;
      else sx -= _THG + _TW;
      const sibX = putRight ? sx : sx;
      const sibCX = sibX + _TW/2;
      nodes.push({id:s.id, x:sibX, y:0, person:s, role:'sibling', d:0});
      sibCXs.push(sibCX);
      const sp = _tS.siblingCouples.get(s.id);
      if (sp){
        if (putRight){
          const spX = sibX + _TW + _THG;
          sx = spX + _TW;
          nodes.push({id:sp.id, x:spX, y:0, person:sp, role:'sib-partner', d:0});
          edges.push({x1:sibX+_TW, y1:_TH/2, x2:spX, y2:_TH/2, type:'partner'});
        } else {
          sx -= _THG + _TW;
          nodes.push({id:sp.id, x:sx, y:0, person:sp, role:'sib-partner', d:0});
          edges.push({x1:sx+_TW, y1:_TH/2, x2:sibX, y2:_TH/2, type:'partner'});
        }
      } else if (putRight) {
        sx = sibX + _TW;
      }
    }
    if (parNode && sibCXs.length){
      for (let j = edges.length-1; j >= 0; j--){
        const e = edges[j];
        if (!e.type && e.x2 === focCX && e.y2 === 0){ edges.splice(j, 1); break; }
      }
      const parCX = parNode.x + _TW/2, parBot = parNode.y + _TH;
      const elbowY = parBot + _TVG * 0.5;
      const allCXs = [focCX, ...sibCXs];
      const minCX = Math.min(...allCXs), maxCX = Math.max(...allCXs);
      edges.push({x1:parCX, y1:parBot, x2:parCX, y2:elbowY, type:'straight'});
      edges.push({x1:minCX, y1:elbowY, x2:maxCX, y2:elbowY, type:'straight'});
      for (const cx of allCXs) edges.push({x1:cx, y1:elbowY, x2:cx, y2:0, type:'straight'});
    }
  }

  // Expanded related trees: show partner/sib-partner ancestry inline above their card
  if (_tS.expandedRelated.size) {
    for (const n of nodes.slice()) {
      if (!(n.role === 'partner' || n.role === 'sib-partner')) continue;
      if (!_tS.expandedRelated.has(n.id)) continue;
      const rp = _tS.persons.get(n.id);
      if (!rp) continue;
      const pCX = n.x + _TW/2, pY = n.y;
      const fW = (rp.father && _tS.persons.has(rp.father)) ? _ancW(rp.father, 1) : 0;
      const mW = (rp.mother && _tS.persons.has(rp.mother)) ? _ancW(rp.mother, 1) : 0;
      if (!fW && !mW) continue;
      const total = fW + (fW && mW ? _THG : 0) + mW;
      let curX = pCX - total/2;
      const fCX = fW ? curX + fW/2 : null;
      if (fW) { _ancPlace(rp.father, 1, curX+fW/2, nodes, edges, pCX, pY); curX += fW+(mW?_THG:0); }
      const mCX = mW ? curX + mW/2 : null;
      if (mW) _ancPlace(rp.mother, 1, curX+mW/2, nodes, edges, pCX, pY);
      if (fCX !== null && mCX !== null) {
        const ancY = pY - (_TH + _TVG);
        edges.push({x1:fCX+_TW/2, y1:ancY+_TH/2, x2:mCX-_TW/2, y2:ancY+_TH/2, type:'partner'});
      }
    }
  }

  // Deduplicate nodes in case a person appears via multiple routes
  const _seen = new Set();
  const uniqueNodes = nodes.filter(n => !_seen.has(n.id) && _seen.add(n.id));

  // Ancestor siblings: paternal ancestors (cx<0) → siblings extend LEFT; maternal (cx>0) → RIGHT
  if (_tS.ancSiblings.size){
    const rowMin = new Map(); // nodeY → leftmost x
    const rowMax = new Map(); // nodeY → rightmost x+TW
    for (const n of uniqueNodes){
      rowMin.set(n.y, Math.min(rowMin.get(n.y) ?? Infinity, n.x));
      rowMax.set(n.y, Math.max(rowMax.get(n.y) || 0, n.x + _TW));
    }
    for (const n of uniqueNodes.slice()){
      if (n.role !== 'anc') continue;
      const entry = _tS.ancSiblings.get(n.id); if (!entry) continue;
      if (!_ancSibsVisible(n.id, n.d)) continue;
      const {parentId, sibs} = entry;
      const parNode = uniqueNodes.find(m => m.id === parentId);
      const rowY = n.y;
      const ancCX = n.x + _TW/2;
      // Paternal side (left of center) → sibs go further left; maternal (right) → right
      const goLeft = ancCX < 0;
      const sibCXs = [];
      for (const sib of sibs){
        if (uniqueNodes.some(m => m.id === sib.id)) continue;
        let sx;
        if (goLeft){
          sx = (rowMin.get(rowY) ?? 0) - _THG - _TW;
          rowMin.set(rowY, sx);
          sibCXs.unshift(sx + _TW/2); // prepend → left-to-right order preserved
        } else {
          sx = (rowMax.get(rowY) || 0) + _THG;
          rowMax.set(rowY, sx + _TW);
          sibCXs.push(sx + _TW/2);
        }
        uniqueNodes.push({id:sib.id, x:sx, y:rowY, person:sib, role:'anc-sib', d:n.d});
        _seen.add(sib.id);
      }
      if (parNode && sibCXs.length){
        const parCX = parNode.x + _TW/2, parBot = parNode.y + _TH;
        const elbowY = parBot + _TVG * 0.45;
        const allCXs = [ancCX, ...sibCXs];
        const minCX = Math.min(...allCXs), maxCX = Math.max(...allCXs);
        for (let j = edges.length-1; j >= 0; j--){
          const e = edges[j];
          if (!e.type && Math.abs(e.x2 - ancCX) < 2 && Math.abs(e.y2 - rowY) < 2){ edges.splice(j,1); break; }
        }
        edges.push({x1:parCX, y1:parBot, x2:parCX, y2:elbowY, type:'straight'});
        edges.push({x1:Math.min(...allCXs), y1:elbowY, x2:Math.max(...allCXs), y2:elbowY, type:'straight'});
        for (const cx of allCXs) edges.push({x1:cx, y1:elbowY, x2:cx, y2:rowY, type:'straight'});
      }
    }
  }

  return {nodes: uniqueNodes, edges};
}

function tpRender(){
  const inner = el('tree-inner'); if (!inner) return;
  const {nodes, edges} = tpComputeLayout();
  if (!nodes.length){
    inner.innerHTML = '<div class="empty-state" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)"><div style="font-size:3rem">🌱</div><p>No relatives yet.</p></div>';
    return;
  }
  const PAD = 60;
  const minX = Math.min(...nodes.map(n=>n.x)) - PAD;
  const maxX = Math.max(...nodes.map(n=>n.x+_TW)) + PAD;
  const minY = Math.min(...nodes.map(n=>n.y)) - PAD;
  const maxY = Math.max(...nodes.map(n=>n.y+_TH)) + PAD;
  const cW = maxX-minX, cH = maxY-minY;
  const ox = -minX, oy = -minY;
  _tS._offset = {ox, oy, cW, cH};

  // SVG connector lines
  let svg = '';
  for (const e of edges){
    const x1=e.x1+ox, y1=e.y1+oy, x2=e.x2+ox, y2=e.y2+oy;
    if (e.type === 'partner'){
      svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--accent-gold)" stroke-dasharray="5 3" stroke-width="2" stroke-linecap="round"/>`;
    } else if (e.type === 'straight'){
      svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#c4bba8" stroke-width="2" stroke-linecap="round"/>`;
    } else {
      svg += `<path d="${_orthoPath(x1,y1,x2,y2)}" stroke="#c4bba8" fill="none" stroke-width="2" stroke-linecap="round"/>`;
    }
  }

  // Row labels: named interactive chips for the focus's direct connections; generic SVG for ancestor rows
  const focusPerson = _tS.persons.get(_tS.focusId);
  const focGivenName = focusPerson ? (focusPerson.given_name || focusPerson.display_name.split(' ')[0] || 'Their') : 'Their';
  const rowYPresent = new Set(nodes.map(n => n.y));
  const _GLEN = _TH + _TVG;
  const focNode = nodes.find(n => n.id === _tS.focusId);
  const labelAnchorX = focNode ? focNode.x + _TW/2 + ox : ox + _TW/2;

  // Generic ancestor-row SVG pills (grandparents and above)
  const ancRows = [
    {y:-3*_GLEN, label:'Great-grandparents', nextY:-2*_GLEN},
    {y:-2*_GLEN, label:'Grandparents',        nextY:-_GLEN},
    {y:-_GLEN,   label:'Parents',             nextY:0},
  ];
  for (const row of ancRows){
    if (!rowYPresent.has(row.y)) continue;
    const nextPresent = rowYPresent.has(row.nextY);
    const gapMidY = nextPresent
      ? (row.y + _TH + row.nextY) / 2 + oy
      : row.y + _TH/2 + oy;
    const lbl = row.label.toUpperCase();
    const lw = lbl.length * 6.2 + 14;
    const lh = 16, lx = labelAnchorX - lw/2, ly = gapMidY - lh/2;
    svg += `<g pointer-events="none">
      <rect x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" width="${lw.toFixed(1)}" height="${lh}" rx="4" fill="rgba(237,232,223,0.92)" stroke="#c4bba8" stroke-width="1"/>
      <text x="${labelAnchorX.toFixed(1)}" y="${(ly+11).toFixed(1)}" text-anchor="middle" font-family="Schibsted Grotesk,system-ui,sans-serif" font-size="8.5" font-weight="700" letter-spacing="0.07em" fill="#8a8070">${lbl}</text>
    </g>`;
  }

  // Named interactive chips for focus ↕ connections (appended to chipHtml, merged into html after declaration)
  let chipHtml = '';
  if (focNode){
    // "Jennifer's Parents" — on connector above focus, toggles ancestral collapse
    if (rowYPresent.has(-_GLEN)){
      const chipY = (-_GLEN + _TH + 0) / 2 + oy;
      const isParCol = _tS.collapsed.has(_tS.focusId);
      const parLabel = `${focGivenName}'s Parents ${isParCol ? '▴' : '▾'}`;
      chipHtml += `<button class="tn-rel-chip${isParCol?' col':''}" style="left:${(labelAnchorX - 70).toFixed(0)}px;top:${(chipY - 12).toFixed(0)}px" onclick="tpToggleCollapse(event,'${_tS.focusId}')">${esc(parLabel)}</button>`;
    }
    // "Jennifer's Children" — on connector below focus, toggles descendant collapse
    if (rowYPresent.has(_GLEN)){
      const chipY = (0 + _TH + _GLEN) / 2 + oy;
      const isChiCol = _tS.descCollapsed.has(_tS.focusId);
      const chiLabel = `${focGivenName}'s Children ${isChiCol ? '▴' : '▾'}`;
      chipHtml += `<button class="tn-rel-chip${isChiCol?' col':''}" style="left:${(labelAnchorX - 70).toFixed(0)}px;top:${(chipY - 12).toFixed(0)}px" onclick="tpToggleCollapse(event,'${_tS.focusId}','desc')">${esc(chiLabel)}</button>`;
    }
    // Generic descendant row labels (grandchildren etc)
    const descRows = [{y:_GLEN, nextY:2*_GLEN, label:'Grandchildren'},{y:2*_GLEN, nextY:3*_GLEN, label:'Great-grandchildren'}];
    for (const row of descRows){
      if (!rowYPresent.has(row.y)) continue;
      const nextPresent = rowYPresent.has(row.nextY);
      const gapMidY = nextPresent ? (row.y + _TH + row.nextY) / 2 + oy : row.y + _TH/2 + oy;
      const lbl = row.label.toUpperCase();
      const lw = lbl.length * 6.2 + 14;
      const lh = 16, lx = labelAnchorX - lw/2, ly = gapMidY - lh/2;
      svg += `<g pointer-events="none">
        <rect x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" width="${lw.toFixed(1)}" height="${lh}" rx="4" fill="rgba(237,232,223,0.92)" stroke="#c4bba8" stroke-width="1"/>
        <text x="${labelAnchorX.toFixed(1)}" y="${(ly+11).toFixed(1)}" text-anchor="middle" font-family="Schibsted Grotesk,system-ui,sans-serif" font-size="8.5" font-weight="700" letter-spacing="0.07em" fill="#8a8070">${lbl}</text>
      </g>`;
    }
  }

  // Node cards
  let html = `<svg class="tree-svg" width="${cW}" height="${cH}" viewBox="0 0 ${cW} ${cH}">${svg}</svg>`;
  html += chipHtml;
  for (const n of nodes){
    const p = n.person;
    const nx = n.x+ox, ny = n.y+oy;
    const isFocus = n.id === _tS.focusId;
    const years = personYears(p);

    // Tree color: prefer birth surname for tree membership (e.g. married-in persons)
    const treeSurname = p.birth_surname || p.family_name;
    const treeColor = _treeColorFor(treeSurname) || _treeColorFor(p.family_name);
    const dimmed = _tS.activeTree && treeSurname !== _tS.activeTree && p.family_name !== _tS.activeTree;

    const photoUrl = p.photo && p.id ? `${API}/api/files/persons/${p.id}/${p.photo}?thumb=80x88` : '';
    const tintSeed = String(p.id || n.id || '0');
    const bandColor = treeColor || avatarTint(tintSeed.charCodeAt(0)%6);
    const av = photoUrl
      ? `<div class="tn-av-band" style="background:${bandColor}"><img class="tn-av-band-img" src="${photoUrl}" alt="" loading="lazy"></div>`
      : `<div class="tn-av-band" style="background:${bandColor}">${personInitials(p)}</div>`;

    // Collapse button: ancestors with known parents (ancestor dir), descendants/focus with children (desc dir)
    const hasUp = n.role==='anc' && n.d < 3 && (p.father || p.mother) && (_tS.persons.has(p.father)||_tS.persons.has(p.mother));
    const hasDown = (n.role==='focus'||n.role==='desc') && (_tS.childrenOf.get(n.id)||[]).length > 0;
    const hasSideSibs = n.role==='anc' && _tS.ancSiblings.has(n.id);
    const isColAnc = _tS.collapsed.has(n.id);
    const isColDesc = _tS.descCollapsed.has(n.id);
    const isColSide = !_ancSibsVisible(n.id, n.d);
    const isCol = isColAnc || isColDesc;

    // "Has more" stub for great-grandparents with parents, or max-depth descendants
    const moreAnc = n.role==='anc' && n.d===3 && (p.father||p.mother);
    const moreDesc = n.role==='desc' && n.d===3 && !_tS.childrenOf.has(n.id);
    const moreBtn = (moreAnc||moreDesc) ? '<div class="tn-more" title="More relatives exist beyond this view">···</div>' : '';
    const tcStyle = treeColor ? `;--tc:${treeColor}` : '';
    const cls = ['tn-card', isFocus?'focus':'', n.role==='anc'?'anc':'', n.role==='partner'?'partner':'',
      n.role==='sibling'?'sibling':'', n.role==='sib-partner'?'sib-partner':'',
      n.role==='anc-sib'?'anc-sib':'',
      n.placeholder?'placeholder':'',
      isCol?'col':'', dimmed?'dimmed':''].filter(Boolean).join(' ');
    const clickAttr = n.placeholder
      ? `onclick="tpAddAncestor('${n.childId}','${n.placeholderRole}')"`
      : `onclick="tpNodeClick(event,'${n.id}')"`
    html += `<div class="${cls}" style="left:${nx}px;top:${ny}px${tcStyle}" ${clickAttr}>
      ${av}<div class="tn-info"><div class="tn-name">${esc(p.display_name)}</div>${years?`<div class="tn-years">${esc(years)}</div>`:''}</div>
      ${moreBtn}</div>`;
    // Collapse button rendered outside the card, on the connector end (leaf position)
    const leafX = (nx + _TW/2 - 10).toFixed(0);
    if (hasUp){
      const c = isColAnc?' col':'', lbl = isColAnc?'+':'−';
      html += `<button class="tn-leaf-btn${c}" style="left:${leafX}px;top:${(ny-10).toFixed(0)}px" onclick="tpToggleCollapse(event,'${n.id}')" title="${isColAnc?'Show parents':'Hide parents'}">${lbl}</button>`;
    }
    if (hasDown){
      const c = isColDesc?' col':'', lbl = isColDesc?'+':'−';
      html += `<button class="tn-leaf-btn${c}" style="left:${leafX}px;top:${(ny+_TH-10).toFixed(0)}px" onclick="tpToggleCollapse(event,'${n.id}','desc')" title="${isColDesc?'Show children':'Hide children'}">${lbl}</button>`;
    }
    if (hasSideSibs){
      const sideLeft = (n.x + _TW/2) < 0;
      const c = isColSide ? ' col' : '';
      const lbl = isColSide ? '+' : '−';
      const btnX = sideLeft ? (nx - 10).toFixed(0) : (nx + _TW - 10).toFixed(0);
      const btnY = (ny + _TH/2 - 10).toFixed(0);
      html += `<button class="tn-leaf-btn${c}" style="left:${btnX}px;top:${btnY}px" onclick="tpToggleAncestorSibs(event,'${n.id}')" title="${isColSide?'Show siblings':'Hide siblings'}">${lbl}</button>`;
    }
    // Branch pill: expand/collapse partner's ancestry inline
    if ((n.role==='partner' || n.role==='sib-partner') && (p.father || p.mother)){
      const isExp = _tS.expandedRelated.has(n.id);
      const bSurname = p.birth_surname || p.family_name;
      const bLabel = (bSurname ? `${esc(bSurname)}` : 'family') + (isExp ? ' ▴' : ' ▾');
      const bW = 94, bX = nx + (_TW - bW)/2, bY = ny - 28;
      html += `<div class="tn-branch${isExp?' expanded':''}" style="left:${bX}px;top:${bY}px${tcStyle}" onclick="tpExpandRelated('${n.id}')" title="${isExp?'Collapse':'Expand'} ${esc(p.display_name)}'s family tree">${bLabel}</div>`;
    }
  }

  inner.style.cssText = `width:${cW}px;height:${cH}px;position:relative`;
  inner.innerHTML = html;
  tpRenderSelector();
}

async function tpExpandRelated(pid){
  if (_tS.expandedRelated.has(pid)){
    _tS.expandedRelated.delete(pid);
    _computeTrees(); tpRender(); return;
  }
  // Fetch ancestors for this person up to 3 generations so layout has data
  await tpFetchUp(pid, 0);
  _tS.expandedRelated.add(pid);
  _computeTrees(); tpRender();
}

function tpRenderSelector(){
  const sel = el('tree-selector'); if (!sel) return;
  if (!_tS.trees.length){ sel.innerHTML = ''; return; }
  const isAdmin = !!(currentUser && currentUser.family_admin);
  const all = `<button class="ts-pill${!_tS.activeTree?' active':''}" onclick="tpSelectTree(null)">All</button>`;
  const pills = _tS.trees.map(t => {
    const active = _tS.activeTree === t.name;
    const saved = t.id ? '' : ' ts-unsaved';
    const editBtn = isAdmin
      ? `<button class="ts-edit-btn" onclick="tpOpenTreeEdit(${JSON.stringify(t.name)})" title="Configure ${esc(t.name)} tree">✎</button>`
      : '';
    return `<span class="ts-pill-wrap">` +
      `<button class="ts-pill${active?' active':''}${saved}" style="--tc:${t.color}" onclick="tpSelectTree(${JSON.stringify(t.name)})" title="${esc(t.name)} lineage${t.id?'':' (unsaved)'}">${esc(t.name)}</button>` +
      editBtn + `</span>`;
  }).join('');
  const addBtn = isAdmin
    ? `<button class="ts-pill ts-add-btn" onclick="tpOpenTreeEdit(null)" title="Add a new tree">+ Tree</button>`
    : '';
  sel.innerHTML = all + pills + addBtn;
}

// Tree management (admin only)
function tpOpenTreeEdit(surname){
  if (!(currentUser && currentUser.family_admin)) return;
  const tree = surname ? (_tS.trees.find(t=>t.name===surname)||{name:surname,color:'#7b5ea7',rootPersonId:null,id:null}) : {name:'',color:'#7b5ea7',rootPersonId:null,id:null};
  const rootPerson = (tree.rootPersonId && _tS.persons.get(tree.rootPersonId)) || null;
  const rootName = rootPerson ? rootPerson.display_name : '';
  openModal(`<h2 class="card-title">${tree.id?'Edit':'Add'} Tree${surname?' — '+esc(surname):''}</h2>
    <div id="te-error" class="alert alert-error" style="display:none"></div>
    <div class="form-group"><label>Tree name</label>
      <input id="te-name" value="${esc(tree.name)}" placeholder="e.g. Kelsall" autocomplete="off" /></div>
    <div class="form-group"><label>Surname <span class="label-note">(matches persons by family name)</span></label>
      <input id="te-surname" value="${esc(surname||tree.name||'')}" placeholder="e.g. Kelsall" autocomplete="off" /></div>
    <div class="form-group"><label>Color</label>
      <input type="color" id="te-color" value="${tree.color||'#7b5ea7'}" style="width:100%;height:40px;cursor:pointer;border-radius:7px;border:1px solid var(--border-default)" /></div>
    <div class="form-group"><label>Root person <span class="label-note">(oldest known ancestor — sets the landing point when centering this tree)</span></label>
      <input id="te-root-search" placeholder="Search by name…" value="${esc(rootName)}" oninput="tpTreeRootSearch()" autocomplete="off" />
      <input type="hidden" id="te-root-id" value="${esc(tree.rootPersonId||'')}" />
      <div id="te-root-results"></div></div>
    <div style="display:flex;gap:.6rem;margin-top:.5rem">
      <button class="btn btn-primary" onclick="tpSaveTree(${JSON.stringify(tree.id||'')})">Save</button>
      ${tree.id?`<button class="btn btn-outline" style="color:var(--error,#c0392b)" onclick="tpDeleteTree(${JSON.stringify(tree.id)},${JSON.stringify(surname||tree.name)})">Delete</button>`:''}
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
    </div>`);
}
let _tpRootTimer = null;
function tpTreeRootSearch(){
  clearTimeout(_tpRootTimer);
  _tpRootTimer = setTimeout(async ()=>{
    const q = val('te-root-search'); const res = el('te-root-results'); if (!res) return;
    if (!q){ res.innerHTML=''; return; }
    const r = await apiFetch('/api/collections/persons/records?perPage=6&filter='+encodeURIComponent(`display_name~"${q}"`));
    const items = r.ok ? (await r.json()).items : [];
    res.innerHTML = items.map(p =>
      `<button class="row-card" onclick="tpSetTreeRoot('${p.id}','${esc(p.display_name)}')">
        <div class="avatar" style="width:32px;height:32px;font-size:.75rem;background:${avatarTint(0)}">${personInitials(p)}</div>
        <div><div class="rc-name">${esc(p.display_name)}</div><div class="rc-sub">${personYears(p)}</div></div></button>`
    ).join('');
  }, 250);
}
function tpSetTreeRoot(id, name){
  const ri=el('te-root-id'),rs=el('te-root-search'),rr=el('te-root-results');
  if(ri) ri.value=id; if(rs) rs.value=name; if(rr) rr.innerHTML='';
}
async function tpSaveTree(existingId){
  const name = val('te-name'); const surname = val('te-surname');
  const color = (el('te-color')||{}).value||'#7b5ea7';
  const rootId = val('te-root-id')||'';
  if (!name) return formErr('te-error','Tree name is required.');
  try {
    const body = {name, surname:surname||name, color, created_by:userId};
    if (rootId) body.root_person = rootId;
    let res;
    if (existingId) res = await apiFetch(`/api/collections/trees/records/${existingId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    else            res = await apiFetch('/api/collections/trees/records',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if (!res.ok){ const d=await res.json(); throw new Error(d.message||'Save failed'); }
    const saved = await res.json();
    const idx = _tS.storedTrees.findIndex(t=>t.id===existingId);
    if (idx>=0) _tS.storedTrees[idx]=saved; else _tS.storedTrees.push(saved);
    _computeTrees(); closeModal(); toast('Tree saved.','success'); tpRender();
  } catch(e){ formErr('te-error',e.message); }
}
async function tpDeleteTree(treeId, surname){
  if (!confirm(`Delete the "${surname}" tree config?\nPeople are not affected — only the color/root settings are removed.`)) return;
  const res = await apiFetch(`/api/collections/trees/records/${treeId}`,{method:'DELETE'});
  if (res.ok||res.status===404){
    _tS.storedTrees = _tS.storedTrees.filter(t=>t.id!==treeId);
    if (_tS.activeTree===surname) _tS.activeTree=null;
    _computeTrees(); closeModal(); toast('Tree deleted.','success'); tpRender();
  } else { toast('Delete failed.','error'); }
}

async function tpSelectTree(surname){
  _tS.activeTree = surname || null;
  if (!surname){ tpRender(); return; }
  // Use stored root_person if set
  const tree = _tS.trees.find(t => t.name === surname);
  if (tree && tree.rootPersonId){
    await tpSetFocus(tree.rootPersonId);
    return;
  }
  // Fall back to oldest known ancestor with this surname in the current view
  const candidates = [..._tS.persons.values()].filter(p => p.family_name === surname);
  if (!candidates.length){ tpRender(); return; }
  const root = candidates.sort((a,b) => {
    const ya = parseInt(_parseYearFromDate(a.birth_date))||9999;
    const yb = parseInt(_parseYearFromDate(b.birth_date))||9999;
    return ya - yb;
  })[0];
  await tpSetFocus(root.id);
}

function tpCenterFocus(){
  const vp = el('tree-vp'); if (!vp || !_tS._offset) return;
  const {ox, oy, cW, cH} = _tS._offset;
  const vpW = vp.clientWidth, vpH = vp.clientHeight;
  _tS.zoom = Math.max(0.2, Math.min(1, (vpW-80)/cW, (vpH-80)/cH));
  _tS.pan.x = vpW/2 - (ox+_TW/2)*_tS.zoom;
  _tS.pan.y = vpH/2 - (oy+_TH/2)*_tS.zoom;
  tpApplyTransform();
}

function tpRenderPreserveViewport(){
  const vp = el('tree-vp');
  const prevOffset = _tS._offset;
  const vpW = vp ? vp.clientWidth : 0;
  const vpH = vp ? vp.clientHeight : 0;
  const anchor = (vp && prevOffset)
    ? {
        x: ((vpW / 2) - _tS.pan.x) / _tS.zoom - prevOffset.ox,
        y: ((vpH / 2) - _tS.pan.y) / _tS.zoom - prevOffset.oy,
      }
    : null;
  tpRender();
  if (vp && anchor && _tS._offset) {
    _tS.pan.x = vpW / 2 - (anchor.x + _tS._offset.ox) * _tS.zoom;
    _tS.pan.y = vpH / 2 - (anchor.y + _tS._offset.oy) * _tS.zoom;
    tpApplyTransform();
  }
}

function tpApplyTransform(){
  const inner = el('tree-inner');
  if (inner) inner.style.transform = `translate(${_tS.pan.x}px,${_tS.pan.y}px) scale(${_tS.zoom})`;
}

// Pan / Zoom
function tpDragStart(e){
  if (e.button !== 0 || e.target.closest('.tn-card,.tree-ctx,.tc-btn,.tn-leaf-btn,.tn-rel-chip')) return;
  _tS.dragging = true; _tS.dragLast = {x:e.clientX, y:e.clientY};
  e.preventDefault();
}
function tpDragMove(e){
  if (!_tS.dragging) return;
  _tS.pan.x += e.clientX-_tS.dragLast.x; _tS.pan.y += e.clientY-_tS.dragLast.y;
  _tS.dragLast = {x:e.clientX, y:e.clientY}; tpApplyTransform();
}
function tpDragEnd(){ _tS.dragging = false; }

let _tpT0=null, _tpD0=0, _tpZ0=1;
function tpTouchStart(e){
  if (e.touches.length===1 && !e.target.closest('.tn-card,.tree-ctx,.tc-btn,.tn-leaf-btn,.tn-rel-chip')){
    _tS.dragging=true; _tS.dragLast={x:e.touches[0].clientX, y:e.touches[0].clientY};
  } else if (e.touches.length===2){
    _tS.dragging=false;
    _tpD0=Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
    _tpZ0=_tS.zoom;
    _tpT0={x:(e.touches[0].clientX+e.touches[1].clientX)/2, y:(e.touches[0].clientY+e.touches[1].clientY)/2};
  }
  e.preventDefault();
}
function tpTouchMove(e){
  if (e.touches.length===1 && _tS.dragging){
    _tS.pan.x+=e.touches[0].clientX-_tS.dragLast.x; _tS.pan.y+=e.touches[0].clientY-_tS.dragLast.y;
    _tS.dragLast={x:e.touches[0].clientX, y:e.touches[0].clientY}; tpApplyTransform();
  } else if (e.touches.length===2 && _tpT0){
    const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
    const nz=Math.max(0.15,Math.min(3,_tpZ0*d/_tpD0));
    const mx=(e.touches[0].clientX+e.touches[1].clientX)/2, my=(e.touches[0].clientY+e.touches[1].clientY)/2;
    const f=nz/_tS.zoom; _tS.pan.x=mx-f*(mx-_tS.pan.x); _tS.pan.y=my-f*(my-_tS.pan.y); _tS.zoom=nz;
    tpApplyTransform();
  }
  e.preventDefault();
}
function tpWheel(e){ e.preventDefault(); tpZoom(e.deltaY>0?-0.1:0.1, e.clientX, e.clientY); }
function tpZoom(delta, cx, cy){
  const vp=el('tree-vp'); if (!vp) return;
  if (cx===undefined){ cx=vp.clientWidth/2; cy=vp.clientHeight/2; }
  const oz=_tS.zoom; _tS.zoom=Math.max(0.15,Math.min(3,_tS.zoom+delta));
  const f=_tS.zoom/oz; _tS.pan.x=cx-f*(cx-_tS.pan.x); _tS.pan.y=cy-f*(cy-_tS.pan.y);
  tpApplyTransform();
}
function tpResetView(){ tpCenterFocus(); }

// Context menu
function tpNodeClick(e, id){
  e.stopPropagation();
  if (_tS.ctxId===id){ tpCloseCtx(); return; }
  tpCloseCtx(); _tS.ctxId=id;
  const vp=el('tree-vp'); const cr=e.currentTarget.getBoundingClientRect(), vr=vp.getBoundingClientRect();
  let mx=cr.left-vr.left, my=cr.bottom-vr.top+8;
  const menuW=202, menuH=200;
  if (mx+menuW>vr.width-8) mx=vr.width-menuW-8;
  if (my+menuH>vr.height-8) my=cr.top-vr.top-menuH-4;
  const p=_tS.persons.get(id)||{};
  const isMe=p.linked_user===userId, canClaim=!p.linked_user;
  const m=document.createElement('div'); m.className='tree-ctx'; m.id='tree-ctx';
  m.style.cssText=`left:${mx}px;top:${my}px`;
  const isFocus = id === _tS.focusId;
  const hasChildren = (_tS.childrenOf.get(id)||[]).length > 0;
  const isCollapsed = _tS.descCollapsed.has(id);
  const hasSibs = isFocus && _tS.siblings.length > 0;
  m.innerHTML=`<div class="ctx-name">${esc(p.display_name||'')}</div>
    <button class="ctx-item" onclick="tpSetFocus('${id}')">⊙ Center on this person</button>
    <button class="ctx-item" onclick="navigate('profile',{id:'${id}'});tpCloseCtx()">☰ View profile</button>
    <button class="ctx-item" onclick="openPersonForm('${id}');tpCloseCtx()">✎ Edit details</button>
    <button class="ctx-item" onclick="openAddRelative('${id}');tpCloseCtx()">＋ Add relative</button>
    ${hasChildren?`<button class="ctx-item" onclick="tpToggleCollapse(event,'${id}','desc');tpCloseCtx()">${isCollapsed?'▶ Expand children':'▼ Collapse children'}</button>`:''}
    ${hasSibs?`<button class="ctx-item" onclick="tpToggleSibs();tpCloseCtx()">${_tS.sibsCollapsed?`◀ Show siblings (${_tS.siblings.length})`:'◀ Hide siblings'}</button>`:''}
    ${canClaim?`<button class="ctx-item" onclick="claimPerson('${id}');tpCloseCtx()">★ This is me</button>`:''}
    ${isMe?'<div class="ctx-me">★ This is you</div>':''}`;
  vp.appendChild(m);
  requestAnimationFrame(()=>document.addEventListener('click', _tpCtxOff, {once:true}));
}
function _tpCtxOff(e){ if (!e.target.closest('#tree-ctx')) tpCloseCtx(); }
function tpCloseCtx(){ const m=el('tree-ctx'); if (m) m.remove(); _tS.ctxId=null; }
async function tpSetFocus(id){
  tpCloseCtx(); _tS.collapsed.clear(); _tS.descCollapsed.clear(); await tpLoad(id);
}
function tpAddAncestor(childId, role){
  pickRelative(childId, role);
}
function tpToggleAncestorSibs(e, id){
  e.stopPropagation();
  if (_tS.ancSibsCollapsed.has(id)) _tS.ancSibsCollapsed.delete(id);
  else _tS.ancSibsCollapsed.add(id);
  tpRenderPreserveViewport();
}
function tpToggleCollapse(e, id, dir){
  e.stopPropagation();
  const set = dir === 'desc' ? _tS.descCollapsed : _tS.collapsed;
  if (set.has(id)) set.delete(id); else set.add(id);
  tpRenderPreserveViewport();
}
function tpToggleSibs(){
  _tS.sibsCollapsed = !_tS.sibsCollapsed;
  tpRenderPreserveViewport();
}

// Backward-compat shim used by savePerson, linkExisting, createAndLink, claimPerson, merge
async function focusPerson(id){
  if (!id) return;
  treeFocusId = id; personCache.delete(id);
  if (el('tree-vp')) await tpSetFocus(id);
}
async function openTree(personId){ await tpLoad(personId); }
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

let _pfNameManual = false;
function pfAutoName(){
  if (_pfNameManual) return;
  const composed = [val('pf-first'), val('pf-mid'), val('pf-last')].filter(Boolean).join(' ');
  const dn = el('pf-name'); if (dn) dn.value = composed;
}

async function openPersonForm(id){
  const p = id ? await getPerson(id) : {};
  const first = p.given_name || '';
  const mid   = p.middle_name || '';
  const last  = p.family_name || '';
  const autoName = [first, mid, last].filter(Boolean).join(' ');
  const displayName = p.display_name || autoName;
  _pfNameManual = !!(displayName && displayName !== autoName);

  openModal(`<h2 class="card-title">${id ? 'Edit person' : 'Add person'}</h2>
    <div id="pf-error" class="alert alert-error" style="display:none"></div>
    <div class="row-3">
      <div class="form-group"><label>First name</label>
        <input id="pf-first" value="${esc(first)}" oninput="pfAutoName()" autocomplete="off" /></div>
      <div class="form-group"><label>Middle name</label>
        <input id="pf-mid" value="${esc(mid)}" oninput="pfAutoName()" autocomplete="off" /></div>
      <div class="form-group"><label>Last name</label>
        <input id="pf-last" value="${esc(last)}" oninput="pfAutoName()" autocomplete="off" /></div>
    </div>
    <div class="form-group">
      <label>Birth surname <span class="label-note">(if different from last name — maiden name, name before adoption, etc.)</span></label>
      <input id="pf-birth-surname" value="${esc(p.birth_surname || '')}" placeholder="e.g. ${esc(last) || 'Smith'}" autocomplete="off" />
    </div>
    <div class="form-group">
      <label>Display name <span class="label-note">auto-filled — override for nicknames, suffixes (Jr, III), etc.</span></label>
      <input id="pf-name" value="${esc(displayName)}" oninput="_pfNameManual=true" autocomplete="off" />
    </div>
    <div class="form-group"><label>Gender</label>
      <select id="pf-gender">${['unknown','male','female','other'].map(g =>
        `<option value="${g}" ${p.gender === g ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
    <div class="form-group"><label>Birth date</label>${_datePicker('pf-birth', p.birth_date || '')}</div>
    <div class="form-group"><label>Death date</label>${_datePicker('pf-death', p.death_date || '')}</div>
    <div class="form-group"><label>Bio</label><textarea id="pf-bio">${esc(p.bio || '')}</textarea></div>
    <div class="form-group"><label>Photo</label><input id="pf-photo" type="file" accept="image/*" /></div>
    <div style="display:flex;gap:.6rem;margin-top:.5rem">
      <button class="btn btn-primary" onclick="savePerson('${id || ''}')">Save</button>
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
    </div>`);
}
async function savePerson(id){
  const first = val('pf-first');
  const mid   = val('pf-mid');
  const last  = val('pf-last');
  if (!first && !last) return formErr('pf-error', 'First or last name is required.');
  const autoName = [first, mid, last].filter(Boolean).join(' ');
  const displayName = val('pf-name') || autoName;
  const fd = new FormData();
  fd.append('display_name', displayName);
  fd.append('given_name', first);
  fd.append('middle_name', mid);
  fd.append('family_name', last);
  fd.append('birth_surname', val('pf-birth-surname'));
  fd.append('gender', el('pf-gender').value);
  fd.append('birth_date', _composeDateText('pf-birth'));
  fd.append('death_date', _composeDateText('pf-death'));
  const _pfBirthY = parseInt(_parseYearFromDate(_composeDateText('pf-birth'))||'0');
  const _pfOldEnough = _pfBirthY && (new Date().getFullYear() - _pfBirthY >= 80);
  fd.append('living', (_composeDateText('pf-death') || _pfOldEnough) ? 'false' : 'true');
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
  if (rel === 'father') return patchPerson(focusId, { father: otherId });
  if (rel === 'mother') return patchPerson(focusId, { mother: otherId });
  if (rel === 'child' || rel === 'son' || rel === 'daughter') {
    const slot = focus.gender === 'female' ? 'mother' : 'father';
    const extra = rel === 'son' ? { gender:'male' } : rel === 'daughter' ? { gender:'female' } : {};
    return patchPerson(otherId, { [slot]: focusId, ...extra });
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
    const genderMap = { father:'male', mother:'female', son:'male', daughter:'female' };
    const body = { display_name: q, given_name: q.split(' ')[0], family_name: q.split(' ').slice(1).join(' '),
      living: true, created_by: userId, updated_by: userId };
    if (genderMap[rel]) body.gender = genderMap[rel];
    const res = await apiFetch('/api/collections/persons/records', {
      method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body) });
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
    const key = normName(p.display_name) + '|' + (_parseYearFromDate(p.birth_date) || '');
    (groups[key] = groups[key] || []).push(p);
  }
  const dupes = Object.values(groups).filter(g => g.length > 1);
  const body = dupes.length ? dupes.map(g => `
    <div class="card" style="margin-bottom:.6rem;padding:1rem"><div class="rc-name">${esc(g[0].display_name)}
      ${g[0].birth_date ? '· ' + (_parseYearFromDate(g[0].birth_date) || '') : ''}</div>
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

// ── Events ───────────────────────────────────────────────────────────────────
const EVENT_TYPE_ICONS = { reunion:'🏕', birthday:'🎂', wedding:'💍', holiday:'🎉', other:'📅' };

SCREENS.events = async function(params){
  if (params && params.event) { await renderEventDetail(params.event); return; }
  await renderEventsList();
};

async function renderEventsList(){
  mountMain('<div class="screen-pad" style="max-width:1100px"><div class="spinner"></div></div>');
  let events = [];
  try {
    const res = await apiFetch('/api/collections/events/records?sort=start_date&perPage=200');
    if (res.ok) events = (await res.json()).items || [];
  } catch { /* ignore */ }

  const now = new Date();
  const upcoming = events.filter(e => e.start_date && new Date(e.start_date) >= now);
  const past     = events.filter(e => e.start_date && new Date(e.start_date) <  now);

  function fmtDate(iso){
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' });
  }

  function eventCard(e){
    const thumb = fileUrl('events', e, 'cover_photo');
    const icon  = EVENT_TYPE_ICONS[e.type] || '📅';
    return `<div class="event-card" onclick="navigate('events',{event:'${e.id}'})">
      <div class="ec-thumb">
        ${thumb ? `<img src="${esc(thumb)}" alt="">` : `<div style="width:100%;height:100%;background:var(--bg-hover);display:flex;align-items:center;justify-content:center;font-size:2.5rem">${icon}</div>`}
        <div class="ec-type-badge">${esc(e.type || 'event')}</div>
      </div>
      <div class="ec-meta">
        <div class="ec-name">${esc(e.name)}</div>
        <div class="ec-date">${esc(fmtDate(e.start_date))}</div>
        ${e.location ? `<div class="ec-loc">📍 ${esc(e.location)}</div>` : ''}
      </div>
    </div>`;
  }

  mountMain(`<div class="screen-pad" style="max-width:1100px">
    <div class="events-header">
      <h1 class="card-title" style="margin:0">Events</h1>
      <button class="btn btn-primary btn-sm" onclick="openEventForm()">+ Add event</button>
    </div>
    ${upcoming.length
      ? `<div class="events-section-label">Upcoming</div><div class="events-grid">${upcoming.map(eventCard).join('')}</div>`
      : '<div class="events-empty"><p>No upcoming events yet.</p></div>'}
    ${past.length ? `
      <details>
        <summary class="events-section-label" style="cursor:pointer;list-style:none">Past events (${past.length})</summary>
        <div class="events-grid" style="margin-top:.75rem">${past.map(eventCard).join('')}</div>
      </details>` : ''}
  </div>`);
}

async function renderEventDetail(eventId){
  mountMain('<div class="screen-pad" style="max-width:860px"><div class="spinner"></div></div>');
  let event = null, myRsvp = null, goingCount = 0, maybeCount = 0;
  try {
    const [eRes, rRes, cRes] = await Promise.all([
      apiFetch(`/api/collections/events/records/${eventId}?expand=organizers`),
      apiFetch(`/api/collections/event_rsvps/records?filter=${encodeURIComponent(`(event="${eventId}" && user="${userId}")`)}` + `&perPage=1`),
      apiFetch(`/api/collections/event_rsvps/records?filter=${encodeURIComponent(`(event="${eventId}")`)}` + `&perPage=200`)
    ]);
    if (eRes.ok) event = await eRes.json();
    if (rRes.ok) { const d = await rRes.json(); myRsvp = d.items && d.items[0]; }
    if (cRes.ok) {
      const items = (await cRes.json()).items || [];
      goingCount = items.filter(r => r.status === 'going').length;
      maybeCount = items.filter(r => r.status === 'maybe').length;
    }
  } catch { /* ignore */ }
  if (!event) { mountMain('<div class="screen-pad"><div class="empty-state"><p>Event not found.</p></div></div>'); return; }

  const thumb = fileUrl('events', event, 'cover_photo');
  const icon  = EVENT_TYPE_ICONS[event.type] || '📅';
  const organizers = (event.expand && event.expand.organizers) || [];
  const isOrganizer = organizers.some(o => o.id === userId) || (currentUser && currentUser.family_admin);

  function fmtDate(iso){ return iso ? new Date(iso).toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' }) : ''; }

  const curStatus = myRsvp ? myRsvp.status : '';
  const rsvpOpt = (key, label) => `<button class="ev-rsvp-opt${curStatus === key ? ' active' : ''}" onclick="setEventRsvp('${eventId}','${key}')">${label}</button>`;

  mountMain(`<div class="screen-pad" style="max-width:860px">
    <div class="breadcrumb"><span class="link" onclick="navigate('events')">Events</span> › ${esc(event.name)}</div>
    <div class="event-detail-hero" style="margin-top:.75rem">
      ${thumb ? `<img src="${esc(thumb)}" alt="">` : `<div class="event-detail-hero-placeholder">${icon}</div>`}
    </div>
    <div class="event-info-bar">
      <div><div class="eib-label">When</div><div class="eib-val">${esc(fmtDate(event.start_date))}</div></div>
      ${event.location ? `<div><div class="eib-label">Where</div><div class="eib-val">${esc(event.location)}</div></div>` : ''}
      <div><div class="eib-label">Headcount</div><div class="eib-val">${goingCount} going · ${maybeCount} maybe</div></div>
    </div>
    <div style="margin-top:1.5rem;display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;flex-wrap:wrap">
      <div>
        <h1 style="font-family:var(--font-display);font-size:2rem;font-weight:500">${esc(event.name)}</h1>
        <span class="pill" style="margin-top:.35rem">${esc(event.type || 'event')}</span>
        ${organizers.length ? `<div style="font-size:.82rem;color:var(--text-muted);margin-top:.4rem">Organised by ${organizers.map(o => esc(o.name || o.email)).join(', ')}</div>` : ''}
      </div>
      ${isOrganizer ? `<button class="btn btn-outline btn-sm" onclick="openEventForm('${event.id}')">Edit event</button>` : ''}
    </div>
    ${event.description ? `<div class="card" style="margin-top:1.25rem"><p style="line-height:1.6">${esc(event.description)}</p></div>` : ''}
    <div class="card" style="margin-top:1.25rem">
      <div class="section-label" style="margin-bottom:1rem">Will you be there?</div>
      <div class="ev-rsvp-row">
        ${rsvpOpt('going', "I'm going")}${rsvpOpt('maybe', 'Maybe')}${rsvpOpt('no', "Can't make it")}
      </div>
    </div>
  </div>`);
}

async function setEventRsvp(eventId, status){
  try {
    const chkRes = await apiFetch(`/api/collections/event_rsvps/records?filter=${encodeURIComponent(`(event="${eventId}" && user="${userId}")`)}` + `&perPage=1`);
    const existing = chkRes.ok ? ((await chkRes.json()).items || [])[0] : null;
    let res;
    if (existing) {
      res = await apiFetch(`/api/collections/event_rsvps/records/${existing.id}`, {
        method:'PATCH', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ status }) });
    } else {
      res = await apiFetch('/api/collections/event_rsvps/records', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ event: eventId, user: userId, status }) });
    }
    if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Could not save RSVP'); }
    toast('RSVP saved.', 'success');
    await renderEventDetail(eventId);
  } catch (e) { toast(e.message, 'error'); }
}

function openEventForm(eventId){
  const isEdit = !!eventId;
  openModal(`<h2 class="card-title">${isEdit ? 'Edit event' : 'New event'}</h2>
    <div id="evf-error" class="alert alert-error" style="display:none"></div>
    <div class="form-group"><label>Name</label><input id="evf-name" /></div>
    <div class="row-2">
      <div class="form-group"><label>Type</label>
        <select id="evf-type">
          ${['reunion','birthday','wedding','holiday','other'].map(t =>
            `<option value="${t}">${t[0].toUpperCase()+t.slice(1)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Location</label><input id="evf-loc" /></div>
    </div>
    <div class="row-2">
      <div class="form-group"><label>Start date/time</label><input id="evf-start" type="datetime-local" /></div>
      <div class="form-group"><label>End date/time</label><input id="evf-end" type="datetime-local" /></div>
    </div>
    <div class="form-group"><label>Description</label><textarea id="evf-desc"></textarea></div>
    <div class="form-group"><label>Cover photo</label><input id="evf-photo" type="file" accept="image/*" /></div>
    <div style="display:flex;gap:.6rem;margin-top:.75rem">
      <button class="btn btn-primary" onclick="saveEvent('${eventId || ''}')">Save</button>
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      ${isEdit ? `<button class="btn btn-danger" style="margin-left:auto" onclick="deleteEvent('${eventId}')">Delete</button>` : ''}
    </div>`);
  if (isEdit) {
    apiFetch(`/api/collections/events/records/${eventId}`).then(async r => {
      if (!r.ok) return;
      const e = await r.json();
      const n = el('evf-name'); if (n) n.value = e.name || '';
      const t = el('evf-type'); if (t) t.value = e.type || 'other';
      const l = el('evf-loc');  if (l) l.value = e.location || '';
      const s = el('evf-start');if (s) s.value = (e.start_date || '').slice(0,16);
      const en= el('evf-end');  if (en) en.value = (e.end_date || '').slice(0,16);
      const d = el('evf-desc'); if (d) d.value = e.description || '';
    });
  }
}

async function saveEvent(eventId){
  const name = val('evf-name');
  const start = val('evf-start');
  if (!name) return formErr('evf-error', 'Name is required.');
  if (!start) return formErr('evf-error', 'Start date is required.');
  const fd = new FormData();
  fd.append('name', name);
  fd.append('type', el('evf-type').value);
  fd.append('start_date', new Date(start).toISOString());
  const end = val('evf-end'); if (end) fd.append('end_date', new Date(end).toISOString());
  const loc = val('evf-loc'); if (loc) fd.append('location', loc);
  const desc = val('evf-desc'); if (desc) fd.append('description', desc);
  const photo = el('evf-photo').files[0]; if (photo) fd.append('cover_photo', photo);
  if (!eventId) {
    fd.append('created_by', userId);
    fd.append('organizers', userId);
  }
  try {
    const res = eventId
      ? await apiFetch(`/api/collections/events/records/${eventId}`, { method:'PATCH', body: fd })
      : await apiFetch('/api/collections/events/records', { method:'POST', body: fd });
    if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Save failed'); }
    const saved = await res.json();
    closeModal();
    navigate('events', { event: saved.id });
  } catch (e) { formErr('evf-error', e.message); }
}

async function deleteEvent(eventId){
  if (!confirm('Delete this event? This cannot be undone.')) return;
  try {
    const res = await apiFetch(`/api/collections/events/records/${eventId}`, { method:'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
    closeModal();
    navigate('events');
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
  if (!rec || !rec[field]) return '';
  const v = rec[field];
  if (v.startsWith('http')) return v;
  return `${API}/api/files/${collection}/${rec.id}/${v}`;
}

// ── Person facts (CRUD) ───────────────────────────────────────────────────────

function _factTypeOptions(selected){
  return FACT_GROUPS.map(g =>
    `<optgroup label="${esc(g.label)}">${g.types.map(t =>
      `<option value="${t}"${t === selected ? ' selected' : ''}>${esc(_factDef(t).label)}</option>`
    ).join('')}</optgroup>`
  ).join('');
}

function _factFormHtml(personId, f){
  const isEdit = !!(f && f.id);
  const type = (f && f.fact_type) || 'birth';
  return `
    <h2 class="card-title">${isEdit ? 'Edit' : 'Add'} Fact</h2>
    <div id="ff-error" class="alert alert-error" style="display:none"></div>
    <div class="form-group">
      <label>Fact type</label>
      <select id="ff-type">${_factTypeOptions(type)}</select>
    </div>
    <div class="form-group">
      <label>Date</label>
      ${_datePicker('ff-date', (f && f.date_text) || '')}
    </div>
    <div class="form-group">
      <label>Place / Location</label>
      <input id="ff-place" value="${esc((f && f.place) || '')}" placeholder="City, State, Country" />
    </div>
    <div class="form-group">
      <label>Value <span style="font-weight:400;text-transform:none;color:var(--text-muted)">(occupation name, address, website URL, etc.)</span></label>
      <input id="ff-value" value="${esc((f && f.value) || '')}" placeholder="e.g. Farmer, 123 Main St, https://…" />
    </div>
    <div class="form-group">
      <label>Description / Notes</label>
      <textarea id="ff-desc">${esc((f && f.description) || '')}</textarea>
    </div>
    <div class="form-group">
      <label>Source / Citation</label>
      <input id="ff-source" value="${esc((f && f.source) || '')}" placeholder="e.g. 1940 US Census, ancestry.com/…" />
    </div>
    <div style="display:flex;gap:.6rem;margin-top:.5rem">
      <button class="btn btn-primary" onclick="saveFact('${personId}','${isEdit ? f.id : ''}')">Save</button>
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      ${isEdit ? `<button class="btn btn-danger" style="margin-left:auto" onclick="deleteFact('${f.id}','${personId}')">Delete</button>` : ''}
    </div>`;
}

async function openFactForm(personId, factId){
  let f = null;
  if (factId) {
    try {
      const r = await apiFetch(`/api/collections/person_facts/records/${factId}`);
      if (r.ok) f = await r.json();
    } catch { /* use null */ }
  }
  openModal(_factFormHtml(personId, f));
}

async function saveFact(personId, factId){
  const fact_type = el('ff-type').value;
  const date_text = _composeDateText('ff-date');
  const place = val('ff-place');
  const value = val('ff-value');
  const description = (el('ff-desc') || {}).value || '';
  const source = val('ff-source');
  const sort_year = _parseYearFromDate(date_text) || null;

  const body = { person: personId, fact_type, date_text, sort_year, place, value, description, source };

  try {
    let r;
    if (factId) {
      r = await apiFetch(`/api/collections/person_facts/records/${factId}`,
        { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    } else {
      r = await apiFetch('/api/collections/person_facts/records',
        { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    }
    if (!r.ok) { const d = await r.json(); throw new Error(d.message || 'Save failed'); }

    // Sync birth_date / death_date on the person record for tree compatibility
    if (date_text && (fact_type === 'birth' || fact_type === 'death')) {
      const field = fact_type === 'birth' ? 'birth_date' : 'death_date';
      const patch = { [field]: date_text };
      if (fact_type === 'death') patch.living = false;
      await apiFetch(`/api/collections/persons/records/${personId}`,
        { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(patch) });
      personCache.delete(personId);
    }

    closeModal();
    await _reloadFactsSection(personId);
  } catch(e){ formErr('ff-error', e.message); }
}

async function deleteFact(factId, personId){
  if (!confirm('Delete this fact?')) return;
  try {
    const r = await apiFetch(`/api/collections/person_facts/records/${factId}`, { method:'DELETE' });
    if (!r.ok) { const d = await r.json().catch(()=>({})); throw new Error(d.message || 'Delete failed'); }
    closeModal();
    await _reloadFactsSection(personId);
  } catch(e){ toast(e.message, 'error'); }
}

// ── Profile: family-events helpers ───────────────────────────────────────────

let _profileState = { personId:null, facts:[], familyFacts:[], canEdit:false, showFamily:true };

async function _fetchSiblings(p){
  const filters = [];
  if (p.father) filters.push(`father="${p.father}"`);
  if (p.mother) filters.push(`mother="${p.mother}"`);
  if (!filters.length) return [];
  const f = encodeURIComponent(`(${filters.join(' || ')}) && id!="${p.id}"`);
  const r = await apiFetch(`/api/collections/persons/records?filter=${f}&perPage=100&sort=birth_date`);
  return r.ok ? (await r.json()).items || [] : [];
}

async function _fetchFamilyFacts(relatives){
  if (!relatives.length) return [];
  const TYPES = ['birth','death','burial','cremation','marriage','graduation'];
  const ids = [...new Set(relatives.map(rv => rv.person.id))];
  const pf = ids.map(id => `person="${id}"`).join(' || ');
  const tf = TYPES.map(t => `fact_type="${t}"`).join(' || ');
  const filter = encodeURIComponent(`(${pf}) && (${tf})`);
  const r = await apiFetch(`/api/collections/person_facts/records?filter=${filter}&perPage=500&sort=sort_year`);
  if (!r.ok) return [];
  const facts = (await r.json()).items || [];
  return facts.map(f => {
    const rel = relatives.find(rv => rv.person.id === f.person);
    return { ...f, _relPerson: rel?.person || null, _relLabel: rel?.label || '' };
  });
}

function _relGenderLabel(person, role){
  if (role === 'sibling') return person.gender==='female'?'Sister':person.gender==='male'?'Brother':'Sibling';
  if (role === 'child')   return person.gender==='female'?'Daughter':person.gender==='male'?'Son':'Child';
  return { father:'Father', mother:'Mother', partner:'Spouse' }[role] || role;
}

function toggleFamilyEvents(){
  _profileState.showFamily = !_profileState.showFamily;
  const c = el('facts-section');
  if (c) c.innerHTML = _renderFactsHTML(
    _profileState.personId, _profileState.facts, _profileState.familyFacts,
    _profileState.canEdit, _profileState.showFamily);
}

async function _reloadFactsSection(personId){
  const container = el('facts-section');
  if (!container) return;
  container.innerHTML = '<div class="spinner" style="margin:1rem auto"></div>';
  try {
    const r = await apiFetch(`/api/collections/person_facts/records?filter=${encodeURIComponent(`(person="${personId}")`)}&perPage=200&sort=sort_year`);
    const facts = r.ok ? (await r.json()).items || [] : [];
    _profileState.facts = facts;
    container.innerHTML = _renderFactsHTML(personId, facts, _profileState.familyFacts, _profileState.canEdit, _profileState.showFamily);
  } catch { container.innerHTML = '<p style="color:var(--text-muted);font-size:.86rem;padding:.5rem 0">Could not load facts.</p>'; }
}

function _renderFactsHTML(personId, facts, familyFacts, canEdit, showFamily){
  const direct = _sortFacts(facts);

  const directRow = f => {
    const def = _factDef(f.fact_type);
    const meta = [f.date_text, f.place].filter(Boolean).join(' · ');
    return `<div class="fact-item fact-cat-${def.cat}">
      <div class="fact-icon">${def.icon}</div>
      <div class="fact-body">
        <div class="fact-label">${esc(def.label)}</div>
        ${f.value ? `<div class="fact-value">${esc(f.value)}</div>` : ''}
        ${meta ? `<div class="fact-meta">${esc(meta)}</div>` : ''}
        ${f.description ? `<div class="fact-desc">${esc(f.description)}</div>` : ''}
        ${f.source ? `<div class="fact-source">Source: ${esc(f.source)}</div>` : ''}
      </div>
      ${canEdit ? `<button class="btn btn-outline btn-sm fact-edit-btn" onclick="openFactForm('${personId}','${f.id}')">Edit</button>` : ''}
    </div>`;
  };

  const familyRow = f => {
    const def = _factDef(f.fact_type);
    const meta = [f.date_text, f.place].filter(Boolean).join(' · ');
    return `<div class="fact-item fact-family fact-cat-${def.cat}">
      <div class="fact-icon">${def.icon}</div>
      <div class="fact-body">
        <div class="fact-label">${esc(f._relLabel)}'s ${esc(def.label.toLowerCase())}</div>
        ${meta ? `<div class="fact-meta">${esc(meta)}</div>` : ''}
        ${f._relPerson ? `<span class="fact-rel-link" onclick="navigate('profile',{id:'${f._relPerson.id}'})">${esc(f._relPerson.display_name)} →</span>` : ''}
      </div>
    </div>`;
  };

  // Merge and sort by year; direct events win tiebreaks
  const all = [
    ...direct.map(f => ({ f, family:false, y: f.sort_year||9999 })),
    ...(showFamily ? [...familyFacts].sort((a,b)=>(a.sort_year||9999)-(b.sort_year||9999)) : [])
      .map(f => ({ f, family:true, y: f.sort_year||9999 }))
  ].sort((a,b) => a.y!==b.y ? a.y-b.y : (a.family?1:-1));

  const rows = all.map(({f,family}) => family ? familyRow(f) : directRow(f)).join('');

  return `
    <div class="facts-header">
      <div class="section-label">Facts &amp; Events</div>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap">
        ${familyFacts.length ? `<button class="btn btn-outline btn-sm" style="font-size:.78rem" onclick="toggleFamilyEvents()">
          ${showFamily ? '⊙ Hide' : '○ Show'} family events (${familyFacts.length})</button>` : ''}
        ${canEdit ? `<button class="btn btn-outline btn-sm" onclick="openFactForm('${personId}','')">+ Add fact</button>` : ''}
      </div>
    </div>
    ${!all.length ? '<p style="color:var(--text-muted);font-size:.86rem;padding:.25rem 0">No facts recorded yet.</p>' : ''}
    <div class="facts-list">${rows}</div>`;
}

// ── Profile: relationships panel ──────────────────────────────────────────────

function _relPersonRow(person, relLabel){
  return `<div class="conn-row" onclick="navigate('profile',{id:'${person.id}'})">
    <div class="avatar" style="width:34px;height:34px;font-size:.78rem">${personInitials(person)}</div>
    <div class="conn-meta">
      <div class="conn-name">${esc(person.display_name)}</div>
      <div class="conn-rel">${esc(relLabel)}${personYears(person) ? ' · ' + personYears(person) : ''}</div>
    </div>
    <span class="conn-chev">›</span></div>`;
}

function _addRelBtn(personId, role, label){
  return `<button class="btn btn-outline btn-sm rel-add-btn" onclick="openProfileRelativeModal('${personId}','${role}')">+ ${label}</button>`;
}

function _renderRelationshipsPanel(personId, p, ex, siblings, partners, children, canEdit){
  const hasFather = !!p.father;
  const hasMother = !!p.mother;

  const section = (title, rows, addBtns) => `
    <div class="rel-section">
      <div class="rel-section-title">${title}</div>
      ${rows || '<p class="rel-empty">None linked</p>'}
      ${canEdit && addBtns ? `<div class="rel-add-row">${addBtns}</div>` : ''}
    </div>`;

  const parents = section('Parents',
    [ex.father && _relPersonRow(ex.father, 'Father'), ex.mother && _relPersonRow(ex.mother, 'Mother')].filter(Boolean).join(''),
    [!hasFather && _addRelBtn(personId,'father','Add father'), !hasMother && _addRelBtn(personId,'mother','Add mother')].filter(Boolean).join(''));

  const sibs = section('Siblings',
    siblings.map(s => _relPersonRow(s, _relGenderLabel(s,'sibling'))).join(''),
    _addRelBtn(personId,'sibling','Add sibling'));

  const spouses = section('Spouse / Partner',
    partners.map(pt => _relPersonRow(pt, 'Partner')).join(''),
    _addRelBtn(personId,'partner','Add spouse'));

  const kids = section('Children',
    children.map(ch => _relPersonRow(ch, _relGenderLabel(ch,'child'))).join(''),
    [_addRelBtn(personId,'son','Add son'), _addRelBtn(personId,'daughter','Add daughter')].join(''));

  return `<div class="card">${parents}${sibs}${spouses}${kids}</div>`;
}

// ── Profile: add-relative modal (profile context — reloads profile not tree) ──

function openProfileRelativeModal(personId, role){
  const titles = { father:'father', mother:'mother', sibling:'sibling', partner:'spouse / partner', son:'son', daughter:'daughter' };
  openModal(`<h2 class="card-title">Add ${titles[role]||role}</h2>
    <div id="rel-error" class="alert alert-error" style="display:none"></div>
    <div class="form-group"><label>Search existing</label>
      <input id="rel-search" placeholder="Type a name…" oninput="profileSearchPersons('${personId}','${role}')" autocomplete="off" /></div>
    <div id="rel-results" style="display:flex;flex-direction:column;gap:.4rem;margin-bottom:1rem"></div>
    <button class="btn btn-primary btn-full" onclick="profileCreateAndLink('${personId}','${role}')">Create new &amp; link</button>
    <div style="margin-top:.6rem"><button class="btn btn-outline" onclick="closeModal()">Cancel</button></div>`);
}

let _profRelTimer = null;
function profileSearchPersons(personId, role){
  clearTimeout(_profRelTimer);
  _profRelTimer = setTimeout(async () => {
    const q = val('rel-search'); const e = el('rel-results');
    if (!q){ e.innerHTML = ''; return; }
    const r = await apiFetch(`/api/collections/persons/records?perPage=8&filter=` + encodeURIComponent(`(display_name~"${q}")`));
    const items = r.ok ? (await r.json()).items : [];
    e.innerHTML = items.length
      ? items.map(p => `<button class="row-card" onclick="profileLinkExisting('${personId}','${role}','${p.id}')">
          <div class="avatar" style="width:36px;height:36px;font-size:.8rem">${personInitials(p)}</div>
          <div><div class="rc-name">${esc(p.display_name)}</div><div class="rc-sub">${personYears(p)}</div></div></button>`).join('')
      : '<p style="font-size:.82rem;color:var(--text-muted)">No matches — create new below.</p>';
  }, 250);
}

async function profileLinkExisting(personId, role, otherId){
  try {
    await applyRelationship(personId, role, otherId);
    closeModal(); personCache.delete(personId);
    await SCREENS.profile({ id: personId });
  } catch(e){ formErr('rel-error', e.message); }
}

async function profileCreateAndLink(personId, role){
  const q = val('rel-search');
  if (!q) return formErr('rel-error', 'Enter a name.');
  try {
    const parts = q.trim().split(/\s+/);
    const genderMap = { father:'male', mother:'female', son:'male', daughter:'female' };
    const body = { display_name: q, given_name: parts[0], family_name: parts.slice(1).join(' '),
      living: true, created_by: userId, updated_by: userId };
    if (genderMap[role]) body.gender = genderMap[role];
    const r = await apiFetch('/api/collections/persons/records', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    if (!r.ok){ const d = await r.json(); throw new Error(d.message || 'Create failed'); }
    const created = await r.json(); personCache.set(created.id, created);
    await applyRelationship(personId, role, created.id);
    closeModal(); personCache.delete(personId);
    await SCREENS.profile({ id: personId });
  } catch(e){ formErr('rel-error', e.message); }
}

// ── Profile screen ────────────────────────────────────────────────────────────
SCREENS.profile = async function(params){
  mountMain('<div class="screen-pad" style="max-width:1100px"><div class="spinner"></div></div>');
  let id = (params && params.id) || null;
  if (!id) id = await myPersonId();
  if (!id) { mountMain('<div class="screen-pad"><div class="empty-state"><div class="emoji">👤</div><p>No profile linked yet. Open the tree and use "This is me".</p></div></div>'); return; }

  let p, facts = [], photos = [], siblings = [], partners = [], children = [], familyFacts = [];
  try {
    // Phase 1: core data in parallel
    const [personRes, factsRes, phRes] = await Promise.all([
      apiFetch(`/api/collections/persons/records/${id}?expand=father,mother,linked_user`),
      apiFetch(`/api/collections/person_facts/records?filter=${encodeURIComponent(`(person="${id}")`)}&perPage=200&sort=sort_year`),
      apiFetch(`/api/collections/photos/records?perPage=12&filter=` + encodeURIComponent(`(tagged_persons~"${id}")`)),
    ]);
    if (!personRes.ok) throw new Error('not found');
    p = await personRes.json();
    if (factsRes.ok) facts = (await factsRes.json()).items || [];
    if (phRes.ok) photos = (await phRes.json()).items || [];

    // Phase 2: relationships (need p first for sibling query)
    const [couplesData, siblingsData, childrenData] = await Promise.all([
      getCouplesFor(id),
      _fetchSiblings(p),
      getChildren(id),
    ]);
    siblings = siblingsData;
    children = childrenData;
    const partnerIds = couplesData.map(c => c.partner_a === id ? c.partner_b : c.partner_a);
    partners = (await Promise.all(partnerIds.map(getPerson))).filter(Boolean);

    // Phase 3: family facts (need all relatives first)
    const ex0 = p.expand || {};
    const relatives = [
      ...(ex0.father ? [{ person: ex0.father, label:'Father', role:'father' }] : []),
      ...(ex0.mother ? [{ person: ex0.mother, label:'Mother', role:'mother' }] : []),
      ...siblings.map(s => ({ person: s, label: _relGenderLabel(s,'sibling'), role:'sibling' })),
      ...partners.map(pt => ({ person: pt, label:'Spouse', role:'partner' })),
      ...children.map(ch => ({ person: ch, label: _relGenderLabel(ch,'child'), role:'child' })),
    ];
    familyFacts = await _fetchFamilyFacts(relatives);
  } catch { mountMain('<div class="screen-pad"><div class="empty-state"><p>Could not load this profile.</p></div></div>'); return; }

  const ex = p.expand || {};
  const linked = ex.linked_user;
  const avatar = fileUrl('persons', p, 'photo');
  const branch = p.family_name ? `${p.family_name} branch` : '';
  const parentNames = [ex.father, ex.mother].filter(Boolean).map(x => x.display_name).join(' & ');
  const sub = [parentNames && `Child of ${parentNames}`, personYears(p)].filter(Boolean).join(' · ');
  const myPersonIdVal = await myPersonId().catch(()=>null);
  const canEdit = !!(currentUser && (currentUser.family_admin || myPersonIdVal === id));

  // Store state for toggle/reload
  _profileState = { personId: id, facts, familyFacts, canEdit, showFamily: _profileState.showFamily };

  mountMain(`<div class="screen-pad" style="max-width:1100px">
    <div class="breadcrumb"><span class="link" onclick="navigate('directory')">Directory</span> › ${esc(p.display_name)}</div>
    <div class="profile-hero card">
      <div class="ph-avatar">${avatar ? `<img src="${avatar}" alt="">` : `<div class="avatar" style="width:76px;height:76px;font-size:1.8rem">${personInitials(p)}</div>`}</div>
      <div class="ph-main">
        <h1 class="ph-name">${esc(p.display_name)}</h1>
        <div class="ph-sub">${esc(sub)}</div>
        <div class="ph-pills">
          ${branch ? `<span class="pill">${esc(branch)}</span>` : ''}
          ${p.birth_date ? `<span class="pill">b. ${esc(_parseYearFromDate(p.birth_date) || p.birth_date)}</span>` : ''}
          ${p.death_date ? `<span class="pill">d. ${esc(_parseYearFromDate(p.death_date) || p.death_date)}</span>` : ''}
          ${p.birth_surname && p.birth_surname !== p.family_name ? `<span class="pill pill-muted">born ${esc(p.birth_surname)}</span>` : ''}
          ${linked ? '<span class="pill">Has account</span>' : ''}
        </div>
      </div>
      <div class="ph-actions">
        ${linked && linked.email ? `<a class="btn btn-primary btn-sm" href="mailto:${esc(linked.email)}">Message</a>` : ''}
        ${linked && linked.phone ? `<a class="btn btn-outline btn-sm" href="tel:${esc(linked.phone)}">Call</a>` : ''}
        <button class="btn btn-outline btn-sm" onclick="navigate('tree',{person:'${p.id}'})">View in tree</button>
        ${canEdit ? `<button class="btn btn-outline btn-sm" onclick="openPersonForm('${p.id}')">Edit details</button>` : ''}
      </div>
    </div>

    <div class="profile-grid-3col">
      <div class="facts-card card" id="facts-section">
        ${_renderFactsHTML(id, facts, familyFacts, canEdit, _profileState.showFamily)}
      </div>

      <aside class="profile-sidebar">
        ${_renderRelationshipsPanel(id, p, ex, siblings, partners, children, canEdit)}

        ${p.bio ? `<div class="card">
          <div class="section-label" style="margin-bottom:.7rem">About</div>
          <p class="about-text">${esc(p.bio)}</p>
        </div>` : ''}

        ${linked && (linked.email || linked.phone) ? `<div class="card">
          <div class="section-label" style="margin-bottom:.7rem">Contact</div>
          ${linked.email ? `<div class="contact-row"><span>✉</span><span>${esc(linked.email)}</span></div>` : ''}
          ${linked.phone ? `<div class="contact-row"><span>☎</span><span>${esc(linked.phone)}</span></div>` : ''}
        </div>` : ''}

        ${photos.length ? `<div class="card">
          <div class="section-label" style="margin-bottom:.9rem">Photos</div>
          <div class="photo-mini">${photos.slice(0, 6).map(ph =>
            `<img src="${fileUrl('photos', ph, 'image_url')}" alt="" style="cursor:pointer">`).join('')}</div>
          <div class="link" style="margin-top:.6rem;font-size:.82rem" onclick="navigate('gallery')">See all →</div>
        </div>` : ''}
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
    const thumb = a.cover_photo_url || fileUrl('albums', a, 'cover_photo');
    const isNew = a.created && (nowMs - new Date(a.created).getTime()) < 30 * 86400000;
    return `<div class="album-card" onclick="navigate('gallery',{album:'${a.id}'})">
      <div class="album-thumb" id="alb-thumb-${a.id}">${thumb
        ? `<img src="${esc(thumb)}" alt="">`
        : '<div class="album-thumb-placeholder"></div>'}</div>
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

  // Auto-cover: for albums with no cover, lazily pull first photo
  const noCover = albums.filter(a => !a.cover_photo_url && !a.cover_photo);
  if (noCover.length) {
    await Promise.all(noCover.map(async a => {
      try {
        const r = await apiFetch(`/api/collections/photos/records?filter=${encodeURIComponent(`(album="${a.id}")`)}` +
          `&sort=created&perPage=1&fields=id,image_url`);
        if (!r.ok) return;
        const items = (await r.json()).items || [];
        if (!items.length || !items[0].image_url) return;
        const thumbEl = document.getElementById(`alb-thumb-${a.id}`);
        if (thumbEl) thumbEl.innerHTML = `<img src="${esc(items[0].image_url)}" alt="">`;
      } catch { /* ignore */ }
    }));
  }
}

let _lbPhotos = [];
let _lbIndex = 0;
let _lbAlbumId = null;

async function renderAlbum(albumId){
  mountMain('<div class="screen-pad"><div class="spinner"></div></div>');
  let album = null, photos = [], events = [];
  try {
    const [aRes, pRes, evRes] = await Promise.all([
      apiFetch(`/api/collections/albums/records/${albumId}?expand=event`),
      apiFetch(`/api/collections/photos/records?filter=${encodeURIComponent(`(album="${albumId}")`)}` + `&sort=-created&perPage=200`),
      apiFetch('/api/collections/events/records?sort=start_date&perPage=200&fields=id,name')
    ]);
    if (aRes.ok) album = await aRes.json();
    if (pRes.ok) photos = (await pRes.json()).items || [];
    if (evRes.ok) events = (await evRes.json()).items || [];
  } catch { /* ignore */ }
  if (!album) { mountMain('<div class="screen-pad"><div class="empty-state"><p>Album not found.</p></div></div>'); return; }

  _lbAlbumId = albumId;
  _lbPhotos = photos.map(ph => ({
    id: ph.id,
    url: fileUrl('photos', ph, 'image_url'),
    caption: ph.caption || '',
    tagged_persons: Array.isArray(ph.tagged_persons) ? ph.tagged_persons : [],
    uploader: ph.uploader || ''
  }));

  const isAdmin = currentUser && currentUser.family_admin;
  const photoItems = photos.map((ph, i) => {
    const url = fileUrl('photos', ph, 'image_url');
    const span = (i + 1) % 5 === 0 ? ' pg-span' : '';
    return `<div class="pg-item${span}" onclick="openLightbox(${i})">
      ${url ? `<img src="${esc(url)}" alt="${esc(ph.caption || '')}">` : '<div class="pg-placeholder"></div>'}
    </div>`;
  }).join('');

  const linkedEvent = album.expand && album.expand.event;
  const yearSpan = album.year ? ` <span style="font-family:var(--font-ui);font-size:1rem;font-weight:400;color:var(--text-muted)">${album.year}</span>` : '';

  mountMain(`<div class="screen-pad">
    <div class="breadcrumb"><span class="link" onclick="navigate('gallery')">Albums</span> › ${esc(album.name)}</div>
    <div class="gallery-header" style="margin-top:.75rem">
      <h1 class="card-title" style="margin:0">${esc(album.name)}${yearSpan}</h1>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap">
        ${isAdmin ? `<button class="btn btn-outline btn-sm" onclick="openEditAlbum('${albumId}')">Edit album</button>` : ''}
        <button class="btn btn-primary btn-sm" onclick="openUploadPhoto('${albumId}')">Upload photo</button>
      </div>
    </div>
    ${album.description ? `<p class="album-desc">${esc(album.description)}</p>` : ''}
    ${linkedEvent ? `<p style="font-size:.85rem;color:var(--text-muted);margin:-.5rem 0 1rem">
      Linked to event: <span class="link" onclick="navigate('events',{event:'${linkedEvent.id}'})">${esc(linkedEvent.name)}</span></p>` : ''}
    ${photos.length
      ? `<div class="photo-grid">${photoItems}</div>`
      : '<div class="empty-state"><div class="emoji">📷</div><p>No photos yet — be the first to upload.</p></div>'}
    <div class="album-comments">
      <h3 class="card-title" style="font-size:1rem;margin:0 0 .75rem">Comments</h3>
      <div id="alb-cmt-list"><div class="spinner"></div></div>
      <div class="comment-form">
        <textarea id="alb-cmt-input" class="comment-input" rows="2" placeholder="Add a comment…"></textarea>
        <button class="btn btn-primary btn-sm comment-submit"
          onclick="submitComment('${albumId}','album','alb-cmt-list','alb-cmt-input')">Post</button>
      </div>
    </div>
  </div>`);

  loadComments(albumId, 'album', 'alb-cmt-list');
}

async function openEditAlbum(albumId){
  openModal('<div class="spinner"></div>');
  try {
    const [aRes, evRes] = await Promise.all([
      apiFetch(`/api/collections/albums/records/${albumId}`),
      apiFetch('/api/collections/events/records?sort=start_date&perPage=200&fields=id,name')
    ]);
    if (!aRes.ok) throw new Error('Could not load album');
    const a = await aRes.json();
    const evList = evRes.ok ? ((await evRes.json()).items || []) : [];
    const evOptions = `<option value="">None</option>` +
      evList.map(e => `<option value="${e.id}"${a.event === e.id ? ' selected' : ''}>${esc(e.name)}</option>`).join('');
    openModal(`<h2 class="card-title">Edit album</h2>
      <div id="alb-edit-err" class="alert alert-error" style="display:none"></div>
      <div class="form-group"><label>Name</label><input id="albe-name" value="${esc(a.name)}" /></div>
      <div class="row-2">
        <div class="form-group"><label>Year</label><input id="albe-year" type="number" value="${a.year || ''}" /></div>
        <div class="form-group"><label>Linked event</label><select id="albe-event">${evOptions}</select></div>
      </div>
      <div class="form-group"><label>Description</label><textarea id="albe-desc">${esc(a.description || '')}</textarea></div>
      <div class="form-group"><label>Cover photo (upload new)</label><input id="albe-cover" type="file" accept="image/*" /></div>
      <div style="display:flex;gap:.6rem;margin-top:.5rem">
        <button class="btn btn-primary" onclick="saveEditAlbum('${albumId}')">Save</button>
        <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      </div>`);
  } catch(e){ openModal(`<p class="alert alert-error">${esc(e.message)}</p><button class="btn btn-outline btn-sm" onclick="closeModal()">Close</button>`); }
}

async function saveEditAlbum(albumId){
  const name = val('albe-name');
  if (!name){ formErr('alb-edit-err','Name is required.'); return; }
  const fd = new FormData();
  fd.append('name', name);
  const yr = val('albe-year'); fd.append('year', yr || '');
  const desc = val('albe-desc'); fd.append('description', desc);
  const eventId = val('albe-event'); fd.append('event', eventId);
  const cover = el('albe-cover').files[0]; if (cover) fd.append('cover_photo', cover);
  try {
    const r = await apiFetch(`/api/collections/albums/records/${albumId}`, { method:'PATCH', body: fd });
    if (!r.ok){ const d = await r.json(); throw new Error(d.message || 'Update failed'); }
    closeModal(); renderAlbum(albumId);
  } catch(e){ formErr('alb-edit-err', e.message); }
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
  openModal(`<h2 class="card-title">Upload photos</h2>
    <div id="upl-error" class="alert alert-error" style="display:none"></div>
    <div class="upload-zone" id="upl-zone" onclick="el('upl-file').click()"
         ondragover="event.preventDefault();this.classList.add('drag-over')"
         ondragleave="this.classList.remove('drag-over')"
         ondrop="event.preventDefault();this.classList.remove('drag-over');handleDroppedFiles(event.dataTransfer.files,'${albumId}')">
      <input id="upl-file" type="file" accept="image/*" multiple onchange="handlePickedFiles(this.files,'${albumId}')">
      <div style="font-size:2rem;margin-bottom:.4rem">📷</div>
      <div>Drop photos here or <span style="color:var(--accent-gold);font-weight:600">browse</span></div>
      <div style="font-size:.78rem;margin-top:.3rem">Supports JPG, PNG, HEIC, WebP — multiple files OK</div>
    </div>
    <div id="upl-file-list" class="upload-file-list"></div>
    <div id="upl-progress" class="upload-progress" style="display:none"></div>
    <div id="upl-errors" class="upload-error-list" style="display:none"></div>
    <div style="display:flex;gap:.6rem;margin-top:1rem">
      <button id="upl-btn" class="btn btn-primary" onclick="doUploadMulti('${albumId}')" disabled>Upload</button>
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
    </div>`);
}

let _uplFiles = [];

function handlePickedFiles(fileList){
  _uplFiles = Array.from(fileList);
  renderUploadFileList();
}

function handleDroppedFiles(fileList){
  _uplFiles = Array.from(fileList).filter(f => f.type.startsWith('image/'));
  renderUploadFileList();
}

function renderUploadFileList(){
  const listEl = el('upl-file-list');
  const btn = el('upl-btn');
  if (!listEl) return;
  if (!_uplFiles.length) { listEl.innerHTML = ''; if (btn) btn.disabled = true; return; }
  listEl.innerHTML = _uplFiles.map((f, i) =>
    `<div class="upload-file-row" id="ufl-${i}">
      <span class="ufl-name">${esc(f.name)}</span>
      <span class="ufl-status" id="ufl-st-${i}">ready</span>
    </div>`).join('');
  if (btn) btn.disabled = false;
}

async function doUploadMulti(albumId){
  if (!_uplFiles.length) return;
  const btn = el('upl-btn');
  if (btn) btn.disabled = true;
  const progressEl = el('upl-progress');
  const errorsEl = el('upl-errors');
  if (progressEl) progressEl.style.display = '';
  if (errorsEl) errorsEl.style.display = 'none';

  let done = 0, errors = [];
  const total = _uplFiles.length;

  for (let i = 0; i < total; i++){
    const f = _uplFiles[i];
    const stEl = el(`ufl-st-${i}`);
    if (progressEl) progressEl.textContent = `Uploading ${i + 1} of ${total}…`;
    if (stEl) { stEl.textContent = 'uploading…'; stEl.className = 'ufl-status'; }
    try {
      // Step 1: upload file to R2 via Worker
      const fd = new FormData();
      fd.append('image', f);
      const uploadRes = await fetch(UPLOAD_URL, {
        method: 'POST',
        headers: { Authorization: token },
        body: fd,
      });
      if (!uploadRes.ok) {
        const d = await uploadRes.json();
        throw new Error(d.error || `Upload failed (${uploadRes.status})`);
      }
      const { url } = await uploadRes.json();

      // Step 2: save metadata to PocketBase
      const metaRes = await apiFetch('/api/collections/photos/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          album: albumId,
          image_url: url,
          caption: f.name.replace(/\.[^.]+$/, ''),
          uploader: userId,
        }),
      });
      if (!metaRes.ok){ const d = await metaRes.json(); throw new Error(d.message || 'Metadata save failed'); }
      done++;
      if (stEl) { stEl.textContent = '✓'; stEl.className = 'ufl-status done'; }
    } catch(e){
      errors.push(f.name + ': ' + e.message);
      if (stEl) { stEl.textContent = '✗'; stEl.className = 'ufl-status error'; }
    }
  }

  if (progressEl) progressEl.textContent = `Done — ${done} of ${total} uploaded.${errors.length ? ` ${errors.length} failed.` : ''}`;
  if (errors.length && errorsEl){
    errorsEl.style.display = '';
    errorsEl.innerHTML = errors.map(e => `<div>${esc(e)}</div>`).join('');
  }
  _uplFiles = [];
  setTimeout(() => { closeModal(); renderAlbum(albumId); }, errors.length ? 3000 : 1200);
}

function openLightbox(index){
  if (!_lbPhotos.length) return;
  _lbIndex = Math.max(0, Math.min(index, _lbPhotos.length - 1));
  el('lb-overlay').hidden = false;
  document.body.style.overflow = 'hidden';
  _showLightboxAt(_lbIndex);
  document.addEventListener('keydown', _lbKeyHandler);
}

function closeLightbox(){
  el('lb-overlay').hidden = true;
  document.body.style.overflow = '';
  document.removeEventListener('keydown', _lbKeyHandler);
}

function lbStep(dir){
  _showLightboxAt(_lbIndex + dir);
}

function _lbKeyHandler(e){
  if (e.key === 'Escape') closeLightbox();
  else if (e.key === 'ArrowLeft') lbStep(-1);
  else if (e.key === 'ArrowRight') lbStep(1);
}

function _showLightboxAt(i){
  if (!_lbPhotos.length) return;
  i = Math.max(0, Math.min(i, _lbPhotos.length - 1));
  _lbIndex = i;
  const ph = _lbPhotos[i];

  const imgEl = el('lb-img');
  imgEl.src = ph.url;
  imgEl.alt = ph.caption || '';
  el('lb-prev').hidden = i === 0;
  el('lb-next').hidden = i === _lbPhotos.length - 1;
  el('lb-counter').textContent = `${i + 1} / ${_lbPhotos.length}`;

  const isAdmin = currentUser && currentUser.family_admin;
  const canEdit = isAdmin || ph.uploader === userId;

  const capEl = el('lb-caption');
  capEl.innerHTML = `
    ${ph.caption ? `<p class="lb-section-label">Caption</p><p class="lb-caption-text">${esc(ph.caption)}</p>` : ''}
    ${canEdit && _lbAlbumId ? `<button class="lb-tag-add" style="margin-top:.35rem" onclick="setAlbumCover('${ph.url}')">Set as album cover</button>` : ''}`;

  // Tags (async, fills in lb-tags)
  el('lb-tags').innerHTML = '<p class="lb-section-label">People in photo</p><div class="lb-tag-list"><span style="color:#555;font-size:.82rem">Loading…</span></div>';
  _loadLbTags(ph, canEdit);

  // Comments (fills in lb-comments)
  _renderLbComments(ph.id);
}

async function _loadLbTags(ph, canEdit){
  const tagsEl = el('lb-tags');
  if (!tagsEl) return;
  const tagIds = ph.tagged_persons || [];
  let persons = [];
  if (tagIds.length){
    try {
      const filter = tagIds.map(id => `id="${id}"`).join('||');
      const r = await apiFetch(`/api/collections/persons/records?filter=${encodeURIComponent(`(${filter})`)}&fields=id,display_name&perPage=50`);
      if (r.ok) persons = (await r.json()).items || [];
    } catch { /* ignore */ }
  }
  const tags = persons.map(p =>
    `<span class="lb-tag" onclick="navigate('profile',{id:'${p.id}'})">${esc(p.display_name || 'Unknown')}</span>`
  ).join('');
  const addBtn = canEdit
    ? `<button class="lb-tag-add" onclick="showLbTagSearch('${ph.id}')">+ Tag person</button>`
    : '';
  tagsEl.innerHTML = `<p class="lb-section-label">People in photo</p>
    <div class="lb-tag-list">${tags || '<span style="color:#555;font-size:.82rem">None tagged yet</span>'}${addBtn}</div>
    <div id="lb-tag-search-wrap"></div>`;
}

function showLbTagSearch(photoId){
  const wrap = el('lb-tag-search-wrap');
  if (!wrap) return;
  wrap.innerHTML = `<input class="lb-tag-search" id="lb-tag-inp" placeholder="Search by name…"
    oninput="searchPersonsForTag(this.value,'${photoId}')">
    <div class="lb-tag-results" id="lb-tag-results"></div>`;
  setTimeout(() => { const inp = el('lb-tag-inp'); if (inp) inp.focus(); }, 50);
}

async function searchPersonsForTag(query, photoId){
  const resEl = el('lb-tag-results');
  if (!resEl) return;
  const q = query.trim();
  if (!q){ resEl.innerHTML = ''; return; }
  try {
    const personFilter = `(display_name~"${q}"||given_name~"${q}"||family_name~"${q}")`;
    const pr = await apiFetch(`/api/collections/persons/records?filter=${encodeURIComponent(personFilter)}&fields=id,display_name&perPage=15`);
    const persons = pr.ok ? (await pr.json()).items || [] : [];

    const isAdmin = currentUser && currentUser.family_admin;
    const quickAdd = isAdmin
      ? `<div class="lb-tag-result" style="color:var(--accent-gold);border-top:1px solid #333;margin-top:.25rem;padding-top:.4rem"
           onclick="quickAddAndTag('${photoId}',${JSON.stringify(q)})">+ Add "${esc(q)}" to family tree &amp; tag</div>`
      : '';

    resEl.innerHTML = persons.map(p =>
      `<div class="lb-tag-result" onclick="addPersonTag('${photoId}','${p.id}')">${esc(p.display_name || 'Unknown')}</div>`
    ).join('') + (persons.length === 0 ? `<div style="color:#666;font-size:.82rem;padding:.3rem .5rem">No matches in family tree</div>` : '') + quickAdd;
  } catch { /* ignore */ }
}

async function quickAddAndTag(photoId, name){
  const parts = name.trim().split(/\s+/);
  const given = parts[0] || name;
  const family = parts.slice(1).join(' ') || '';
  try {
    const r = await apiFetch('/api/collections/persons/records', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ display_name: name, given_name: given, family_name: family, living: true })
    });
    if (!r.ok){ const d = await r.json(); throw new Error(d.message || 'Could not create person'); }
    const person = await r.json();
    await addPersonTag(photoId, person.id);
    toast(`"${name}" added to family tree and tagged.`, 'success');
  } catch(e){ toast(e.message, 'error'); }
}

async function addPersonTag(photoId, personId){
  const ph = _lbPhotos[_lbIndex];
  if (!ph) return;
  const current = ph.tagged_persons || [];
  if (current.includes(personId)){ el('lb-tag-search-wrap').innerHTML = ''; return; }
  const updated = [...current, personId];
  try {
    const r = await apiFetch(`/api/collections/photos/records/${photoId}`, {
      method:'PATCH', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ tagged_persons: updated })
    });
    if (!r.ok) throw new Error('Tag update failed');
    ph.tagged_persons = updated;
    el('lb-tag-search-wrap').innerHTML = '';
    const isAdmin = currentUser && currentUser.family_admin;
    _loadLbTags(ph, isAdmin || ph.uploader === userId);
  } catch(e){ toast(e.message, 'error'); }
}

async function setAlbumCover(url){
  if (!_lbAlbumId) return;
  try {
    const r = await apiFetch(`/api/collections/albums/records/${_lbAlbumId}`, {
      method:'PATCH', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ cover_photo_url: url })
    });
    if (!r.ok) throw new Error('Could not set cover');
    toast('Album cover updated.', 'success');
  } catch(e){ toast(e.message, 'error'); }
}

function _renderLbComments(photoId){
  const container = el('lb-comments');
  if (!container) return;
  container.innerHTML = `
    <p class="lb-section-label">Comments</p>
    <div class="lb-comment-list" id="lb-cmt-list"><div style="color:#555;font-size:.82rem">Loading…</div></div>
    <div class="lb-comment-form">
      <textarea class="lb-comment-input" id="lb-cmt-inp" rows="2" placeholder="Add a comment…"></textarea>
      <button class="lb-comment-submit" onclick="submitLbComment('${photoId}')">Post comment</button>
    </div>`;
  _loadLbComments(photoId);
}

async function _loadLbComments(photoId){
  const container = el('lb-cmt-list');
  if (!container) return;
  try {
    const r = await apiFetch(`/api/collections/comments/records?filter=${encodeURIComponent(`(related_id="${photoId}"&&related_type="photo")`)}` +
      `&sort=created&perPage=100&expand=author`);
    if (!r.ok){ container.innerHTML = '<div style="color:#555;font-size:.82rem">Could not load.</div>'; return; }
    const items = (await r.json()).items || [];
    if (!items.length){ container.innerHTML = '<div style="color:#555;font-size:.82rem">No comments yet.</div>'; return; }
    container.innerHTML = items.map(c => {
      const author = c.expand && c.expand.author;
      const name = author ? (author.name || (author.email ? author.email.split('@')[0] : 'Family member')) : 'Unknown';
      const canDel = c.author === userId || (currentUser && currentUser.family_admin);
      return `<div class="lb-comment">
        <div class="lb-comment-author">${esc(name)}
          ${canDel ? `<button class="lb-comment-del" onclick="_deleteLbComment('${c.id}','${photoId}')">Delete</button>` : ''}
        </div>
        <div class="lb-comment-body">${esc(c.body)}</div>
      </div>`;
    }).join('');
  } catch { container.innerHTML = '<div style="color:#555;font-size:.82rem">Could not load.</div>'; }
}

async function submitLbComment(photoId){
  const input = el('lb-cmt-inp');
  const body = input ? input.value.trim() : '';
  if (!body) return;
  try {
    const r = await apiFetch('/api/collections/comments/records', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ body, author: userId, related_id: photoId, related_type: 'photo' })
    });
    if (!r.ok){ const d = await r.json(); throw new Error(d.message || 'Post failed'); }
    input.value = '';
    _loadLbComments(photoId);
  } catch(e){ toast(e.message, 'error'); }
}

async function _deleteLbComment(commentId, photoId){
  try {
    const r = await apiFetch(`/api/collections/comments/records/${commentId}`, { method:'DELETE' });
    if (!r.ok && r.status !== 204) throw new Error('Delete failed');
    _loadLbComments(photoId);
  } catch(e){ toast(e.message, 'error'); }
}

// ── Album comments ────────────────────────────────────────────────────────────

async function loadComments(relatedId, relatedType, containerId){
  const container = el(containerId);
  if (!container) return;
  try {
    const r = await apiFetch(`/api/collections/comments/records?filter=${encodeURIComponent(`(related_id="${relatedId}"&&related_type="${relatedType}")`)}` +
      `&sort=created&perPage=100&expand=author`);
    if (!r.ok){ container.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem">Could not load comments.</p>'; return; }
    const items = (await r.json()).items || [];
    if (!items.length){ container.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem">No comments yet.</p>'; return; }
    container.innerHTML = items.map(c => {
      const author = c.expand && c.expand.author;
      const name = author ? (author.name || (author.email ? author.email.split('@')[0] : 'Family member')) : 'Unknown';
      const initials = name.charAt(0).toUpperCase();
      const canDel = c.author === userId || (currentUser && currentUser.family_admin);
      const date = c.created ? new Date(c.created).toLocaleDateString() : '';
      return `<div class="comment-item" id="cmt-${c.id}">
        <div class="comment-avatar">${initials}</div>
        <div class="comment-body-wrap">
          <div><span class="comment-author">${esc(name)}</span><span class="comment-date">${date}</span>
            ${canDel ? `<button class="comment-del-btn" onclick="deleteComment('${c.id}','${relatedId}','${relatedType}','${containerId}')">Delete</button>` : ''}
          </div>
          <p class="comment-text">${esc(c.body)}</p>
        </div>
      </div>`;
    }).join('');
  } catch { container.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem">Could not load comments.</p>'; }
}

async function submitComment(relatedId, relatedType, containerId, inputId){
  const input = el(inputId);
  const body = input ? input.value.trim() : '';
  if (!body) return;
  try {
    const r = await apiFetch('/api/collections/comments/records', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ body, author: userId, related_id: relatedId, related_type: relatedType })
    });
    if (!r.ok){ const d = await r.json(); throw new Error(d.message || 'Post failed'); }
    input.value = '';
    loadComments(relatedId, relatedType, containerId);
  } catch(e){ toast(e.message, 'error'); }
}

async function deleteComment(commentId, relatedId, relatedType, containerId){
  try {
    const r = await apiFetch(`/api/collections/comments/records/${commentId}`, { method:'DELETE' });
    if (!r.ok && r.status !== 204) throw new Error('Delete failed');
    loadComments(relatedId, relatedType, containerId);
  } catch(e){ toast(e.message, 'error'); }
}

// ── Notifications ────────────────────────────────────────────────────────────
SCREENS.notifications = async function(){
  mountMain('<div class="screen-pad" style="max-width:720px"><div class="spinner"></div></div>');
  let notes = [];
  try {
    const res = await apiFetch(`/api/collections/notifications/records?sort=-created&perPage=100&filter=${encodeURIComponent(`(user="${userId}")`)}` );
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

  let pending = [], members = [], albumCount = 0, newsCount = 0, claims = [],
      branchAdminRecords = [], distinctBranches = [];
  try {
    const [pRes, mRes, aRes, nRes, cRes, baRes, bnRes] = await Promise.all([
      apiFetch('/api/collections/users/records?filter=(approved=false)&perPage=100&sort=created'),
      apiFetch('/api/collections/users/records?filter=(approved=true)&perPage=200&sort=name'),
      apiFetch('/api/collections/albums/records?perPage=1'),
      apiFetch('/api/collections/news/records?perPage=1'),
      apiFetch('/api/collections/person_claims/records?filter=(status="pending")&perPage=100&expand=person,user&sort=created'),
      apiFetch('/api/collections/branch_admins/records?perPage=200&expand=user'),
      apiFetch('/api/collections/persons/records?perPage=500&fields=family_name')
    ]);
    if (pRes.ok) pending = (await pRes.json()).items || [];
    if (mRes.ok) { const d = await mRes.json(); members = d.items || []; }
    if (aRes.ok) albumCount = (await aRes.json()).totalItems || 0;
    if (nRes.ok) newsCount  = (await nRes.json()).totalItems || 0;
    if (cRes.ok) claims = (await cRes.json()).items || [];
    if (baRes.ok) branchAdminRecords = (await baRes.json()).items || [];
    if (bnRes.ok) {
      const ps = (await bnRes.json()).items || [];
      distinctBranches = [...new Set(ps.map(p => (p.family_name || '').trim()).filter(Boolean))].sort();
    }
  } catch { /* ignore */ }

  const stat = (v, l) => `<div class="stat-card"><div class="stat-val">${v}</div><div class="stat-label">${l}</div></div>`;

  const pendingRows = pending.length
    ? pending.map(u => {
        const displayName = u.name || '—';
        const displayEmail = u.email || u.username || '(email hidden)';
        return `<tr>
          <td>${esc(displayName)}</td>
          <td>${esc(displayEmail)}</td>
          <td>${u.phone ? esc(u.phone) : '—'}</td>
          <td>${u.created ? new Date(u.created).toLocaleDateString() : '—'}</td>
          <td>
            <button class="btn btn-primary btn-sm" onclick="adminApprove('${u.id}')">Approve</button>
            <button class="btn btn-danger btn-sm" style="margin-left:.3rem" onclick="adminDeny('${u.id}')">Deny</button>
          </td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="5" style="color:var(--text-muted);text-align:center;padding:1rem">No pending requests.</td></tr>';

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
        <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Signed up</th><th>Actions</th></tr></thead>
        <tbody>${pendingRows}</tbody>
      </table>
    </div>` : ''}

    ${claims.length ? `<div class="admin-section">Tree claims (${claims.length} pending)</div>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>Claimant</th><th>Person in tree</th><th>Submitted</th><th>Actions</th></tr></thead>
        <tbody>${claims.map(c => {
          const p = (c.expand && c.expand.person) || {};
          const u = (c.expand && c.expand.user)   || {};
          return `<tr>
            <td>${esc(u.name || u.email || '—')}</td>
            <td>${esc(p.display_name || '—')}${p.birth_date ? ' · ' + (_parseYearFromDate(p.birth_date) || '') : ''}</td>
            <td>${c.created ? new Date(c.created).toLocaleDateString() : '—'}</td>
            <td>
              <button class="btn btn-primary btn-sm" onclick="adminApproveClaim('${c.id}','${p.id}','${u.id}')">Approve</button>
              <button class="btn btn-danger btn-sm" style="margin-left:.3rem" onclick="adminDenyClaim('${c.id}','${u.id}')">Deny</button>
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>` : ''}

    <div class="admin-section">All members</div>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>Name</th><th>Email</th><th>Joined</th><th>Role</th><th></th></tr></thead>
        <tbody>${memberRows}</tbody>
      </table>
    </div>

    <div class="admin-section">Branches</div>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>Branch</th><th>Branch admin</th><th></th></tr></thead>
        <tbody>${distinctBranches.map(branch => {
          const rec = branchAdminRecords.find(r => r.branch === branch);
          const u = rec && rec.expand && rec.expand.user;
          return `<tr>
            <td>${esc(branch)}</td>
            <td>${u ? esc(u.name || u.email) : '<span style="color:var(--text-muted)">Unassigned</span>'}</td>
            <td>${rec
              ? `<button class="btn btn-danger btn-sm" onclick="removeBranchAdmin('${rec.id}')">Remove</button>`
              : `<button class="btn btn-outline btn-sm" onclick="openAssignBranchAdmin('${esc(branch)}')">Assign</button>`
            }</td>
          </tr>`;
        }).join('')}
        ${distinctBranches.length === 0 ? '<tr><td colspan="3" style="color:var(--text-muted);text-align:center;padding:1rem">No family branches in the tree yet.</td></tr>' : ''}
        </tbody>
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
    await refreshPending();
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
    await refreshPending();
    renderSidebar();
    SCREENS.admin();
  } catch (e) { toast(e.message, 'error'); }
}

async function adminToggleAdmin(id, makeAdmin){
  try {
    const res = await apiFetch(`/api/collections/users/records/${id}`, {
      method:'PATCH', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify(makeAdmin ? { family_admin: true, approved: true } : { family_admin: false }) });
    if (!res.ok) throw new Error('Could not update');
    toast(makeAdmin ? 'Made admin.' : 'Admin removed.', 'success');
    SCREENS.admin();
  } catch (e) { toast(e.message, 'error'); }
}

function openAssignBranchAdmin(branch){
  openModal(`<h2 class="card-title">Assign branch admin — ${esc(branch)}</h2>
    <div id="ba-error" class="alert alert-error" style="display:none"></div>
    <p style="font-size:.86rem;color:var(--text-secondary);margin-bottom:1rem">
      Choose an approved member to manage the ${esc(branch)} branch.
    </p>
    <div class="form-group"><label>Member email or name</label>
      <input id="ba-search" placeholder="Search…" oninput="searchBranchAdminUser()" />
    </div>
    <div id="ba-results"></div>
    <input type="hidden" id="ba-user-id" />
    <div style="display:flex;gap:.6rem;margin-top:.75rem">
      <button class="btn btn-primary" onclick="saveBranchAdmin('${esc(branch)}')">Assign</button>
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
    </div>`);
}

let _baSearchTimer = null;
function searchBranchAdminUser(){
  clearTimeout(_baSearchTimer);
  _baSearchTimer = setTimeout(async () => {
    const q = val('ba-search');
    if (!q) return;
    const res = await apiFetch(`/api/collections/users/records?filter=${encodeURIComponent(`(approved=true && (name~"${q}" || email~"${q}"))`)}&perPage=8`);
    const items = res.ok ? (await res.json()).items || [] : [];
    const container = el('ba-results');
    if (!container) return;
    container.innerHTML = items.map(u => `
      <div class="claim-result" onclick="selectBranchAdminUser('${u.id}','${esc(u.name || u.email)}')">
        <div><div class="cr-name">${esc(u.name || '—')}</div><div class="cr-sub">${esc(u.email)}</div></div>
      </div>`).join('') || '<p style="font-size:.82rem;color:var(--text-muted)">No matches.</p>';
  }, 200);
}

function selectBranchAdminUser(uid, label){
  const inp = el('ba-user-id'); if (inp) inp.value = uid;
  const s = el('ba-search'); if (s) s.value = label;
  const r = el('ba-results'); if (r) r.innerHTML = '';
}

async function saveBranchAdmin(branch){
  const uid = val('ba-user-id');
  if (!uid) return formErr('ba-error', 'Please select a member first.');
  try {
    const res = await apiFetch('/api/collections/branch_admins/records', {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ user: uid, branch })
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Could not assign'); }
    closeModal();
    toast('Branch admin assigned.', 'success');
    SCREENS.admin();
  } catch (e) { formErr('ba-error', e.message); }
}

async function removeBranchAdmin(recordId){
  try {
    const res = await apiFetch(`/api/collections/branch_admins/records/${recordId}`, { method:'DELETE' });
    if (!res.ok) throw new Error('Could not remove');
    toast('Branch admin removed.', 'success');
    SCREENS.admin();
  } catch (e) { toast(e.message, 'error'); }
}

async function adminApproveClaim(claimId, personId, claimUserId){
  try {
    await apiFetch(`/api/collections/persons/records/${personId}`, {
      method:'PATCH', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ linked_user: claimUserId })
    });
    await apiFetch(`/api/collections/person_claims/records/${claimId}`, {
      method:'PATCH', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ status: 'approved' })
    });
    await apiFetch('/api/collections/notifications/records', {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ user: claimUserId, type: 'admin', title: 'Your tree claim was approved', read: false })
    });
    toast('Claim approved.', 'success');
    await loadBranchAdminState(); renderSidebar();
    const caller = (currentUser && currentUser.family_admin) ? SCREENS.admin : SCREENS.branchadmin;
    caller();
  } catch (e) { toast(e.message, 'error'); }
}

async function adminDenyClaim(claimId, claimUserId){
  try {
    await apiFetch(`/api/collections/person_claims/records/${claimId}`, {
      method:'PATCH', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ status: 'denied' })
    });
    await apiFetch('/api/collections/notifications/records', {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ user: claimUserId, type: 'admin', title: 'Your tree claim was not approved', read: false })
    });
    toast('Claim denied.', 'success');
    await loadBranchAdminState(); renderSidebar();
    const caller = (currentUser && currentUser.family_admin) ? SCREENS.admin : SCREENS.branchadmin;
    caller();
  } catch (e) { toast(e.message, 'error'); }
}

// ── Branch Admin ──────────────────────────────────────────────────────────────
SCREENS.branchadmin = async function(){
  if (!isBranchAdmin()) { navigate('home'); return; }
  mountMain('<div class="screen-pad" style="max-width:1100px"><div class="spinner"></div></div>');

  let claims = [], persons = [];
  const branchFilter = currentBranches.map(b => `person.family_name="${b}"`).join('||');
  const personFilter = currentBranches.map(b => `family_name="${b}"`).join('||');

  try {
    const [cRes, pRes] = await Promise.all([
      apiFetch(`/api/collections/person_claims/records?filter=${encodeURIComponent(`(status="pending" && (${branchFilter}))`)}&perPage=100&expand=person,user&sort=created`),
      apiFetch(`/api/collections/persons/records?filter=${encodeURIComponent(`(${personFilter})`)}&perPage=500&sort=family_name`)
    ]);
    if (cRes.ok) claims = (await cRes.json()).items || [];
    if (pRes.ok) persons = (await pRes.json()).items || [];
  } catch { /* ignore */ }

  const claimsHtml = claims.length
    ? `<div class="admin-section">Pending tree claims</div>
       <div class="admin-table-wrap"><table class="admin-table">
         <thead><tr><th>Claimant</th><th>Person in tree</th><th>Submitted</th><th>Actions</th></tr></thead>
         <tbody>${claims.map(c => {
           const p = (c.expand && c.expand.person) || {};
           const u = (c.expand && c.expand.user)   || {};
           return `<tr>
             <td>${esc(u.name || u.email || '—')}</td>
             <td>${esc(p.display_name || '—')}${p.birth_date ? ' · ' + (_parseYearFromDate(p.birth_date) || '') : ''}</td>
             <td>${c.created ? new Date(c.created).toLocaleDateString() : '—'}</td>
             <td>
               <button class="btn btn-primary btn-sm" onclick="adminApproveClaim('${c.id}','${p.id}','${u.id}')">Approve</button>
               <button class="btn btn-danger btn-sm" style="margin-left:.3rem" onclick="adminDenyClaim('${c.id}','${u.id}')">Deny</button>
             </td>
           </tr>`;
         }).join('')}</tbody>
       </table></div>`
    : '<div class="empty-state" style="padding:2rem 0"><p>No pending claims for your branch.</p></div>';

  const personsHtml = persons.length
    ? `<div class="admin-section">Persons — ${currentBranches.map(esc).join(', ')} branch${currentBranches.length > 1 ? 'es' : ''}</div>
       <div class="admin-table-wrap"><table class="admin-table">
         <thead><tr><th>Name</th><th>Branch</th><th>Born</th><th>Account</th><th></th></tr></thead>
         <tbody>${persons.map(p => `<tr>
           <td>${esc(p.display_name)}</td>
           <td>${esc(p.family_name || '—')}</td>
           <td>${esc(_parseYearFromDate(p.birth_date) || '—')}</td>
           <td>${p.linked_user ? '<span class="pill" style="font-size:.72rem">Linked</span>' : '<span style="color:var(--text-muted);font-size:.82rem">—</span>'}</td>
           <td><button class="btn btn-outline btn-sm" onclick="openPersonForm('${p.id}')">Edit</button></td>
         </tr>`).join('')}</tbody>
       </table></div>`
    : '';

  mountMain(`<div class="screen-pad" style="max-width:1100px">
    <h1 class="card-title" style="margin-bottom:1.25rem">Branch Admin
      <span style="font-family:var(--font-ui);font-size:1rem;font-weight:400;color:var(--text-muted);margin-left:.5rem">
        ${currentBranches.map(esc).join(', ')}
      </span>
    </h1>
    ${claimsHtml}
    ${personsHtml}
  </div>`);
};

// ── Placeholder screens (replaced by screen modules appended below) ──────────
for (const n of NAV) if (!SCREENS[n.tab]) SCREENS[n.tab] = () =>
  mountMain(`<div class="screen-pad"><h1 class="card-title">${esc(n.label)}</h1>
    <div class="empty-state"><p>Coming soon.</p></div></div>`);
if (!SCREENS.profile) SCREENS.profile = () =>
  mountMain('<div class="screen-pad"><div class="empty-state"><p>Coming soon.</p></div></div>');

init();
