/*
 * Tests for CONSUME_EXPERT_INSTANCE_ON_EXECUTION_PATH_V1.
 * Run: node_modules/.bin/tsx src/runtime/local-mission-runner.expert.test.ts
 *
 * Proves LocalMissionRunner.run surfaces a mission-scoped §303 Expert Instance (compiled from the
 * released assembler + real profiles on disk) WITHOUT touching control flow: `validated` is still
 * derived solely from the reporter status, and the instance is purely additive on the result.
 */

import assert from "node:assert";
import { LocalMissionRunner } from "./local-mission-runner";
import { MissionOrchestrator, ExecutionPlan } from "./mission-orchestrator";
import { RuntimeKernel } from "./runtime-kernel";

let passed = 0;
function ok(label: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ok - ${label}`);
}

// Build a minimal ExecutionPlan carrying only what compileExpertInstance reads.
function planFor(id: string, goal: string): ExecutionPlan {
  return {
    mission: {
      id,
      name: id,
      brain: {
        objectiveSpecs: [{ id: "obj-1", goal, doneWhen: [], dependsOn: [], proof: null }],
        nextObjective: "obj-1",
        objectives: [goal],
        loaded: true,
      },
      contract: { definitionOfDone: ["tests green"], completion: [], verify: [] },
    },
    objectives: ["obj-1"],
    nextObjective: "obj-1",
    steps: [],
    dependencies: [],
  } as unknown as ExecutionPlan;
}

// Injected orchestrator + kernel: deterministic, no disk mission, no provider.
function runnerFor(goal: string, status: string): LocalMissionRunner {
  const orchestrator = {
    buildPlan: (id: string) => planFor(id, goal),
  } as unknown as MissionOrchestrator;
  const kernel = {
    execute: () => ({ report: { status } }),
  } as unknown as RuntimeKernel;
  const recordLedger = () => undefined;
  return new LocalMissionRunner(orchestrator, kernel, recordLedger);
}

// --- Engineering (non-financial) objective, SUCCESS ---------------------------------------------
const eng = runnerFor("implement the runtime fix for the team", "SUCCESS");
const engOut = eng.run("ENG_MISSION");

ok("run surfaces an expertInstance on the result", () => {
  assert.ok(engOut.ok);
  assert.ok(engOut.expertInstance, "no expertInstance surfaced");
});

ok("non-financial ⇒ ENGINEERING profile bound to the mission", () => {
  assert.strictEqual(engOut.expertInstance!.role, "ENGINEERING_EXPERT");
  assert.strictEqual(engOut.expertInstance!.mission_id, "ENG_MISSION");
  assert.strictEqual(engOut.expertInstance!.objective_id as unknown, "obj-1");
});

ok("authority_scope stays [] (no invented authority vocabulary, §307)", () => {
  assert.deepStrictEqual(engOut.expertInstance!.authority_scope, []);
});

ok("control flow unchanged: validated derives from reporter status only", () => {
  assert.strictEqual(engOut.validated, true);
  const red = runnerFor("implement the runtime fix", "FAILED").run("ENG2");
  assert.strictEqual(red.validated, false);
  assert.ok(red.expertInstance, "instance still surfaced regardless of verdict");
});

// --- Financial objective ⇒ ECONOMIC profile (existing classifier) -------------------------------
ok("financial objective ⇒ ECONOMIC profile", () => {
  const eco = runnerFor("charge the customer payment transaction invoice", "SUCCESS").run("ECO");
  assert.strictEqual(eco.expertInstance!.role, "ECONOMIC_EXPERT");
  assert.strictEqual(eco.expertInstance!.profile_status, "CERTIFIED");
});

ok("instance carries §303 required fields", () => {
  for (const f of ["mission_id", "role", "scope", "allowed_capabilities",
    "allowed_tools", "authority_scope", "validators", "profile_status", "flags"]) {
    assert.ok(f in engOut.expertInstance!, `missing field: ${f}`);
  }
});

console.log(`\nlocal-mission-runner.expert: ${passed} assertions passed`);
