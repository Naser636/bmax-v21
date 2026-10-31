/*
 * Pipeline Builder — TypeScript canonical. Faithful port of the historical runtime/core/pipeline-builder.js;
 * behaviour (import-time side effects, stage ordering, the written runtime/generated/runtime-pipeline.json,
 * the console lines and the exported CommonJS array) is byte-identical. Strict-typed in η-ORCH-T1 (no
 * ts-nocheck suppression); verified under tsconfig.runtime-leaves-strict.json. The file stays a CommonJS
 * module — `module.exports = pipeline` is preserved so the raw `require("./pipeline-builder")` consumers
 * (odg-run and siblings) are unchanged. The legacy .js is an INDEPENDENT byte-equivalent implementation
 * (NOT a shim re-exporting this module; corrected per η1-A) and remains the production default.
 */
"use strict";

import * as fs from "fs";

// COLD-START FALLBACK (capability-registry.json): pipeline-builder runs at startup, BEFORE the
// "Capability Registry" stage has produced runtime/generated/capability-registry.json. Fall back to an
// empty registry object so the pipeline can still be built; an empty registry exposes no `available`
// capabilities, so the conditional ProjectContext Engine stage is simply omitted. No data is invented.
const REGISTRY_PATH = "runtime/generated/capability-registry.json";
const registry = fs.existsSync(REGISTRY_PATH)
  ? JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"))
  : {};

// STAGE BASE ROUTING (Lot η1-B1) — the directory each of the pipeline's stage files is resolved FROM.
// This is SEPARATE from ODG_RUNTIME_ENTRY (which selects the pipeline ENTRY, bin/odg-run.js vs
// dist/bin/odg-run.js); ODG_STAGE_BASE selects the STAGE directory. Historical DEFAULT is the JS source
// tree "runtime/core" — UNCHANGED unless an operator OPTS IN explicitly. An opt-in value is used VERBATIM
// and committed to: the directory MUST exist or we THROW (NO silent fallback to the historical base). If a
// chosen base is missing a stage file, `node <base>/<stage>.js` fails explicitly (NON_ZERO_EXIT) at spawn
// time — again no silent fallback. This lot ONLY routes the base; it does NOT migrate or compile any stage
// (the stages remain JavaScript; a chosen dist base must already contain the stage .js files to be usable).
// L7-FIX-2 / ZERO-JS (L-iv): the 13 mission stages spawn from the COMPILED dist ports (runtime/dist/core)
// — the source runtime/core .js rollbacks are retired. An explicit ODG_STAGE_BASE override still wins
// (resolveStageBase checks it first). The "runtime/core" branch remains only as a last-resort label for a
// not-yet-built tree; production always ensures the dist before launch (odg-ensure-ts-runtime.sh).
const DEFAULT_STAGE_BASE =
  fs.existsSync("runtime/dist/core") ? "runtime/dist/core" : "runtime/core";
function resolveStageBase() {
  const override = process.env.ODG_STAGE_BASE;
  if (typeof override === "string" && override.trim().length > 0) {
    const base = override.trim().replace(/\/+$/, "");
    if (!fs.existsSync(base)) {
      throw new Error(
        `pipeline-builder: ODG_STAGE_BASE="${base}" does not exist — refusing to silently fall back to ` +
          `the historical base "${DEFAULT_STAGE_BASE}". Provide a base dir that contains the stage files.`,
      );
    }
    return base;
  }
  return DEFAULT_STAGE_BASE;
}
const STAGE_BASE = resolveStageBase();
// Resolve a stage file path from the selected base. Default base reproduces the historical literals
// byte-for-byte (e.g. "runtime/core/mission-interpreter.js"), so the legacy behaviour is unchanged.
const stage = (name: string) => `${STAGE_BASE}/${name}.js`;

const pipeline = [
  ["Mission Interpreter", stage("mission-interpreter")],
  ["Mission Loader", stage("mission-loader")],
  ["Execution Planner", stage("execution-planner")],
  ["Capability Registry", stage("capability-registry")],
  ["Knowledge Engine", stage("knowledge-engine")],
];

if ((registry.available || []).includes("ProjectContext Engine")) {
  pipeline.push(["ProjectContext Engine", stage("project-context-engine")]);
}

pipeline.push(
  ["Decision Engine", stage("decision-engine")],
  ["Patch Engine", stage("patch-engine")],
  ["Patch Executor", stage("patch-executor")],
  // P0-C#3 part 2: fresh THIS-MISSION build/TS evidence AFTER the patch is applied, BEFORE validation — so the
  // engineering build/TS gate judges real post-patch evidence instead of an absent/stale runtime-verify.json.
  ["Build/TS Evidence", stage("stage-build-ts-evidence")],
  ["Validation Engine", stage("validation-engine")],
  // Governance lifecycle advances AFTER validation (consumes mission-report.json) and BEFORE the
  // Ledger, so the Ledger records the real achieved state instead of a hardcoded "CREATED".
  ["Mission Lifecycle", stage("mission-lifecycle")],
  ["Mission Ledger", stage("mission-ledger")],
  // Final report is the last stage: it summarises the proven evidence for the run. Non-blocking.
  ["Final Report", stage("final-report")],
);

// Fleet Bridge stage. Position anchored by stage NAME (ProjectContext is conditional, indices shift):
// immediately BEFORE "Decision Engine"; fallback BEFORE "Mission Ledger"; last resort append.
// Idempotent: never adds a duplicate if the builder runs more than once.
const FLEET_STAGE = ["Fleet Bridge", stage("fleet-stage")];
if (!pipeline.some((s) => s[0] === FLEET_STAGE[0])) {
  let anchor = pipeline.findIndex((s) => s[0] === "Decision Engine");
  if (anchor === -1) anchor = pipeline.findIndex((s) => s[0] === "Mission Ledger");
  if (anchor === -1) anchor = pipeline.length;
  pipeline.splice(anchor, 0, FLEET_STAGE);
}

fs.writeFileSync("runtime/generated/runtime-pipeline.json", JSON.stringify(pipeline, null, 2));

console.log("PIPELINE BUILDER READY");
console.log("Stages :", pipeline.length);
console.log("Stage base :", STAGE_BASE);

module.exports = pipeline;
