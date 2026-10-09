/*
 * DEF-014 regression — a GOVERNED Validation BLOCKED must be DEFERRED (loop continues to the next
 * independent mission), DISTINCT from a genuine crash (EXECUTION_FAILED hard-halt), and must NEVER
 * auto-escalate to a live provider. Covers both halves of the fix:
 *   Part 1 (core loop, src/core/runtime-autonomy.ts): pipelineOk=false + reason VALIDATION_BLOCKED ⇒
 *           escalate+defer+continue (D2/S4 parity with NO_RELEASE); NON_ZERO_EXIT ⇒ EXECUTION_FAILED.
 *   Part 2 (adapter, src/runtime/autonomy-runtime-adapter.ts): runPipeline returns a VALIDATION_BLOCKED
 *           outcome WITHOUT calling runViaProvider; a real crash still escalates (guard is reason-specific).
 * Pure in-memory fakes (no provider, no git, no network). Run:
 *   node_modules/.bin/tsx src/tests/autonomy-blocked-defer.test.ts
 */
import { RuntimeAutonomy } from "@/core/runtime-autonomy";
import { AutonomyRuntimeAdapter } from "@/runtime/autonomy-runtime-adapter";

let failures = 0;
const check = (c: boolean, l: string) => { console.log((c ? "  PASS " : "  FAIL ") + l); if (!c) failures++; };

// ---- Part 1: core loop defer-vs-halt --------------------------------------
const GREEN = { build: true, typescript: true, gitClean: true, missionPipeline: true };
const BUILD_RED = { build: false, typescript: true, gitClean: true, missionPipeline: true };
function evidence(mission: string, val: any) {
  return {
    validation: val,
    source: { commit: "abc123", branch: "main" },
    documentationProof: {
      artifactContractVersion: "1.0.0", requestId: mission, artifactCount: 1,
      artifacts: [{ kind: "report", id: mission, version: "1.0.0", hash: "abcd0000abcd0000" }],
      inputsHash: "0123456789abcdef",
    },
    artifacts: [{ kind: "certificate", id: mission, version: "1.0.0" }],
    previousReleaseRef: null,
  };
}
const contract = (m: string) => ({ mission: m, priority: "NORMAL", mode: "SEQUENTIAL",
  objectives: [{ id: m, goal: "g", done_when: ["d"] }], definition_of_done: ["done"], completion: ["RELEASE"] });
function ports(objs: string[], runPipelineOf: (m: string) => any, valOf: (m: string) => any) {
  const archived: string[] = [];
  return {
    readPlanState: () => ({ masterPlanObjectives: objs, missingCapabilities: objs, completedMissions: [...archived] }),
    generateContract: (m: string) => contract(m),
    runPipeline: (m: string) => runPipelineOf(m),
    gatherEvidence: (m: string) => evidence(m, valOf(m)),
    archive: (m: string) => { archived.push(m); },
  } as any;
}
const cfg = { autonomyContractVersion: "1.0.0" };
const run = (p: any) => { const a = new RuntimeAutonomy(); a.initialize(); return a.run(cfg, p) as any; };
const released = (r: any) => (r.completed || []).map((c: any) => c.mission);

console.log("Part 1 — core loop:");
// A. governed BLOCKED then GOOD ⇒ defer + continue; terminal BLOCKED, GOOD released.
const rA = run(ports(
  ["BLOCKED_MISSION", "GOOD_MISSION"],
  (m) => m === "BLOCKED_MISSION"
    ? { pipelineOk: false, diagnostics: { stage: "Validation Engine", reason: "VALIDATION_BLOCKED", message: "capability proof missing (DRY_RUN)" } }
    : { pipelineOk: true },
  () => GREEN,
));
check(released(rA).includes("GOOD_MISSION"), "A1. VALIDATION_BLOCKED is DEFERRED — the independent GOOD mission still RELEASED");
check(!released(rA).includes("BLOCKED_MISSION"), "A2. the blocked mission did NOT release");
check(rA.status === "BLOCKED", `A3. honest terminal BLOCKED (not EXECUTION_FAILED) [got ${rA.status}]`);

// B. NO_RELEASE (build red) then GOOD ⇒ existing D2/S4 parity still works.
const rB = run(ports(["NORELEASE_MISSION", "GOOD_MISSION"], () => ({ pipelineOk: true }),
  (m) => m === "NORELEASE_MISSION" ? BUILD_RED : GREEN));
check(released(rB).includes("GOOD_MISSION"), "B1. NO_RELEASE still DEFERS — GOOD mission still RELEASED (parity)");

// C. genuine crash (NON_ZERO_EXIT) ⇒ EXECUTION_FAILED hard-halt, DISTINCT from a governed block.
const rC = run(ports(
  ["CRASH_MISSION", "GOOD_MISSION"],
  (m) => m === "CRASH_MISSION"
    ? { pipelineOk: false, diagnostics: { stage: "local-pipeline", reason: "NON_ZERO_EXIT", message: "patch executor threw", exitCode: 1 } }
    : { pipelineOk: true },
  () => GREEN,
));
check(rC.status === "EXECUTION_FAILED", `C1. a genuine crash still HARD-HALTS EXECUTION_FAILED [got ${rC.status}]`);
check(!released(rC).includes("GOOD_MISSION"), "C2. crash is distinct from a governed block (loop did not continue)");

// ---- Part 2: adapter never spawns a provider for a governed block ---------
console.log("Part 2 — adapter runPipeline provider gating:");
function adapterWith(reason: string) {
  const a = new AutonomyRuntimeAdapter();
  let providerCalled = false;
  const blocked = { pipelineOk: false, diagnostics: { stage: reason === "VALIDATION_BLOCKED" ? "Validation Engine" : "local-pipeline", reason, message: "x" } };
  (a as any).readMissionJson = () => ({ mission: "M", requires_engineering: true });
  (a as any).runLocalPipeline = () => blocked;
  (a as any).recoverLocally = () => ({ outcome: blocked, exhausted: true });
  (a as any).runViaProvider = () => { providerCalled = true; return { pipelineOk: false, diagnostics: { stage: "provider", reason: "PROVIDER_RAN", message: "should not happen for a governed block" } }; };
  const out = (a as any).runPipeline("M");
  return { providerCalled, out };
}
const gb = adapterWith("VALIDATION_BLOCKED");
check(gb.providerCalled === false, "D1. governed VALIDATION_BLOCKED did NOT spawn a provider (runViaProvider not called)");
check(gb.out?.diagnostics?.reason === "VALIDATION_BLOCKED", "D2. runPipeline returns the governed-block outcome unchanged (loop will defer it)");
const cr = adapterWith("NON_ZERO_EXIT");
check(cr.providerCalled === true, "D3. a real crash (NON_ZERO_EXIT) still escalates to the provider — guard is reason-specific, not a blanket block");

console.log(failures === 0 ? "\nALL PASS — DEF-014 defer-on-BLOCKED + no-provider-escalation + crash-distinct" : `\n${failures} assertion(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
