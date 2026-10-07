import test from "node:test";
import assert from "node:assert";
import { buildVerificationPlan, renderMissionPrompt, type ProviderRequest } from "./provider-port";

/*
 * V32 — Predictive Verification Plan. Covers the pure builder + prompt rendering. The plan is derived
 * PURELY from the current contract (declared/implied verify, objective proofs, class), never from memory,
 * and is ADVISORY — it marks nothing successful; the Validation Engine re-checks everything.
 */

test("V32 verification plan — correct engineering plan (required + optional + objective proofs)", () => {
  const plan = buildVerificationPlan({
    verifyProofs: [
      { capability: "Connectivity Audit", evidence: "internet-reachable", required: true },
      { capability: "Clean Workspace", evidence: "clean-workspace-scanned", required: false },
    ],
    objectiveProofs: ["legacy-runtime-retired"],
    requiresEngineering: true,
  });
  assert.deepStrictEqual(plan.classGates.length, 2, "engineering ⇒ build + tsc class gates");
  assert.ok(plan.requiredChecks.includes("internet-reachable"), "required probe is a required check");
  assert.ok(!plan.requiredChecks.includes("clean-workspace-scanned"), "optional probe is NOT a required check");
  assert.ok(plan.objectiveProofs.includes("legacy-runtime-retired"), "objective proof surfaced");
  assert.strictEqual(plan.relevantProbes.length, 2, "both probes listed as relevant");
  assert.ok(plan.relevantProbes.find((p) => p.evidence === "clean-workspace-scanned")!.required === false, "optional labelled");
  assert.ok(plan.expectedFailureModes.some((f) => f.includes("build turns red")), "deterministic failure mode: build");
  assert.ok(plan.expectedFailureModes.some((f) => f.includes("internet-reachable")), "failure mode names required probe");
});

test("V32 verification plan — adversarial 1–12 (prediction never becomes proof)", () => {
  // 2/3. non-engineering ⇒ NO class gates (never fabricate a build/tsc requirement).
  const nonEng = buildVerificationPlan({ verifyProofs: [{ evidence: "internet-reachable", required: true }], requiresEngineering: false });
  assert.deepStrictEqual(nonEng.classGates, [], "non-engineering ⇒ no class gates");
  // 4/5/10. corrupted / malformed inputs ⇒ empty plan, never throws.
  assert.doesNotThrow(() => buildVerificationPlan({ verifyProofs: null as unknown as [], objectiveProofs: null as unknown as [] }));
  const empty = buildVerificationPlan({ verifyProofs: [{ bad: 1 } as unknown as { evidence: string }], objectiveProofs: [42 as unknown as string] });
  assert.deepStrictEqual(empty.relevantProbes, [], "malformed probe entries dropped");
  assert.deepStrictEqual(empty.objectiveProofs, [], "non-string objective proofs dropped");
  // 6. no declared/implied verify ⇒ fully empty plan (fail-closed).
  const none = buildVerificationPlan({ verifyProofs: [], objectiveProofs: [], requiresEngineering: false });
  assert.deepStrictEqual([none.requiredChecks, none.relevantProbes, none.expectedFailureModes], [[], [], []]);
  // 11. contradictory/duplicate evidence names ⇒ deduped deterministically.
  const dup = buildVerificationPlan({ verifyProofs: [{ evidence: "p", required: true }, { evidence: "p", required: false }] });
  assert.strictEqual(dup.relevantProbes.length, 1, "duplicate evidence deduped");
  // 12. a predicted check is still just advisory text — the plan marks nothing successful.
  assert.ok(!JSON.stringify(none).includes("DONE") && !JSON.stringify(none).includes("proven"), "plan contains no success/proof verdict");
});

function req(withPlan: boolean): ProviderRequest {
  const ctx: ProviderRequest["mission"]["context"] = {
    repoRoot: ".", branch: "main", headCommit: "abc", masterPlanObjectives: [], missingCapabilities: [],
  };
  if (withPlan) {
    ctx.verificationPlan = buildVerificationPlan({
      verifyProofs: [{ capability: "Connectivity Audit", evidence: "internet-reachable", required: true }],
      objectiveProofs: ["obj-proof-x"],
      requiresEngineering: true,
    });
  }
  return {
    providerContractVersion: "1.0.0", model: "m", maxTurns: 1,
    mission: {
      mission: "M", priority: "P1", mode: "ENGINEERING",
      objectives: [{ id: "OBJ_1", goal: "g", done_when: [] }],
      definitionOfDone: [], completion: [], authorizedPaths: ["runtime/core"], context: ctx,
    },
  };
}

test("V32 verification plan — reaches the provider prompt as advisory input", () => {
  const cold = renderMissionPrompt(req(false));
  const warm = renderMissionPrompt(req(true));
  assert.ok(!cold.includes("VERIFICATION_PLAN"), "cold mission renders no plan (backward compatible)");
  assert.ok(warm.includes("## VERIFICATION_PLAN"), "warm mission renders the plan");
  assert.ok(warm.includes("advisory only") && warm.includes("NOT proof"), "plan is labelled advisory, not proof");
  assert.ok(warm.includes("internet-reachable") && warm.includes("obj-proof-x"), "names the real gates");
  assert.ok(warm.includes("class_gates"), "surfaces class gates for engineering");
});
