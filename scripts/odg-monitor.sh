#!/bin/bash
# odg-monitor.sh — P3/P5 private supervision tick (READ-ONLY). Runs the two already-shipped detectors
# (exposure-audit CLI + maintenance-alerts CLI) once, emitting their output to the systemd journal and
# letting each CLI maintain its OWN deduplicated alert file under runtime/generated/. It NEVER remediates:
# no restart, no rollback, no config/firewall/bind change, no business-data write. Best-effort — one
# detector failing must not skip the other; the tick itself always exits 0 (the signal lives in the journal
# and the deduped alert files, not in the unit's exit status, so there is no accidental OnFailure coupling).
set -u
REPO="${ODG_REPO:-/home/ubuntu/bmax-v21}"
NODE="/usr/bin/node"; [ -x "$NODE" ] || NODE="$(command -v node || echo node)"
cd "$REPO" || { echo "odg-monitor: repo $REPO unavailable"; exit 0; }

echo "== odg-monitor tick $(date -u +%Y-%m-%dT%H:%M:%SZ) =="

# Exposure drift (ODG-owned listeners must be loopback; foreign public = informational, never touched).
"$NODE" "$REPO/runtime/bin/odg-exposure-check.js" || true

# Maintenance alerts (health/disk/mem/NRestarts/backup-age/release-current → CRIT/WARN/INFO, deduped).
"$NODE" "$REPO/runtime/bin/odg-maintenance-check.js" || true

exit 0
