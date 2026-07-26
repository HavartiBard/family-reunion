# backfill_community_tree — one-time community-layer `tree` backfill

Stamps `tree` onto every currently-untreed `news`/`events`/`albums` record,
and repoints the 3 `svc-*` service-account users onto a dedicated,
deliberately unlinked "Service Accounts" tree. **Not** a PocketBase
migration — this is a one-time production data operation, run once against
the live API with admin credentials, same pattern as `tools/backfill_tree`.

Part of Phase 6 (community-layer tree scoping — see `.claude/plans` in this
repo's history), which extends the existing persons/couples tree isolation
to `news`/`events`/`albums`/`photos`/`event_rsvps`/`comments`, prompted by a
real bug: a user added to a genealogically-unrelated tree could still see
another family's event, its photos, and every other user in the directory.

## What it does

1. Resolves `--target-tree` by **exact** `trees.name` match against real
   data — fails loud (exit 2) if it doesn't exist, never guesses or
   auto-creates it. Unlike `persons` (grouped by `birth_surname`), community
   records have no natural per-record grouping key, so every existing
   untreed record goes to this single explicit tree.
2. Stamps `tree` on every `news`/`events`/`albums` record that doesn't
   already have one (fill-blank only — never overwrites an already-set
   `tree`).
3. Resolves-or-creates a `trees` record named "Service Accounts" (matched by
   exact name on re-run, so safe to run more than once) — deliberately never
   linked to any real tree via `linked_trees`.
4. Repoints `home_tree` for every `users` record whose email ends in
   `@reunion.local` (the `gedcom_sync`/`ai_research_mcp`/`photos_sync`
   service accounts) onto that Service Accounts tree, so the community-layer
   visibility hooks make them invisible to every real tree's scoped view
   while `family_admin` still sees them via the unconditional bypass.

Every write compares current-vs-target before patching — idempotent, safe
to interrupt and re-run.

## Usage

```bash
export PB_ADMIN_EMAIL="james@klsll.com"
export PB_ADMIN_PASSWORD="<pocketbase admin pw>"   # 1Password: Reunion Pocketbase

pip install -r requirements.txt
python3 backfill_community_tree.py --pb-url https://reunion-api.klsll.com --target-tree Kelsall --dry-run
# inspect the counts, then:
python3 backfill_community_tree.py --pb-url https://reunion-api.klsll.com --target-tree Kelsall
```

**Never run this against prod first.** Run it against dev, verify the gate
below, and only then run it for real against prod.

## Verification gate

1. `GET /api/collections/news/records?perPage=1&filter=(tree=null||tree="")`
   → `totalItems` must be `0` (repeat for `events`, `albums`).
2. `GET /api/collections/trees/records?perPage=1&filter=(name="Service Accounts")`
   → exists, `totalItems` = `1`.
3. Every `users` record with an email ending in `@reunion.local` has
   `home_tree` set to that tree's id.
4. Re-run with `--dry-run`: all `*_updated`/`*_created` counts should be `0`,
   all `*_noop`/`*_matched` counts nonzero.

## Local unit tests

```bash
pip install -r requirements.txt   # or just: pip install pytest
python3 -m pytest test_backfill_community_tree.py -q
```
