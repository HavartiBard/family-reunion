#!/bin/sh
set -e

/usr/local/bin/pocketbase serve \
  --http=127.0.0.1:8091 \
  --dir=/pb_data \
  --migrationsDir=/pb_migrations &

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
