#!/usr/bin/env bash
# One command for the demo: the hub (both trees, demo keys) and the web app, on this laptop.
#   pnpm demo           then open http://localhost:3000
set -uo pipefail
cd "$(dirname "$0")/.."
if [ -f .env ]; then set -a; . ./.env; set +a; fi
export HELLGATE_HUB_TOKEN="${HELLGATE_HUB_TOKEN:-dev-token}"
export HELLGATE_HUB="http://127.0.0.1:8787"

# A previous demo that was not stopped cleanly still holds the ports: stop its node processes first.
for port in 8787 3000; do
  for pid in $(ss -ltnp 2>/dev/null | grep -E "[:.]$port\b" | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u); do
    if ps -o comm= -p "$pid" | grep -qE 'node|next'; then
      echo "port $port is held by an old process ($pid); stopping it"
      kill "$pid" 2>/dev/null || true
    else
      echo "port $port is used by something that is not node (pid $pid). Free it and try again."; exit 1
    fi
  done
done
sleep 1

cleanup() { trap - EXIT INT TERM; kill 0 2>/dev/null || true; }
trap cleanup EXIT INT TERM

pnpm hub:demo &
[ -d web/.next ] || (cd web && pnpm build)
(cd web && exec pnpm exec next start -p 3000) &
echo "hub on $HELLGATE_HUB, web on http://localhost:3000 (Ctrl-C stops both)"
wait
