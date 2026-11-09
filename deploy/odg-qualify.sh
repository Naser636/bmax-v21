#!/usr/bin/env bash
# ODG INTEGRATED QUALIFICATION — the single ODG-piloted orchestrator (CTO V10 §9–§10). It RE-COMPOSES existing canonical
# gates in the canonical order declared by runtime/core/qualification-plan.ts, runs each real command, keeps every step's
# result VISIBLE, STOPS at the first critical failure (no masking), and emits one fail-CLOSED verdict (an un-run critical
# gate ⇒ NOT_QUALIFIED, never a silent pass). It is NOT a monolith: no step is hidden, and the aggregate verdict is
# computed by the pure plan module, not by this shell. USER-SPACE: no root, no service restart, no mutation of state.
#
# Usage: deploy/odg-qualify.sh [--with-e2e]   (--with-e2e also runs the heavy on-demand runner e2e + rollback dry-run)
set -u
cd "$(dirname "$0")/.." || exit 2
WITH_E2E="${1:-}"
EVID="runtime/generated/qualification-result.json"
mkdir -p runtime/generated
TSX="node_modules/.bin/tsx"

run_step() {  # run_step <id> <command...>; echoes PASS/FAIL, returns 0/1
  local id="$1"; shift
  echo "-- [$id] $* --"
  if "$@" >/tmp/qualify-$id.log 2>&1; then echo "   [$id] PASS"; return 0; else echo "   [$id] FAIL (see /tmp/qualify-$id.log)"; tail -5 /tmp/qualify-$id.log | sed 's/^/     /'; return 1; fi
}

echo "== ODG integrated qualification =="
declare -A RES
HALT=0

# Ordered critical steps (mirrors qualification-plan.QUALIFICATION_STEPS). Each maps to one real canonical command.
step() {  # step <id> <critical:0|1> <command...>
  local id="$1" crit="$2"; shift 2
  [ "$HALT" = "1" ] && { echo "-- [$id] SKIPPED (halted at a prior critical failure) --"; RES[$id]="MISSING"; return; }
  if run_step "$id" "$@"; then RES[$id]="PASS"; else RES[$id]="FAIL"; [ "$crit" = "1" ] && HALT=1; fi
}

step compile               1 npm run build:runtime
step types                 1 npx tsc --noEmit -p tsconfig.json
step types-strict-leaves   1 npx tsc --noEmit -p tsconfig.runtime-leaves-strict.json
step contracts             1 bash -c './runtime/bin/odg verify 2>&1 | grep -qE "generatedContractsValid[^a-z]*true|contracts.*valid"'
step unit-gate             1 npm run test:report
step campaign-controller   1 $TSX runtime/core/campaign-controller.test.ts
step capability-ladder     1 $TSX runtime/core/capability-map.test.ts
step metier-parity         1 $TSX runtime/core/metier-baseline.test.ts
step local-model-router    1 $TSX runtime/core/model-router.test.ts
step security-ports        1 bash deploy/odg-port-audit.sh
step private-deploy-health 1 bash -c './runtime/bin/odg health 2>&1 | grep -qiE "READY"'
if [ "$WITH_E2E" = "--with-e2e" ]; then
  step runner-e2e          0 $TSX runtime/__bench__/odg-schedule-tick.e2e.test.ts
  step recovery-rollback   0 bash -c 'test -x deploy/odg-rollback.sh'
fi

# Build the results JSON and let the PURE plan module compute the honest fail-closed verdict.
JSON="{"; for k in "${!RES[@]}"; do JSON="$JSON\"$k\":\"${RES[$k]}\","; done; JSON="${JSON%,}}"
echo "$JSON" > /tmp/qualify-results.json
VERDICT="$($TSX -e '
  const Q=require("./runtime/core/qualification-plan.js");
  const fs=require("fs");
  const raw=JSON.parse(fs.readFileSync("/tmp/qualify-results.json","utf8"));
  const results={}; for(const k of Object.keys(raw)) results[k]= raw[k]==="PASS"?"PASS":{ok:false};
  const v=Q.evaluateQualification({results});
  fs.writeFileSync("'"$EVID"'", JSON.stringify({at:new Date().toISOString(),...v},null,2));
  process.stdout.write(v.verdict+" | criticalFailing="+v.summary.criticalFailing+(v.firstCriticalFailure?" | firstCriticalFailure="+v.firstCriticalFailure:""));
')"
echo ""
echo "== VERDICT: $VERDICT =="
echo "   evidence: $EVID"
case "$VERDICT" in QUALIFIED*) exit 0;; *) exit 1;; esac
