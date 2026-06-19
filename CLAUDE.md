# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture

**Frontend:** Single-file SPA (`index.html` + `merge.js`) served by GitHub Pages at `reunion.klsll.com`. No build step, no bundler — raw HTML/CSS/JS. All API calls go to the `API` constant (`https://reunion-api.klsll.com`).

**Backend:** PocketBase, deployable two ways:
- **Fly.io (primary):** `backend/Dockerfile` + `backend/fly.toml`. Migrations are baked into the image at build time (`COPY pb_migrations /pb_migrations`). `pb_data` persists on a Fly Volume. Cloudflare DNS (grey cloud) points `reunion-api.klsll.com` → `family-reunion-api.fly.dev`; Fly handles TLS.
- **Homelab (fallback):** Docker Compose via `backend/compose.yml`. Optional cloudflared overlay (`compose.cloudflared.yml`) exposes PocketBase via a Cloudflare Tunnel using secrets from 1Password.

Schema is defined entirely in `backend/pb_migrations/`; migrations auto-apply on first run.

**Admin tool:** `tools/gedcom_sync/` — a Python script that reads a Webtrees MariaDB and upserts into PocketBase. Run on the Unraid host where the `webtrees` Docker network is accessible.

## Data model

Three PocketBase collections, all gated behind `approved=true` user auth:

- **`users`** — built-in PocketBase auth collection; has `approved` (bool), `family_admin` (bool), `phone`, `birthday` fields; new registrants start `approved=false`.
- **`persons`** — tree nodes: `display_name`, `given_name`, `family_name`, `gender`, `birth_date`, `death_date`, `living`, `bio`, `photo`, `linked_user` (→users), `father`/`mother` (self-referential → persons), `gedcom_id` (Webtrees xref).
- **`couples`** — `partner_a`/`partner_b` (→persons), `status` (married/divorced/partners/unknown), `married_date`.
- **`news`** — `title`, `body`, `author` (→users).

## Merge logic

`merge.js` is intentionally framework-free — pure functions, no DOM, no network — so it can be unit-tested in Node and also loaded as a browser global via `<script src="merge.js">`. The SPA calls `computeMergeWrites(survivor, duplicate, childrenOfDup, couplesOfDup)` which returns the exact PATCH/DELETE operations to perform without side effects.

## Running tests

```bash
# merge.js unit tests (Node built-in test runner, no install required)
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

- **Access control:** App collections require `@request.auth.id != "" && @request.auth.approved = true`. Users register with `approved=false`; users with `family_admin=true` can approve pending accounts from the SPA Admin tab.
- **OAuth:** Google and Apple sign-in use PocketBase's OAuth2 flow with PKCE; state/verifier round-trip through `sessionStorage`. The redirect URL must match what's configured in PocketBase's auth providers.
- **Tree navigation:** The tree view is neighborhood-based (focus person ± 2 generations). `treeFocusId` persists in the URL as `?person=<id>` for deep linking. `personCache` (session-scoped `Map`) avoids redundant fetches.
- **gedcom_sync:** Idempotent (keyed on `gedcom_id`), fill-blanks-only (never overwrites SPA edits), redacts living people. Must run on Unraid where the `webtrees` Docker network exists; see `tools/gedcom_sync/README.md` for exact commands.
