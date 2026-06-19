#!/bin/sh
set -e

/usr/local/bin/pocketbase serve \
  --http=0.0.0.0:8091 \
  --dir=/pb_data \
  --migrationsDir=/pb_migrations &

/usr/bin/python3 /apple_bridge.py &

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
