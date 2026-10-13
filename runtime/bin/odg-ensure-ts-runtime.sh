#!/usr/bin/env bash
#
# odg-ensure-ts-runtime.sh — η3-B104
#
# EXPLICIT, CONTROLLED, REPRODUCIBLE build of the compiled TypeScript runtime AT THE ENTRY POINT.
# Invoked ONLY on the opt-in path (ODG_RUNTIME=ts, see odg-local-pipeline.sh). It honours the ODG
# packaging doctrine:
#   - runtime/dist stays GENERATED and git-ignored (never committed, never shipped);
#   - NO implicit npm postinstall; the build happens only when an operator explicitly selected the
#     TS runtime and the distribution is absent or structurally invalid;
#   - NO tsx-as-production-runtime: this performs a real `tsc` emit + deterministic closure copy,
#     then runs plain compiled JavaScript;
#   - NO SILENT FALLBACK to the JS runtime: if the build or its validation fails, exit non-zero and
#     let the caller STOP loudly.
#
# Rollback: unset ODG_RUNTIME (or ODG_RUNTIME=js) to use the default JavaScript runtime; this script
# is never invoked on that path. Force a clean rebuild with ODG_TS_REBUILD=1.
#
# Validity is STRUCTURAL (presence + manifest self-consistency + every copied dependency present).
# It is NOT a byte-provenance check against the source tree; deep staleness detection is documented
# future hardening. `ODG_TS_REBUILD=1` is the explicit escape hatch when a stale dist is suspected.
set -euo pipefail

DIST="runtime/dist"
MANIFEST="${DIST}/dist-closure-manifest.json"

# Structural validator: entry present, core/ present, manifest parseable + self-consistent, and every
# file the manifest claims to have copied actually exists. Exit 0 = valid, non-zero = (re)build needed.
valid_dist() {
  [ -f "${DIST}/bin/odg-run.js" ] || return 1
  [ -d "${DIST}/core" ] || return 1
  [ -f "${MANIFEST}" ] || return 1
  node -e '
    const fs = require("fs"), path = require("path");
    try {
      const m = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      if (typeof m.totalClosure !== "number" || m.totalClosure !== m.emittedCount + m.copiedCount) process.exit(1);
      for (const c of (m.copied || [])) {
        const rel = typeof c === "string" ? c : (c && (c.rel || c.to || c.path || c.file));
        if (rel && !fs.existsSync(path.join("runtime", "dist", rel))) process.exit(1);
      }
      process.exit(0);
    } catch (e) { process.exit(1); }
  ' "${MANIFEST}" || return 1
  return 0
}

if [ "${ODG_TS_REBUILD:-0}" = "1" ]; then
  echo "[TS-RUNTIME] ODG_TS_REBUILD=1 — forcing a clean rebuild of ${DIST}."
  rm -rf "${DIST}"
fi

if valid_dist; then
  echo "[TS-RUNTIME] existing ${DIST} is structurally valid — reusing (set ODG_TS_REBUILD=1 to force a rebuild)."
  exit 0
fi

echo "[TS-RUNTIME] ${DIST} is absent or structurally invalid — performing an explicit controlled build (tsc + closure)."

# Always build from a CLEAN dist so every build is deterministic/reproducible and the manifest's
# emitted/copied classification is stable (a dirty re-emit over a populated dist/core drifts the
# accounting and can reclassify copied JS deps). This mirrors the clean-room build proved in B103.
rm -rf "${DIST}"

if ! command -v node >/dev/null 2>&1; then
  echo "[TS-RUNTIME] node is not available. Cannot build the compiled runtime. NO silent fallback." >&2
  exit 1
fi
if [ ! -x "node_modules/.bin/tsc" ]; then
  echo "[TS-RUNTIME] TypeScript toolchain (node_modules/.bin/tsc) is not installed." >&2
  echo "[TS-RUNTIME] Install dependencies first (the compiled runtime needs devDependencies). NO silent fallback." >&2
  exit 1
fi
if [ ! -f "tsconfig.runtime-dist.json" ] || [ ! -f "scripts/build-dist-closure.js" ]; then
  echo "[TS-RUNTIME] build inputs missing (tsconfig.runtime-dist.json / scripts/build-dist-closure.js). NO silent fallback." >&2
  exit 1
fi

node_modules/.bin/tsc -p tsconfig.runtime-dist.json
node scripts/build-dist-closure.js

if ! valid_dist; then
  echo "[TS-RUNTIME] build completed but ${DIST} is still structurally invalid. NO silent fallback." >&2
  exit 1
fi

echo "[TS-RUNTIME] explicit controlled build OK — ${DIST} is ready."
exit 0
