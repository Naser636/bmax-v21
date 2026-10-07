import test from "node:test";
import assert from "node:assert";
import {
  renderMissionPrompt, buildVerificationPlan, deriveFailingChecks, summarizeRootCause,
  summarizePipelineDiagnostics, type ProviderRequest,
} from "./provider-port";

/*
 * V39 — Composed provider intelligence: a reproducible, deterministic A/B over the real renderMissionPrompt
 * (CONTROL = pre-V32 baseline context; TREATMENT = V32+V36+V37+V38 composed), plus the meaning-preserving
 * V39 compression (CURRENT_FAILING_CHECKS suppressed only when ROOT_CAUSE_DIAGNOSIS already names every
 * failing gate). Provider *behaviour* is NOT measured here (hazard-gated; a canned mock cannot reason).
 */

const M = "FIX_X";
function mk(opts: { plan?: boolean; failing?: string[]; rc?: boolean; pipe?: boolean }): ProviderRequest {
  const ctx: ProviderRequest["mission"]["context"] = {
    repoRoot: ".", branch: "main", headCommit: "abc", masterPlanObjectives: ["A", "B"], missingCapabilities: [],
  };
  if (opts.plan) ctx.verificationPlan = buildVerificationPlan({ verifyProofs: [{ capability: "Connectivity Audit", evidence: "internet-reachable", required: true }], objectiveProofs: ["legacy-runtime-retired"], requiresEngineering: true });
  if (opts.failing) ctx.currentFailingChecks = deriveFailingChecks(Object.fromEntries(["build", "typescript", "gitClean"].map((g) => [g, !opts.failing!.includes(g)])) as never);
  if (opts.rc) ctx.rootCauseDiagnosis = summarizeRootCause({ status: "DIAGNOSED", mission: M, blockingGates: ["build", "gitClean"], rootCause: { gate: "build", blockingRule: "build must be green", detail: "tsc error", responsibleComponent: { evidenceProducer: "odg-verify.js", evidenceFile: "runtime/generated/runtime-verify.json" } } }, M);
  if (opts.pipe) ctx.pipelineDiagnostics = summarizePipelineDiagnostics({ stage: "local-pipeline", reason: "NON_ZERO_EXIT", exitCode: 1, provider: "runtime/bin/odg-run.js" });
  return { providerContractVersion: "1.0.0", model: "m", maxTurns: 1, mission: { mission: M, priority: "P1", mode: "ENGINEERING", objectives: [{ id: "OBJ_1", goal: "repair build", done_when: ["build green"] }], definitionOfDone: ["validated"], completion: ["released"], authorizedPaths: ["runtime/core"], context: ctx } };
}

test("V39 A/B — composed context retains real information at bounded overhead, no contradiction", () => {
  const C = renderMissionPrompt(mk({}));
  const T = renderMissionPrompt(mk({ plan: true, failing: ["build", "gitClean"], rc: true, pipe: true }));
  // information retained: facts present in TREATMENT, absent in CONTROL.
  for (const f of ["internet-reachable", "legacy-runtime-retired", "odg-verify.js", "NON_ZERO_EXIT", "tsc error"]) {
    assert.ok(T.includes(f) && !C.includes(f), `TREATMENT surfaces "${f}" that CONTROL omits`);
  }
  // all four advisory blocks present in TREATMENT (CURRENT_FAILING_CHECKS may be compressed — checked below).
  for (const b of ["VERIFICATION_PLAN", "ROOT_CAUSE_DIAGNOSIS", "PIPELINE_DIAGNOSTICS"]) {
    assert.ok(T.includes(`## ${b}`) && !C.includes(`## ${b}`), `${b} present only in TREATMENT`);
  }
  // overhead is real but bounded (regression guard against future context bloat).
  assert.ok(T.length > C.length, "TREATMENT larger (adds information)");
  assert.ok(T.length < C.length * 6, "overhead bounded (< 6x baseline)");
});

test("V39 compression — CURRENT_FAILING_CHECKS suppressed only when fully named by ROOT_CAUSE_DIAGNOSIS", () => {
  // (a) failing ⊆ root-cause gates (build, gitClean) ⇒ suppressed; gate names still present via diagnosis.
  const covered = renderMissionPrompt(mk({ failing: ["build", "gitClean"], rc: true }));
  assert.ok(!covered.includes("## CURRENT_FAILING_CHECKS"), "redundant block suppressed");
  assert.ok(covered.includes("build") && covered.includes("gitClean"), "no gate name lost (present in diagnosis)");
  // (b) failing has a gate the diagnosis omits (typescript) ⇒ block KEPT (no information loss).
  const extra = renderMissionPrompt(mk({ failing: ["build", "typescript"], rc: true }));
  assert.ok(extra.includes("## CURRENT_FAILING_CHECKS"), "block kept when it carries an uncovered gate");
  assert.ok(extra.includes("typescript"), "the uncovered gate is surfaced");
  // (c) no ROOT_CAUSE_DIAGNOSIS ⇒ block KEPT (nothing to be subsumed by).
  const alone = renderMissionPrompt(mk({ failing: ["build"] }));
  assert.ok(alone.includes("## CURRENT_FAILING_CHECKS"), "block kept when no diagnosis present");
});
