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

# WI-3 — baseline-relative governance. The pre-flight [1/5] captures a verifiable BASELINE of the dirty
# tree here and the post-run gate [5/5] charges the mission with ONLY its delta vs that baseline (via the
# checkpoint-engine classifier shared with the Validation Engine). Pre-existing operator work is therefore
# PRESERVED, not a reason to STOP — yet NEVER a licence to modify it: a pre-existing file the mission
# further changes has a different content-hash ⇒ counted as mission-touched ⇒ fail-closed. The baseline is
# a git-ignored Runtime artifact under runtime/generated/ (so it never pollutes its own classification).
# FINALIZE_*/CLOSEOUT_* capture NO baseline (empty baseline ⇒ byte-identical pre-WI-3 strict end-clean).
BASELINE_FILE="runtime/generated/mission-baseline.json"

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
# --report-only: the pre-flight only needs odg-verify to STAMP runtime-verify.json; this pipeline does
# its OWN content gating below (build/tsc at [1/5], gitClean with the FINALIZE_*/CLOSEOUT_* exception).
# odg-verify now exits non-zero on a red/dirty verification (so `odg delegate`/`system-ready` stop
# honestly), and under `set -e` that would abort this pre-flight before the content gates run — and
# wrongly break the finalize-mission dirty-tree entry. report-only keeps odg-verify a pure stamper here.
node runtime/bin/odg-verify.js "$MISSION" --report-only

BUILD_OK=$(node -e "try{process.stdout.write(String(require('./runtime/generated/runtime-verify.json').build===true))}catch(e){process.stdout.write('false')}")
TSC_OK=$(node -e "try{process.stdout.write(String(require('./runtime/generated/runtime-verify.json').typescript===true))}catch(e){process.stdout.write('false')}")

if [ "$BUILD_OK" != "true" ] || [ "$TSC_OK" != "true" ]; then
  echo "STOP: canonical verifier reported failing gates (build=${BUILD_OK}, typescript=${TSC_OK})."
  exit 1
fi

# ROOT CAUSE FIX (circular finalization deadlock): the pre-flight dirty-tree STOP is unconditional,
# but FINALIZE_*/CLOSEOUT_* missions exist PRECISELY to commit/finalize pending Runtime work — the
# very work that makes the tree dirty. Requiring gitClean=true BEFORE they run is circular: they can
# never run to produce the clean tree the gate demands. For those mission classes we DO NOT hard-STOP
# on a dirty tree here; we let the mission run its own finalization first. Governance is NOT weakened:
# the [5/5] post-run gate below still requires the tree to end clean (gitClean=true), so a finalize
# mission that fails to actually finalize still fails. Every OTHER mission keeps the byte-for-byte
# pre-flight STOP (the Patch Executor must never run on a dirty/red tree).
case "$MISSION" in
  FINALIZE_*|CLOSEOUT_*)
    # Finalization missions exist to COMMIT/finalize pending Runtime work, so they do NOT capture a
    # baseline (empty baseline ⇒ the [5/5] gate keeps its strict end-clean semantics, byte-identical to
    # the pre-WI-3 behaviour). Blanking BASELINE_FILE also makes [5/5] ignore any stale baseline left on
    # disk by a prior non-finalize run.
    BASELINE_FILE=""
    DIRTY_TRACKED=$(git diff --name-only -- "${ARTIFACT_EXCLUDES[@]}")
    if [ -n "$DIRTY_TRACKED" ]; then
      echo "NOTE: tree is dirty on entry; ${MISSION} is a finalization mission and will finalize it."
      echo "Pending tracked files (to be finalized by this mission):"
      echo "$DIRTY_TRACKED"
      echo
    fi
    ;;
  *)
    # WI-3: capture a verifiable baseline of the CURRENT dirty tree instead of hard-STOPping on
    # pre-existing work. The Patch Executor is still protected: the build/tsc gate above blocks a RED
    # tree, and any file the mission actually touches (including a pre-existing one it further modifies)
    # is attributed to the mission at [5/5] and fails closed if out-of-scope. Governance safety (CTO):
    # an existing baseline that is CORRUPT or DIVERGENT from the current tree is NEVER auto-overwritten —
    # the pipeline STOPs and leaves it untouched for human review. Only an absent or byte-identical
    # (REUSE) baseline lets the run proceed.
    BF_STATUS=$(BF="$BASELINE_FILE" node -e '
      const fs = require("fs");
      const ce = require("./runtime/core/checkpoint-engine");
      const bf = process.env.BF;
      if (fs.existsSync(bf)) {
        let prev = null;
        try { prev = JSON.parse(fs.readFileSync(bf, "utf8")); } catch {}
        if (!prev || typeof prev !== "object" || !prev.paths || typeof prev.paths !== "object") {
          process.stdout.write("CORRUPT"); process.exit(0);
        }
        const cur = ce.snapshotDirty();
        const a = Object.keys(prev.paths).sort(), b = Object.keys(cur).sort();
        let same = a.length === b.length;
        for (let i = 0; same && i < a.length; i++) if (a[i] !== b[i] || prev.paths[a[i]] !== cur[a[i]]) same = false;
        process.stdout.write(same ? "REUSE" : "DIVERGENT"); process.exit(0);
      }
      ce.writeBaseline(bf);
      process.stdout.write("WROTE");
    ' 2>/dev/null || true)
    case "$BF_STATUS" in
      WROTE|REUSE)
        : # absent ⇒ fresh baseline captured; REUSE ⇒ identical baseline from an interrupted run — proceed.
        ;;
      CORRUPT)
        echo "STOP: mission baseline is corrupt (${BASELINE_FILE})."
        echo "It was NOT overwritten (governance safety). Remove it after review to re-capture a clean baseline."
        exit 1
        ;;
      DIVERGENT)
        echo "STOP: an existing mission baseline diverges from the current tree (${BASELINE_FILE})."
        echo "It was NOT overwritten automatically (governance safety). A prior run likely ended in"
        echo "PENDING_COMMIT/OUTSIDE; resolve it, then remove the baseline to re-capture."
        exit 1
        ;;
      *)
        echo "STOP: baseline capture failed (status='${BF_STATUS:-<none>}')."
        exit 1
        ;;
    esac
    ;;
esac

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

# Runtime selector (η3-B102; entry build η3-B104; DEFAULT FLIPPED to TypeScript η3-B108). PUBLISHED
# DEFAULT = compiled TypeScript. ROLLBACK to JavaScript = ODG_RUNTIME=js (explicit). runtime/dist stays
# generated + git-ignored (never committed, no implicit postinstall); on the TS path an EXPLICIT,
# controlled, reproducible build is performed at the entry if the distribution is absent or
# structurally invalid or STALE (helper: odg-ensure-ts-runtime.sh — real tsc emit + closure copy +
# provenance/freshness, NOT tsx). If that build or its validation fails the launcher STOPS loudly; it
# NEVER silently falls back to the JS runtime. Set ODG_RUNTIME=js to return to the JavaScript runtime.
if [ "${ODG_RUNTIME:-ts}" = "ts" ]; then
  if ! bash runtime/bin/odg-ensure-ts-runtime.sh; then
    echo "[PIPELINE] ODG_RUNTIME=ts but the compiled runtime could not be ensured (see [TS-RUNTIME] above)." >&2
    echo "[PIPELINE] Fix the build, or unset ODG_RUNTIME to use the JS runtime. NO silent fallback." >&2
    exit 1
  fi
  echo "[PIPELINE] Runtime engine: COMPILED TypeScript (runtime/dist, ODG_STAGE_BASE=${ODG_STAGE_BASE:-runtime/dist/core})"
  ODG_STAGE_BASE="${ODG_STAGE_BASE:-runtime/dist/core}" node runtime/dist/bin/odg-run.js "$MISSION"
else
  echo "[PIPELINE] Runtime engine: JavaScript (default)"
  node runtime/bin/odg-run.js "$MISSION"
fi

# W6 observability (η3-B110) — STRICTLY OBSERVATIONAL. Runs AFTER the mission is finalized; reads the
# canonical mission-report and appends one W6 journal record under runtime/generated/w6/. Fully guarded
# (`|| true`, stderr muted): a collection failure can NEVER change the mission result or exit code — the
# collector logs its own failure as an observability incident and still exits 0. Opt-out: ODG_W6_OBSERVE=0.
if [ "${ODG_W6_OBSERVE:-1}" = "1" ]; then
  node scripts/w6-collect.js "$MISSION" "A-shell:${ODG_RUNTIME:-ts}" 2>/dev/null || true
fi

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

# WI-3 — baseline-relative verdict. postGateVerdict (checkpoint-engine, the SAME classifier the Validation
# Engine uses) charges the mission with ONLY its delta vs the [1/5] baseline; an empty baseline
# (FINALIZE_*/CLOSEOUT_*, or BASELINE_FILE blanked) ⇒ strict end-clean, byte-identical to pre-WI-3. The
# classification is then composed with the SAME artifact exclusion the gate has always applied — factory-
# stamped contracts + *.evidence.md are Runtime bookkeeping, never "real work" (identical predicate to the
# ARTIFACT_EXCLUDES set above / odg-verify.js generatedContractExcludes). verdictOf is the engine's own
# pure mapping: CLEAN ⇒ proceed; PENDING_COMMIT ⇒ in-scope deliverable awaiting the HUMAN commit gate
# (exit 20); OUTSIDE ⇒ a mission-produced out-of-scope change ⇒ hard STOP (exit 1). gitClean is NOT
# weakened: a dirty tree is NEVER reported clean (gitClean ⇔ verdict CLEAN).
GATE=$(MISSION="$MISSION" BF="$BASELINE_FILE" node -e '
  const fs = require("fs");
  const ce = require("./runtime/core/checkpoint-engine");
  const mission = process.env.MISSION;
  let authorizedPaths = [];
  try {
    const c = JSON.parse(fs.readFileSync("runtime/missions/" + mission + ".json", "utf8"));
    authorizedPaths = c.authorized_paths || c.authorizedPaths || [];
  } catch {}
  const bf = process.env.BF;
  const useBaseline = Boolean(bf) && fs.existsSync(bf);
  const res = ce.postGateVerdict({ baselineFile: useBaseline ? bf : undefined, authorizedPaths });
  const isArtifact = (p) => {
    if (/^runtime\/missions\/[^\/]+\.evidence\.md$/.test(p)) return true;
    if (/^runtime\/missions\/[^\/]+\.json$/.test(p)) {
      try { const c = JSON.parse(fs.readFileSync(p, "utf8")); return Boolean(c) && c.generatedBy === "mission-contract-factory"; }
      catch { return false; }
    }
    return false;
  };
  const strip = (a) => (Array.isArray(a) ? a : []).filter((p) => !isArtifact(p));
  const cls = {
    preExisting: strip(res.preExisting),
    missionTouched: strip(res.missionTouched),
    inScope: strip(res.inScope),
    unexpected: strip(res.unexpected),
  };
  const verdict = ce.verdictOf(cls);
  const offending = verdict === "OUTSIDE" ? cls.unexpected : verdict === "PENDING_COMMIT" ? cls.inScope : [];
  process.stdout.write(verdict + "\n" + offending.join("\n"));
' 2>/dev/null || true)
VERDICT=$(printf '%s' "$GATE" | head -n 1)
VERDICT="${VERDICT:-OUTSIDE}"
OFFENDING=$(printf '%s' "$GATE" | tail -n +2)

# S3 (review N4 remediation) — keep runtime-verify.json coherent with the POST-APPLICATION tree. The [1/5]
# pre-flight stamped gitClean BEFORE the Patch Executor ran; re-stamp it here from the authoritative
# verdict so any reader sees the REAL post-apply state: clean IFF the mission produced NOTHING dirty.
VERDICT="$VERDICT" node -e '
  const fs = require("fs");
  const f = "runtime/generated/runtime-verify.json";
  try {
    const v = JSON.parse(fs.readFileSync(f, "utf8"));
    v.gitClean = process.env.VERDICT === "CLEAN";
    fs.writeFileSync(f, JSON.stringify(v, null, 2));
  } catch { /* best-effort: artifact absent ⇒ nothing to re-stamp */ }
' || true

if [ "$VERDICT" = "PENDING_COMMIT" ]; then
  echo "VALIDATED_PENDING_COMMIT: mission validated + proven; the engineering deliverable is ENTIRELY within"
  echo "authorized_paths and awaits the HUMAN commit gate (ODG never auto-commits; tree is NOT clean)."
  echo "Pending (authorized) changes:"
  echo "$OFFENDING"
  echo
  exit 20
fi
if [ "$VERDICT" = "OUTSIDE" ]; then
  echo "STOP: Repository changed unexpectedly"
  echo
  echo "Changes outside mission artifact directories:"
  echo "$OFFENDING"
  echo
  exit 1
fi

# verdict CLEAN ⇒ the mission produced nothing dirty (all remaining dirt is preserved pre-existing work).
# Consume THIS run's baseline so the next run captures a fresh one. Only a CLEAN success reaches here, so
# the file removed is this run's own clean, consumed baseline — NEVER a divergent/corrupt one (those
# hard-STOP at [1/5] and are deliberately left untouched for human review).
[ -n "$BASELINE_FILE" ] && rm -f "$BASELINE_FILE"

echo "[6/6] COMPLETE"

echo "======================================"
echo "MISSION SUCCESS"
echo "======================================"
echo "Mission : ${MISSION}"
echo "======================================"
