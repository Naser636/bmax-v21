#!/usr/bin/env bash
# V15 — CONFINED launcher for the resident driver (bubblewrap). Replaces the systemd ProtectSystem/ProtectHome proposal,
# fragile on this host (kernel.apparmor_restrict_unprivileged_userns=1); bwrap has its own AppArmor profile.
# Three phases (inspection HIGH: a writable runtime/dist would let confined code plant JS that UNCONFINED services run):
#   1. TRUSTED, unconfined, before the sandbox: freshness check (closure sources AND emitted dist .js) and, if stale, rebuild.
#   2. CONFINED: run the tick with EVERYTHING read-only — NO writable host path at all (V15 trace integrity). No host root,
#      private size-capped /tmp /run /dev/shm, sandbox root and /dev read-only, all namespaces unshared (loopback only),
#      no inherited fd > 2, stdin /dev/null, bounded in time (timeout) and by RLIMIT_FSIZE / NPROC (/ AS, precompiled path).
#      The sandbox is a DIRECT child of this launcher (no $(...) subshell) and dies with it (pdeathsig chain, see below).
#   3. TRUSTED, after the sandbox: the LAUNCHER (not the confined tick) appends ONE line to runtime/logs/resident-driver-l0.log
#      — the tick's last stdout line if it matches the strict L0 trace format, else a TIMEOUT / INVALID_TRACE line (with an
#      explicit truncated= marker). Earlier lines are beyond the reach of confined code. The line CONTENT is still the tick's
#      self-report (not an attestation).
# Usage: scripts/odg-resident-driver-confined.sh [repo]   (ODG_RESIDENT_NO_BUILD=1 skips phase-1 rebuild ⇒ tsx fallback)
# Tunables (validated decimal, else default): ODG_RESIDENT_TIMEOUT s (60), ODG_RESIDENT_MAX_FILE_KB (1024),
#   ODG_RESIDENT_TMP_MB (64), ODG_RESIDENT_MAX_PROCS (128), ODG_RESIDENT_MAX_VMEM_KB (4194304), ODG_RESIDENT_STDERR_KB (16).
set -euo pipefail
# Inherited fds: a caller fd (e.g. `exec 9>>hostfile`) would stay writable inside bwrap (directly, or by reopening
# /proc/<ancestor>/fd/N) ⇒ close EVERY fd > 2 before anything else runs; stdin from /dev/null.
# (NO redirection on this loop: bash would save fd 2 in a high fd, the loop would close it and stderr would be lost.)
# bash's own script fd survives (re-opened by bash, O_CLOEXEC ⇒ not inherited by bwrap).
for _p in /proc/$$/fd/*; do _n="${_p##*/}"; case "$_n" in ''|*[!0-9]*) continue ;; esac; if [ "$_n" -gt 2 ]; then exec {_n}>&-; fi; done
exec </dev/null
REPO="$(cd "${1:-$(dirname "${BASH_SOURCE[0]}")/..}" && pwd -P)"; cd "$REPO"
. "$REPO/scripts/lib/odg-resident-freshness.sh"
. "$REPO/scripts/lib/odg-confined-view.sh"
# num <value> <default> <max> — decimal in [1,max] (base-10 forced: no octal surprise on a leading 0), else <default>.
num() { local v="${1:-}"; case "$v" in ''|*[!0-9]*) v="$2" ;; esac; [ "${#v}" -gt 9 ] && v="$2"; v=$((10#$v)); { [ "$v" -lt 1 ] || [ "$v" -gt "$3" ]; } && v="$2"; printf '%s' "$v"; }
LOG="runtime/logs/resident-driver-l0.log"
mkdir -p runtime/logs; [ -e "$LOG" ] || : > "$LOG"
if [ -L "$LOG" ] || [ ! -f "$LOG" ]; then echo "[resident-confined] REFUSED: $LOG is not a regular file (symlink?)" >&2; exit 1; fi
command -v setpriv >/dev/null || { echo "[resident-confined] REFUSED: setpriv (util-linux) missing — cannot tie the sandbox to the launcher" >&2; exit 1; }
# phase 1 (trusted)
if ! odg_resident_fresh && [ "${ODG_RESIDENT_NO_BUILD:-}" != "1" ]; then bash scripts/odg-resident-driver-build.sh >/dev/null 2>&1 || true; fi
# RLIMIT_AS: the precompiled tick needs ~800 MB of virtual address space (measured: fails at 600 MB, runs at 800 MB)
# ⇒ 4 GiB default. NOT applied to the tsx fallback: tsx's WebAssembly lexer reserves > 32 GiB of virtual guard space
# (measured: fails at 32 GiB, runs at 64 GiB), so an AS cap there would bound nothing — that path relies on the tmpfs
# caps + NPROC here and on the unit's MemoryMax= (see the drop-in proposal).
VMEM="$(num "${ODG_RESIDENT_MAX_VMEM_KB:-}" 4194304 268435456)"
if odg_resident_fresh; then CMD=(node "$REPO/runtime/dist/bin/odg-resident-driver-tick.js")
else echo "[resident-confined] precompiled build unavailable/stale ⇒ tsx fallback" >&2; CMD=("$REPO/node_modules/.bin/tsx" "$REPO/runtime/bin/odg-resident-driver-tick.ts"); VMEM=unlimited; fi
# phase 2 (confined) — nothing writable on the host (the tick's own append fails read-only and is ignored by design)
ODG_CONFINED_TMP_MB="$(num "${ODG_RESIDENT_TMP_MB:-}" 64 4096)" odg_confined_view "$REPO"
for v in ODG_TRUTH_LOCK_ENFORCE ODG_SCHEDULER_STOP; do [ -n "${!v:-}" ] && BW+=(--setenv "$v" "${!v}"); done
MAXKB="$(num "${ODG_RESIDENT_MAX_FILE_KB:-}" 1024 4194304)"; BLOCKS=$(( MAXKB * 2 ))   # dash ulimit -f counts 512-byte blocks
NPROC="$(num "${ODG_RESIDENT_MAX_PROCS:-}" 128 4096)"   # RLIMIT_NPROC, counted per sandbox user namespace (threads included)
TO="$(num "${ODG_RESIDENT_TIMEOUT:-}" 60 86400)"
ERRKB="$(num "${ODG_RESIDENT_STDERR_KB:-}" 16 1024)"
W="$(mktemp -d "${TMPDIR:-/tmp}/odg-resident-confined.XXXXXX")"; trap 'rm -rf -- "$W"' EXIT
mkfifo -m 600 "$W/err"
# stderr: kept visible but bounded (ERRKB) and sanitized below; the excess is DRAINED (the tick never gets EPIPE).
{ head -c $(( ERRKB * 1024 )); cat >/dev/null; } <"$W/err" >"$W/err.txt" & EPID=$!
# stdout: 64 KiB + 1 byte kept (the extra byte detects truncation), the excess drained. Process chain: this shell → setpriv
# (PDEATHSIG=KILL, then execs) timeout → bwrap --die-with-parent (parent = timeout) → sandbox PID namespace. A SIGKILL of the
# launcher kills timeout, which kills bwrap, which tears down the whole namespace (no orphan); timeout bounds the run.
START=$SECONDS
set +e
setpriv --pdeathsig KILL -- timeout -k 5 "$TO" "${BW[@]}" --chdir "$REPO" /bin/sh -c 'ulimit -f "$1" && ulimit -p "$2" && ulimit -v "$3" || exit 126; shift 3; exec "$@"' sh "$BLOCKS" "$NPROC" "$VMEM" "${CMD[@]}" 2>"$W/err" \
  | { head -c 65537 >"$W/out"; cat >/dev/null; }
RC="${PIPESTATUS[0]}"
set -e
ELAPSED=$(( SECONDS - START ))
wait "$EPID" 2>/dev/null || true
ERRSZ=$(stat -c %s "$W/err.txt"); OUTSZ=$(stat -c %s "$W/out")
if [ "$ERRSZ" -gt 0 ]; then LC_ALL=C tr -c '[:print:]\n' '?' <"$W/err.txt" | sed -e '$a\' >&2
  if [ "$ERRSZ" -ge $(( ERRKB * 1024 )) ]; then echo "[resident-confined] confined stderr truncated at ${ERRKB} KiB" >&2; fi; fi
TRUNC=0; if [ "$OUTSZ" -gt 65536 ]; then TRUNC=1; fi
if [ "$OUTSZ" -gt 0 ]; then head -c 65536 "$W/out" | LC_ALL=C tr -c '[:print:]\n' '?' | sed -e '$a\'; fi
# phase 3 (trusted) — the launcher writes the trace; strict format, printable ASCII only, bounded length
LINE=$(head -c 65536 "$W/out" | LC_ALL=C grep -a -E '^\[[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z\] L0 tick: [[:print:]]{1,480}$' | tail -n 1 || true)
TS="$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)"   # the LAUNCHER's clock stamps the line (confined code cannot back/forward-date it)
# TIMEOUT only when timeout fired (rc 124 TERM / 137 KILL) AND the bound really elapsed — a tick exiting 124 itself is not one.
if { [ "$RC" = 124 ] || [ "$RC" = 137 ]; } && [ "$ELAPSED" -ge "$TO" ]; then
  LINE="[$TS] L0 tick: state=TIMEOUT rc=$RC timeout=${TO}s truncated=$TRUNC modifiedBusinessState=unknown"
elif [ "$TRUNC" = 1 ]; then LINE="[$TS] L0 tick: state=INVALID_TRACE rc=$RC truncated=1 (confined stdout exceeded 64 KiB) modifiedBusinessState=unknown"
elif [ -n "$LINE" ]; then LINE="[$TS] ${LINE#*\] }"
else LINE="[$TS] L0 tick: state=INVALID_TRACE rc=$RC truncated=0 (confined output did not match the trace format) modifiedBusinessState=unknown"; fi
if [ -L "$LOG" ] || [ ! -f "$LOG" ]; then echo "[resident-confined] REFUSED: $LOG is not a regular file (symlink?)" >&2; exit 1; fi
printf '%s\n' "$LINE" >> "$LOG"
exit "$RC"
