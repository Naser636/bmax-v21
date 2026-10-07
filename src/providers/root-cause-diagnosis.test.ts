import test from "node:test";
import assert from "node:assert";
import { summarizeRootCause, renderMissionPrompt, type ProviderRequest } from "./provider-port";

/*
 * V37 — Root-cause diagnosis propagation. summarizeRootCause is pure and fail-closed: it emits a
 * diagnosis ONLY for a genuinely DIAGNOSED report bound to the current mission. Advisory only — never
 * proof, never a patch; the Validation Engine re-checks. Current mission identity > historical report.
 */

const MISSION = "FIX_X";
function report(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    status: "DIAGNOSED",
    mission: MISSION,
    blockingGates: ["build", "gitClean"],
    rootCause: {
      gate: "build",
      blockingRule: "build must be green",
      detail: "tsc error in runtime/core/x.ts",
      responsibleComponent: { evidenceProducer: "odg-verify.js", evidenceFile: "runtime/generated/runtime-verify.json" },
    },
    ...over,
  };
}

test("V37 summarizeRootCause — valid current-mission diagnosis surfaces existing facts only", () => {
  const d = summarizeRootCause(report(), MISSION);
  assert.ok(d, "diagnosed + mission-bound ⇒ emitted");
  assert.strictEqual(d!.blockingGate, "build");
  assert.deepStrictEqual(d!.blockingGates, ["build", "gitClean"]);
  assert.strictEqual(d!.evidenceProducer, "odg-verify.js");
  assert.strictEqual(d!.evidenceRef, "runtime/generated/runtime-verify.json");
  assert.strictEqual(d!.blockingRule, "build must be green");
  assert.strictEqual(d!.reason, "tsc error in runtime/core/x.ts");
  // never carries a patch (keys are exactly the advisory facts)
  assert.deepStrictEqual(Object.keys(d!).sort(), ["blockingGate", "blockingGates", "blockingRule", "evidenceProducer", "evidenceRef", "reason"]);
});

test("V37 summarizeRootCause — adversarial 1–16 (fail-closed; current mission wins)", () => {
  assert.strictEqual(summarizeRootCause(null, MISSION), undefined, "1 no diagnosis ⇒ omit");
  assert.strictEqual(summarizeRootCause("bad" as unknown as null, MISSION), undefined, "2 malformed ⇒ omit");
  assert.strictEqual(summarizeRootCause(report({ mission: "OTHER" }), MISSION), undefined, "3/4 stale/wrong mission ⇒ omit");
  assert.strictEqual(summarizeRootCause(report({ status: "NO_BLOCKER" }), MISSION), undefined, "11 non-engineering/no blocker ⇒ omit");
  assert.strictEqual(summarizeRootCause(report({ status: "EVIDENCE_MISSING" }), MISSION), undefined, "16 missing evidence ⇒ omit");
  assert.strictEqual(summarizeRootCause(report({ rootCause: null }), MISSION), undefined, "no rootCause ⇒ omit");
  assert.strictEqual(summarizeRootCause(report({ rootCause: { gate: 42 } }), MISSION), undefined, "malformed gate ⇒ omit");
  // missing optional component fields ⇒ nulls, still emits the core facts (no fabrication, no throw).
  const partial = summarizeRootCause(report({ rootCause: { gate: "typescript", detail: "x" } }), MISSION);
  assert.ok(partial && partial.evidenceProducer === null && partial.evidenceRef === null && partial.reason === "x");
  // 15 multiple causes: blockingGates preserved; primary = rootCause.gate.
  const multi = summarizeRootCause(report({ blockingGates: ["build", "typescript", "gitClean"] }), MISSION);
  assert.deepStrictEqual(multi!.blockingGates, ["build", "typescript", "gitClean"]);
});

function req(withDiag: boolean): ProviderRequest {
  const ctx: ProviderRequest["mission"]["context"] = {
    repoRoot: ".", branch: "main", headCommit: "abc", masterPlanObjectives: [], missingCapabilities: [],
  };
  if (withDiag) ctx.rootCauseDiagnosis = summarizeRootCause(report(), MISSION)!;
  return {
    providerContractVersion: "1.0.0", model: "m", maxTurns: 1,
    mission: {
      mission: MISSION, priority: "P1", mode: "ENGINEERING",
      objectives: [{ id: "OBJ_1", goal: "g", done_when: [] }],
      definitionOfDone: [], completion: [], authorizedPaths: ["runtime/core"], context: ctx,
    },
  };
}

test("V37 prompt — diagnosis reaches the provider as advisory, NOT proof", () => {
  const cold = renderMissionPrompt(req(false));
  const warm = renderMissionPrompt(req(true));
  assert.ok(!cold.includes("ROOT_CAUSE_DIAGNOSIS"), "no diagnosis ⇒ renders nothing (backward compatible)");
  assert.ok(warm.includes("## ROOT_CAUSE_DIAGNOSIS"), "diagnosis rendered");
  assert.ok(warm.includes("blocking_gate: build") && warm.includes("odg-verify.js"), "names gate + producer");
  assert.ok(warm.includes("advisory") && warm.includes("NOT proof"), "labelled advisory, not proof");
});
