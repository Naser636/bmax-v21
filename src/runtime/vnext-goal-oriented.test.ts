/*
 * VNext Goal-Oriented extension — deterministic unit test.
 *
 * Run directly with tsx (no repository, provider or network — every effect is an injected seam):
 *   node_modules/.bin/tsx src/runtime/vnext-goal-oriented.test.ts
 *
 * Asserts the ADDITIVE contract of the VNext layer:
 *   - Goal → Intent → Mission synthesis is deterministic and compatible with MissionIntent.
 *   - SingleStrategyEngine preserves current single-path behavior.
 *   - ProviderResource re-expresses provider availability without changing it.
 *   - ConstitutionEngine only verifies invariants (flags a breach, passes a clean decision).
 *   - runGoalOriented composes the target pipeline order offline (no provider call, no mutation).
 */

import {
  deriveIntent,
  synthesizeMission,
  isValidGoal,
  type Goal,
} from "./vnext/goal";
import { SingleStrategyEngine } from "./vnext/strategy-engine";
import { ProviderResource } from "./vnext/resource";
import { ConstitutionEngine, type Constitution } from "./vnext/constitution-engine";
import { runGoalOriented } from "./vnext/goal-oriented-pipeline";
import { validateMissionIntent } from "./mission-intent";

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) {
    console.log(`  PASS ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}

const GOAL: Goal = {
  id: "EVOLVE_RUNTIME",
  statement: "Prepare the Runtime for the Goal-Oriented architecture without regression.",
  priority: "HIGH",
  successCriteria: ["runtime stays CONVERGED", "no existing behavior changes"],
};

// Frozen-shaped Constitution, injected so the test is disk-independent + deterministic.
const CONSTITUTION: Constitution = {
  version: 1,
  principles: [
    "DETERMINISM_FIRST",
    "REUSE_BEFORE_CREATE",
    "EVIDENCE_REQUIRED",
    "ROLLBACK_MUST_ALWAYS_BE_POSSIBLE",
    "ARTIFACTS_ARE_IMMUTABLE",
    "PIPELINE_IS_REPRODUCIBLE",
  ],
};

// 1. Goal → Intent → Mission.
{
  console.log("Goal → Intent → Mission synthesis");
  check(isValidGoal(GOAL), "a well-formed goal validates");
  const intent = deriveIntent(GOAL);
  check(intent.objective === GOAL.statement, "intent objective is the goal statement");
  check(intent.priority === "HIGH", "goal priority flows into the intent");
  check(validateMissionIntent(intent), "derived intent satisfies the EXISTING MissionIntent contract");

  const engine = new SingleStrategyEngine();
  const strategy = engine.select(engine.propose(intent)).strategy;
  const m1 = synthesizeMission(GOAL, strategy);
  const m2 = synthesizeMission(GOAL, strategy);
  check(JSON.stringify(m1) === JSON.stringify(m2), "mission synthesis is deterministic");
  check(m1.derivedFrom.goal === GOAL.id && m1.derivedFrom.strategy === strategy.id, "mission records its Goal+Strategy provenance");
  check(m1.definitionOfDone.length === 2, "success criteria seed the definition of done");
}

// 2. SingleStrategyEngine preserves single-path behavior.
{
  console.log("Strategy Engine (default = single path)");
  const engine = new SingleStrategyEngine();
  const candidates = engine.propose(deriveIntent(GOAL));
  check(candidates.length === 1, "exactly one candidate (no comparison performed)");
  check(engine.select(candidates).strategy.id === "SINGLE_PATH", "selects the single path");
  let threw = false;
  try {
    engine.select([]);
  } catch {
    threw = true;
  }
  check(threw, "select on empty candidate list is a hard error");
}

// 3. ProviderResource adapts provider availability without altering it.
{
  console.log("Resource abstraction (provider as Resource)");
  const up = new ProviderResource({ provider: "claude", available: true });
  const down = new ProviderResource({ provider: "openai", available: false, reason: "no api key", nextAction: "set OPENAI_API_KEY" });
  const a = up.allocate();
  const b = down.allocate();
  check(up.id === "provider:claude" && up.kind === "PROVIDER", "provider becomes a PROVIDER-kind resource");
  check(a.granted === true && a.reason === null, "available provider is granted with no reason");
  check(b.granted === false && b.reason === "no api key" && b.nextAction === "set OPENAI_API_KEY", "unavailable provider surfaces the exact blocker + next action");
}

// 4. Constitution Engine — verifier only.
{
  console.log("Constitution Engine (verify invariants only)");
  const engine = new ConstitutionEngine(CONSTITUTION);
  check(engine.enforceablePrinciples().length >= 5, "enforces the principles it lists and can check");

  const clean = engine.verify({
    stage: "test",
    summary: "clean decision",
    hasEvidence: true,
    reversible: true,
    overwritesArtifact: false,
    nonDeterministic: false,
    reusedExisting: true,
  });
  check(clean.compliant && clean.violations.length === 0, "a compliant decision passes");

  const dirty = engine.verify({
    stage: "test",
    summary: "breaching decision",
    hasEvidence: false,
    reversible: false,
    overwritesArtifact: true,
    nonDeterministic: true,
    reusedExisting: false,
  });
  check(!dirty.compliant, "a breaching decision is flagged non-compliant");
  check(dirty.violations.some((v) => v.principle === "EVIDENCE_REQUIRED"), "missing evidence is caught");
  check(dirty.violations.some((v) => v.principle === "ROLLBACK_MUST_ALWAYS_BE_POSSIBLE"), "irreversibility is caught");
  check(dirty.violations.some((v) => v.principle === "ARTIFACTS_ARE_IMMUTABLE"), "artifact overwrite is caught");
  // The engine has no decide/execute/select method — structural guarantee of "verifier only".
  check(typeof (engine as unknown as Record<string, unknown>).execute === "undefined", "engine exposes no execute()");
  check(typeof (engine as unknown as Record<string, unknown>).select === "undefined", "engine exposes no select()");
}

// 5. Goal-Oriented pipeline composes the target order offline (defaults = no side effects).
{
  console.log("Goal-Oriented pipeline (offline default run)");
  const trace = runGoalOriented(GOAL, { constitution: new ConstitutionEngine(CONSTITUTION) });
  check(trace.mission.id === GOAL.id, "pipeline synthesizes the mission from the goal");
  check(trace.strategy.strategy.id === "SINGLE_PATH", "default strategy is the single path");
  check(trace.capabilities.length > 0, "capabilities resolved from the strategy steps");
  check(trace.policy.allowed === true, "default policy allows (no new blocking gate)");
  check(trace.execution.status === "SKIPPED", "no execute seam ⇒ execution SKIPPED (NO provider call)");
  check(trace.validation.valid === true, "a skipped run validates trivially");
  check(trace.strategyVerdict.compliant === true, "strategy decision respects the invariants");
  check(trace.ok === true, "offline default run is OK end-to-end");
  const order = trace.evidence.map((e) => e.event);
  check(
    JSON.stringify(order) ===
      JSON.stringify(["MissionSynthesized", "ContextBuilt", "CapabilitiesResolved", "PolicyEvaluated", "ResourceAllocated", "Executed", "Validated"]),
    "evidence follows the target pipeline order",
  );

  // With a granting provider resource injected, allocation is recorded + verified.
  const withResource = runGoalOriented(GOAL, {
    constitution: new ConstitutionEngine(CONSTITUTION),
    resources: [new ProviderResource({ provider: "claude", available: true })],
    execute: (_m, alloc) => ({ executed: alloc?.granted ?? false, status: "DONE" }),
  });
  check(withResource.allocation?.granted === true, "granting resource is allocated");
  check(withResource.allocationVerdict?.compliant === true, "allocation decision respects the invariants");
  check(withResource.execution.status === "DONE" && withResource.ok, "supplied execute seam runs and validates");
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
