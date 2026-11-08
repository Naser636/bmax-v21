#!/usr/bin/env bash
# ODG VPS front-door smoke (READ-ONLY, local only). Probes the local front-facing service ports with a GET and
# confirms they respond. Does NOT mutate any service, open any port, or touch the public internet. Exit 0 iff all
# probed ports respond with an HTTP status. Ports: 8080 edg-core (observed read-only), 3000 next app, 11434 ollama.
set -euo pipefail
PORTS=("${@:-8080 3000 11434}")
# allow override: deploy/odg-frontdoor-smoke.sh 8080 3000
read -r -a PORTS <<< "${*:-8080 3000 11434}"
fail=0
for p in "${PORTS[@]}"; do
  code="$(timeout 10 curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${p}/" 2>/dev/null || echo 000)"
  if [ "$code" = "000" ]; then echo "port ${p}: NO RESPONSE"; fail=1; else echo "port ${p}: HTTP ${code}"; fi
done
[ "$fail" -eq 0 ] && echo "FRONT-DOOR SMOKE OK (local, read-only; no service mutated)" || { echo "FRONT-DOOR SMOKE FAILED"; exit 1; }
