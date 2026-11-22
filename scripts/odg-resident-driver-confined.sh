#!/usr/bin/env bash
# V15 — CONFINED launcher for the resident driver (bubblewrap). Replaces the systemd ProtectSystem/ProtectHome proposal,
# fragile on this host (kernel.apparmor_restrict_unprivileged_userns=1); bwrap has its own AppArmor profile.
# Two phases (inspection HIGH: a writable runtime/dist would let confined code plant JS that UNCONFINED services run):
#   1. TRUSTED, unconfined, before the sandbox: freshness check and, if stale, rebuild (same code as the normal launcher).
#   2. CONFINED: run the tick with EVERYTHING read-only — NO writable host path at all (V15 trace integrity: the trace file
#      used to be bound writable, so confined code could truncate/rewrite the trace HISTORY). No host root, private /tmp
#      and /run (no host Unix socket), all namespaces unshared (loopback only).
#   3. TRUSTED, after the sandbox: the LAUNCHER (not the confined tick) appends ONE line to runtime/logs/resident-driver-l0.log
#      — the tick's last stdout line if it matches the strict L0 trace format, else an INVALID_TRACE line. Earlier lines are
#      beyond the reach of confined code. The line CONTENT is still the tick's self-report (not an attestation).
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
# phase 2 (confined) — nothing writable on the host (the tick's own append fails read-only and is ignored by design)
odg_confined_view "$REPO"
for v in ODG_TRUTH_LOCK_ENFORCE ODG_SCHEDULER_STOP; do [ -n "${!v:-}" ] && BW+=(--setenv "$v" "${!v}"); done
# RLIMIT_FSIZE bounds files written in the private tmpfs (/tmp) — absolute cap, nothing on the host grows any more.
MAXKB="${ODG_RESIDENT_MAX_FILE_KB:-1024}"; case "$MAXKB" in *[!0-9]*|"") MAXKB=1024 ;; esac
[ "${#MAXKB}" -gt 7 ] && MAXKB=1024   # bound the arithmetic (no bash overflow on a huge value)
BLOCKS=$(( MAXKB * 2 ))   # dash ulimit -f counts 512-byte blocks
if OUT=$("${BW[@]}" --chdir "$REPO" /bin/sh -c 'ulimit -f "$0"; exec "$@"' "$BLOCKS" "${CMD[@]}" | head -c 65536); then RC=0; else RC=$?; fi
[ -n "$OUT" ] && printf '%s\n' "$OUT"
# phase 3 (trusted) — the launcher writes the trace; strict format, printable ASCII only, bounded length
LINE=$(printf '%s\n' "$OUT" | LC_ALL=C grep -E '^\[[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z\] L0 tick: [[:print:]]{1,480}$' | tail -n 1 || true)
TS="$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)"   # the LAUNCHER's clock stamps the line (confined code cannot back/forward-date it)
if [ -n "$LINE" ]; then LINE="[$TS] ${LINE#*\] }"; else LINE="[$TS] L0 tick: state=INVALID_TRACE rc=$RC (confined output did not match the trace format) modifiedBusinessState=unknown"; fi
if [ -L "$LOG" ] || [ ! -f "$LOG" ]; then echo "[resident-confined] REFUSED: $LOG is not a regular file (symlink?)" >&2; exit 1; fi
printf '%s\n' "$LINE" >> "$LOG"
exit "$RC"
