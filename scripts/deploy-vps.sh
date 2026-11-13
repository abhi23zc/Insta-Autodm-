#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ ! -f .env.vps ]; then
  echo 'Create .env.vps first; see docs/deploy-vps.md.' >&2
  exit 1
fi
case "${1:-https}" in
  https) set -- --profile https ;;
  existing-proxy) set -- ;;
  *) echo 'Usage: sh scripts/deploy-vps.sh [https|existing-proxy]' >&2; exit 1 ;;
esac
docker compose --env-file .env.vps -f compose.vps.yml "$@" config --quiet
docker compose --env-file .env.vps -f compose.vps.yml "$@" build web
docker compose --env-file .env.vps -f compose.vps.yml "$@" up -d --no-build --wait --wait-timeout 180
docker compose --env-file .env.vps -f compose.vps.yml "$@" exec -T web \
  node --input-type=module -e 'const r = await fetch("http://127.0.0.1:3000/api/health", { signal: AbortSignal.timeout(15000) }); const data = await r.json(); console.log(JSON.stringify(data, null, 2)); if (!r.ok) process.exit(1);'
