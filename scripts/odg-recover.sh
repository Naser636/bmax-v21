#!/usr/bin/env bash
# odg-recover — bounded auto-recovery invoked by systemd `OnFailure=odg-recover.service` when odg-preprod exhausts
# its restart limit (a PERSISTENT crash-loop, not a transient blip). Reuses the PROVEN odg-release rollback; adds a
# hard ATTEMPT CAP so recovery can never loop forever. Private/loopback only; never touches data, ports, firewall,
# DNS, or co-tenant services.
#
# Flow: (attempt cap) → odg-release rollback --no-serve (swap to the verified-good previous; systemd owns the proc)
#       → systemctl restart odg-preprod → bounded health-wait on 127.0.0.1:3000 → incident. Fail-closed + STOP on
#       cap-exceeded / no-valid-previous / rollback-refused / post-restart-unhealthy (systemd leaves the unit failed;
#       odg-recover has NO OnFailure of its own ⇒ no recursive recovery).
set -uo pipefail
REPO="${ODG_REPO:-/home/ubuntu/bmax-v21}"
ROOT="${ODG_RELEASE_ROOT:-/home/ubuntu/odg-releases}"
PORT="${ODG_RECOVER_PORT:-3000}"; HOST="${ODG_RECOVER_HOST:-127.0.0.1}"
UNIT="${ODG_RECOVER_UNIT:-odg-preprod.service}"
# Restart command as an ARRAY so it can be "systemctl" (test stub, 1 word) OR "sudo systemctl" (live, 2 words,
# via a scoped NOPASSWD sudoers rule — recover runs as non-root ubuntu and a system unit needs privilege to restart).
read -r -a SYSTEMCTL <<< "${ODG_SYSTEMCTL:-systemctl}"
MAX="${ODG_RECOVER_MAX:-2}"; WINDOW="${ODG_RECOVER_WINDOW:-300}"
ATTEMPTS_FILE="$ROOT/.recover-attempts"; INCIDENTS="$ROOT/incidents.jsonl"
NOW="$(date -u +%s)"
inc(){ mkdir -p "$ROOT"; echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"action\":\"recover\",\"result\":\"$1\",\"blocker\":\"${2:-}\"}" >> "$INCIDENTS"; echo "[odg-recover] $1 ${2:-}" >&2; }

# --- hard attempt cap within WINDOW (prevents a recovery loop) ---
recent=0
if [ -f "$ATTEMPTS_FILE" ]; then
  : > "$ATTEMPTS_FILE.tmp"
  while read -r t; do [ -n "$t" ] && [ $((NOW - t)) -lt "$WINDOW" ] && { echo "$t" >> "$ATTEMPTS_FILE.tmp"; recent=$((recent+1)); }; done < "$ATTEMPTS_FILE"
  mv -f "$ATTEMPTS_FILE.tmp" "$ATTEMPTS_FILE"
fi
if [ "$recent" -ge "$MAX" ]; then
  inc "CAP_EXCEEDED" "$recent recoveries in ${WINDOW}s ≥ max $MAX — STOP, manual intervention (no loop)"
  exit 3
fi
echo "$NOW" >> "$ATTEMPTS_FILE"

# --- swap to the verified-good previous (no boot; systemd restarts) ---
if ! bash "$REPO/scripts/odg-release.sh" rollback --no-serve --port "$PORT" --host "$HOST" >&2; then
  inc "ROLLBACK_REFUSED" "odg-release rollback --no-serve failed (no/invalid previous) — STOP fail-closed"
  exit 2
fi

# --- restart the service from the now-good current, then confirm real health (bounded) ---
# Best-effort restart (QUEUED, --no-block). A synchronous restart from within the unit's own OnFailure transaction
# conflicts with that transaction, so this command may return non-zero even though the swap + systemd's own
# transaction bring the unit back up. Therefore recovery is judged by OBSERVED HEALTH below (the real goal), NOT by
# this command's exit code — we log a best-effort note and proceed to the authoritative health check.
"${SYSTEMCTL[@]}" restart --no-block "$UNIT" >&2 2>&1 || echo "[odg-recover] restart --no-block returned non-zero (OnFailure job-conflict expected); health-wait is authoritative" >&2
code="000"
for i in 1 2 3 4 5; do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "http://$HOST:$PORT/api/health" 2>/dev/null || echo 000)"
  [ "$code" = "200" ] && break
  sleep 2
done
if [ "$code" = "200" ]; then inc "RECOVERED" "rolled back to previous + health 200 on $HOST:$PORT"; exit 0; fi
inc "RECOVERY_UNHEALTHY" "post-restart health $code — STOP fail-closed (no loop)"
exit 2
