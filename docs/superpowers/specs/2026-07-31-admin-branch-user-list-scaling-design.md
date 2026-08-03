# Admin Panel: Branch & User List Scaling

## Context

James flagged that the Admin panel is going to get unwieldy as more people/branches are added: the branch (trees) list and the "All members" list are both flat, unpaginated tables with no search. This is the first of several admin-section improvements discussed (pending-approval notifications, service-account separation, and a stats dashboard were also raised, but scoped out as separate future passes — see Non-goals).

Current state, confirmed by code survey:
- `SCREENS.admin` (`app.js:6669-6777`) is one monolithic function rendering 5 blocks inline: stat-card strip, pending approvals table, tree-claims table, all-members table, branches table.
- The members fetch (`app.js:6678`) is `users?filter=(approved=true)&perPage=200&sort=name` — a flat, uncapped-in-the-UI query that silently truncates past 200 rows, with no search/filter/pagination control anywhere.
- The pending-users fetch (`app.js:6677`) is the same pattern at `perPage=100`.
- The branches table (`app.js:6756-6775`) iterates all `trees` (fetched `perPage=200`) and for each tree does a client-side linear scan of `branchAdminRecords` to find its assigned admin (`app.js:6761`) — O(trees × branch_admins) per render, all client-side.
- No table shows branch member counts or `linked_trees` (in-law connections) today.
- The 3 `svc-*` service accounts (`svc-gedcom-sync@reunion.local`, `svc-ai-research@reunion.local`, `svc-photos-sync@reunion.local`) are `approved=true`/`family_admin=true` per CLAUDE.md, so they currently appear mixed into the "All members" table with no visual distinction.

## Decisions (brainstormed with James, 2026-07-31)

**Admin screen splits into sub-tabs**, replacing the single monolithic render: **Pending Approvals**, **Members**, **Branches**, **Service Accounts**. Tree claims stays as its own existing table, untouched — it isn't part of the scaling problem. The stat-card strip at the top of the Admin screen stays as a shared summary across all tabs. Each tab gets its own render function and its own independent data-fetching — switching tabs doesn't trigger fetches for tabs not currently in view.

**Query strategy: fully server-driven (not fetch-all-then-filter).** Every list (Members, Branches) re-queries PocketBase on each search/filter/page change using `filter`/`sort`/`page`/`perPage` params, mirroring the existing debounced-search pattern already in use for branch-admin assignment (`searchBranchAdminUser`, `app.js:6832-6846`). This was chosen over client-side fetch-all-then-filter specifically because that approach reintroduces the exact "silent undercount past `perPage`" bug already flagged elsewhere in this codebase (the `event_availability` counter gotcha in CLAUDE.md) — once a list's true size exceeds the page cap, a client-side filter would silently miss rows with no error. A hybrid (server pagination + client-side filter on just the current page) was also rejected: search would only ever search the page currently being viewed, which is misleading for an admin trying to locate one person in a large list.

### Pending Approvals tab
No functional change from today's table — same columns, same Approve/Deny actions. Stays a dedicated, always-visible tab (not folded into Members' status filter) because it's action-oriented and naturally small; it is not the list that's "going to become unwieldy."

### Members tab
Replaces the "All members" table (`app.js:6748-6754`).
- **Search box**, debounced, matching `name`/`email` via PocketBase `~` filter — same UX pattern as `searchBranchAdminUser`.
- **Role filter**: All / Admin / Regular.
- **Status filter**: All / Approved / Pending. This is a *filter view* over the same Members table, not a replacement for the Pending Approvals tab — Pending Approvals remains the action-oriented surface; Status=Pending here is just a way to browse/search within pending users too.
- Search + Role + Status combine into a single server-side `filter` string sent with each query.
- **`svc-*` accounts always excluded** from this tab's results regardless of filter selection (`email !~ "svc-"` always ANDed in), since they get their own tab.
- **Numbered pagination**: prev/next + page number controls, default page size 25, using PocketBase's native `page`/`perPage` params.
- Columns unchanged from today: Name / Email / Joined / Role / Action (make/remove admin, "You" on self-row).

### Branches tab
Replaces the trees table (`app.js:6756-6775`).
- **Search box** filtering `trees.name`.
- **Numbered pagination**, same style/page-size default as Members.
- **New column: member count** — count of `persons` (and/or `users.home_tree`, see Implementation notes) belonging to that tree. Computed via a `perPage=1` count query per tree (PocketBase returns `totalItems` even at `perPage=1`), batched with `Promise.all`, run only for the trees on the currently-displayed page — bounded regardless of total tree count.
- **New column: linked trees** — names of trees connected via `trees.linked_trees` (in-law marriage links), currently invisible in the admin UI.
- **Branch-admin lookup fix**: replaces the client-side `.find()` scan over all `branch_admins` with a single scoped query, `branch_admins?filter=(tree ?~ "<id1>" || tree ?~ "<id2>" || ...)`, built from just the tree IDs on the current page — eliminates the O(trees × branch_admins) full scan.
- Existing Assign/Remove branch-admin modal flow (`openAssignBranchAdmin` etc., `app.js:6814-6876`) is unchanged.

### Service Accounts tab
New. Small, deliberately **unpaginated** (bounded at exactly 3 accounts today — `svc-gedcom-sync`, `svc-ai-research`, `svc-photos-sync`). Shows name/email/which dedicated tree ("Service Accounts") each is pinned to. No search/filter chrome (not needed at this size), no actions — these accounts are managed exclusively by `tools/*` scripts per CLAUDE.md, not through the Admin UI.

## Non-goals

- **Pending-approval notifications** (in-portal alert beyond the existing nav badge, and/or email to admins on new registration) — real gap, but a separate feature with its own design (needs pb_hooks + possibly PocketBase mailer config). Not part of this pass.
- **Statistics dashboard** (branch activity, invite-to-join conversion funnel, photo/event stats) — separate, larger feature requiring new backend aggregation. Not part of this pass. The existing 4-stat-card strip at the top of the Admin screen is left as-is.
- **Reconciling the two different "branch" concepts** — `SCREENS.home`'s branch count derives from distinct `persons.family_name` strings (`app.js:989/996`), while this Admin redesign counts actual `trees` records. These can disagree today; reconciling them is out of scope here (noted as a discrepancy worth a future look, not fixed now).
- No change to the Tree Claims table, the Assign/Remove branch-admin modal's own search, or `SCREENS.branchadmin` (the scoped-down non-family_admin view) — none of these were flagged as part of the scaling problem.
- No change to the 4-stat-card summary strip's contents or computation.

## Implementation notes

- `SCREENS.admin` (`app.js:6669-6777`) is restructured into a tab container plus 4 tab-render functions (e.g. `_renderAdminPending`, `_renderAdminMembers`, `_renderAdminBranches`, `_renderAdminServiceAccounts`), each owning its own fetch. A simple in-memory `adminActiveTab` (or reuse whatever local tab-state pattern this app already uses elsewhere, if any) drives which one renders; switching tabs re-invokes only that tab's render/fetch.
- Members query filter is built incrementally: base `approved=true` semantics dropped in favor of the Status filter directly controlling `approved` (All = no clause, Approved = `approved=true`, Pending = `approved=false`), Role filter adds `family_admin=true`/`family_admin=false`, search adds `(name~"q" || email~"q")`, and `email !~ "svc-"` is always ANDed in. All joined with `&&`.
- Branch member count = count of `persons` with `tree=X` (a `perPage=1` count query, `totalItems` field). `persons.tree` is this codebase's primary tenancy field (CLAUDE.md's data model section); `users.home_tree` is a secondary/derived reference used for auth scoping, not the natural "how big is this branch" metric — a branch can have many genealogical `persons` records for relatives who never registered a `users` account. Not shown as a separate `users.home_tree` count in this pass.
- Pagination UI: reuse or introduce one shared prev/next-plus-page-number component/markup pattern for both Members and Branches tabs, since they need identical behavior — avoid duplicating the same markup/logic twice within the same screen.
- CSS: extend `.admin-table`/`.admin-section` (`app.css:805-818`) rather than introducing a parallel table style; add whatever minimal pagination/tab-nav classes are needed, consistent with existing `app.css` conventions (no new design system).

## Testing

- `node --test helpers.test.js` / `node --test merge.test.js` — unaffected, but run as a baseline sanity check since this touches `app.js` broadly.
- `node --check app.js` (no automated test coverage exists for screen rendering in this codebase, consistent with how other `app.js` UI changes in this project have been verified).
- Real-browser pass (Camoufox, per this project's established pattern) covering: switching between all 4 tabs, Members search/role/status filter combinations, Members pagination across a page boundary, Branches search, Branches pagination, a branch with 0 vs. several linked trees, and confirming the 3 service accounts appear only in their own tab and never in Members.
