#!/usr/bin/env bash
# V15 — CONFINED launcher for the resident driver: runs the normal freshness-guarded launcher
# (scripts/odg-resident-driver-run.sh) inside bubblewrap. Replaces the systemd ProtectSystem/ProtectHome proposal, which
# is fragile on this host (kernel.apparmor_restrict_unprivileged_userns=1 can deny the user manager's namespace setup),
# whereas bwrap has its own AppArmor profile (bwrap-userns-restrict) and is tested here end to end without systemd.
# View: system dirs + node + node_modules + the repo READ-ONLY; WRITABLE only runtime/logs and runtime/dist (the trace
# and the rebuildable build); /tmp, /run private tmpfs (no host Unix socket); all namespaces unshared (no network).
# Usage: scripts/odg-resident-driver-confined.sh [repo]   — exit code of the tick is preserved.
set -euo pipefail
REPO="$(cd "${1:-$(dirname "${BASH_SOURCE[0]}")/..}" && pwd -P)"
# shellcheck source=lib/odg-confined-view.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/odg-confined-view.sh"
odg_confined_view "$REPO" runtime/logs runtime/dist
for v in ODG_TRUTH_LOCK_ENFORCE ODG_SCHEDULER_STOP; do [ -n "${!v:-}" ] && BW+=(--setenv "$v" "${!v}"); done
exec "${BW[@]}" --chdir "$REPO" /bin/bash scripts/odg-resident-driver-run.sh
