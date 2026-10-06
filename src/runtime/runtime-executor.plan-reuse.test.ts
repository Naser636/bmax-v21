/*
 * Tests for FIX_DOUBLE_RECOMPUTE_V1.
 * Run: node_modules/.bin/tsx src/runtime/runtime-executor.plan-reuse.test.ts
 *
 * Proves the executor REUSES a supplied ExecutionPlan (no second load + buildPlan + ExecutionPlanner.create),
 * that the no-plan path still builds (backward-compatible), and that LocalMissionRunner builds the plan
 * exactly once on the runner→kernel→executor path.
 */

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { RuntimeExecutor } from "./runtime-executor";
import { LocalMissionRunner } from "./local-mission-runner";
import { MissionOrchestrator, ExecutionPlan } from "./mission-orchestrator";

let passed = 0;
function ok(label: string, fn: () => void): void { fn(); passed += 1; console.log(`  ok - ${label}`); }
const reportResult = (ex: unknown) =>
  (ex as { report?: { result?: { objectivesTotal?: number; objectivesExecuted?: number } } })?.report?.result;

// A supplied plan whose objective count DIVERGES from any on-disk contract for the id — so if the executor
// rebuilt instead of reusing, objectivesTotal would NOT be 3.
function suppliedPlan(id: string, n: number): ExecutionPlan {
  const specs = Array.from({ length: n }, (_, i) => ({ id: `SUP_${i + 1}`, goal: `supplied objective ${i + 1}`, doneWhen: [], dependsOn: [], proof: null }));
  const steps = [
    { id: "LOAD", name: "Load", status: "PENDING", actions: [], dependencies: [], postconditions: [], verificationRequirements: [] },
    ...specs.map((s, i) => ({ id: `OBJECTIVE_${i + 1}`, name: s.goal, status: "PENDING", actions: [], dependencies: [], postconditions: [], verificationRequirements: [] })),
  ];
  return {
    mission: {
      id, name: id, projectContext: null, intent: undefined,
      policies: { authorizedPaths: [] }, contract: { definitionOfDone: [], completion: [], verify: [] },
      control: { required: false },
      brain: { loaded: true, objectives: specs.map((s) => s.goal), objectiveSpecs: specs, nextObjective: "SUP_1" },
    },
    objectives: specs.map((s) => s.id), nextObjective: "SUP_1", steps, dependencies: [],
  } as unknown as ExecutionPlan;
}

// 1 — Executor REUSES the supplied plan (divergent 3-objective plan for an id with no 3-objective contract).
ok("executor reuses the supplied plan (objectivesTotal reflects the SUPPLIED 3, not a rebuild)", () => {
  const ex = new RuntimeExecutor().execute("__PLAN_REUSE__", "__PLAN_REUSE__", suppliedPlan("__PLAN_REUSE__", 3));
  const r = reportResult(ex);
  assert.strictEqual(r?.objectivesTotal, 3, "executor did not reuse the supplied plan");
  assert.strictEqual(r?.objectivesExecuted, 3);
});

// 2 — Backward-compatible: no supplied plan ⇒ executor builds a plan for a real temp mission.
{
  const id = "__PLAN_REUSE_BC__";
  const file = path.join("runtime", "missions", `${id}.json`);
  try {
    fs.mkdirSync(path.join("runtime", "missions"), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({
      mission: id, mode: "ANALYZE", requires_engineering: false,
      objectives: [{ id: "BC_A", goal: "a", done_when: ["x"] }, { id: "BC_B", goal: "b", done_when: ["x"] }],
    }));
    ok("no-plan executor path still builds (objectivesTotal from the on-disk 2-objective mission)", () => {
      const ex = new RuntimeExecutor().execute(id, id);
      const r = reportResult(ex);
      assert.strictEqual(r?.objectivesTotal, 2, "backward-compatible build path did not run");
    });
  } finally { fs.rmSync(file, { force: true }); }
}

// 3 — LocalMissionRunner builds the plan exactly ONCE (counting orchestrator), and the executor reuses it.
{
  const id = "__PLAN_REUSE_ONCE__";
  const file = path.join("runtime", "missions", `${id}.json`);
  class CountingOrchestrator extends MissionOrchestrator {
    count = 0;
    buildPlan(i: string, n: string, intent?: import("./mission-intent").MissionIntent): ExecutionPlan {
      this.count += 1;
      return super.buildPlan(i, n, intent);
    }
  }
  const spy = () => ({ skipped: true });
  try {
    fs.writeFileSync(file, JSON.stringify({
      mission: id, mode: "ANALYZE", requires_engineering: false,
      objectives: [{ id: "ONCE_A", goal: "a", done_when: ["x"] }],
    }));
    const counting = new CountingOrchestrator();
    const out = new LocalMissionRunner(counting, undefined, spy).run(id);
    ok("runner→kernel→executor builds the plan exactly once (reused, not rebuilt)", () => {
      assert.strictEqual(counting.count, 1, `expected 1 buildPlan on the runner, got ${counting.count}`);
      assert.strictEqual(out.ok, true);
      // result.plan is the same object the runner built and passed down for execution.
      assert.ok(out.plan, "runner did not return its plan");
    });
  } finally { fs.rmSync(file, { force: true }); }
}

console.log(`\nruntime-executor.plan-reuse: ${passed} assertions passed`);
