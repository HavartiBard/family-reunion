# Admin Panel: Branch & User List Scaling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the monolithic `SCREENS.admin` into 4 independently-fetched sub-tabs (Pending Approvals, Members, Branches, Service Accounts), replacing today's flat/unpaginated/unsearchable tables with server-driven search, filter, and numbered pagination.

**Architecture:** `SCREENS.admin` becomes a thin shell that renders a tab bar plus a content mount point, and delegates to one render function per tab (`_renderAdminPending`, `_renderAdminMembers`, `_renderAdminBranches`, `_renderAdminServiceAccounts`). Each tab function does its own `apiFetch` calls with PocketBase `filter`/`sort`/`page`/`perPage` query params and re-renders only its own content div — switching tabs never re-fetches data for tabs not in view. Search/filter state per tab lives in module-level `let`s (mirroring the existing `_baSearchTimer` debounce pattern), reset when the tab is left.

**Tech Stack:** Vanilla JS (`app.js`), PocketBase REST API via `apiFetch`, plain CSS (`app.css`) — no new dependencies, no build step, consistent with the rest of this codebase.

## Global Constraints

- No build step — `app.js`/`app.css`/`index.html` are edited directly, no bundler, no TypeScript.
- Follow the existing `esc()`-escaping convention for all user-supplied text interpolated into HTML (names, emails, search query, tree names) — every existing render function in this file does this; skipping it on a new field is an XSS risk.
- Follow the existing `admin-table`/`admin-table-wrap`/`admin-section` CSS classes (`app.css:805-818`) for all new tables — do not introduce a parallel table style.
- PocketBase filter strings must be URL-encoded via `encodeURIComponent(...)` before being appended to the query string — every existing filtered fetch in this file does this (e.g. `app.js:6837`).
- `svc-*` service accounts (identified by `email ~ "svc-"`) must never appear in the Members tab's results, only in the Service Accounts tab.
- Tests: this codebase has no automated test coverage for screen rendering (`node --test` covers only `helpers.js`/`merge.js`). Verification is `node --check app.js` (syntax) plus a real-browser pass (Camoufox, per this project's established pattern) — call this out explicitly at the end of each task rather than skipping verification.

---

### Task 1: Tab shell — split `SCREENS.admin` into a tab bar + 4 stub panels

**Files:**
- Modify: `app.js:6669-6777` (replace `SCREENS.admin` body)
- Modify: `app.css` (add tab-bar rule, reusing `.evf-tabs`/`.evf-tab` pattern at `app.css:847-854` as the model — do not touch those existing rules, add new `.admin-tabs`/`.admin-tab` rules alongside them)

**Interfaces:**
- Produces: `SCREENS.admin()` — unchanged entry point/signature, still gated on `currentUser.family_admin` and calling `navigate('home')` otherwise (existing behavior at `app.js:6670`, keep verbatim).
- Produces: `_adminActiveTab` (module-level `let`, one of `'pending'|'members'|'branches'|'service'`, default `'pending'`).
- Produces: `_adminSwitchTab(tabName)` — sets `_adminActiveTab`, updates the active class on tab buttons, and calls the matching render function into a fixed content mount (`#admin-tab-content`).
- Produces: `_adminRenderStats()` — returns the stat-card strip HTML string (extracted verbatim from `app.js:6694,6725-6730` — same 4 stats, same `stat()` helper, same data). Keep the existing 7-way `Promise.all` fetch (`app.js:6676-6691`) here for now (album/news counts + all the other counts needed for the stat strip); Tasks 2-4 will move the pending/members/branches-specific fetches into their own tab functions and this function keeps only what the stat strip needs (approved-member total, pending total, album count, news count).

- [ ] **Step 1: Write the new `SCREENS.admin` shell**

Replace `app.js:6669-6777` with:

```javascript
let _adminActiveTab = 'pending';

SCREENS.admin = async function(){
  if (!(currentUser && currentUser.family_admin)) { navigate('home'); return; }
  mountMain('<div class="screen-pad" style="max-width:1100px"><div class="spinner"></div></div>');

  const statsHtml = await _adminRenderStats();

  mountMain(`<div class="screen-pad" style="max-width:1100px">
    <h1 class="card-title" style="margin-bottom:1.25rem">Admin Panel</h1>
    ${statsHtml}
    <div class="admin-tabs" id="admin-tabs">
      <div class="admin-tab${_adminActiveTab==='pending'?' active':''}" onclick="_adminSwitchTab('pending')">Pending Approvals</div>
      <div class="admin-tab${_adminActiveTab==='members'?' active':''}" onclick="_adminSwitchTab('members')">Members</div>
      <div class="admin-tab${_adminActiveTab==='branches'?' active':''}" onclick="_adminSwitchTab('branches')">Branches</div>
      <div class="admin-tab${_adminActiveTab==='service'?' active':''}" onclick="_adminSwitchTab('service')">Service Accounts</div>
    </div>
    <div id="admin-tab-content"><div class="spinner"></div></div>
  </div>`);

  await _adminRenderActiveTab();
};

async function _adminRenderStats(){
  let memberCount = 0, pendingCount = 0, albumCount = 0, newsCount = 0;
  try {
    const [mRes, pRes, aRes, nRes] = await Promise.all([
      apiFetch('/api/collections/users/records?filter=(approved=true)&perPage=1'),
      apiFetch('/api/collections/users/records?filter=(approved=false)&perPage=1'),
      apiFetch('/api/collections/albums/records?perPage=1'),
      apiFetch('/api/collections/news/records?perPage=1')
    ]);
    if (mRes.ok) memberCount = (await mRes.json()).totalItems || 0;
    if (pRes.ok) pendingCount = (await pRes.json()).totalItems || 0;
    if (aRes.ok) albumCount = (await aRes.json()).totalItems || 0;
    if (nRes.ok) newsCount = (await nRes.json()).totalItems || 0;
  } catch { /* ignore */ }
  const stat = (v, l) => `<div class="stat-card"><div class="stat-val">${v}</div><div class="stat-label">${l}</div></div>`;
  return `<div class="admin-stats">
    ${stat(memberCount, 'Approved members')}
    ${stat(pendingCount, 'Pending approvals')}
    ${stat(albumCount, 'Albums')}
    ${stat(newsCount, 'News posts')}
  </div>`;
}

function _adminSwitchTab(tabName){
  _adminActiveTab = tabName;
  document.querySelectorAll('#admin-tabs .admin-tab').forEach(t => t.classList.remove('active'));
  const active = document.querySelector(`#admin-tabs .admin-tab[onclick*="'${tabName}'"]`);
  if (active) active.classList.add('active');
  _adminRenderActiveTab();
}

async function _adminRenderActiveTab(){
  const mount = el('admin-tab-content');
  if (!mount) return;
  mount.innerHTML = '<div class="spinner"></div>';
  if (_adminActiveTab === 'pending') return _renderAdminPending();
  if (_adminActiveTab === 'members') return _renderAdminMembers();
  if (_adminActiveTab === 'branches') return _renderAdminBranches();
  if (_adminActiveTab === 'service') return _renderAdminServiceAccounts();
}
```

Note: `_renderAdminPending`, `_renderAdminMembers`, `_renderAdminBranches`, `_renderAdminServiceAccounts` are stubs for this task — implemented fully in Tasks 2-4. For this task, add temporary stub bodies directly below the code above so the app doesn't crash:

```javascript
async function _renderAdminPending(){ const m = el('admin-tab-content'); if (m) m.innerHTML = '<p>TODO Task 2</p>'; }
async function _renderAdminMembers(){ const m = el('admin-tab-content'); if (m) m.innerHTML = '<p>TODO Task 3</p>'; }
async function _renderAdminBranches(){ const m = el('admin-tab-content'); if (m) m.innerHTML = '<p>TODO Task 4</p>'; }
async function _renderAdminServiceAccounts(){ const m = el('admin-tab-content'); if (m) m.innerHTML = '<p>TODO Task 5</p>'; }
```
(Tasks 2-5 replace each stub with its real implementation — these are not shipped as-is, this step only exists so Task 1 is independently testable.)

Also remove the old top-level tree-claims table, all-members table, and branches table markup that used to live inline in `SCREENS.admin` (`app.js:6740-6776` in the original) — that logic moves into the tab functions in later tasks. Do NOT delete `_renderClaimsTableRows` (`app.js:6654-6668`) — it's still used by `SCREENS.branchadmin` and will be reused by Task 2.

- [ ] **Step 2: Add tab-bar CSS**

Add to `app.css`, near the existing `.admin-*` rules (after line 818):

```css
.admin-tabs{display:flex;gap:.25rem;margin:1.5rem 0 0;border-bottom:2px solid var(--border-default);padding:0 .25rem}
.admin-tab{padding:.6rem 1.1rem;border-radius:8px 8px 0 0;font-size:.9rem;font-weight:500;
  color:var(--text-muted);cursor:pointer;border:1px solid transparent;border-bottom:none}
.admin-tab:hover{color:var(--text-primary)}
.admin-tab.active{background:var(--bg-card);color:var(--accent-gold);
  border-color:var(--border-default)}
#admin-tab-content{background:var(--bg-card);border:1px solid var(--border-default);
  border-top:none;border-radius:0 0 12px 12px;padding:1rem 1.25rem;min-height:120px}
```

- [ ] **Step 3: Syntax check**

Run: `node --check app.js`
Expected: no output (exits 0).

- [ ] **Step 4: Manual browser check**

Start the app locally (open `index.html` via a static server, or whatever this project's established local-preview method is — see `README.md`/`CLAUDE.md` if unclear), log in as a `family_admin` user, navigate to Admin Panel. Confirm: stat strip renders with real numbers, 4 tabs render, clicking each tab shows its stub "TODO Task N" text without a console error, and the previously-tested tree-claims/members/branches tables are gone from the main page in favor of the empty stub tabs (expected at this point in the plan — later tasks fill them in).

- [ ] **Step 5: Commit**

```bash
git add app.js app.css
git commit -m "feat(admin): split Admin Panel into tabbed shell (stubs for Pending/Members/Branches/Service Accounts)"
```

---

### Task 2: Pending Approvals tab (behavior-preserving move)

**Files:**
- Modify: `app.js` (replace `_renderAdminPending` stub from Task 1; also relocate the tree-claims table into this tab)

**Interfaces:**
- Consumes: `_renderClaimsTableRows(claims)` (existing, `app.js:6654-6668`, unchanged).
- Consumes: `adminApprove(id)`, `adminDeny(id)`, `adminApproveClaim(claimId, personId, claimUserId)`, `adminDenyClaim(claimId, claimUserId)` — all existing (`app.js:6779+`), **must be updated** in Task 5's cleanup step to re-render via `_adminRenderActiveTab()` instead of `SCREENS.admin()` after a mutation (see Task 5), but for this task leave them calling `SCREENS.admin()` — Task 5 is where all the action-handler call sites get swept in one pass so the diff for each concern stays isolated per task.
- Produces: `_renderAdminPending()` — fetches pending users (`approved=false`) and pending `person_claims`, renders both tables into `#admin-tab-content`.

- [ ] **Step 1: Implement `_renderAdminPending`**

```javascript
async function _renderAdminPending(){
  const mount = el('admin-tab-content');
  if (!mount) return;
  let pending = [], claims = [];
  try {
    const [pRes, cRes] = await Promise.all([
      apiFetch('/api/collections/users/records?filter=(approved=false)&perPage=100&sort=created'),
      apiFetch('/api/collections/person_claims/records?filter=(status="pending")&perPage=100&expand=person,user&sort=created')
    ]);
    if (pRes.ok) pending = (await pRes.json()).items || [];
    if (cRes.ok) claims = (await cRes.json()).items || [];
  } catch { /* ignore */ }

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

  mount.innerHTML = `
    <div class="admin-section" style="margin-top:0">Pending approvals</div>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Signed up</th><th>Actions</th></tr></thead>
        <tbody>${pendingRows}</tbody>
      </table>
    </div>
    ${claims.length ? `<div class="admin-section">Tree claims (${claims.length} pending)</div>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>Claimant</th><th>Person in tree</th><th>Submitted</th><th>Actions</th></tr></thead>
        <tbody>${_renderClaimsTableRows(claims)}</tbody>
      </table>
    </div>` : ''}`;
}
```

Replace the Task-1 stub of the same name with this.

- [ ] **Step 2: Syntax check**

Run: `node --check app.js`
Expected: no output.

- [ ] **Step 3: Manual browser check**

As a `family_admin`, create (or use an existing) pending user and a pending tree claim in the dev PocketBase instance. Open Admin Panel → Pending Approvals tab. Confirm both tables render with correct data, and Approve/Deny buttons on both still work (they'll currently reload the whole `SCREENS.admin` — that's expected until Task 5).

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat(admin): implement Pending Approvals tab"
```

---

### Task 3: Members tab — search, role/status filter, pagination, svc-* exclusion

**Files:**
- Modify: `app.js` (replace `_renderAdminMembers` stub from Task 1)
- Modify: `app.css` (add pagination control styles, reused by Task 4 too)

**Interfaces:**
- Consumes: `adminToggleAdmin(id, makeAdmin)` (existing, `app.js:6803-6812`, unchanged this task).
- Produces: `_adminMembersState` (module-level object: `{ page: 1, search: '', role: 'all', status: 'all' }`) — reset to defaults whenever `_renderAdminMembers()` is called with no arguments (i.e. on tab switch); preserved across search/filter/page-change re-renders within the tab.
- Produces: `_renderAdminMembers()` — builds the combined filter string, fetches page, renders table + pagination controls.
- Produces: `_adminMembersSearch()` — debounced (200ms, matching `_baSearchTimer`'s existing debounce interval at `app.js:6831-6846`) input handler that resets `_adminMembersState.page` to 1 and re-renders.
- Produces: `_adminMembersSetFilter(kind, value)` — sets `role` or `status` on `_adminMembersState`, resets page to 1, re-renders.
- Produces: `_adminMembersGoToPage(p)` — sets `_adminMembersState.page`, re-renders (no reset of search/filter).
- Produces (shared, reused by Task 4): `_adminPaginationHtml(currentPage, totalPages, goToPageFnName)` — returns prev/next + page-number HTML, calling `goToPageFnName(n)` (a global function name string) on click.

- [ ] **Step 1: Implement shared pagination helper**

```javascript
function _adminPaginationHtml(currentPage, totalPages, goToPageFnName){
  if (totalPages <= 1) return '';
  const prevDisabled = currentPage <= 1 ? 'disabled' : '';
  const nextDisabled = currentPage >= totalPages ? 'disabled' : '';
  return `<div class="admin-pagination">
    <button class="btn btn-outline btn-sm" ${prevDisabled} onclick="${goToPageFnName}(${currentPage - 1})">Prev</button>
    <span class="admin-pagination-label">Page ${currentPage} of ${totalPages}</span>
    <button class="btn btn-outline btn-sm" ${nextDisabled} onclick="${goToPageFnName}(${currentPage + 1})">Next</button>
  </div>`;
}
```

- [ ] **Step 2: Implement `_renderAdminMembers` and its state/handlers**

```javascript
let _adminMembersState = { page: 1, search: '', role: 'all', status: 'all' };
let _adminMembersSearchTimer = null;

function _adminMembersBuildFilter(){
  const clauses = ['email !~ "svc-"'];
  if (_adminMembersState.status === 'approved') clauses.push('approved=true');
  else if (_adminMembersState.status === 'pending') clauses.push('approved=false');
  if (_adminMembersState.role === 'admin') clauses.push('family_admin=true');
  else if (_adminMembersState.role === 'regular') clauses.push('family_admin=false');
  const q = _adminMembersState.search.trim();
  if (q) clauses.push(`(name~"${q}" || email~"${q}")`);
  return `(${clauses.join(' && ')})`;
}

async function _renderAdminMembers(){
  const mount = el('admin-tab-content');
  if (!mount) return;
  let members = [], totalPages = 1;
  try {
    const filter = encodeURIComponent(_adminMembersBuildFilter());
    const res = await apiFetch(`/api/collections/users/records?filter=${filter}&perPage=25&page=${_adminMembersState.page}&sort=name`);
    if (res.ok) { const d = await res.json(); members = d.items || []; totalPages = d.totalPages || 1; }
  } catch { /* ignore */ }

  const memberRows = members.length ? members.map(u => `<tr>
    <td>${esc(u.name || '—')}</td>
    <td>${esc(u.email || '—')}</td>
    <td>${u.created ? new Date(u.created).toLocaleDateString() : '—'}</td>
    <td>${u.family_admin ? '<span class="pill">Admin</span>' : ''}</td>
    <td>${u.id !== userId
      ? `<button class="btn btn-outline btn-sm" onclick="adminToggleAdmin('${u.id}',${!u.family_admin})">${u.family_admin ? 'Remove admin' : 'Make admin'}</button>`
      : '<span style="color:var(--text-muted);font-size:.82rem">You</span>'}</td>
  </tr>`).join('') : '<tr><td colspan="5" style="color:var(--text-muted);text-align:center;padding:1rem">No members match.</td></tr>';

  mount.innerHTML = `
    <div class="admin-filter-bar">
      <input id="admin-members-search" placeholder="Search name or email…" value="${esc(_adminMembersState.search)}" oninput="_adminMembersSearch()" />
      <select id="admin-members-role" onchange="_adminMembersSetFilter('role', this.value)">
        <option value="all" ${_adminMembersState.role==='all'?'selected':''}>All roles</option>
        <option value="admin" ${_adminMembersState.role==='admin'?'selected':''}>Admin</option>
        <option value="regular" ${_adminMembersState.role==='regular'?'selected':''}>Regular</option>
      </select>
      <select id="admin-members-status" onchange="_adminMembersSetFilter('status', this.value)">
        <option value="all" ${_adminMembersState.status==='all'?'selected':''}>All statuses</option>
        <option value="approved" ${_adminMembersState.status==='approved'?'selected':''}>Approved</option>
        <option value="pending" ${_adminMembersState.status==='pending'?'selected':''}>Pending</option>
      </select>
    </div>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>Name</th><th>Email</th><th>Joined</th><th>Role</th><th></th></tr></thead>
        <tbody>${memberRows}</tbody>
      </table>
    </div>
    ${_adminPaginationHtml(_adminMembersState.page, totalPages, '_adminMembersGoToPage')}`;
}

function _adminMembersSearch(){
  clearTimeout(_adminMembersSearchTimer);
  _adminMembersSearchTimer = setTimeout(() => {
    const inp = el('admin-members-search');
    _adminMembersState.search = inp ? inp.value : '';
    _adminMembersState.page = 1;
    _renderAdminMembers();
  }, 200);
}

function _adminMembersSetFilter(kind, value){
  _adminMembersState[kind] = value;
  _adminMembersState.page = 1;
  _renderAdminMembers();
}

function _adminMembersGoToPage(p){
  _adminMembersState.page = p;
  _renderAdminMembers();
}
```

Replace the Task-1 stub `_renderAdminMembers` with this block, and reset `_adminMembersState` to its default object whenever the tab is switched to from elsewhere — do this in `_adminSwitchTab` (Task 1) by adding, right before the `if (_adminActiveTab === 'members')` dispatch in `_adminRenderActiveTab`:
```javascript
if (_adminActiveTab === 'members' && tabJustSwitched) _adminMembersState = { page: 1, search: '', role: 'all', status: 'all' };
```
Simplify: instead of threading a `tabJustSwitched` flag through `_adminRenderActiveTab` (which is also called after in-tab actions like approve/deny in Task 5, where state must NOT reset), reset state directly inside `_adminSwitchTab` (Task 1's function), not `_adminRenderActiveTab`:
```javascript
function _adminSwitchTab(tabName){
  _adminActiveTab = tabName;
  if (tabName === 'members') _adminMembersState = { page: 1, search: '', role: 'all', status: 'all' };
  if (tabName === 'branches') _adminBranchesState = { page: 1, search: '' };
  document.querySelectorAll('#admin-tabs .admin-tab').forEach(t => t.classList.remove('active'));
  const active = document.querySelector(`#admin-tabs .admin-tab[onclick*="'${tabName}'"]`);
  if (active) active.classList.add('active');
  _adminRenderActiveTab();
}
```
(This updates Task 1's `_adminSwitchTab` — apply this edit to the function written in Task 1, replacing its body with the version above. `_adminBranchesState` is defined in Task 4; referencing it here is safe since it's declared with `let` at module scope before any call site executes.)

- [ ] **Step 3: Add filter-bar and pagination CSS**

Add to `app.css` after the `.admin-tab*` rules from Task 1:

```css
.admin-filter-bar{display:flex;gap:.6rem;flex-wrap:wrap;margin-bottom:.85rem}
.admin-filter-bar input{flex:1;min-width:180px}
.admin-filter-bar select{min-width:130px}
.admin-pagination{display:flex;align-items:center;gap:.75rem;justify-content:center;margin-top:.85rem}
.admin-pagination-label{font-size:.82rem;color:var(--text-muted)}
```

- [ ] **Step 4: Syntax check**

Run: `node --check app.js`
Expected: no output.

- [ ] **Step 5: Manual browser check**

Open Admin Panel → Members tab. Confirm: existing members list renders paginated at 25/page (create/seed more than 25 approved users in dev if needed to see page 2), search box filters by typing a partial name/email after the 200ms debounce, Role and Status dropdowns each narrow the list, combining search+role+status works together (e.g. search "smith" + Role=Admin), and no `svc-*` email ever appears regardless of filter combination. Confirm Make/Remove admin button still works and "You" shows correctly on your own row.

- [ ] **Step 6: Commit**

```bash
git add app.js app.css
git commit -m "feat(admin): implement Members tab with search, role/status filters, pagination"
```

---

### Task 4: Branches tab — search, pagination, member counts, linked trees, scoped admin lookup

**Files:**
- Modify: `app.js` (replace `_renderAdminBranches` stub from Task 1)

**Interfaces:**
- Consumes: `_adminPaginationHtml` (Task 3).
- Consumes: `openAssignBranchAdmin(treeId, treeName)`, `removeBranchAdmin(recordId)` (existing, `app.js:6814-6876`, unchanged).
- Produces: `_adminBranchesState` (module-level object: `{ page: 1, search: '' }`, reset in `_adminSwitchTab` per Task 3's step 2 update).
- Produces: `_renderAdminBranches()`.
- Produces: `_adminBranchesSearch()` — debounced search handler, same 200ms pattern as Task 3.
- Produces: `_adminBranchesGoToPage(p)`.

- [ ] **Step 1: Implement `_renderAdminBranches`**

```javascript
let _adminBranchesState = { page: 1, search: '' };
let _adminBranchesSearchTimer = null;

async function _renderAdminBranches(){
  const mount = el('admin-tab-content');
  if (!mount) return;
  let trees = [], totalPages = 1, branchAdminRecords = [], memberCounts = {};
  try {
    const q = _adminBranchesState.search.trim();
    const filter = q ? `&filter=${encodeURIComponent(`(name~"${q}")`)}` : '';
    const tRes = await apiFetch(`/api/collections/trees/records?perPage=15&page=${_adminBranchesState.page}${filter}&sort=name`);
    if (tRes.ok) { const d = await tRes.json(); trees = d.items || []; totalPages = d.totalPages || 1; }

    if (trees.length) {
      const treeIds = trees.map(t => t.id);
      const baFilter = encodeURIComponent(`(${treeIds.map(id => `tree ?~ "${id}"`).join(' || ')})`);
      const baRes = await apiFetch(`/api/collections/branch_admins/records?filter=${baFilter}&perPage=200&expand=user`);
      if (baRes.ok) branchAdminRecords = (await baRes.json()).items || [];

      const countResults = await Promise.all(treeIds.map(id =>
        apiFetch(`/api/collections/persons/records?filter=${encodeURIComponent(`(tree="${id}")`)}&perPage=1`)
          .then(r => r.ok ? r.json() : { totalItems: 0 })
          .then(d => ({ id, count: d.totalItems || 0 }))
          .catch(() => ({ id, count: 0 }))
      ));
      countResults.forEach(r => { memberCounts[r.id] = r.count; });
    }
  } catch { /* ignore */ }

  const rows = trees.length ? trees.map(tree => {
    const rec = branchAdminRecords.find(r => (r.tree || []).includes(tree.id));
    const u = rec && rec.expand && rec.expand.user;
    const linkedNames = (tree.linked_trees || []).length
      ? trees.filter(t2 => (tree.linked_trees || []).includes(t2.id)).map(t2 => esc(t2.name)).join(', ') || '—'
      : '—';
    return `<tr>
      <td>${esc(tree.name)}</td>
      <td>${memberCounts[tree.id] || 0}</td>
      <td>${linkedNames}</td>
      <td>${u ? esc(u.name || u.email) : '<span style="color:var(--text-muted)">Unassigned</span>'}</td>
      <td>${rec
        ? `<button class="btn btn-danger btn-sm" onclick="removeBranchAdmin('${rec.id}')">Remove</button>`
        : `<button class="btn btn-outline btn-sm" onclick="openAssignBranchAdmin('${tree.id}','${esc(tree.name)}')">Assign</button>`
      }</td>
    </tr>`;
  }).join('') : '<tr><td colspan="5" style="color:var(--text-muted);text-align:center;padding:1rem">No family trees match.</td></tr>';

  mount.innerHTML = `
    <div class="admin-filter-bar">
      <input id="admin-branches-search" placeholder="Search branch name…" value="${esc(_adminBranchesState.search)}" oninput="_adminBranchesSearch()" />
    </div>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>Tree</th><th>Members</th><th>Linked trees</th><th>Branch admin</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${_adminPaginationHtml(_adminBranchesState.page, totalPages, '_adminBranchesGoToPage')}`;
}

function _adminBranchesSearch(){
  clearTimeout(_adminBranchesSearchTimer);
  _adminBranchesSearchTimer = setTimeout(() => {
    const inp = el('admin-branches-search');
    _adminBranchesState.search = inp ? inp.value : '';
    _adminBranchesState.page = 1;
    _renderAdminBranches();
  }, 200);
}

function _adminBranchesGoToPage(p){
  _adminBranchesState.page = p;
  _renderAdminBranches();
}
```

Note on the "linked trees" lookup: it only resolves names for linked trees that also appear in the *current page* of `trees` results (`trees.filter(t2 => ...)`) — a tree linked to another tree on a different page won't show a name, only get filtered out of `linkedNames`, silently showing `—` if none of its links are on-page. This is an accepted limitation for this pass (the spec's Branches tab section calls for showing linked-tree names, not for guaranteeing every link resolves across pages); note it in the PR description rather than solving pagination-spanning joins here.

Replace the Task-1 stub `_renderAdminBranches` with this block.

- [ ] **Step 2: Syntax check**

Run: `node --check app.js`
Expected: no output.

- [ ] **Step 3: Manual browser check**

Open Admin Panel → Branches tab. Confirm: trees list renders paginated at 15/page, search by partial tree name works, each row shows a persons-count number matching what you'd expect from the dev data (spot-check one tree's count against `persons?filter=(tree="<id>")&perPage=1`'s `totalItems` directly), linked-trees column shows names for any tree with a cross-tree marriage link (or `—` otherwise), and Assign/Remove branch-admin still works exactly as before.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat(admin): implement Branches tab with search, pagination, member counts, linked trees"
```

---

### Task 5: Service Accounts tab + action-handler re-render cleanup

**Files:**
- Modify: `app.js` (replace `_renderAdminServiceAccounts` stub from Task 1; update `adminApprove`, `adminDeny`, `adminToggleAdmin`, `saveBranchAdmin`, `removeBranchAdmin`, `adminApproveClaim`, `adminDenyClaim` call sites)

**Interfaces:**
- Consumes: none new.
- Produces: `_renderAdminServiceAccounts()`.
- Modifies: every admin action handler's post-mutation re-render call, from `SCREENS.admin()` (full page reload) to `_adminRenderActiveTab()` (re-render just the current tab, preserving search/filter/page state on the other tabs and matching the "switching tabs doesn't re-fetch other tabs' data" design goal from the spec).

- [ ] **Step 1: Implement `_renderAdminServiceAccounts`**

```javascript
async function _renderAdminServiceAccounts(){
  const mount = el('admin-tab-content');
  if (!mount) return;
  let accounts = [];
  try {
    const res = await apiFetch(`/api/collections/users/records?filter=${encodeURIComponent('(email ~ "svc-")')}&perPage=20&sort=name&expand=home_tree`);
    if (res.ok) accounts = (await res.json()).items || [];
  } catch { /* ignore */ }

  const rows = accounts.length ? accounts.map(u => `<tr>
    <td>${esc(u.name || '—')}</td>
    <td>${esc(u.email || '—')}</td>
    <td>${esc((u.expand && u.expand.home_tree && u.expand.home_tree.name) || '—')}</td>
  </tr>`).join('') : '<tr><td colspan="3" style="color:var(--text-muted);text-align:center;padding:1rem">No service accounts found.</td></tr>';

  mount.innerHTML = `
    <p style="font-size:.82rem;color:var(--text-secondary);margin-bottom:1rem">
      Managed by <code>tools/*</code> scripts, not through this panel.
    </p>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>Name</th><th>Email</th><th>Pinned tree</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}
```

Replace the Task-1 stub `_renderAdminServiceAccounts` with this block.

- [ ] **Step 2: Update action handlers to re-render only the active tab**

In `app.js`, change every occurrence of a bare `SCREENS.admin();` call inside these existing functions to `_adminRenderActiveTab();` instead:
- `adminApprove` (was `app.js:6787`)
- `adminDeny` (equivalent line, same pattern as `adminApprove`)
- `adminToggleAdmin` (existing, `app.js:6803-6812`)
- `saveBranchAdmin` (was `app.js:6865`)
- `removeBranchAdmin` (was `app.js:6874`)
- `adminApproveClaim` (was `app.js:6895`, the `caller()` ternary — change its `SCREENS.admin` branch specifically to `_adminRenderActiveTab`, leaving the `SCREENS.branchadmin` branch for non-family_admin branch admins untouched, since that screen has no tabs)
- `adminDenyClaim` (was `app.js:6912`, same ternary pattern as `adminApproveClaim`)

Example for `adminApproveClaim`/`adminDenyClaim`, the ternary becomes:
```javascript
const caller = (currentUser && currentUser.family_admin) ? _adminRenderActiveTab : SCREENS.branchadmin;
caller();
```

Also update `refreshPending()` (`app.js:336-343`, the nav-badge pending-count refresher) — no change needed there, it doesn't call `SCREENS.admin`, just recomputes `pendingCount` for the nav badge; confirm this during Step 4's browser check rather than editing it.

- [ ] **Step 3: Syntax check**

Run: `node --check app.js`
Expected: no output.

- [ ] **Step 4: Manual browser check**

Full regression pass: from the Members tab, set a search term and a filter, then switch to Pending Approvals and approve a pending user — confirm you land back on Pending Approvals (not reset to the first tab) and that its own list updates immediately. Switch back to Members and confirm your earlier search/filter/page selections are still applied (not reset by the unrelated approve action). Repeat for deny, toggle-admin, assign/remove branch admin, and approve/deny claim — each should refresh only its own tab's data. Finally open the Service Accounts tab and confirm exactly the 3 `svc-*` accounts appear with their pinned tree name, and that switching away and back to Members still excludes them.

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "feat(admin): add Service Accounts tab, re-render only active tab after admin actions"
```

---

### Task 6: Final review pass against the spec

**Files:** none (verification only)

- [ ] **Step 1: Diff review**

Run `git diff origin/main...HEAD -- app.js app.css` (or the equivalent against whatever base branch this work started from) and read the full accumulated diff top to bottom. Confirm every item in the spec's 4 tab sections (Pending Approvals, Members, Branches, Service Accounts) and its Non-goals section (no notification feature, no stats-dashboard expansion, no `SCREENS.home` branch-count reconciliation, no Tree Claims table changes beyond relocating it, no `SCREENS.branchadmin` changes) is reflected accurately — no accidental scope creep, no missing piece.

- [ ] **Step 2: Full manual regression**

Repeat the Task 5 Step 4 browser pass once more end-to-end in a single sitting (all 4 tabs, all filters, all actions, service-account exclusion) to catch anything that only shows up after the full sequence of commits, not just each task in isolation.

- [ ] **Step 3: Request code review**

Use the `superpowers:requesting-code-review` skill (or this project's `/code-review` flow) before opening a PR, per this project's established workflow of checking Codex's inline PR comments before merge — open the PR first if that's the review's expected trigger point, per this repo's normal flow.
