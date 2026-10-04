/*
 * V5 CONTROLLED EXECUTION — CONTROL-DECLARATION TRANSPORT regression.
 *
 * Proves the mission's control declaration SURVIVES the real mission-loading / runtime transport
 * path and stays consistent with the authoritative live release gate:
 *
 *   mission manifest (runtime/missions/<id>.json : control.required)
 *     -> MissionLoader.load            (RuntimeMission.control)
 *     -> MissionOrchestrator.buildPlan (ExecutionPlan.mission.control = execution context)
 *     -> runtime/core/acceptance-facts.controlDeclared  (the ledger release gate's own disk read)
 *
 * Before this campaign the loader dropped control entirely (RuntimeMission had no control field), so
 * the runtime transport object was blind to controlled execution and the declaration only survived
 * because the ledger re-reads the contract from disk. This test fails if any future loader refactor
 * silently drops or mutates control.required, re-opening that transport gap.
 *
 * Pure/read-only: loads existing migrated missions, mutates nothing. M0000 is the controlled sample
 * (control.required=true); M0001 is the legacy sample (no control declared).
 *
 * Run directly: node_modules/.bin/tsx src/runtime/control-transport.test.ts
 */
import { createRequire } from "node:module";
import { MissionLoader } from "./mission-loader";
import { MissionOrchestrator } from "./mission-orchestrator";

const require = createRequire(import.meta.url);
const { controlDeclared } = require("../../runtime/core/acceptance-facts.js") as {
  controlDeclared: (m: string) => boolean;
};
const { isControlled } = require("../../runtime/core/mechanical-acceptance.js") as {
  isControlled: (m: unknown) => boolean;
};

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

console.log("V5 CONTROLLED EXECUTION — CONTROL-DECLARATION TRANSPORT");

const loader = new MissionLoader();
const orchestrator = new MissionOrchestrator();

// 1 — CONTROLLED: control.required=true survives manifest -> loader -> RuntimeMission.
{
  const m = loader.load("M0000", "M0000");
  check(m.control !== undefined, "1. RuntimeMission carries a control field (not dropped)");
  check(m.control.required === true, "1b. controlled manifest ⇒ RuntimeMission.control.required === true");
}

// 2 — EXECUTION CONTEXT: the declaration survives into the ExecutionPlan the runtime executes.
{
  const plan = orchestrator.buildPlan("M0000", "M0000");
  check(plan.mission.control.required === true, "2. control.required survives into ExecutionPlan.mission (execution context)");
  // The transported object alone is now sufficient for mechanical-acceptance's opt-in switch,
  // with no re-read of disk required at the runtime layer.
  check(isControlled(plan.mission) === true, "2b. isControlled(plan.mission) === true on the transported object");
}

// 3 — AUTHORITATIVE GATE CONSISTENCY: the transported declaration agrees with the ledger gate's
//     own independent disk read (acceptance-facts.controlDeclared). Transport ties to enforcement.
{
  const m = loader.load("M0000", "M0000");
  check(m.control.required === controlDeclared("M0000"), "3. transported control.required agrees with the live release gate (controlDeclared)");
}

// 4 — LEGACY: a mission with no control declaration is NEVER defaulted to controlled.
{
  const m = loader.load("M0001", "M0001");
  check(m.control.required === false, "4. legacy manifest (no control) ⇒ RuntimeMission.control.required === false");
  check(isControlled(m) === false, "4b. isControlled(legacy RuntimeMission) === false");
  check(controlDeclared("M0001") === false, "4c. gate agrees: M0001 is not controlled");
  check(m.control.required === controlDeclared("M0001"), "4d. legacy transport agrees with the live release gate");
}

// 5 — TOLERANCE: an unknown/contract-less mission yields the safe legacy shape (never throws).
{
  const m = loader.load("NO_SUCH_MISSION_XYZ", "NO_SUCH_MISSION_XYZ");
  check(m.control.required === false, "5. contract-less mission ⇒ safe legacy { required:false } (no throw, no default-to-controlled)");
}

console.log(failures === 0 ? "ALL PASS — CONTROL-DECLARATION TRANSPORT" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
