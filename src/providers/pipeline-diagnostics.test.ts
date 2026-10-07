import test from "node:test";
import assert from "node:assert";
import { summarizePipelineDiagnostics, renderMissionPrompt, type ProviderRequest } from "./provider-port";

/*
 * V38 — Pipeline-diagnostics propagation. summarizePipelineDiagnostics is pure and fail-closed: it
 * surfaces ONLY the already-existing PipelineOutcome.diagnostics facts (stage/reason/exitCode/launcher/
 * message/unauthorizedChanges). Advisory only — never proof; the Validation Engine re-checks.
 */

test("V38 summarizePipelineDiagnostics — surfaces existing facts only; fail-closed", () => {
  const d = summarizePipelineDiagnostics({ stage: "local-pipeline", reason: "NON_ZERO_EXIT", exitCode: 1, provider: "runtime/bin/odg-run.js", message: "exited 1" });
  assert.ok(d);
  assert.strictEqual(d!.stage, "local-pipeline");
  assert.strictEqual(d!.reason, "NON_ZERO_EXIT");
  assert.strictEqual(d!.exitCode, 1);
  assert.strictEqual(d!.launcher, "runtime/bin/odg-run.js");
  assert.strictEqual(d!.message, "exited 1");
  assert.deepStrictEqual(d!.unauthorizedChanges, []);
  // 1 missing / 10 empty / 2 malformed ⇒ undefined (omit, no throw).
  assert.strictEqual(summarizePipelineDiagnostics(undefined), undefined, "1 missing ⇒ omit");
  assert.strictEqual(summarizePipelineDiagnostics({}), undefined, "10 empty ⇒ omit");
  assert.strictEqual(summarizePipelineDiagnostics("x" as unknown as null), undefined, "2 malformed ⇒ omit");
  assert.strictEqual(summarizePipelineDiagnostics({ exitCode: 2 }), undefined, "no stage/reason ⇒ omit");
  // partial: reason only ⇒ stage defaults 'unknown', nulls elsewhere, no throw.
  const partial = summarizePipelineDiagnostics({ reason: "KILLED_BY_SIGNAL" });
  assert.ok(partial && partial.stage === "unknown" && partial.exitCode === null && partial.launcher === null);
  // 9 multiple/unauthorized signals preserved; non-string entries dropped.
  const multi = summarizePipelineDiagnostics({ stage: "s", reason: "r", unauthorizedChanges: ["src/app/page.tsx", 42 as unknown as string] });
  assert.deepStrictEqual(multi!.unauthorizedChanges, ["src/app/page.tsx"]);
  // exitCode non-number ⇒ null (never coerced).
  assert.strictEqual(summarizePipelineDiagnostics({ stage: "s", exitCode: "1" as unknown as number })!.exitCode, null);
});

function req(withDiag: boolean): ProviderRequest {
  const ctx: ProviderRequest["mission"]["context"] = {
    repoRoot: ".", branch: "main", headCommit: "abc", masterPlanObjectives: [], missingCapabilities: [],
  };
  if (withDiag) ctx.pipelineDiagnostics = summarizePipelineDiagnostics({ stage: "local-pipeline", reason: "NON_ZERO_EXIT", exitCode: 1, provider: "runtime/bin/odg-run.js" });
  return {
    providerContractVersion: "1.0.0", model: "m", maxTurns: 1,
    mission: {
      mission: "M", priority: "P1", mode: "ENGINEERING",
      objectives: [{ id: "OBJ_1", goal: "g", done_when: [] }],
      definitionOfDone: [], completion: [], authorizedPaths: ["runtime/core"], context: ctx,
    },
  };
}

test("V38 prompt — diagnostics reach the provider as advisory, NOT proof", () => {
  // 7 successful local pipeline ⇒ no diagnostics propagated (provider not told a failure it didn't have).
  const cold = renderMissionPrompt(req(false));
  const warm = renderMissionPrompt(req(true));
  assert.ok(!cold.includes("PIPELINE_DIAGNOSTICS"), "no failure ⇒ renders nothing (backward compatible)");
  assert.ok(warm.includes("## PIPELINE_DIAGNOSTICS"), "failure ⇒ rendered");
  assert.ok(warm.includes("stage: local-pipeline") && warm.includes("NON_ZERO_EXIT") && warm.includes("exit_code: 1"), "names the real facts");
  assert.ok(warm.includes("advisory") && warm.includes("NOT proof"), "labelled advisory, not proof");
});
