#!/usr/bin/env bash
# odg-healthcheck — periodic (systemd .timer) poll that catches an ALIVE-but-UNHEALTHY dashboard (process up, but
# /api/health not 200) — the gap systemd OnFailure (process-exit only) cannot see. Chosen over WatchdogSec because
# the Next standalone server emits no sd_notify. Reuses the EXISTING recovery path (odg-recover.sh → odg-release
# rollback); no second recovery loop, no business logic duplicated.
#
# Transient-tolerant: acts only after THRESHOLD CONSECUTIVE unhealthy polls (a blip / momentary dependency outage
# resets the counter). Conflict-safe: SKIPS while a recovery lock is held OR the unit is not active (the OnFailure
# path owns a crashed process). At most one recovery per incident (odg-recover's own cap + the shared lock). Never
# touches data, ports, firewall, DNS, or public exposure.
set -uo pipefail
REPO="${ODG_REPO:-/home/ubuntu/bmax-v21}"
ROOT="${ODG_RELEASE_ROOT:-/home/ubuntu/odg-releases}"
HOST="${ODG_RECOVER_HOST:-127.0.0.1}"; PORT="${ODG_RECOVER_PORT:-3000}"
THRESHOLD="${ODG_HEALTH_THRESHOLD:-3}"
STATE="$ROOT/.health-fails"; INCIDENTS="$ROOT/incidents.jsonl"; LOCK_DIR="$ROOT/.recovery.lock"
RECOVER="${ODG_RECOVER_CMD:-$REPO/scripts/odg-recover.sh}"
IS_ACTIVE="${ODG_ISACTIVE_CMD:-systemctl is-active odg-preprod.service}"
HEALTH_URL="${ODG_HEALTH_URL:-http://$HOST:$PORT/api/health}"
inc(){ mkdir -p "$ROOT"; echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"action\":\"healthcheck\",\"result\":\"$1\",\"blocker\":\"${2:-}\"}" >> "$INCIDENTS"; echo "[odg-healthcheck] $1 ${2:-}" >&2; }
reset_fails(){ echo 0 > "$STATE"; }
get_fails(){ cat "$STATE" 2>/dev/null || echo 0; }

# Conflict-safe gates (do NOT count failures during recovery / when the process is down).
[ -d "$LOCK_DIR" ] && { echo "[odg-healthcheck] recovery in progress — skip" >&2; exit 0; }
active="$($IS_ACTIVE 2>/dev/null || true)"
[ "$active" = "active" ] || { echo "[odg-healthcheck] unit not active ($active) — OnFailure path owns it, skip" >&2; exit 0; }

code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$HEALTH_URL" 2>/dev/null || echo 000)"
if [ "$code" = "200" ]; then reset_fails; exit 0; fi

# Unhealthy while alive — count CONSECUTIVE failures (transient tolerance).
n=$(( $(get_fails) + 1 )); echo "$n" > "$STATE"
if [ "$n" -lt "$THRESHOLD" ]; then
  echo "[odg-healthcheck] unhealthy (code=$code) $n/$THRESHOLD — tolerating transient, no action" >&2; exit 0
fi

# Persistent alive-but-unhealthy ⇒ invoke the EXISTING bounded recovery ONCE, then reset the counter.
inc "UNHEALTHY_PERSISTENT" "alive but /api/health=$code for $n consecutive polls — invoking bounded recovery"
reset_fails
bash "$RECOVER"; rc=$?
# Post-recovery verification is done inside odg-recover (health-wait). Surface its outcome honestly.
if [ "$rc" = 0 ]; then inc "HEALTHCHECK_RECOVERED" "recovery returned 0"; else inc "HEALTHCHECK_RECOVERY_FAILED" "odg-recover exit $rc (bounded, incident preserved)"; fi
exit "$rc"
