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

# Homelab — secrets come from 1Password (item "Reunion Cloudflare Tunnel"):
op inject -i .env.1password -o .env
docker compose -f compose.yml -f compose.cloudflared.yml up -d

# Cloud — fill values by hand, no 1Password / no tunnel:
cp ../.env.example .env && $EDITOR .env
docker compose -f compose.yml up -d
```
Migrations in `backend/pb_migrations/` auto-apply on container start. If you add a
migration to a running instance, restart the container to apply it.

## Frontend
GitHub Pages serves the repo root. The SPA targets the API at the `API`
constant in `index.html` (`https://reunion-api.klsll.com`). Change it if the
backend moves.

Apple sign-in is started and completed on the backend now:
- `/auth/apple/start` begins the flow from the API origin.
- `/auth/apple/callback` receives Apple's `form_post` callback.
- `/auth/apple/finalize` hands the PocketBase session back to the SPA with a
  short-lived one-time code.

If the public frontend or API URLs move, update `FRONTEND_URL` and
`PUBLIC_API_URL` in the backend environment so the Apple bridge uses the right
origins and callback URL.

## gedcom_sync
See `tools/gedcom_sync/README.md`.
