/*
 * Stage Effect Gate (RC-1) — a zero exit code is NOT proof a pipeline stage produced its effect.
 *
 * TypeScript canonical. Faithful port of the historical runtime/core/stage-effect.js; behaviour is
 * byte-identical. Strict-typed in η-ORCH-T2 (no ts-nocheck suppression); verified under
 * tsconfig.runtime-leaves-strict.json. The file stays a CommonJS module — `module.exports = { ... }` and the
 * exported names (STAGE_OUTPUTS, stageEffectOk, artifactNonEmpty) are preserved so the raw
 * `require("./stage-effect")` consumers are unchanged. The legacy .js is an INDEPENDENT byte-equivalent
 * implementation (NOT a shim re-exporting this module; corrected per η1-A) and remains the production default.
 *
 * runtime/bin/odg-run.js used to mark a stage DONE on `r.status === 0` alone. A stage could therefore exit 0
 * while having written no output at all; this module adds the missing predicate: a stage with a DECLARED
 * deterministic output artifact is only DONE when that artifact exists and is non-empty.
 *
 * Pure + deterministic: a function of (stage name, on-disk state) only; writes nothing.
 */

"use strict";

import * as fs from "fs";
import * as path from "path";

// stage name -> the single deterministic artifact it writes under runtime/generated/. A name absent from
// this map is an UNDECLARED stage (stageEffectOk returns true for it — the historical exit-0 => DONE path).
const STAGE_OUTPUTS: Record<string, string> = {
  "Mission Interpreter": "mission-interpretation.json",
  "Mission Loader": "mission-plan.json",
  "Execution Planner": "execution-plan.json",
  "Capability Registry": "capability-registry.json",
  "Knowledge Engine": "knowledge.json",
  "Decision Engine": "decision.json",
  "Patch Engine": "patch-plan.json",
  "Patch Executor": "patch-execution.json",
  "Validation Engine": "mission-report.json",
  "Mission Lifecycle": "mission-lifecycle.json",
  "Mission Ledger": "mission-ledger.json",
};

function artifactNonEmpty(file: string): boolean {
  try {
    return fs.existsSync(file) && fs.statSync(file).size > 0;
  } catch {
    return false;
  }
}

// Decide, AFTER a stage has exited 0, whether its real effect is present. A declared stage requires
// its artifact to exist and be non-empty; an UNDECLARED stage is unconstrained (returns true), which
// preserves the historical exit-0 => DONE behaviour for conditional / non-blocking stages.
function stageEffectOk(stageName: string, generatedDir?: string): boolean {
  const rel = STAGE_OUTPUTS[stageName];
  if (!rel) return true;
  const dir = generatedDir || path.join("runtime", "generated");
  return artifactNonEmpty(path.join(dir, rel));
}

module.exports = { STAGE_OUTPUTS, stageEffectOk, artifactNonEmpty };
