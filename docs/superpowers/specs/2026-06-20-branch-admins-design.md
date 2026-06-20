# Branch Admins Design

**Goal:** Two-tier admin system — site admins (existing `family_admin` flag) with full access, and branch admins scoped to a specific family branch (defined by `persons.family_name`).

**Architecture:** New `branch_admins` join table maps users to branch names. Branch admins get a scoped view of the admin panel — only their branch's persons and claims. Site admins manage branch admin assignments.

**Tech Stack:** PocketBase migration, raw JS/CSS, existing patterns.

---

## Global Constraints

- No build step — raw HTML/CSS/JS only
- All user-supplied strings pass through `esc()`
- `apiFetch` always sends `Authorization: token`
- PocketBase access rule base: `@request.auth.id != "" && @request.auth.approved = true`
- Design tokens from `:root` — no hardcoded colors
- Fonts: Newsreader (display) + Schibsted Grotesk (UI)
- Family name: "Kelsall"

---

## Permission Tiers

| Capability | Regular member | Branch admin | Site admin |
|---|---|---|---|
| View all content | ✅ | ✅ | ✅ |
| Create events | ✅ | ✅ | ✅ |
| Edit their own events | ✅ | ✅ | ✅ |
| Approve/deny person claims (their branch) | ❌ | ✅ | ✅ |
| Edit persons (their branch) | ❌ | ✅ | ✅ |
| Approve new accounts | ❌ | ❌ | ✅ |
| Create albums | ❌ | ❌ | ✅ |
| Manage branch admin assignments | ❌ | ❌ | ✅ |
| Grant/revoke site admin | ❌ | ❌ | ✅ |

---

## Data Model

### `branch_admins` collection
| Field | Type | Notes |
|---|---|---|
| `user` | relation →users, required | |
| `branch` | text, required | Matches `persons.family_name` value |

**Access rules:**
- `listRule` / `viewRule`: `@request.auth.id != "" && (@request.auth.family_admin = true || user = @request.auth.id)`
- `createRule` / `updateRule` / `deleteRule`: `@request.auth.family_admin = true` (site admin only)

### Helper: `isBranchAdmin()`
Frontend JS function: fetches `branch_admins` records where `user = currentUser.id`; caches result as `currentBranches` (array of branch name strings). Returns true if array non-empty.

---

## UI Changes

### Sidebar
- Branch admins see a new "Branch Admin" nav item (below Admin Panel, above Settings) that navigates to `SCREENS.branchadmin`
- Site admins already see "Admin Panel" — no change

### `SCREENS.branchadmin` (new screen for branch admins)
Two-section layout:

**Claims section** (visible to branch admins and site admins):
- Lists `person_claims` with `status = pending` where `person.family_name` is in `currentBranches`
- Approve / Deny buttons (same logic as site admin claims tab)

**Persons section** (branch admin view):
- Table of `persons` where `family_name` is in `currentBranches`
- Edit button per row → opens the existing person edit modal

### Admin Panel additions (site admin only)

New "Branches" tab in the admin panel:
- Lists every distinct `family_name` value in `persons` collection
- Each row: branch name, current branch admin (name or "Unassigned"), "Assign" button → modal to pick a user from approved members
- Assign → creates `branch_admins` record; Remove → deletes it

---

## Frontend State

```js
let currentBranches = null; // null = not loaded; [] = not a branch admin; ['Kelsall'] = branch admin

async function loadBranchAdminState() {
  if (!currentUser) { currentBranches = []; return; }
  const res = await apiFetch(`/api/collections/branch_admins/records?filter=${encodeURIComponent(`(user="${userId}")`)}` );
  currentBranches = res.ok ? (await res.json()).items.map(r => r.branch) : [];
}

function isBranchAdmin() { return currentBranches && currentBranches.length > 0; }
```

Called once after `enterApp()`. Result used to conditionally show Branch Admin nav item and scope admin queries.

---

## Navigation

```js
{ tab:'branchadmin', label:'Branch Admin', ico:'⚐',
  branchAdminOnly: true, badge: () => branchPendingCount }
```

Shown when `isBranchAdmin()` is true (and user is not site admin, to avoid duplication — site admins manage branches from the main Admin Panel).
