/*
 * S6 — SEMANTIC MISSION COMPILER COVERAGE GUARD (wired into `npm test` via the
 * src/runtime/*.test.ts glob; the canonical final increment of Campaign 03).
 *
 * Locks the 10-stage roadmap contract
 *   MISSION → INTENT → OBJECTIVES → DEPENDENCIES → CAPABILITIES → POLICIES → CONTRACTS →
 *   RESOURCES → EXPECTED OUTCOMES → VERIFICATION
 * as it is compiled into the ExecutionPlan by MissionOrchestrator.buildPlan, so the compiler
 * contract cannot silently regress. It is READ-ONLY and ADDITIVE: it inspects the plan the
 * orchestrator already produces and changes no production code, no runtime model, no plan field,
 * and asserts no execution/enforcement behaviour.
 *
 * It asserts, for the 8 source-backed stages (1,2,3,4,6,7,9,10):
 *   A. PRESENCE — the field is present AND reflects the mission's own contract (so if the S1/S2/S3
 *      wiring is removed from buildPlan, the value reverts to a default and the guard goes red).
 *   B. FUNCTION OF THE MISSION — two genuinely contrasting committed contracts compile to different
 *      per-stage values (no artificial differences).
 * For the 2 no-source stages (5 CAPABILITIES, 8 RESOURCES):
 *   C. HONEST ABSENCE — the plan carries NO fabricated capabilities/resources field.
 * And across the board:
 *   D. DETERMINISM — same mission ⇒ byte-identical ExecutionPlan (the plan is pure; TechnicalPlan,
 *      RuntimeReporter and Date/timestamps are OUTSIDE the ExecutionPlan and are not inspected).
 *
 * Hermetic in the same sense as phase0-s1/certification/a4-strict: it reads committed repo
 * contracts read-only and writes nothing.
 *
 * Run directly: node_modules/.bin/tsx src/runtime/phase0-s6-compiler-coverage.test.ts
 */

import fs from "node:fs";
import { MissionLoader } from "./mission-loader";
import { MissionOrchestrator } from "./mission-orchestrator";

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) {
    console.log(`  PASS ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}
const eq = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const differs = (a: unknown, b: unknown): boolean => JSON.stringify(a) !== JSON.stringify(b);

// Two genuinely contrasting committed contracts (chosen from runtime/missions, not fabricated):
//   A — engineering, CRITICAL, 5 objectives, snake authorized_paths, verify[] (2), no completion
//   B — IMPLEMENT, NORMAL, 1 objective, camel authorizedPaths, completion present, no verify
const A = "BUILD_GATE_AUTONOMY";
const B = "AUTONOMY_E2E_LOOP";

const planOf = (id: string): any => new MissionOrchestrator().buildPlan(id, id);
const contractOf = (id: string): any =>
  JSON.parse(fs.readFileSync(`runtime/missions/${id}.json`, "utf8"));

// Replicate ONLY the loader's documented, verbatim normalization so expectations are derived from
// the real contract (data-driven) rather than hardcoded — this keeps the guard robust to content
// edits while still proving the buildPlan wiring.
const ENUM = ["ANALYZE", "PLAN", "IMPLEMENT", "VALIDATE", "LEARN"];
const expectedMode = (m: unknown): string =>
  typeof m === "string" && ENUM.includes(m) ? m : "UNKNOWN";
const descLine0 = (c: any): string =>
  typeof c.description === "string" ? c.description.split(/\r?\n/)[0].trim() : "";
const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
const expectedAuthorizedPaths = (c: any): string[] => strArr(c.authorized_paths ?? c.authorizedPaths);
const expectedDoD = (c: any): string[] => strArr(c.definition_of_done ?? c.definitionOfDone);
const expectedVerify = (c: any): Array<{ capability: string; evidence: string }> =>
  Array.isArray(c.verify)
    ? c.verify
        .filter(
          (v: any) =>
            !!v && typeof v === "object" &&
            typeof v.capability === "string" && typeof v.evidence === "string",
        )
        .map((v: any) => ({ capability: v.capability, evidence: v.evidence }))
    : [];
const expectedGoals = (c: any): string[] =>
  (Array.isArray(c.objectives) ? c.objectives : []).map((o: any, i: number) =>
    o && typeof o === "object" ? (o.goal || o.id || `Objective ${i + 1}`) : String(o),
  );
const firstObjDoneWhen = (c: any): string[] =>
  Array.isArray(c.objectives) && c.objectives[0] && typeof c.objectives[0] === "object"
    ? strArr(c.objectives[0].done_when)
    : [];
const stepById = (plan: any, id: string): any => plan.steps.find((s: any) => s.id === id);

console.log("S6 — SEMANTIC MISSION COMPILER COVERAGE GUARD (10-stage roadmap contract)");

const planA = planOf(A);
const planB = planOf(B);
const cA = contractOf(A);
const cB = contractOf(B);

// ---------------------------------------------------------------------------
// A. PRESENCE — each source-backed stage present AND a reflection of the contract.
//    (Each assertion simultaneously guards the corresponding S1/S2/S3 wiring: strip it from
//     buildPlan and the plan value diverges from the contract-derived expectation → FAIL.)
// ---------------------------------------------------------------------------
console.log("\nA. PRESENCE (source-backed stages reflect the mission contract)");

// 1 MISSION
check(planA.mission?.id === A && planA.mission?.name === A, "stage 1 MISSION: plan echoes the mission id/name");

// 2 INTENT (S1 wiring)
check(
  !!planA.intent &&
    planA.intent.priority === cA.priority &&
    planA.intent.type === cA.mode &&
    planA.intent.mode === expectedMode(cA.mode) &&
    planA.intent.objective === descLine0(cA),
  "stage 2 INTENT: plan.intent derived from the contract (priority/type/mode/objective)",
);

// 3 OBJECTIVES
check(eq(planA.objectives, expectedGoals(cA)), "stage 3 OBJECTIVES: plan.objectives = contract objective goals");
check(
  expectedGoals(cA).every((g, i) => stepById(planA, `OBJECTIVE_${i + 1}`)?.name === g),
  "stage 3 OBJECTIVES: each OBJECTIVE_n step name = its goal",
);

// 4 DEPENDENCIES (A4/A4-strict; no dependsOn here ⇒ positional chain)
check(Array.isArray(planA.dependencies) && planA.dependencies.length > 0, "stage 4 DEPENDENCIES: plan.dependencies is a non-empty edge list");
check(
  planA.dependencies.some((e: any) => e.from === "LOAD" && e.to === "OBJECTIVE_1") &&
    planA.dependencies.some((e: any) => e.from === "OBJECTIVE_1" && e.to === "OBJECTIVE_2"),
  "stage 4 DEPENDENCIES: positional edges LOAD→OBJECTIVE_1→OBJECTIVE_2 present",
);

// 6 POLICIES (S2 wiring)
check(!!planA.policies, "stage 6 POLICIES: plan.policies present");
check(eq(planA.policies.authorizedPaths, expectedAuthorizedPaths(cA)), "stage 6 POLICIES: authorizedPaths (snake) reflects the contract");
check(eq(planB.policies.authorizedPaths, expectedAuthorizedPaths(cB)), "stage 6 POLICIES: authorizedPaths (camel) reflects the contract");

// 7 CONTRACTS (S3 wiring)
check(!!planA.contract, "stage 7 CONTRACTS: plan.contract present");
check(eq(planA.contract.definitionOfDone, expectedDoD(cA)), "stage 7 CONTRACTS: definitionOfDone reflects the contract");
check(eq(planA.contract.verify, expectedVerify(cA)), "stage 7 CONTRACTS: verify (capability→evidence) reflects the contract");

// 9 EXPECTED OUTCOMES (contract-level DoD + per-objective done_when→postconditions)
check(expectedDoD(cA).length > 0 && eq(planA.contract.definitionOfDone, expectedDoD(cA)), "stage 9 EXPECTED OUTCOMES: contract-level definitionOfDone compiled");
check(eq(stepById(planA, "OBJECTIVE_1")?.postconditions, firstObjDoneWhen(cA)), "stage 9 EXPECTED OUTCOMES: per-objective done_when → step.postconditions");

// 10 VERIFICATION (contract-level verify + per-objective done_when→verificationRequirements)
check(expectedVerify(cA).length > 0 && eq(planA.contract.verify, expectedVerify(cA)), "stage 10 VERIFICATION: contract-level verify compiled");
check(eq(stepById(planA, "OBJECTIVE_1")?.verificationRequirements, firstObjDoneWhen(cA)), "stage 10 VERIFICATION: per-objective done_when → step.verificationRequirements");

// ---------------------------------------------------------------------------
// B. FUNCTION OF THE MISSION — the two contrasting contracts compile to different values.
// ---------------------------------------------------------------------------
console.log("\nB. FUNCTION OF THE MISSION (A vs B differ where the contracts differ)");
check(differs(planA.intent, planB.intent), "intent is a function of the mission");
check(differs(planA.objectives, planB.objectives), "objectives/steps are a function of the mission");
check(differs(planA.dependencies, planB.dependencies), "dependencies are a function of the mission");
check(differs(planA.policies.authorizedPaths, planB.policies.authorizedPaths), "policies (authorizedPaths) are a function of the mission");
check(differs(planA.contract, planB.contract), "contract (DoD/completion/verify) is a function of the mission");
check(
  differs(stepById(planA, "OBJECTIVE_1")?.postconditions, stepById(planB, "OBJECTIVE_1")?.postconditions),
  "expected outcomes (per-objective postconditions) are a function of the mission",
);
check(differs(planA.contract.verify, planB.contract.verify), "verification (contract verify) is a function of the mission");

// ---------------------------------------------------------------------------
// C. HONEST ABSENCE — no fabricated capabilities/resources field on the plan.
// ---------------------------------------------------------------------------
console.log("\nC. HONEST ABSENCE (no-source stages 5 CAPABILITIES / 8 RESOURCES not fabricated)");
check(!("capabilities" in planA) && !("capabilities" in planB), "stage 5 CAPABILITIES: no fabricated capabilities field on the plan");
check(!("resources" in planA) && !("resources" in planB), "stage 8 RESOURCES: no fabricated resources field on the plan");

// ---------------------------------------------------------------------------
// D. DETERMINISM — same mission + same inputs ⇒ identical ExecutionPlan (pure; no Date/timestamp).
// ---------------------------------------------------------------------------
console.log("\nD. DETERMINISM (ExecutionPlan is byte-identical across builds)");
check(eq(planOf(A), planOf(A)), "deterministic ExecutionPlan for mission A");
check(eq(planOf(B), planOf(B)), "deterministic ExecutionPlan for mission B");

console.log(failures === 0 ? "\nALL PASS — S6 COMPILER COVERAGE PROVEN" : `\n${failures} FAILURE(S) — S6 NOT PROVEN`);
process.exit(failures === 0 ? 0 : 1);
