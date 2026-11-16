#!/usr/bin/env bash
# V244 — resident-driver L0 launcher: run the PRECOMPILED node build when FRESH (fast, low-RAM), else rebuild it, else
# fall back to tsx on the TS source. A STALE build is NEVER run. No sudo, no network. Deterministic choice.
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$REPO"
SRC="runtime/bin/odg-resident-driver-tick.ts"
OUT="runtime/dist/bin/odg-resident-driver-tick.js"
HASH="runtime/dist/bin/odg-resident-driver-tick.srchash"

fresh() {
  # fresh iff the build + srchash exist AND the recorded hash matches the CURRENT content of the same closure inputs.
  [ -f "$OUT" ] && [ -f "$HASH" ] || return 1
  HASH="$HASH" node -e '
    const fs=require("fs"),cp=require("crypto");
    let rec; try{ rec=JSON.parse(fs.readFileSync(process.env.HASH,"utf8")); }catch{ process.exit(1); }
    const h=cp.createHash("sha256");
    for(const f of rec.inputs){ try{ h.update(f); h.update("\0"); h.update(fs.readFileSync(f)); h.update("\0"); }catch{ process.exit(1);} }
    process.exit(h.digest("hex")===rec.hash?0:1);
  '
}

if fresh; then exec node "$OUT"; fi
# not fresh ⇒ rebuild (fast), then re-check; never run a stale build.
if bash scripts/odg-resident-driver-build.sh >/dev/null 2>&1 && fresh; then exec node "$OUT"; fi
# rebuild unavailable (e.g. esbuild missing) ⇒ safe fallback to the TS source via tsx (correctness over speed).
echo "[resident-driver-run] precompiled build unavailable/stale ⇒ tsx fallback" >&2
exec npx tsx "$SRC"
