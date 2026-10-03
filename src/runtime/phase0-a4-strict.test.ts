/*
 * Phase 1 — A4-STRICT certification test (wired into `npm test`).
 *
 * Proves the P0-010-strict A4 criterion that the Phase-0 harness could not: a mission that
 * DECLARES "B depends on A" yields a directed edge A→B, and reversing the declaration reverses
 * the edge (B→A). Also pins the explicit, deterministic behaviour for cycles and unknown ids.
 *
 * Read-only: loads committed fixtures via an injected MissionLoader (missionsDir override) and
 * inspects the plan's dependency edges. Writes no artifact. Run directly:
 *   node_modules/.bin/tsx src/runtime/phase0-a4-strict.test.ts
 */

import { MissionLoader } from "./mission-loader";
import { MissionOrchestrator, ExecutionPlan } from "./mission-orchestrator";
import { createMissionIntent } from "./mission-intent";

const FIXTURES = "src/runtime/__fixtures__/a4";

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) {
    console.log(`  PASS ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}

function planFor(id: string): ExecutionPlan {
  const loader = new MissionLoader(
    "runtime/generated/project-context.snapshot",
    "runtime/brain/MASTER_PLAN.md",
    FIXTURES,
  );
  return new MissionOrchestrator(loader).buildPlan(id, id, createMissionIntent(id));
}

const stepIdByGoal = (plan: ExecutionPlan, goal: string): string | null =>
  plan.steps.find((s) => s.name === goal)?.id ?? null;

function hasEdge(plan: ExecutionPlan, fromGoal: string, toGoal: string): boolean {
  const from = stepIdByGoal(plan, fromGoal);
  const to = stepIdByGoal(plan, toGoal);
  return !!from && !!to && plan.dependencies.some((e) => e.from === from && e.to === to);
}

console.log("PHASE 1 — A4-STRICT (declared dependsOn reflected as directed edges)");

// FWD — "B depends on A" ⇒ edge A→B, and NOT B→A.
{
  const p = planFor("FWD");
  check(
    hasEdge(p, "Objective A", "Objective B") && !hasEdge(p, "Objective B", "Objective A"),
    "FWD: 'B dependsOn A' yields edge A->B (and not B->A)",
  );
}

// REV — reversing the declaration ("A depends on B") reverses the edge ⇒ B→A, and NOT A→B.
{
  const p = planFor("REV");
  check(
    hasEdge(p, "Objective B", "Objective A") && !hasEdge(p, "Objective A", "Objective B"),
    "REV: reversing the declaration reverses the edge (B->A, not A->B)",
  );
}

// CYCLE — mutual A<->B ⇒ plan still builds, graph stays acyclic (no bidirectional edge),
// and the cycle-break is deterministic (first-in-contract-order edge kept: B->A, A->B dropped).
{
  const p = planFor("CYCLE");
  const ab = hasEdge(p, "Objective A", "Objective B");
  const ba = hasEdge(p, "Objective B", "Objective A");
  check(!(ab && ba), "CYCLE: no bidirectional edge (cycle broken, build did not loop)");
  check(ba && !ab, "CYCLE: deterministic cycle-break keeps B->A and drops A->B");
}

// UNKNOWN — dependsOn an id that does not exist ⇒ ignored: no edge touches it and the
// declaring objective ends up with no objective dependency.
{
  const p = planFor("UNKNOWN");
  const bId = stepIdByGoal(p, "Objective B");
  const bStep = p.steps.find((s) => s.id === bId);
  const noGhost = !p.dependencies.some((e) => e.from === "GHOST" || e.to === "GHOST");
  const bDeps: string[] = bStep?.dependencies ?? [];
  check(noGhost && bDeps.length === 0, "UNKNOWN: unknown dependsOn id is ignored (no edge, empty deps)");
}

console.log(failures === 0 ? "\nALL PASS — A4-STRICT PROVEN" : `\n${failures} FAILURE(S) — A4-STRICT NOT PROVEN`);
process.exit(failures === 0 ? 0 : 1);
