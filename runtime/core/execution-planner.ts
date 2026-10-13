/*
 * Execution Planner — TypeScript canonical (Lot η2 migration; strict-typed in η2-T). Faithful port of the
 * historical runtime/core/execution-planner.js; behaviour (reads runtime/generated/mission-plan.json,
 * writes runtime/generated/execution-plan.json, the console lines) is byte-identical. The legacy .js is
 * untouched and remains the production default; reached ONLY via the ODG_STAGE_BASE opt-in. Types are
 * verified under tsconfig.runtime-leaves-strict.json (strict: true, noEmit) — NO ts-nocheck.
 */
import * as fs from "fs";

interface MissionPlan {
  mission: string;
  nextObjective?: unknown;
  objectives?: unknown;
}

const plan = JSON.parse(
  fs.readFileSync("runtime/generated/mission-plan.json", "utf8"),
) as MissionPlan;

const execution = {
  mission: plan.mission,
  status: "READY",
  steps: [
    "LOAD_PROJECT_CONTEXT",
    "LOAD_RUNTIME_BRAIN",
    "SELECT_NEXT_OBJECTIVE",
    "BUILD_COMPONENT",
    "VERIFY",
    "DOCUMENT",
    "UPDATE_MEMORY",
  ],
  nextObjective: plan.nextObjective,
  objectives: plan.objectives,
};

fs.writeFileSync(
  "runtime/generated/execution-plan.json",
  JSON.stringify(execution, null, 2),
);

console.log("======================================");
console.log("EXECUTION PLANNER");
console.log("======================================");
console.log("Mission :", execution.mission);
console.log("Next :", execution.nextObjective);
console.log("Steps :", execution.steps.length);
console.log("Output : runtime/generated/execution-plan.json");
console.log("======================================");
