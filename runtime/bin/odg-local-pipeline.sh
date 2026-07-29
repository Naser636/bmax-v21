#!/usr/bin/env bash
set -euo pipefail

# Local-mission execution route of the ONE Runtime (single-entrypoint consolidation).
#
# This is NOT a fallback to a second engine — the legacy engine is gone and there is
# a single execution pipeline. It contains NO
# execution logic of its own: it reuses the SAME shared components the rest of the
# Runtime uses — runtime/bin/odg-verify.js (verification)
# and runtime/bin/odg-run.js (the real staged pipeline). The gates it applies
# (build/tsc pre-flight, dirty-tree pre/post governance, report validated+SUCCESS)
# are LOAD-BEARING: the pipeline's Patch Executor runs BEFORE the Validation
# Engine gate (pipeline-builder), so removing the pre-flight gate would execute
# real patches on a red/dirty tree — a different observable behaviour. They are
# therefore preserved byte-for-byte to keep behaviour identical.
#

MISSION="${1:-default}"
DATE=$(date -Iseconds)
COMMIT=$(git rev-parse --short HEAD)
BRANCH=$(git branch --show-current)

# Runtime-owned artifact paths (git-ignored, regenerated every run). Identical set
# to the legacy engine so the pre-flight and post-run governance checks agree on
# exactly which paths are Runtime outputs; any change OUTSIDE them is real work.
#
# The engine's own [4/5] outputs (passport/report/certificate/history/generated JSON) are written
# under runtime/generated/ (git-ignored), so git never reports them and they need no pathspec
# exclusion here — only the Provider-emitted mission evidence needs registering.
#
# Contract-On-Demand contracts synthesised for the active mission are Runtime-owned bookkeeping:
# content-stamped `generatedBy: "mission-contract-factory"`, idempotently regenerated on EVERY run,
# and already certified structurally valid by odg-verify.js's generatedContractsValid gate. Like the
# evidence files above they must never count as an "unexpected" repository change — otherwise the
# factory re-materialises them each run, churning runtime/missions/, so the [5/5] governance gate can
# never pass for a contract-on-demand mission (the observed "STOP: Repository changed unexpectedly").
# Excluded by CONTENT stamp ONLY — identical discipline to runtime/bin/odg-verify.js's
# generatedContractExcludes() — so a hand-authored contract or any real source change is still judged
# honestly and governance/determinism/auditability stay fully intact.
#
# ROOT CAUSE FIX: this exclude set is (re)computed from the CURRENT tree, never snapshotted once at
# startup. The Mission Loader synthesises runtime/missions/<MISSION>.json ON DEMAND *during* the
# pipeline run (node runtime/bin/odg-run.js), i.e. AFTER the pre-flight was taken — so a snapshot
# built before the run would miss that just-generated, factory-stamped contract and the [5/5]
# governance gate would flag the Runtime's own expected artifact as an unexpected change. Recomputing
# immediately before each check keeps every run's synthesized contract recognised, while any file that
# is NOT a factory-stamped contract still counts as real work.
compute_artifact_excludes() {
  # Closing paren stays at column 0 so the single-source-of-truth exclusion set is parseable straight
  # out of this script (src/tests/mse-governance-gate.test.ts couples to it verbatim).
  ARTIFACT_EXCLUDES=(
    ':(exclude)runtime/missions/*.evidence.md'
)
  local line
  while IFS= read -r line; do
    [ -n "$line" ] && ARTIFACT_EXCLUDES+=("$line")
  done < <(node -e '
    const fs = require("fs");
    let files = [];
    try { files = fs.readdirSync("runtime/missions").filter((f) => f.endsWith(".json")).sort(); }
    catch { process.exit(0); }
    for (const f of files) {
      try {
        const c = JSON.parse(fs.readFileSync("runtime/missions/" + f, "utf8"));
        if (c && c.generatedBy === "mission-contract-factory") console.log(":(exclude)runtime/missions/" + f);
      } catch {}
    }
  ')
}

compute_artifact_excludes

echo "======================================"
echo "ODG LOCAL FALLBACK (modern)"
echo "======================================"

echo "[1/5] PRE-FLIGHT"

mkdir -p runtime/generated
node runtime/bin/odg-verify.js "$MISSION"

BUILD_OK=$(node -e "try{process.stdout.write(String(require('./runtime/generated/runtime-verify.json').build===true))}catch(e){process.stdout.write('false')}")
TSC_OK=$(node -e "try{process.stdout.write(String(require('./runtime/generated/runtime-verify.json').typescript===true))}catch(e){process.stdout.write('false')}")

if [ "$BUILD_OK" != "true" ] || [ "$TSC_OK" != "true" ]; then
  echo "STOP: canonical verifier reported failing gates (build=${BUILD_OK}, typescript=${TSC_OK})."
  exit 1
fi

DIRTY_TRACKED=$(git diff --name-only -- "${ARTIFACT_EXCLUDES[@]}")
if [ -n "$DIRTY_TRACKED" ]; then
echo "STOP: Git repository is dirty"
echo
echo "Modified tracked files (outside mission artifacts):"
echo "$DIRTY_TRACKED"
echo
exit 1
fi

echo "[2/5] LOAD BRAIN"

BRAIN="runtime/brain/MASTER_PLAN.md"

if [ ! -f "$BRAIN" ]; then
  echo "STOP: Runtime Brain not found"
  exit 1
fi

echo "Brain loaded: $BRAIN"

echo "[BRAIN] Objectives:"
grep -E '^(MODE|MISSION:|NEXT_OBJECTIVES:|[0-9]+\.)' "$BRAIN" || true

echo "[3/5] INITIALIZE"

echo "[PIPELINE] Launching Runtime..."

node runtime/bin/odg-run.js "$MISSION"

mkdir -p runtime/generated/mission-artifacts/{generated,passports,reports,certificates,history}

echo "[4/5] GENERATE"

REPORT_STATUS=$(node -e "try{process.stdout.write(String(require('./runtime/generated/mission-report.json').status||'UNKNOWN'))}catch(e){process.stdout.write('UNKNOWN')}")
REPORT_VALIDATED=$(node -e "try{process.stdout.write(String(require('./runtime/generated/mission-report.json').validated===true))}catch(e){process.stdout.write('false')}")

if [ "$REPORT_VALIDATED" != "true" ] || [ "$REPORT_STATUS" != "SUCCESS" ]; then
  echo "STOP: mission not proven by the Validation Engine (status=${REPORT_STATUS}, validated=${REPORT_VALIDATED})."
  echo "No SUCCESS artifact will be written."
  exit 1
fi

cat > "runtime/generated/mission-artifacts/passports/${MISSION}.passport.md" <<PASS
Mission : ${MISSION}
Date : ${DATE}
Status : ${REPORT_STATUS}
Validated : ${REPORT_VALIDATED}
PASS

cat > "runtime/generated/mission-artifacts/reports/${MISSION}.report.md" <<REPORT
Mission : ${MISSION}
Status : ${REPORT_STATUS}
Validated : ${REPORT_VALIDATED}
REPORT

cat > "runtime/generated/mission-artifacts/certificates/${MISSION}.certificate.md" <<CERT
Mission : ${MISSION}
Commit : ${COMMIT}
Branch : ${BRANCH}
Date : ${DATE}
Status : ${REPORT_STATUS}
CERT

printf -- "- [%s] %s %s\n" "$DATE" "$MISSION" "$REPORT_STATUS" >> runtime/generated/mission-artifacts/history/history.md

cat > "runtime/generated/mission-artifacts/generated/${MISSION}.json" <<JSON
{
  "mission":"${MISSION}",
  "status":"${REPORT_STATUS}",
  "validated":${REPORT_VALIDATED}
}
JSON

echo "[5/5] GOVERNANCE"

# Recompute the exclude set from the tree AS IT IS NOW: the pipeline may have synthesized this
# mission's factory-stamped contract on demand (see compute_artifact_excludes above). Any file that
# is not such a Runtime artifact still surfaces as an unexpected change below.
compute_artifact_excludes

UNEXPECTED_CHANGES=$(git status --porcelain -- "${ARTIFACT_EXCLUDES[@]}")

if [ -n "$UNEXPECTED_CHANGES" ]; then
  echo "STOP: Repository changed unexpectedly"
  echo
  echo "Changes outside mission artifact directories:"
  echo "$UNEXPECTED_CHANGES"
  echo
  exit 1
fi

echo "[6/6] COMPLETE"

echo "======================================"
echo "MISSION SUCCESS"
echo "======================================"
echo "Mission : ${MISSION}"
echo "======================================"
