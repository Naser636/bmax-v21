#!/usr/bin/env bash
# V375 Lot B — run ONE resident-driver L1 SIMULATE cycle under bubblewrap with the WHOLE filesystem READ-ONLY and NO
# network (all namespaces unshared), then compare a repository fingerprint before/after. The READ-ONLY mount is the
# structural proof; the fingerprint is a supplementary check (a concurrent mission-runner tick writing
# runtime/generated would change it without any L1 write — re-run if zeroWrite=false and inspect).
# Dev/sandbox only: no systemd, no sudo, no unit change. Usage: scripts/odg-resident-driver-l1-sandbox.sh [repo]
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"   # code (cycle + core) comes from THIS checkout
REPO="$(cd "${1:-$HERE}" && pwd -P)"; cd "$REPO"                 # state (companion, fingerprint) comes from the target repo
fp() {   # HEAD + index/worktree status + content hash of tracked files + listing of runtime/{generated,logs}
  { git rev-parse HEAD; git status --porcelain=v1 --untracked-files=all; git ls-files -s | sha256sum;
    { find runtime/generated runtime/logs -type f -printf '%p %s %T@\n' 2>/dev/null || true; } | sort; } | sha256sum | cut -d' ' -f1
}
before=$(fp)
NODE="$(command -v node)"; TSX="$HERE/node_modules/.bin/tsx"
out=$(bwrap --ro-bind / / --dev /dev --proc /proc --tmpfs /tmp --unshare-all --die-with-parent --new-session \
        --chdir "$REPO" --setenv TMPDIR /tmp --setenv HOME /tmp ${ODG_SCHEDULER_STOP:+--setenv ODG_SCHEDULER_STOP "$ODG_SCHEDULER_STOP"} \
        "$NODE" "$TSX" "$HERE/runtime/bin/odg-resident-driver-l1-cycle.ts")
# negative control: the same sandbox must REFUSE a write into the repository (proves the RO confinement is real)
if bwrap --ro-bind / / --dev /dev --proc /proc --tmpfs /tmp --unshare-all --die-with-parent --chdir "$REPO" \
     /bin/sh -c 'echo x > runtime/logs/.l1-write-probe' 2>/dev/null; then rw=WRITABLE; rm -f runtime/logs/.l1-write-probe; else rw=READ_ONLY; fi
net=$(bwrap --ro-bind / / --dev /dev --proc /proc --tmpfs /tmp --unshare-all --die-with-parent "$NODE" -e 'const n=require("os").networkInterfaces();process.stdout.write(Object.keys(n).join(","))')
after=$(fp)
printf '{"sandbox":{"fs":"%s","netInterfaces":"%s"},"fingerprintBefore":"%s","fingerprintAfter":"%s","zeroWrite":%s,"cycle":%s}\n' \
  "$rw" "$net" "$before" "$after" "$([ "$before" = "$after" ] && echo true || echo false)" "$out"
