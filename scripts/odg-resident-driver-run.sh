#!/usr/bin/env bash
# V244 — resident-driver L0 launcher: run the PRECOMPILED node build when FRESH (fast, low-RAM), else rebuild it, else
# fall back to tsx on the TS source. A STALE build is NEVER run. No sudo, no network. Deterministic choice.
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$REPO"
SRC="runtime/bin/odg-resident-driver-tick.ts"
OUT="runtime/dist/bin/odg-resident-driver-tick.js"
HASH="runtime/dist/bin/odg-resident-driver-tick.srchash"

# shellcheck source=lib/odg-resident-freshness.sh
. "$REPO/scripts/lib/odg-resident-freshness.sh"
fresh() { odg_resident_fresh; }

if fresh; then exec node "$OUT"; fi
# not fresh ⇒ rebuild (fast), then re-check; never run a stale build.
if bash scripts/odg-resident-driver-build.sh >/dev/null 2>&1 && fresh; then exec node "$OUT"; fi
# rebuild unavailable (e.g. esbuild missing) ⇒ safe fallback to the TS source via tsx (correctness over speed).
echo "[resident-driver-run] precompiled build unavailable/stale ⇒ tsx fallback" >&2
exec "$REPO/node_modules/.bin/tsx" "$SRC"   # local bin: no npx, no ~/.npm cache (V15: works under a read-only HOME)
