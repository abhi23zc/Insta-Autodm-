#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
umask 077
mkdir -p backups
chmod 700 backups
stamp=$(date -u '+%Y%m%dT%H%M%SZ')
dump="backups/postgres-$stamp.dump"
trap 'rm -f "$dump.partial"' EXIT HUP INT TERM
docker compose --env-file .env.vps -f compose.vps.yml exec -T postgres \
  pg_dump -U openreply -d openreply -Fc > "$dump.partial"
mv "$dump.partial" "$dump"
cp .env.vps "backups/env-$stamp"
echo "Saved $dump and matching environment file. Copy both to private off-server storage."
