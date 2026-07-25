# backfill_tree — one-time `trees` backfill

Creates the initial `trees` records and stamps existing `persons`/
`branch_admins`/`users` data with `tree`/`home_tree`/`admin_trees`, so that
Phase 3 (tree-scoped PocketBase rules, see `.claude/plans` in this repo's
history — or ask whoever ran this) has zero null `tree` values to worry
about. **Not** a PocketBase migration — this is a one-time production data
operation, run once against the live API with admin credentials, same
pattern as `tools/gedcom_sync`.

## What it does

1. Groups all `persons` by `birth_surname` (falling back to `family_name`
   where blank) — this is the stable "family line" grouping, not the mutable
   married/current surname.
2. Creates one `trees` record per distinct surname group (matched by exact
   `trees.surname` string on re-run, so it's safe to run more than once).
3. Stamps `persons.tree` for every grouped person.
4. Re-triggers `backend/pb_hooks/couples_tree_link.pb.js` for every existing
   `couples` record (a no-op `status` PATCH) so cross-tree marriages that
   already exist in the data get `trees.linked_trees` populated — the hook
   only fires on couples create/update, so this step is required even though
   step 3 alone stamps every person.
5. Migrates `branch_admins.branch` (free text) → `branch_admins.tree`,
   matching against the trees created in step 2.
6. Sets `users.home_tree` for already-linked users (fill-blank only, never
   overwrites an existing value).
7. Sets `users.admin_trees` for existing branch admins (unions in, never
   overwrites/removes).

Every write compares current-vs-target before patching — the whole script is
idempotent and safe to interrupt (Ctrl-C) and re-run.

## Usage

```bash
export PB_ADMIN_EMAIL="james@klsll.com"
export PB_ADMIN_PASSWORD="<pocketbase admin pw>"   # 1Password: Reunion Pocketbase

pip install -r requirements.txt
python3 backfill_tree.py --pb-url https://reunion-api.klsll.com --dry-run
# inspect the counts, then:
python3 backfill_tree.py --pb-url https://reunion-api.klsll.com
```

**Never run this against prod first.** Run it against a dev PocketBase
instance loaded with a prod snapshot, verify the gate below, and only then
run it for real against prod.

## Verification gate (must all pass before any tree-scoped rule ships)

1. `GET /api/collections/persons/records?perPage=1&filter=(tree=null||tree="")`
   → `totalItems` must be `0`. Nonzero means some persons had neither
   `birth_surname` nor `family_name` set — resolve manually.
2. Every `couples` record's `partner_a`/`partner_b` resolve to a person with
   a non-null `tree`.
3. `GET /api/collections/branch_admins/records?perPage=1&filter=(tree=null)`
   → `totalItems` must be `0`, and no `branch_admins_unmatched` count from
   the run above (a mismatched free-text `branch` value needs manual
   reconciliation).
4. For a known pre-existing cross-surname marriage, confirm both trees list
   each other in `linked_trees`.
5. Re-run with `--dry-run`: all `*_updated`/`*_created` counts should be `0`,
   all `*_noop`/`*_matched` counts nonzero.

## Local unit tests

```bash
pip install -r requirements.txt   # or just: pip install pytest
python3 -m pytest test_backfill_tree.py -q
```
