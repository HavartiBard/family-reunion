# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture

**Frontend:** SPA served by GitHub Pages at `reunion.klsll.com`. No build step, no bundler — raw HTML/CSS/JS split across:
- `index.html` — shell (head, `#app`, toast/modal anchors, script tags)
- `app.css` — all styles (design tokens, primitives, screen-specific)
- `app.js` — routing, auth, all screen renderers (`SCREENS.*`)
- `helpers.js` — pure, side-effect-free utilities (also importable in Node for tests)
- `merge.js` — merge logic (pure, no DOM, no network)

All API calls go to the `API` constant in `app.js` (`https://reunion-api.klsll.com`).

**Backend:** PocketBase, deployable two ways:
- **Fly.io (primary):** `backend/Dockerfile` + `backend/fly.toml`. Migrations are baked into the image at build time (`COPY pb_migrations /pb_migrations`). `pb_data` persists on a Fly Volume. Cloudflare DNS (grey cloud) points `reunion-api.klsll.com` → `family-reunion-api.fly.dev`; Fly handles TLS.
- **Homelab (fallback):** Docker Compose via `backend/compose.yml`. Optional cloudflared overlay (`compose.cloudflared.yml`) exposes PocketBase via a Cloudflare Tunnel using secrets from 1Password.

Schema is defined entirely in `backend/pb_migrations/`; migrations auto-apply on first run.

**`schema.removeField()` takes a field ID, not a name.** Several older migrations (e.g. `1718500006`/`1718500008`'s `removeField("rsvp")`) passed the field's *name* — this silently no-ops (removeField does nothing if no field has that literal ID) rather than erroring, so the migration "succeeds" with the field still live. `users.rsvp` sat unused in the schema for months as a result before being caught and fixed (`1718500025`); `branch_admins.branch` had the same bug fixed in `1718500024`. Correct pattern: `const f = collection.schema.getFieldByName("name"); if (f) collection.schema.removeField(f.id);`. Always verify a field-removal migration actually removed the field via the live API schema (not just a clean startup log) before trusting it.

Server-side hook logic (record lifecycle behavior that can't be expressed as a collection rule) lives in `backend/pb_hooks/`, loaded via `--hooksDir=/pb_hooks` (baked into the image via `COPY pb_hooks /pb_hooks` in `backend/Dockerfile`, mounted via `./pb_hooks:/pb_hooks` in `backend/compose.yml`). Like migrations, a hook change requires a redeploy (Fly: `fly deploy`; homelab: `docker compose restart pocketbase` after a rebuild) to take effect. PocketBase is pinned at `0.22.20` (see `backend/Dockerfile`), which uses the pre-0.23 JSVM hook API (`onRecordAfterCreateRequest`/`onRecordsListRequest`/etc., `record.get()`/`.set()`, `dao.saveRecord()`) — do not copy 0.23+-style hook examples (`e.app`, event-based naming) without adapting them.

**Admin tools:**
- `tools/gedcom_sync/` — a Python script that reads a Webtrees MariaDB (or a `.ged` file) and upserts into PocketBase. Run on the Unraid host where the `webtrees` Docker network is accessible. Stamps `persons.tree` on any newly-created person via the same `birth_surname`/`family_name` grouping logic as `tools/backfill_tree/` (duplicated, not shared — see that tool's own note).
- `tools/backfill_tree/` — one-time script (not a migration) that creates `trees` records and stamps existing `persons`/`branch_admins`/`users` data with `tree`/`home_tree`/`admin_trees`. Idempotent, `--dry-run` supported. Groups persons by `birth_surname` (falling back to `family_name`) — the stable "family line," not the mutable married surname.

## Data model

All collections gated behind `@request.auth.id != "" && @request.auth.approved = true` unless noted. Several collections are additionally scoped by tree membership via `backend/pb_hooks/` — see **Multi-tenant tree access control** below; the base PocketBase rules alone are intentionally broad.

- **`users`** — built-in PocketBase auth collection; `approved` (bool), `family_admin` (bool), `phone`, `birthday`, `privacy_settings` (json), `notification_prefs` (json), `home_tree` (→trees), `admin_trees` (→trees, multi). New registrants start `approved=false`. **Note:** `approved`, `phone`, and `birthday` were added directly through the PocketBase Admin UI at some point and are not created by any migration in this repo — `1718500022_add_users_approved_phone.js` backfills the first two (guarded, no-ops where they already exist); `birthday` still has this gap as of writing.
- **`persons`** — tree nodes: `display_name`, `given_name`, `family_name`, `gender`, `birth_date`, `death_date`, `living`, `bio`, `photo`, `linked_user` (→users), `father`/`mother` (self-referential → persons), `gedcom_id` (Webtrees xref), `middle_name`, `birth_surname`, `tree` (→trees).
- **`couples`** — `partner_a`/`partner_b` (→persons), `status` (married/divorced/partners/unknown), `married_date`. No `tree` field of its own — a couple can legitimately span two trees (that's how an in-law marriage creates a cross-tree link); visibility/writability is derived by looking up both partners' `persons.tree`.
- **`trees`** — a family-line/tenancy boundary: `name`, `surname` (grouping key), `color`, `description`, `root_person` (→persons), `created_by` (→users), `linked_trees` (→trees, multi — auto-maintained transitively-closed by `couples_tree_link.pb.js` whenever a couple spans two trees). Any approved user can view all trees; only `family_admin` can create/update/delete.
- **`branch_admins`** — `user` (→users), `branch` (legacy free-text surname, superseded but not yet removed), `tree` (→trees, multi — the actual scoping field). Assignment stays `family_admin`-only. `branch_admins_sync_admin_trees.pb.js` keeps the owning user's `users.admin_trees` in sync with this collection's `tree` values on every create/update/delete — every access-control hook reads `admin_trees` off the user record, never `branch_admins` directly.
- **`person_claims`** — the reviewed "this is me" flow: `person` (→persons), `user` (→users), `status` (pending/approved/denied), `note`. Approving/denying is `family_admin` or a branch admin whose `admin_trees` includes the claimed person's tree (rule widened broadly, precise per-claim scoping done in `person_claims_tree_scope.pb.js` — see below).
- **`person_facts`** — structured facts about a person: `person` (→persons), `fact_type` (large enum, includes sensitive types `ssn`/`national_id`/`medical`/`address`/`phone`/`email`/`website`/`residence`), `date_text`, `sort_year`, `place`, `value`, `description`, `source`, `ai_generated` (bool), `verified` (bool). Sensitive fact types are gated far more strictly than everything else — see below.
- **`news`** — `title`, `body`, `author` (→users).
- **`albums`** — `name`, `description`, `year`, `cover_photo` (file). Create/update/delete restricted to `family_admin`.
- **`photos`** — `album` (→albums, cascade delete), `image` (file), `caption`, `taken_date`, `uploader` (→users), `tagged_persons` (→persons, multi). Update/delete by uploader or admin.
- **`notifications`** — `user` (→users), `type` (select), `title`, `body`, `read` (bool), `related_id`, `related_type`. All rules scoped to `user = @request.auth.id`.
- **`events`** / **`event_rsvps`** / **`comments`** — reunion-community collections, intentionally left global (not tree-scoped) — see below.

## Multi-tenant tree access control

The site models multiple family lines ("trees") in one shared PocketBase instance. A user should not be aware of another tree's data unless a genealogical link exists (an in-law marriage connecting two trees via `couples`).

**Why hooks, not rules:** PocketBase 0.22.20's rule engine cannot evaluate a `?=` comparison against an `@request.auth.<relation field>` in *any* operand configuration — single-vs-multi, multi-vs-single, or a two-hop chain (`tree.linked_trees ?= @request.auth.home_tree`) all either silently match nothing or are rejected as invalid syntax. Confirmed empirically against the live binary; do not attempt rule-based tree scoping without re-verifying this first. Every collection's base `listRule`/`viewRule`/`createRule`/`updateRule` therefore stays at the old broad "approved user" permission, and `backend/pb_hooks/*_tree_visibility.pb.js` files narrow LIST/VIEW responses and reject BEFORE-write requests using plain JS logic instead — the same category of mechanism as `couples_tree_link.pb.js`/`users_privacy_redact.pb.js`.

**Roles:**
- **Trunk admin** (`users.family_admin = true`) — unconditional access everywhere, the escape hatch every hook checks first so this account can never be locked out by a bad rule/hook/backfill.
- **Branch admin** — scoped to `users.admin_trees` (kept in sync with `branch_admins.tree` by `branch_admins_sync_admin_trees.pb.js`). Full read/write within those trees; read-only elsewhere via a link.
- **Regular user** — scoped to `users.home_tree` for read/write, plus read-only visibility into trees reachable via `home_tree`'s own `linked_trees` (marriage links). Sensitive `person_facts` are visible/writable only on their own linked person, never via home_tree or a link.

**Superuser/admin-authenticated requests bypass everything** (PocketBase's own rule engine already does this; the hooks explicitly no-op when `e.httpContext.get('authRecord')` is null, to match rather than fight that). `tools/gedcom_sync`, `tools/ai_research_mcp`, and `tools/photos_sync` all authenticate as superuser today, so none of this scoping constrains them — a known, deliberate gap, not yet closed (migrating them to a scoped non-superuser service account is the fix, not yet done).

**Identity claiming** always goes through admin review (`person_claims`) — there is no instant self-link path anywhere, backend or frontend. `persons_tree_visibility.pb.js`'s before-update hook rejects a `linked_user` change from anyone who isn't `family_admin` or a branch admin of that person's tree, checked against the *persisted* value so unrelated edits to an already-linked person aren't false-positived.

**`expand` bypasses hooks — never trust it for privacy-gated fields.** Confirmed empirically: PocketBase resolves `?expand=someRelation` *after* the target collection's own `onRecordsListRequest`/`onRecordViewRequest` hooks run (`e.record.expand` is literally `undefined` at hook time), so `users_privacy_redact.pb.js` never fires for a `users` record pulled in via `expand` from a different collection (e.g. `persons/records/{id}?expand=linked_user`). A restricted user's `phone` leaked through exactly this path until fixed on the frontend by making a separate direct fetch instead of reading the sensitive field off the expand payload. There is no backend fix available — nothing to intercept at that point in the pipeline. Any future code that expands a relation to `users` (or any other collection with a privacy-redaction hook) for display purposes must re-fetch privacy-gated fields directly rather than trusting the embedded blob.

**Hook self-containment constraint:** every `onRecord*` callback in `backend/pb_hooks/` must be a single, fully self-contained closure — PocketBase's JSVM re-evaluates each registered callback in isolation and does not retain sibling top-level `const`/`function` declarations in the same file. Referencing one throws a `ReferenceError` at runtime, not at load time. Duplicate small pieces of logic inline per callback rather than sharing a helper; this bit real development twice on this project and is easy to reintroduce without noticing (no static check catches it — only exercising the actual hook does).

## Graph database (Neo4j): evaluated, not adopted — revisit triggers below

The person/couple/tree graph (`persons.father`/`.mother`, `couples`, `trees.linked_trees`) is exactly the kind of data a graph database is built for, and it's been evaluated twice: a cost/feasibility read (cheap, self-hostable, tooling exists) and, on 2026-07-26, an actual prototype — a throwaway `neo4j:5-community` container loaded with real dev data (79 persons/21 couples/24 trees) via Cypher. A single ad-hoc traversal query reproduced `couples_tree_link.pb.js`'s precomputed `linked_trees` result exactly, and a synthetic worst case (100 trees/5000 persons, a 99-hop marriage chain) resolved in 8ms server-side. Full methodology and results in `/home/james/.claude/plans/sunny-moseying-thacker.md` §7.

**Decision: not adopting now.** The tradeoff isn't really about query power — Neo4j clearly wins there — it's about what migrating would actually cost against what it would buy:

- **Cost side:** Neo4j has no native rule/auth system, so the tree-scoping + PII-gating logic in `backend/pb_hooks/*_tree_visibility.pb.js` (the bulk of this session's multi-tenant work) would either need reimplementing against Neo4j's model from scratch, or a dual-write bridge with PocketBase staying authoritative — two sources of truth to keep in sync, ongoing. Plus a second database to run, patch, and back up starting immediately. Plus a real rewrite of the tree-rendering frontend (~15+ merged width-first-layout PRs built directly against a flat PocketBase `persons`/`couples` fetch), which is actively-developed code, not stable legacy.
- **Benefit side:** nothing in the product today needs arbitrary-depth relationship queries. The one thing PocketBase's model genuinely can't do well is an ad-hoc "how are person X and person Y related" / relationship-path-finder feature — nobody has asked for that yet.

**Revisit triggers** (concrete, not vibes):
1. A real "how are we related" / relationship-path feature gets requested — this is the one thing the current model can't do without a full client-side graph walk.
2. `couples_tree_link.pb.js`'s connected-component union becomes measurably expensive: it rewrites `linked_trees` on *every* tree in the component on every new cross-tree marriage (O(component size) per write). Today's largest component is 11 trees (Kelsall's) — worth checking again if that grows past, say, 30-40 trees, or if couple-creation requests start visibly slowing down.
3. The person/couple dataset grows by an order of magnitude (currently ~80-90 persons) with heavy cross-tree interconnection — the "do it while the surface area is small" argument only starts to outweigh the migration cost at a scale where the current model's tradeoffs (write amplification, no relationship-path queries) actually start to hurt in practice, not preemptively.

## Merge logic

`merge.js` is intentionally framework-free — pure functions, no DOM, no network — so it can be unit-tested in Node and also loaded as a browser global via `<script src="merge.js">`. The SPA calls `computeMergeWrites(survivor, duplicate, childrenOfDup, couplesOfDup)` which returns the exact PATCH/DELETE operations to perform without side effects.

## Running tests

```bash
# helpers.js unit tests (Node built-in test runner, no install required)
node --test helpers.test.js

# merge.js unit tests
node --test merge.test.js

# gedcom_sync Python tests
cd tools/gedcom_sync
pip install -r requirements.txt
python -m pytest test_gedcom_sync.py -q

# backfill_tree Python tests
cd tools/backfill_tree
pip install -r requirements.txt
python -m pytest test_backfill_tree.py -q
```

`backend/pb_hooks/*.pb.js` and `backend/pb_migrations/*.js` have no automated test runner (PocketBase's JSVM isn't invokable from Node/pytest) — verify by building the Dockerfile into a disposable image and exercising it against a scratch PocketBase instance (see below), never against the live dev container or prod directly.

## Backend operations

**Fly.io deploy:**
```bash
cd backend
fly auth login
fly apps create family-reunion-api
fly volumes create pb_data --region iad --size 1
fly secrets set PB_ADMIN_EMAIL=you@example.com PB_ADMIN_PASSWORD=yourpassword
fly deploy
fly certs add reunion-api.klsll.com   # then follow DNS instructions
```
In Cloudflare DNS: CNAME `reunion-api` → `family-reunion-api.fly.dev` (DNS-only / grey cloud — Fly handles TLS).
In PocketBase admin (`/_/`): confirm OAuth2 redirect URLs match `https://reunion-api.klsll.com`.

Subsequent deploys after adding a migration: `cd backend && fly deploy`.

**Homelab (Docker):**
```bash
cd backend

# With 1Password + Cloudflare Tunnel
op inject -i .env.1password -o .env
docker compose -f compose.yml -f compose.cloudflared.yml up -d

# Manual .env
cp ../.env.example .env && $EDITOR .env
docker compose -f compose.yml up -d
```

After adding a migration to a running Docker instance, restart: `docker compose restart pocketbase`. **Caveat discovered the hard way:** `compose.yml` bind-mounts `./pb_migrations:/pb_migrations`, which *overrides* whatever the image baked in via `COPY pb_migrations /pb_migrations` — a plain `docker compose restart` after only rebuilding the image does **not** pick up new migration files unless the host-side `pb_migrations/` directory is also kept in sync (this is exactly how the homelab deploy drifted 19 migrations behind at one point — see issue #64's resolution). `pb_hooks` has no such bind mount, so a hook change genuinely does require an image rebuild + container recreation (`docker compose up -d --build`, or equivalent manual `docker build` + `docker stop`/`rm`/`run` if not going through compose) — a restart alone will not pick up new hook files or the `--hooksDir` flag if the running container predates it.

**Verifying a migration or hook before it touches real data:** build the current `backend/` into a disposable image (`docker build -t <scratch-tag> backend/`), run it against a scratch/empty data volume (never the real `pb_data` mount), create a temporary admin (`pocketbase admin create ...`), and exercise the actual behavior over the API — don't trust a clean startup log alone. A failing migration takes the *entire* PocketBase instance down (health endpoint 502s until fixed, no partial-failure tolerance), so this is not optional for anything nontrivial. If a container is caught up but you need to see current schema/data state without disturbing anything, a temporary admin account can be created via `docker exec <container> pocketbase admin create <email> <pass> --dir=/pb_data` and deleted again afterward (`DELETE /api/admins/{id}`) — safe, reversible, doesn't touch existing data.

## Key behaviors

- **Access control:** App collections require `@request.auth.id != "" && @request.auth.approved = true`. Users register with `approved=false`; users with `family_admin=true` can approve pending accounts from the Admin tab in the SPA.
- **OAuth:** Google and Apple sign-in use PocketBase's OAuth2 flow with PKCE; state/verifier round-trip through `sessionStorage`. The redirect URL must match what's configured in PocketBase's auth providers.
- **Tree navigation:** The tree view is neighborhood-based (focus person ± 2 generations). `treeFocusId` persists in the URL as `?person=<id>` for deep linking. `personCache` (session-scoped `Map`) avoids redundant fetches.
- **Claiming a person:** always goes through `person_claims` (admin/branch-admin review) via `submitClaimForExisting()` (tree context menu) or `submitClaim()` (onboarding search) — both create a `pending` claim record, never an instant `linked_user` PATCH. `skipClaim()` (new person + self-link) is the one exception, since creating a brand-new record has no collision/impersonation risk.
- **New `persons` records should set `tree`** where an existing relative's tree can be inferred (`createAndLink`, `profileCreateAndLink` inherit the relative's/profile subject's `.tree`; `skipClaim`/`_wizCreateAndSelect` inherit `currentUser.home_tree`) — except a new *partner*, who is deliberately left untreed (marrying in, not part of the existing person's line). Two call sites (`savePerson`'s standalone "Add person", `quickAddAndTag`'s photo-tag quick-add) have no relative to infer from and are intentionally left unstamped pending a product decision (tree picker vs. default).
- **gedcom_sync:** Idempotent (keyed on `gedcom_id`), fill-blanks-only (never overwrites SPA edits), redacts living people. Must run on Unraid where the `webtrees` Docker network exists; see `tools/gedcom_sync/README.md` for exact commands.
