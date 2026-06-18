#!/usr/bin/env bash
set -e

PB_VERSION=${PB_VERSION:-0.22.20}
BIN=./pocketbase

if [ ! -f "$BIN" ]; then
  echo "Downloading PocketBase v${PB_VERSION}..."
  curl -sL "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" -o pb.zip
  unzip -q pb.zip pocketbase
  rm pb.zip
  chmod +x pocketbase
  echo "PocketBase downloaded."
fi

exec ./pocketbase serve \
  --http=0.0.0.0:8090 \
  --dir=./pb_data \
  --migrationsDir=./pb_migrations
