import test from "node:test";
import assert from "node:assert";
import { deriveFailingChecks, renderMissionPrompt, type ProviderRequest } from "./provider-port";

/*
 * V36 — Current-failing-checks reuse. The provider is handed the gates currently RED (from the existing
 * runtime-verify.json), ADVISORY only. deriveFailingChecks is pure: only explicit `false` is failing;
 * undefined/true/absent/malformed ⇒ not claimed failing (fail-closed). Never proof, never authority.
 */

test("V36 deriveFailingChecks — only explicit false, stable order, fail-closed", () => {
  assert.deepStrictEqual(deriveFailingChecks({ build: false, typescript: true, gitClean: false }), ["build", "gitClean"]);
  assert.deepStrictEqual(deriveFailingChecks({ build: true, typescript: true, gitClean: true }), [], "all green ⇒ none");
  assert.deepStrictEqual(deriveFailingChecks({ typescript: false }), ["typescript"], "only present-false gates");
  assert.deepStrictEqual(deriveFailingChecks({ build: undefined }), [], "unknown ⇒ not claimed failing");
  // adversarial: missing / malformed / corrupted ⇒ [] (no throw, no false claim).
  assert.deepStrictEqual(deriveFailingChecks(null), []);
  assert.deepStrictEqual(deriveFailingChecks(undefined), []);
  assert.deepStrictEqual(deriveFailingChecks("red" as unknown as null), []);
  assert.deepStrictEqual(deriveFailingChecks({ build: "no" } as unknown as { build?: unknown }), [], "non-boolean false-ish not failing");
  // stable deterministic order regardless of input key order.
  assert.deepStrictEqual(deriveFailingChecks({ gitClean: false, build: false }), ["build", "gitClean"]);
});

function req(failing?: string[]): ProviderRequest {
  const ctx: ProviderRequest["mission"]["context"] = {
    repoRoot: ".", branch: "main", headCommit: "abc", masterPlanObjectives: [], missingCapabilities: [],
  };
  if (failing) ctx.currentFailingChecks = failing;
  return {
    providerContractVersion: "1.0.0", model: "m", maxTurns: 1,
    mission: {
      mission: "M", priority: "P1", mode: "ENGINEERING",
      objectives: [{ id: "OBJ_1", goal: "g", done_when: [] }],
      definitionOfDone: [], completion: [], authorizedPaths: ["runtime/core"], context: ctx,
    },
  };
}

test("V36 prompt — failing gates reach the provider as advisory, NOT proof", () => {
  const cold = renderMissionPrompt(req(undefined));
  const warm = renderMissionPrompt(req(["build", "gitClean"]));
  assert.ok(!cold.includes("CURRENT_FAILING_CHECKS"), "cold (none failing) renders nothing — backward compatible");
  assert.ok(warm.includes("## CURRENT_FAILING_CHECKS"), "warm renders the failing gates");
  assert.ok(warm.includes("build") && warm.includes("gitClean"), "names the red gates");
  assert.ok(warm.includes("advisory") && warm.includes("NOT proof"), "labelled advisory, not proof");
});
