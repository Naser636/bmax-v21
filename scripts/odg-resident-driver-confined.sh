#!/usr/bin/env bash
# V15 — CONFINED launcher for the resident driver (bubblewrap). Replaces the systemd ProtectSystem/ProtectHome proposal,
# fragile on this host (kernel.apparmor_restrict_unprivileged_userns=1); bwrap has its own AppArmor profile.
# Two phases (inspection HIGH: a writable runtime/dist would let confined code plant JS that UNCONFINED services run):
#   1. TRUSTED, unconfined, before the sandbox: freshness check and, if stale, rebuild (same code as the normal launcher).
#   2. CONFINED: run the tick with EVERYTHING read-only except ONE file — its own trace runtime/logs/resident-driver-l0.log,
#      bound alone (the logs directory stays read-only ⇒ no symlink can be planted for other, unconfined writers).
#      No host root, private /tmp and /run (no host Unix socket), all namespaces unshared (loopback only).
# Usage: scripts/odg-resident-driver-confined.sh [repo]   (ODG_RESIDENT_NO_BUILD=1 skips phase-1 rebuild ⇒ tsx fallback)
set -euo pipefail
REPO="$(cd "${1:-$(dirname "${BASH_SOURCE[0]}")/..}" && pwd -P)"; cd "$REPO"
. "$REPO/scripts/lib/odg-resident-freshness.sh"
. "$REPO/scripts/lib/odg-confined-view.sh"
LOG="runtime/logs/resident-driver-l0.log"
mkdir -p runtime/logs; [ -e "$LOG" ] || : > "$LOG"
if [ -L "$LOG" ] || [ ! -f "$LOG" ]; then echo "[resident-confined] REFUSED: $LOG is not a regular file (symlink?)" >&2; exit 1; fi
# phase 1 (trusted)
if ! odg_resident_fresh && [ "${ODG_RESIDENT_NO_BUILD:-}" != "1" ]; then bash scripts/odg-resident-driver-build.sh >/dev/null 2>&1 || true; fi
if odg_resident_fresh; then CMD=(node "$REPO/runtime/dist/bin/odg-resident-driver-tick.js")
else echo "[resident-confined] precompiled build unavailable/stale ⇒ tsx fallback" >&2; CMD=("$REPO/node_modules/.bin/tsx" "$REPO/runtime/bin/odg-resident-driver-tick.ts"); fi
# phase 2 (confined)
odg_confined_view "$REPO"
BW+=(--bind "$REPO/$LOG" "$REPO/$LOG")
for v in ODG_TRUTH_LOCK_ENFORCE ODG_SCHEDULER_STOP; do [ -n "${!v:-}" ] && BW+=(--setenv "$v" "${!v}"); done
exec "${BW[@]}" --chdir "$REPO" "${CMD[@]}"
