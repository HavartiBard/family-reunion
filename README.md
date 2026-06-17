# Family Reunion Portal

Private family portal: directory, news, and an interactive family tree.
Frontend is a single-page app on GitHub Pages (`reunion.klsll.com`); backend is
PocketBase. Portable — deploy on the homelab or any cloud host.

## Layout
- `index.html`, `merge.js` — the SPA (served by GitHub Pages from repo root)
- `backend/` — PocketBase compose + schema migrations (+ optional cloudflared overlay)
- `tools/gedcom_sync/` — admin tool: sync a Webtrees DB into PocketBase

## Deploy the backend
```bash
cd backend
cp ../.env.example .env && $EDITOR .env      # fill from 1Password (home) or by hand (cloud)

# Homelab (Cloudflare tunnel ingress):
docker compose -f compose.yml -f compose.cloudflared.yml up -d

# Cloud (your own reverse proxy / public ingress):
docker compose -f compose.yml up -d
```
Migrations in `backend/pb_migrations/` auto-apply on container start. If you add a
migration to a running instance, restart the container to apply it.

## Frontend
GitHub Pages serves the repo root. The SPA targets the API at the `API`
constant in `index.html` (`https://reunion-api.klsll.com`). Change it if the
backend moves.

## gedcom_sync
See `tools/gedcom_sync/README.md`.
