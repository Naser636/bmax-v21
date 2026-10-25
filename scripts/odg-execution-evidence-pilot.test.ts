/*
 * odg-execution-evidence-pilot.test.ts — deterministic tests for the pilot orchestration + tally, using an
 * INJECTED fake runner (no real pipeline spawn), no-op snapshot/restore, and a stub measurer (no coupling to
 * buildAutonomyRate internals). Covers real-run success/failure, oracle exclusion, restore verification, the
 * mission/objective tally split, and JS/TS dual-port parity.
 */
"use strict";
const assert = require("assert");
const path = require("path");
const P = require(path.resolve(__dirname, "odg-execution-evidence-pilot.ts"));
const PJS = require(path.resolve(__dirname, "odg-execution-evidence-pilot.js"));

let passed = 0;
function ok(name: string, cond: any) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

// Deterministic fake runner: maps a mission id to a captured (exit, plan, execution) without spawning.
function fakeRunner(mission: string): any {
  if (mission === "M_OK") return { mission, exit: 0, plan: { mission: "M_OK", objectives: [{ id: "o1" }] }, execution: { mission: "M_OK", executed: [{ objectiveId: "o1", status: "RECORDED" }] } };
  if (mission === "M_FAIL") return { mission, exit: 1, plan: null, execution: null };
  if (mission === "M_CROSS") return { mission, exit: 0, plan: { mission: "M_CROSS", objectives: [{ id: "o1" }] }, execution: { mission: "OTHER", executed: [{ objectiveId: "o1" }] } };
  return { mission, exit: 0, plan: null, execution: null };
}
const noopSnap = () => ({ tgz: "x", digest: "D" });
const okRestore = () => ({ verified: true, digest: "D" });
const badRestore = () => ({ verified: false, digest: "MISMATCH" });
// Stub measurer: M_OK ⇒ 1/1 verified; so executedBenchmark yields a justified denominator from oracle-clean pairs.
const stubRate = (inputs: any) => ({ measure: { measurable: true, denominator: 1, numerator: 1, categories: { ODG_EXECUTED_VERIFIED: 1, ODG_EXECUTED_UNVERIFIED: 0, OPERATOR_OR_EXTERNAL: 0, BLOCKED_REFUSED_FAILED: 0, HUMAN_MANDATORY: 0, NOT_EXECUTED: 0 } } });

const commonOpts = { runner: fakeRunner, snapshot: noopSnap, restore: okRestore, buildRate: stubRate };

// ---- 1. End-to-end pilot: failed run blocked; cross-mission excluded by oracle; clean run measured. ----
(function pilotEndToEnd() {
  const r = P.runPilot(["M_OK", "M_FAIL", "M_CROSS"], commonOpts);
  const t = r.tally;
  ok("attempted = 3", t.attempted === 3);
  ok("failed run classified blocked (not a pair)", t.runFailedBlocked.length === 1 && t.runFailedBlocked[0] === "M_FAIL");
  ok("cross-mission run excluded by oracle", t.excludedByOracle.length === 1 && t.excludedByOracle[0] === "M_CROSS");
  ok("only the clean run is measurable", t.measurableMissions === 1);
  ok("objective denominator/numerator from the clean run", t.objectiveDenominator === 1 && t.objectiveNumeratorVerified === 1);
  ok("executed-autonomy% (objectives) = 100 on this stubbed clean run", t.executedAutonomyPercentObjectives === 100);
  ok("restore verified true", r.restoreVerified === true);
})();

// ---- 2. RECORDED-only run yields NOT_EXECUTED, never a success (use the REAL measurer, no stub). --------
(function recordedNeverSuccess() {
  const r = P.runPilot(["M_OK"], { runner: fakeRunner, snapshot: noopSnap, restore: okRestore }); // real buildAutonomyRate
  const t = r.tally;
  // M_OK's single objective lacks an authorization declaration ⇒ eligibility incomplete ⇒ NOT measurable,
  // so it cannot contribute a numerator. A RECORDED status is never counted as executed autonomy.
  ok("RECORDED-only real run contributes NO verified numerator", (t.objectiveNumeratorVerified || 0) === 0);
  ok("executed-autonomy% is 0 or null, never a fabricated success", t.executedAutonomyPercentObjectives === 0 || t.executedAutonomyPercentObjectives === null);
})();

// ---- 3. Failed restore ⇒ restoreVerified false (fail-closed signal). ----------------------------------
(function restoreFailSignal() {
  const r = P.runPilot(["M_OK"], { runner: fakeRunner, snapshot: noopSnap, restore: badRestore, buildRate: stubRate });
  ok("restore mismatch ⇒ restoreVerified false", r.restoreVerified === false);
})();

// ---- 4. tally is pure over (runs, benchmarkReport). ----------------------------------------------------
(function tallyPure() {
  const runs = [{ mission: "A", exit: 0, plan: {}, execution: {} }, { mission: "B", exit: 2, plan: null, execution: null }];
  const t = P.tally(runs, { countedMissions: 1, excluded: [], notMeasurable: [], denominator: 2, numerator: 0, executedAutonomyPercent: 0, categories: { NOT_EXECUTED: 2 } });
  ok("tally: B flagged runFailedBlocked (exit 2)", t.runFailedBlocked.length === 1 && t.runFailedBlocked[0] === "B");
  ok("tally: objective rate passthrough", t.objectiveDenominator === 2 && t.executedAutonomyPercentObjectives === 0);
})();

// ---- 5. JS/TS dual-port parity on the pilot orchestration. --------------------------------------------
(function dualPortParity() {
  const a = P.runPilot(["M_OK", "M_FAIL", "M_CROSS"], commonOpts);
  const b = PJS.runPilot(["M_OK", "M_FAIL", "M_CROSS"], commonOpts);
  ok("runPilot report parity (ts≡js)", JSON.stringify(a) === JSON.stringify(b));
  ok("SAFE_MISSION_SET parity (ts≡js)", JSON.stringify(P.SAFE_MISSION_SET) === JSON.stringify(PJS.SAFE_MISSION_SET));
})();

console.log(`\nEXECUTION-EVIDENCE PILOT — ${passed} assertions passed.`);
export {};
