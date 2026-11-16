#!/usr/bin/env bash
# V244 — precompile the resident-driver L0 tick to node-runnable JS (no tsx at runtime). TypeScript stays the source of
# truth. It TRANSPILES (does NOT bundle) each file of the tick's dependency closure into runtime/dist/ mirroring
# runtime/{core,bin} — non-bundling keeps each module its own file so per-module `require.main === module` CLI guards
# behave correctly (esbuild --bundle misfires them). A source-hash sidecar lets the launcher refuse a STALE build.
# No sudo, no network. Reproducible.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$REPO"
SRC="runtime/bin/odg-resident-driver-tick.ts"
META="runtime/dist/bin/odg-resident-driver-tick.meta.json"
HASH="runtime/dist/bin/odg-resident-driver-tick.srchash"
mkdir -p runtime/dist/bin runtime/dist/core
# 1) discover the exact closure via a throwaway bundle metafile (the bundle itself is NOT run — only its input list is used).
node_modules/.bin/esbuild "$SRC" --bundle --platform=node --metafile="$META" --outfile=/dev/null >/dev/null 2>&1
# 2) transpile each closure .ts (NON-bundle) into runtime/dist/{core,bin} (outbase=runtime ⇒ core/x.ts -> dist/core/x.js).
mapfile -t FILES < <(node -e 'const m=require("./'"$META"'");for(const p of Object.keys(m.inputs))if(p.endsWith(".ts")&&!p.includes("node_modules"))console.log(p)')
node_modules/.bin/esbuild "${FILES[@]}" --platform=node --format=cjs --outbase=runtime --outdir=runtime/dist --log-level=error >/dev/null
# 3) freshness fingerprint = sha256 over the sorted content of every closure input (written to HASH).
HASH="$HASH" node -e '
  const fs=require("fs"),cp=require("crypto");
  const inputs=process.argv.slice(1).sort(), h=cp.createHash("sha256");
  for(const f of inputs){ h.update(f); h.update("\0"); h.update(fs.readFileSync(f)); h.update("\0"); }
  fs.writeFileSync(process.env.HASH, JSON.stringify({hash:h.digest("hex"),inputs}));
' "${FILES[@]}"
echo "built runtime/dist/bin/odg-resident-driver-tick.js (${#FILES[@]} closure files) + srchash"
