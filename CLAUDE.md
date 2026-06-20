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

**Admin tool:** `tools/gedcom_sync/` — a Python script that reads a Webtrees MariaDB and upserts into PocketBase. Run on the Unraid host where the `webtrees` Docker network is accessible.

## Data model

All collections gated behind `@request.auth.id != "" && @request.auth.approved = true` unless noted.

- **`users`** — built-in PocketBase auth collection; `approved` (bool), `family_admin` (bool), `phone`, `birthday`, `rsvp` (select: going/maybe/no), `privacy_settings` (json), `notification_prefs` (json). New registrants start `approved=false`.
- **`persons`** — tree nodes: `display_name`, `given_name`, `family_name`, `gender`, `birth_date`, `death_date`, `living`, `bio`, `photo`, `linked_user` (→users), `father`/`mother` (self-referential → persons), `gedcom_id` (Webtrees xref).
- **`couples`** — `partner_a`/`partner_b` (→persons), `status` (married/divorced/partners/unknown), `married_date`.
- **`news`** — `title`, `body`, `author` (→users).
- **`albums`** — `name`, `description`, `year`, `cover_photo` (file). Create/update/delete restricted to `family_admin`.
- **`photos`** — `album` (→albums, cascade delete), `image` (file), `caption`, `taken_date`, `uploader` (→users), `tagged_persons` (→persons, multi). Update/delete by uploader or admin.
- **`notifications`** — `user` (→users), `type` (select), `title`, `body`, `read` (bool), `related_id`, `related_type`. All rules scoped to `user = @request.auth.id`.

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
```

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

After adding a migration to a running Docker instance, restart: `docker compose restart pocketbase`.

## Key behaviors

- **Access control:** App collections require `@request.auth.id != "" && @request.auth.approved = true`. Users register with `approved=false`; users with `family_admin=true` can approve pending accounts from the Admin tab in the SPA.
- **OAuth:** Google and Apple sign-in use PocketBase's OAuth2 flow with PKCE; state/verifier round-trip through `sessionStorage`. The redirect URL must match what's configured in PocketBase's auth providers.
- **Tree navigation:** The tree view is neighborhood-based (focus person ± 2 generations). `treeFocusId` persists in the URL as `?person=<id>` for deep linking. `personCache` (session-scoped `Map`) avoids redundant fetches.
- **gedcom_sync:** Idempotent (keyed on `gedcom_id`), fill-blanks-only (never overwrites SPA edits), redacts living people. Must run on Unraid where the `webtrees` Docker network exists; see `tools/gedcom_sync/README.md` for exact commands.
