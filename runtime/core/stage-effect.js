#!/usr/bin/env node

/*
 * Stage Effect Gate (RC-1) — a zero exit code is NOT proof a pipeline stage produced its effect.
 *
 * runtime/bin/odg-run.js used to mark a stage DONE on `r.status === 0` alone (odg-run.js:149). A stage
 * could therefore exit 0 while having written no output at all (a silent skip, a crash after its
 * success log, a future regression), and the checkpoint would grave it DONE — which RC-2 then trusts
 * on resume. This module adds the missing predicate: a stage with a DECLARED deterministic output
 * artifact is only DONE when that artifact exists and is non-empty.
 *
 * Conservative by design (no false FAILED): only stages that write ONE fixed artifact under
 * runtime/generated/ are declared here — each entry verified against the stage source that writes it.
 * Stages that are CONDITIONAL (ProjectContext Engine, Fleet Bridge) or whose output path is
 * mission-specific / explicitly non-blocking (Final Report) are intentionally NOT declared, so they
 * keep the historical exit-0 => DONE behaviour.
 *
 * Pure + deterministic: a function of (stage name, on-disk state) only; writes nothing.
 */

"use strict";

const fs = require("fs");
const path = require("path");

// stage name -> the single deterministic artifact it writes under runtime/generated/.
// Justification (verified by reading each stage's writeFileSync target):
//   Mission Interpreter  -> mission-interpretation.json
//   Mission Loader       -> mission-plan.json
//   Execution Planner    -> execution-plan.json
//   Capability Registry  -> capability-registry.json
//   Knowledge Engine     -> knowledge.json
//   Decision Engine      -> decision.json
//   Patch Engine         -> patch-plan.json
//   Patch Executor       -> patch-execution.json
//   Validation Engine    -> mission-report.json
//   Mission Lifecycle    -> mission-lifecycle.json
//   Mission Ledger       -> mission-ledger.json
const STAGE_OUTPUTS = {
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

function artifactNonEmpty(file) {
  try {
    return fs.existsSync(file) && fs.statSync(file).size > 0;
  } catch {
    return false;
  }
}

// Decide, AFTER a stage has exited 0, whether its real effect is present. A declared stage requires
// its artifact to exist and be non-empty; an UNDECLARED stage is unconstrained (returns true), which
// preserves the historical exit-0 => DONE behaviour for conditional / non-blocking stages.
function stageEffectOk(stageName, generatedDir) {
  const rel = STAGE_OUTPUTS[stageName];
  if (!rel) return true;
  const dir = generatedDir || path.join("runtime", "generated");
  return artifactNonEmpty(path.join(dir, rel));
}

module.exports = { STAGE_OUTPUTS, stageEffectOk, artifactNonEmpty };
