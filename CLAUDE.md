# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture

**Frontend:** Single-file SPA (`index.html` + `merge.js`) served by GitHub Pages at `reunion.klsll.com`. No build step, no bundler — raw HTML/CSS/JS. All API calls go to the `API` constant (`https://reunion-api.klsll.com`).

**Backend:** PocketBase, deployable two ways:
- **Replit (primary):** Reserved VM deployment. `backend/.replit` + `backend/replit/start.sh` bootstrap the PocketBase binary at runtime and serve on port 8090. `pb_data` persists on Replit's VM disk. Cloudflare proxies `reunion-api.klsll.com` → the Replit deployment URL (no tunnel needed).
- **Homelab (fallback):** Docker Compose via `backend/compose.yml`. Optional cloudflared overlay (`compose.cloudflared.yml`) exposes PocketBase via a Cloudflare Tunnel using secrets from 1Password.

Schema is defined entirely in `backend/pb_migrations/`; migrations auto-apply on first run.

**Admin tool:** `tools/gedcom_sync/` — a Python script that reads a Webtrees MariaDB and upserts into PocketBase. Run on the Unraid host where the `webtrees` Docker network is accessible.

## Data model

Three PocketBase collections, all gated behind `approved=true` user auth:

- **`users`** — built-in PocketBase auth collection; has `approved` (bool), `phone`, `birthday` fields; new registrants start `approved=false`.
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

**Replit deploy:**
1. Create a Replit Reserved VM repl pointing at the `backend/` directory.
2. Add secrets in Replit's Secrets tab: `PB_ADMIN_EMAIL`, `PB_ADMIN_PASSWORD`.
3. Run — `replit/start.sh` downloads the PocketBase binary on first boot.
4. In Cloudflare DNS, add a proxied CNAME: `reunion-api` → `<your-repl>.replit.app`.
5. In PocketBase admin (`/_/`), confirm OAuth2 redirect URLs match `https://reunion-api.klsll.com`.

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

- **Access control:** All PocketBase collection rules require `@request.auth.id != "" && @request.auth.approved = true`. Users register with `approved=false`; a family admin must flip it in the PocketBase admin UI.
- **OAuth:** Google and Apple sign-in use PocketBase's OAuth2 flow with PKCE; state/verifier round-trip through `sessionStorage`. The redirect URL must match what's configured in PocketBase's auth providers.
- **Tree navigation:** The tree view is neighborhood-based (focus person ± 2 generations). `treeFocusId` persists in the URL as `?person=<id>` for deep linking. `personCache` (session-scoped `Map`) avoids redundant fetches.
- **gedcom_sync:** Idempotent (keyed on `gedcom_id`), fill-blanks-only (never overwrites SPA edits), redacts living people. Must run on Unraid where the `webtrees` Docker network exists; see `tools/gedcom_sync/README.md` for exact commands.
