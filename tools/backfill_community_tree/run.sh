#!/usr/bin/env bash
# Run backfill_community_tree.py from a temporary container with its deps
# installed. Only talks to PocketBase -- no special Docker network needed.
# Required env: PB_ADMIN_EMAIL PB_ADMIN_PASSWORD
# Any extra args (e.g. --target-tree Kelsall --dry-run) are forwarded to
# backfill_community_tree.py.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
docker run --rm -v "$DIR":/app -w /app \
  -e PB_URL="${PB_URL:-http://192.168.20.14:8094}" \
  -e PB_ADMIN_EMAIL -e PB_ADMIN_PASSWORD \
  python:3.12-slim sh -c "pip install -q -r requirements.txt && python backfill_community_tree.py $*"
