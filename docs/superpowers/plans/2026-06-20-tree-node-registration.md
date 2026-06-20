# Tree Node Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After registration, let users search for themselves in the family tree and either claim an existing person node (pending admin approval) or auto-create a new one linked immediately to their account.

**Architecture:** New `person_claims` PocketBase collection tracks pending/approved/denied claims. `doRegister()` is updated to call a new `showTreeClaimStep()` instead of `showPending()`. Admin panel gets a Claims tab. Approved/denied claims create notifications.

**Tech Stack:** PocketBase JS migration, raw HTML/CSS/JS, existing patterns.

## Global Constraints

- No build step — raw HTML/CSS/JS only; no npm, no bundler
- All user-supplied strings rendered in innerHTML must pass through `esc()`
- `apiFetch(path, opts)` always sends `Authorization: token` header (do not use `fetch` directly for authenticated calls)
- PocketBase access rule base: `@request.auth.id != "" && @request.auth.approved = true` (abbreviated `APPROVED`)
- CSS uses design tokens from `:root` — no hardcoded hex colors outside the token block
- Fonts: Newsreader (display/headings) + Schibsted Grotesk (UI/body)
- Family name throughout: "Kelsall"
- Working directory for all commands: `/home/james/projects/family-reunion`
- Tests: `node --test helpers.test.js` and `node --test merge.test.js`
- Commit after every task with `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`

---

### Task 1: Migration — person_claims collection

**Files:**
- Create: `backend/pb_migrations/1718500009_add_person_claims.js`

**Interfaces:**
- Produces: `person_claims` collection with fields: `person` (→persons), `user` (→users), `status` (select: pending/approved/denied), `note` (text)
- Access: claimant can read their own; site admins read/write all; unapproved users can create (needed during registration)

- [ ] **Step 1: Write migration**

Create `/home/james/projects/family-reunion/backend/pb_migrations/1718500009_add_person_claims.js`:

```js
/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const users   = dao.findCollectionByNameOrId("users");
  const persons = dao.findCollectionByNameOrId("persons");

  const OWN_OR_ADMIN = '@request.auth.id != "" && (user = @request.auth.id || @request.auth.family_admin = true)';

  const claims = new Collection({
    name: "person_claims", type: "base",
    listRule:   OWN_OR_ADMIN,
    viewRule:   OWN_OR_ADMIN,
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.family_admin = true',
    deleteRule: '@request.auth.family_admin = true',
    schema: [
      { name:"person", type:"relation", required:true, options:{ collectionId:persons.id, maxSelect:1, cascadeDelete:true  } },
      { name:"user",   type:"relation", required:true, options:{ collectionId:users.id,   maxSelect:1, cascadeDelete:true  } },
      { name:"status", type:"select",   required:true, options:{ maxSelect:1, values:["pending","approved","denied"] } },
      { name:"note",   type:"text" }
    ]
  });
  dao.saveCollection(claims);
}, (db) => {
  const dao = new Dao(db);
  dao.deleteCollection(dao.findCollectionByNameOrId("person_claims"));
});
```

- [ ] **Step 2: Verify file exists**

```bash
ls /home/james/projects/family-reunion/backend/pb_migrations/1718500009_add_person_claims.js
```

Expected: file listed.

- [ ] **Step 3: Commit**

```bash
git add backend/pb_migrations/1718500009_add_person_claims.js
git commit -m "feat(claims): migration for person_claims collection

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: CSS for tree claim step

**Files:**
- Modify: `app.css` — add styles for the claim search step (full-screen centered layout matching auth screens)

**Interfaces:**
- Produces: `.claim-step` (full-screen wrapper), `.claim-box` (max-width 480px card), `.claim-result` (person row), `.claim-result:hover`

- [ ] **Step 1: Append claim-step styles to app.css**

Add after the last CSS block (after `.admin-table-wrap`):

```css
/* ── Tree claim step (post-registration) ─────────────────────────────── */
.claim-step{min-height:100vh;display:flex;align-items:center;justify-content:center;
  padding:24px;background:var(--bg-app)}
.claim-box{width:100%;max-width:480px;background:var(--bg-card);border-radius:16px;
  border:1px solid var(--border-default);padding:2rem;box-shadow:var(--shadow-hover)}
.claim-box h2{font-family:var(--font-display);font-size:1.5rem;margin-bottom:.4rem}
.claim-box .sub{color:var(--text-secondary);font-size:.88rem;margin-bottom:1.25rem}
.claim-result{display:flex;align-items:center;gap:.75rem;padding:.6rem .75rem;border-radius:10px;
  cursor:pointer;border:1px solid var(--border-default);background:var(--bg-card);margin-bottom:.35rem}
.claim-result:hover{background:var(--bg-hover)}
.cr-name{font-size:.9rem;font-weight:600}
.cr-sub{font-size:.8rem;color:var(--text-secondary)}
```

- [ ] **Step 2: Run tests**

```bash
node --test helpers.test.js
```

Expected: `# pass 10`, `# fail 0`.

- [ ] **Step 3: Commit**

```bash
git add app.css
git commit -m "feat(claims): CSS for tree claim step

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Tree claim step JS — post-registration flow

**Files:**
- Modify: `app.js`
  - Update `doRegister()` — call `showTreeClaimStep(first, last)` instead of `showPending()`
  - Add `showTreeClaimStep(first, last)` function
  - Add `_claimSearchTimer`, `runClaimSearch(first, last)`, `submitClaim(personId)`, `skipClaim(first, last)` functions

**Interfaces:**
- Consumes: `token`, `userId`, `currentUser` (globals, set by `setSession` before this runs)
- Consumes: `filterPeople(people, query)` from helpers.js (window global)
- Consumes: `personInitials(p)`, `personYears(p)`, `esc()` from helpers.js
- Consumes: `apiFetch()`, `showPending()` (existing)
- Produces: `showTreeClaimStep(first, last)` — renders full-screen claim UI
- Produces: `skipClaim(first, last)` — creates new persons record, then calls `showPending()`
- Produces: `submitClaim(personId)` — creates person_claims record, then calls `showPending()`

- [ ] **Step 1: Update doRegister to call showTreeClaimStep**

In `app.js`, find `doRegister` and change its final lines from:

```js
    if (authRes.ok) { const ad = await authRes.json(); setSession(ad.token, ad.record); }
    showPending();
```

To:

```js
    if (authRes.ok) { const ad = await authRes.json(); setSession(ad.token, ad.record); }
    showTreeClaimStep(first, last);
```

- [ ] **Step 2: Add showTreeClaimStep and related functions**

Insert after the closing `}` of `doRegister` (before `async function doGoogleAuth`):

```js
let _claimAllPersons = [];
let _claimSearchTimer = null;

async function showTreeClaimStep(first, last){
  // Load all persons once for client-side search
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
        onclick="skipClaim('${esc(first)}','${esc(last)}')">
        I'm not in the tree yet — add me as new
      </button>
    </div>
  </div>`;

  // Run initial search with their name
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
    showPending('Your account is awaiting approval. An admin will also review your tree claim.');
  } catch (e) {
    const errEl = document.getElementById('claim-results');
    if (errEl) errEl.insertAdjacentHTML('afterbegin',
      `<div class="alert alert-error" style="margin-bottom:.5rem">${esc(e.message)}</div>`);
  }
}

async function skipClaim(first, last){
  try {
    const res = await apiFetch('/api/collections/persons/records', {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({
        display_name: `${first} ${last}`.trim(),
        given_name: first,
        family_name: last,
        living: true,
        linked_user: userId
      })
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Could not create tree entry'); }
  } catch { /* non-fatal: tree entry creation is best-effort */ }
  showPending();
}
```

- [ ] **Step 3: Update showPending to accept an optional message**

Find `function showPending(){` and update its signature and message:

```js
function showPending(msg){
  clearInterval(rollerTimer);
  const text = msg || 'Your account was created and is waiting for a family admin to approve it. You\'ll get access once approved.';
  el('app').innerHTML = `<div class="auth-wrap"><div class="auth-form"><div class="box" style="text-align:center">
    <div style="font-size:2.5rem">⏳</div>
    <h1 style="font-family:var(--font-display);font-size:1.8rem;margin:.5rem 0">Awaiting approval</h1>
    <p class="sub">${esc(text)}</p>
    <button class="btn btn-outline" onclick="logout()">Sign out</button>
  </div></div></div>`;
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
git commit -m "feat(claims): post-registration tree claim step and skipClaim auto-create

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Admin panel — Claims tab

**Files:**
- Modify: `app.js` — extend `SCREENS.admin` to load and display pending claims; add `adminApproveClaim(claimId, personId, claimUserId)` and `adminDenyClaim(claimId, claimUserId)` functions

**Interfaces:**
- Consumes: `person_claims` collection via `apiFetch` with `expand=person,user`
- Consumes: `adminApprove`, `adminDeny` (existing, unchanged)
- Produces: `adminApproveClaim(claimId, personId, claimUserId)` — patches person.linked_user, sets claim.status=approved, creates notification
- Produces: `adminDenyClaim(claimId, claimUserId)` — sets claim.status=denied, creates notification

- [ ] **Step 1: Update SCREENS.admin to load claims**

In `app.js`, find `SCREENS.admin = async function(){` and update the parallel fetch block to also fetch claims:

Change:
```js
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
```

To (also add `let claims = [];` to the variable declarations above):
```js
    const [pRes, mRes, aRes, nRes, cRes] = await Promise.all([
      apiFetch('/api/collections/users/records?filter=(approved=false)&perPage=100&sort=created'),
      apiFetch('/api/collections/users/records?filter=(approved=true)&perPage=200&sort=name'),
      apiFetch('/api/collections/albums/records?perPage=1'),
      apiFetch('/api/collections/news/records?perPage=1'),
      apiFetch('/api/collections/person_claims/records?filter=(status="pending")&perPage=100&expand=person,user&sort=created')
    ]);
    if (pRes.ok) pending = (await pRes.json()).items || [];
    if (mRes.ok) { const d = await mRes.json(); members = d.items || []; }
    if (aRes.ok) albumCount = (await aRes.json()).totalItems || 0;
    if (nRes.ok) newsCount  = (await nRes.json()).totalItems || 0;
    if (cRes.ok) claims = (await cRes.json()).items || [];
```

- [ ] **Step 2: Add claims table to admin HTML**

In `SCREENS.admin`, after the pending approvals table and before the all-members section, add:

```js
    ${claims.length ? `<div class="admin-section">Tree claims (${claims.length} pending)</div>
    <div class="admin-table-wrap">
      <table class="admin-table">
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
      </table>
    </div>` : ''}
```

- [ ] **Step 3: Add adminApproveClaim and adminDenyClaim functions**

After the existing `adminToggleAdmin` function in `app.js`, add:

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
    SCREENS.admin();
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
git commit -m "feat(claims): admin panel claims tab with approve/deny and notifications

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Deploy + smoke test

- [ ] **Step 1: Push frontend + deploy backend**

```bash
git push origin main
/home/james/.fly/bin/fly deploy --config /home/james/projects/family-reunion/backend/fly.toml
```

Expected: Fly deploy exits `✔ Machine ... is now in a good state`.

- [ ] **Step 2: Smoke test (manual)**

1. Sign out and register a new test account (use a temporary email)
2. After account creation, confirm the "Are you in the family tree?" screen appears
3. Type your name — confirm person results appear from the tree
4. Click a person to claim — confirm pending screen with custom message
5. Sign in as james@klsll.com → Admin Panel → confirm "Tree claims" section shows the claim
6. Click Approve — confirm the person's `linked_user` is set (check PocketBase admin panel at `/_/`)
7. Sign back in as the test account → confirm notification "Your tree claim was approved"
8. Register a second test account, click "I'm not in the tree yet" — confirm pending screen and a new persons record created in PocketBase admin

- [ ] **Step 3: Commit (deploy tag)**

```bash
git commit --allow-empty -m "chore: tree-node registration deployed

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
