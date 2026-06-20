# Branch Admins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a two-tier admin system: site admins (existing `family_admin` flag) retain full access; new branch admins are scoped to a specific `family_name` branch — they can approve tree claims and edit persons within their branch.

**Architecture:** New `branch_admins` PocketBase collection maps users to branch names. Frontend loads branch state after login (`loadBranchAdminState()`), shows a "Branch Admin" nav item for branch admins, and gates a `SCREENS.branchadmin` view. Site admin panel gets a Branches tab for assigning branch admins.

**Tech Stack:** PocketBase JS migration, raw HTML/CSS/JS, existing patterns.

## Global Constraints

- No build step — raw HTML/CSS/JS only; no npm, no bundler
- All user-supplied strings rendered in innerHTML must pass through `esc()`
- `apiFetch(path, opts)` always sends `Authorization: token` header
- PocketBase access rule base: `@request.auth.id != "" && @request.auth.approved = true`
- CSS uses design tokens from `:root` — no hardcoded hex colors outside the token block
- Fonts: Newsreader (display/headings) + Schibsted Grotesk (UI/body)
- Family name throughout: "Kelsall"
- Working directory for all commands: `/home/james/projects/family-reunion`
- Tests: `node --test helpers.test.js` and `node --test merge.test.js`
- Commit after every task with `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`
- Branch admins do NOT see site-admin capabilities (account approvals, album creation, global admin toggle)
- Site admins see the regular Admin Panel; branch admins see Branch Admin screen; users who are both see both

---

### Task 1: Migration — branch_admins collection

**Files:**
- Create: `backend/pb_migrations/1718500010_add_branch_admins.js`

**Interfaces:**
- Produces: `branch_admins` collection with fields: `user` (→users), `branch` (text)
- Site admins can CRUD; any logged-in approved user can read their own records

- [ ] **Step 1: Write migration**

Create `/home/james/projects/family-reunion/backend/pb_migrations/1718500010_add_branch_admins.js`:

```js
/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const users = dao.findCollectionByNameOrId("users");
  const APPROVED = '@request.auth.id != "" && @request.auth.approved = true';
  const IS_ADMIN = '@request.auth.family_admin = true';
  const IS_SELF  = 'user = @request.auth.id';

  const branch_admins = new Collection({
    name: "branch_admins", type: "base",
    listRule:   `${APPROVED} && (${IS_ADMIN} || ${IS_SELF})`,
    viewRule:   `${APPROVED} && (${IS_ADMIN} || ${IS_SELF})`,
    createRule: `${APPROVED} && ${IS_ADMIN}`,
    updateRule: `${APPROVED} && ${IS_ADMIN}`,
    deleteRule: `${APPROVED} && ${IS_ADMIN}`,
    schema: [
      { name:"user",   type:"relation", required:true, options:{ collectionId:users.id, maxSelect:1, cascadeDelete:true } },
      { name:"branch", type:"text",     required:true }
    ]
  });
  dao.saveCollection(branch_admins);
}, (db) => {
  const dao = new Dao(db);
  dao.deleteCollection(dao.findCollectionByNameOrId("branch_admins"));
});
```

- [ ] **Step 2: Verify**

```bash
ls /home/james/projects/family-reunion/backend/pb_migrations/1718500010_add_branch_admins.js
```

- [ ] **Step 3: Commit**

```bash
git add backend/pb_migrations/1718500010_add_branch_admins.js
git commit -m "feat(branch-admins): migration for branch_admins collection

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Branch admin state + NAV wiring

**Files:**
- Modify: `app.js`
  - Add `currentBranches` global, `branchPendingCount` global
  - Add `loadBranchAdminState()` function
  - Add branch admin NAV entry
  - Call `loadBranchAdminState()` in `enterApp()`
  - Update `renderSidebar()` to show Branch Admin item when `isBranchAdmin()` is true

**Interfaces:**
- Produces: `currentBranches` — `null` (unloaded) | `string[]` (branch names this user admins)
- Produces: `branchPendingCount` — number of pending claims in user's branches
- Produces: `isBranchAdmin()` — returns `currentBranches && currentBranches.length > 0`
- Produces: `loadBranchAdminState()` — async, sets `currentBranches` and `branchPendingCount`
- Consumes: `userId`, `apiFetch`, `renderSidebar` (existing)

- [ ] **Step 1: Add globals after existing globals**

In `app.js`, after `let pendingCount = 0;` (around line 15), add:

```js
let currentBranches = null;  // null = not loaded; [] = not branch admin; ['Kelsall'] = branch admin
let branchPendingCount = 0;
```

- [ ] **Step 2: Add branch admin NAV entry**

In `app.js`, in the `NAV` array, add after the `admin` entry:

```js
  { tab:'branchadmin', label:'Branch Admin', ico:'⚐', branchAdminOnly:true, badge:() => branchPendingCount },
```

- [ ] **Step 3: Add loadBranchAdminState and isBranchAdmin functions**

After `async function refreshPending(){...}` (around line 117), add:

```js
function isBranchAdmin(){ return !!(currentBranches && currentBranches.length > 0); }

async function loadBranchAdminState(){
  if (!userId) { currentBranches = []; branchPendingCount = 0; return; }
  try {
    const res = await apiFetch(`/api/collections/branch_admins/records?filter=${encodeURIComponent(`(user="${userId}")`)}` + `&perPage=50`);
    currentBranches = res.ok ? (await res.json()).items.map(r => r.branch) : [];
  } catch { currentBranches = []; }

  if (currentBranches.length === 0) { branchPendingCount = 0; return; }
  try {
    // Count pending claims for persons in this branch
    const branchFilter = currentBranches.map(b => `person.family_name="${b}"`).join('||');
    const res = await apiFetch(`/api/collections/person_claims/records?filter=${encodeURIComponent(`(status="pending" && (${branchFilter}))`)}&perPage=1`);
    branchPendingCount = res.ok ? (await res.json()).totalItems || 0 : 0;
  } catch { branchPendingCount = 0; }
}
```

- [ ] **Step 4: Call loadBranchAdminState in enterApp**

In `app.js`, find `async function enterApp(){` and add the call:

Change:
```js
  await Promise.all([refreshUnread(), refreshPending()]);
```

To:
```js
  await Promise.all([refreshUnread(), refreshPending(), loadBranchAdminState()]);
```

- [ ] **Step 5: Update renderSidebar to conditionally show Branch Admin item**

In `renderSidebar()`, change the NAV filter line from:

```js
  const items = NAV.filter(n => !n.adminOnly || (currentUser && currentUser.family_admin));
```

To:

```js
  const items = NAV.filter(n => {
    if (n.adminOnly) return currentUser && currentUser.family_admin;
    if (n.branchAdminOnly) return isBranchAdmin() && !(currentUser && currentUser.family_admin);
    return true;
  });
```

(Site admins see the regular Admin Panel, not the Branch Admin item — they already have full access.)

- [ ] **Step 6: Run tests**

```bash
node --test helpers.test.js && node --test merge.test.js
```

Expected: `# pass 10`, `# pass 3`, `# fail 0`.

- [ ] **Step 7: Commit**

```bash
git add app.js
git commit -m "feat(branch-admins): globals, loadBranchAdminState, NAV entry, sidebar wiring

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Branch Admin screen (SCREENS.branchadmin)

**Files:**
- Modify: `app.js` — add `SCREENS.branchadmin` function
- Modify: `app.css` — no new styles needed (reuses `.admin-*`, `.admin-table`, `.stat-card`)

**Interfaces:**
- Consumes: `currentBranches`, `isBranchAdmin()`, `adminApproveClaim()`, `adminDenyClaim()` (from tree-node-registration plan)
- Consumes: `apiFetch`, `mountMain`, `openPersonForm` (existing)
- Produces: `SCREENS.branchadmin(params)` — shows claims + persons for this user's branches

- [ ] **Step 1: Add SCREENS.branchadmin**

In `app.js`, before the `// ── Placeholder screens` comment, add:

```js
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
             <td>${esc(p.display_name || '—')}${p.birth_date ? ' · ' + p.birth_date.slice(0,4) : ''}</td>
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
    ? `<div class="admin-section">Persons — ${currentBranches.join(', ')} branch${currentBranches.length > 1 ? 'es' : ''}</div>
       <div class="admin-table-wrap"><table class="admin-table">
         <thead><tr><th>Name</th><th>Branch</th><th>Born</th><th>Account</th><th></th></tr></thead>
         <tbody>${persons.map(p => `<tr>
           <td>${esc(p.display_name)}</td>
           <td>${esc(p.family_name || '—')}</td>
           <td>${esc((p.birth_date || '').slice(0,4) || '—')}</td>
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
```

- [ ] **Step 2: Update adminApproveClaim and adminDenyClaim to refresh branch state**

In `app.js`, find `adminApproveClaim` and add `await loadBranchAdminState(); renderSidebar();` before `SCREENS.admin()`:

```js
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
```

- [ ] **Step 3: Run tests**

```bash
node --test helpers.test.js && node --test merge.test.js
```

Expected: `# pass 10`, `# pass 3`, `# fail 0`.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat(branch-admins): SCREENS.branchadmin — claims + persons for branch

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Site admin — Branches tab

**Files:**
- Modify: `app.js` — add Branches tab to `SCREENS.admin`; add `openAssignBranchAdmin(branch)`, `saveBranchAdmin(branch)`, `removeBranchAdmin(recordId)` functions

**Interfaces:**
- Consumes: `branch_admins` collection via `apiFetch`
- Consumes: `persons` collection to get distinct `family_name` values
- Consumes: `openModal`, `closeModal`, `formErr`, `val`, `el`, `toast` (existing)
- Produces: `openAssignBranchAdmin(branch)` — modal to pick a user as branch admin
- Produces: `saveBranchAdmin(branch)` — creates `branch_admins` record
- Produces: `removeBranchAdmin(recordId)` — deletes `branch_admins` record

- [ ] **Step 1: Extend SCREENS.admin data fetching**

In `SCREENS.admin`, extend the parallel fetch to also load branch_admins and distinct persons family_names:

Add to the `Promise.all` call:
```js
      apiFetch('/api/collections/branch_admins/records?perPage=200&expand=user'),
      apiFetch('/api/collections/persons/records?perPage=500&fields=family_name'),
```

Add handling:
```js
    let branchAdminRecords = [], distinctBranches = [];
    if (baRes.ok) branchAdminRecords = (await baRes.json()).items || [];
    if (bnRes.ok) {
      const ps = (await bnRes.json()).items || [];
      distinctBranches = [...new Set(ps.map(p => (p.family_name || '').trim()).filter(Boolean))].sort();
    }
```

- [ ] **Step 2: Add Branches section to admin HTML**

After the all-members table in `SCREENS.admin`, add:

```js
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
```

- [ ] **Step 3: Add branch admin management functions**

After `adminToggleAdmin` in `app.js`, add:

```js
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

function selectBranchAdminUser(userId, label){
  const inp = el('ba-user-id'); if (inp) inp.value = userId;
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
```

- [ ] **Step 4: Run tests**

```bash
node --test helpers.test.js && node --test merge.test.js
```

Expected: `# pass 10`, `# pass 3`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "feat(branch-admins): site admin Branches tab — assign/remove branch admins

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Deploy + smoke test

- [ ] **Step 1: Push + deploy**

```bash
git push origin main
/home/james/.fly/bin/fly deploy --config /home/james/projects/family-reunion/backend/fly.toml
```

Expected: Fly deploy exits `✔ Machine ... is now in a good state`.

- [ ] **Step 2: Smoke test (manual)**

1. Sign in as james@klsll.com → Admin Panel → Branches tab
2. Confirm distinct family names from the tree appear (e.g., "Kelsall")
3. Click Assign for "Kelsall" → search for jma8chz@gmail.com → select → Assign
4. Confirm Branches tab shows james as Kelsall branch admin
5. Sign in as jma8chz@gmail.com — confirm "Branch Admin" appears in sidebar (not "Admin Panel")
6. Click Branch Admin → confirm it shows the Kelsall branch claims and persons
7. Sign back in as james@klsll.com — confirm "Admin Panel" shows (not "Branch Admin"), and both persons and claims are visible there too
8. In Admin Panel → Branches → Remove jma8chz — confirm removed and sidebar clears on next login

- [ ] **Step 3: Commit (deploy tag)**

```bash
git commit --allow-empty -m "chore: branch admins deployed

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
