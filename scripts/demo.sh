#!/usr/bin/env bash
# One command for the demo: the hub (both trees, demo keys) and the web app, on this laptop.
#   pnpm demo           then open http://localhost:3000
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f .env ]; then set -a; . ./.env; set +a; fi
export HELLGATE_HUB_TOKEN="${HELLGATE_HUB_TOKEN:-dev-token}"
export HELLGATE_HUB="http://127.0.0.1:8787"

pnpm hub:demo &
HUB=$!
trap 'kill $HUB ${WEB:-} 2>/dev/null || true' EXIT INT TERM
[ -d web/.next ] || (cd web && pnpm build)
(cd web && pnpm exec next start -p 3000) &
WEB=$!
echo "hub on $HELLGATE_HUB, web on http://localhost:3000 (Ctrl-C stops both)"
wait
