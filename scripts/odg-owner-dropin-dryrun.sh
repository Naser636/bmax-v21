#!/usr/bin/env bash
# V16 — OWNER-RUN dry-run of the proposed confined drop-in (user systemd, no root, NOTHING installed).
# Runs the confined launcher in a TRANSIENT unit (systemd-run --user, auto-collected) with the properties the real unit
# would have (base unit + installed v364-hardening.conf + proposal), against a THROW-AWAY copy of HEAD — the installed
# odg-resident-driver.service/timer and the real repo are untouched. Three variants:
#   A  installed hardening + proposal WITHOUT the V16 relaxation  (expected: INVALID_TRACE — RestrictNamespaces=yes)
#   B  installed hardening + proposal WITH the V16 relaxation     (expected: one IDLE L0 line, rc 0)
#   C  = B with ODG_SCHEDULER_STOP=1                             (expected: state=STOPPED)
# Usage (owner): bash scripts/odg-owner-dropin-dryrun.sh            Rollback: nothing to roll back (transient units).
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
git -C "$REPO" archive HEAD runtime/core runtime/bin scripts docs/odg/v124-consolidated-roadmap.json package.json tsconfig.runtime-dist.json | tar -x -C "$T"
ln -s "$REPO/node_modules" "$T/node_modules"
COMMON=(-p PrivateNetwork=yes -p NoNewPrivileges=yes -p ProtectControlGroups=yes -p LockPersonality=yes -p RestrictRealtime=yes
        -p RestrictSUIDSGID=yes -p SystemCallArchitectures=native -p UMask=0027 -p Nice=10 -p CPUQuota=50%
        -p MemoryMax=512M -p MemorySwapMax=0 -p TasksMax=256 -p RuntimeMaxSec=120
        -E PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin -E ODG_TRUTH_LOCK_ENFORCE=1)
run() { local label="$1"; shift
  local n0; n0=0; [ -f "$T/runtime/logs/resident-driver-l0.log" ] && n0=$(wc -l < "$T/runtime/logs/resident-driver-l0.log")
  set +e; systemd-run --user --wait --collect --pipe --quiet -p WorkingDirectory="$T" "${COMMON[@]}" "$@" \
    /bin/bash -lc "bash scripts/odg-resident-driver-confined.sh '$T'" >"$T/$label.out" 2>&1; local rc=$?; set -e
  echo "== $label rc=$rc"; tail -n +$((n0+1)) "$T/runtime/logs/resident-driver-l0.log" 2>/dev/null | cut -c1-200; tail -2 "$T/$label.out" | cut -c1-200; }
run A -p RestrictNamespaces=yes -p RestrictAddressFamilies=AF_UNIX
run B -p "RestrictNamespaces=user mnt pid net ipc uts" -p "RestrictAddressFamilies=AF_UNIX AF_NETLINK"
run C -p "RestrictNamespaces=user mnt pid net ipc uts" -p "RestrictAddressFamilies=AF_UNIX AF_NETLINK" -E ODG_SCHEDULER_STOP=1
echo "Install only if B = one IDLE line (rc 0) and C = STOPPED. Install: copy the proposal to ~/.config/systemd/user/odg-resident-driver.service.d/zz-v15-confined-launcher.conf (name must sort AFTER v364-hardening.conf) ; systemctl --user daemon-reload ; check 'systemctl --user show odg-resident-driver -p RestrictNamespaces -p MemoryMax -p TasksMax' ; wait one timer tick. Rollback: delete that file ; systemctl --user daemon-reload."
