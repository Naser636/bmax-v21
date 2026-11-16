#!/usr/bin/env node
"use strict";
/* V241 Phase-2/3/4/5 — resident driver L0 OBSERVE. Proves: an L0 cycle is read-only (no business-state write, no
 * execution/accept/reject, no provider call, no status change); explicit lifecycle + states; IDLE when no work; reports
 * (never executes) when work exists; emergency-stop honoured; blocked surfaced; obsolete proof surfaced (V236); no level
 * self-promotes (L1 can't trigger L2; non-L0 refused); runs a REAL L0 cycle over the committed consolidated roadmap;
 * deterministic + frozen. */
const D = require("./odg-resident-driver.js");
const PC = require("./odg-program-continuity.js");
const fs = require("fs");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

const T0 = Date.UTC(2026, 10, 16);
const progNoWork = { objective: "p", boussoleRef: "V12.4", missions: [{ id: "A", status: "ACCEPTED", deps: [], evidence: "e" }] };
const progWork = { objective: "p", boussoleRef: "V12.4", missions: [{ id: "A", status: "ACCEPTED", deps: [], evidence: "e" }, { id: "B", status: "READY", deps: [] }] };
const progBlocked = { objective: "p", boussoleRef: "V12.4", missions: [{ id: "BLK", status: "BLOCKED", deps: [], blockReason: "owner" }, { id: "C", status: "READY", deps: ["BLK"] }] };

function main() {
  // L0 no work ⇒ IDLE, read-only.
  const idle = D.observe({ program: progNoWork, context: { asOfEpochMs: T0, currentCommit: "c" } });
  check("L0 no work ⇒ IDLE, lifecycle STARTING→OBSERVING→IDLE→STOPPING→STOPPED", idle.state === "IDLE" && JSON.stringify(idle.lifecycle) === JSON.stringify(["STARTING", "OBSERVING", "IDLE", "STOPPING", "STOPPED"]));
  check("L0 NO business-state write / no execution / no status change / no provider call", idle.modifiedBusinessState === false && idle.writes.length === 0 && idle.executedMission === false && idle.changedMissionStatus === false && idle.calledProvider === false && idle.executionPermittedAtThisLevel === false);

  // L0 work available ⇒ REPORTS it, still does not execute (observe-only).
  const work = D.observe({ program: progWork, context: { asOfEpochMs: T0, currentCommit: "c" } });
  check("L0 work available ⇒ reports nextEligible but executes NOTHING (observe-only)", work.observation.workAvailable === true && work.observation.nextEligible === "B" && work.executedMission === false && work.modifiedBusinessState === false && /executes NOTHING/.test(work.note));

  // blocked surfaced without executing.
  const blk = D.observe({ program: progBlocked, context: { asOfEpochMs: T0, currentCommit: "c" } });
  check("L0 blocked dependency surfaced (read-only), independent branch not falsely executed", blk.observation.blocked.includes("BLK") && blk.modifiedBusinessState === false);

  // emergency stop dominates ⇒ clean STOPPED, no observation.
  const stop = D.observe({ program: progWork, context: { asOfEpochMs: T0, currentCommit: "c" }, emergencyStopEngaged: true });
  check("emergency-stop engaged ⇒ clean STOPPED, honoured, no business write", stop.state === "STOPPED" && stop.emergencyStopHonoured === true && stop.modifiedBusinessState === false && JSON.stringify(stop.lifecycle) === JSON.stringify(["STARTING", "STOPPING", "STOPPED"]));

  // obsolete proof (V236 component changed) surfaced for revalidation, read-only.
  const fp = require("./odg-cartography-reconcile.js").fingerprint, P = (s: string) => "runtime/core/" + s;
  const progStale = { objective: "p", boussoleRef: "V12.4",
    missions: [{ id: "A", status: "ACCEPTED", deps: [], evidence: "e", observation: { claim: "A", kind: "OBSERVATION", observedAtEpochMs: T0, observedCommit: "old", scope: [P("x.ts")], method: "m" }, componentPaths: [P("x.ts")] }],
    prevSnapshot: { commit: "old", entries: [{ id: "x", path: P("x.ts"), digest: fp("v1") }] }, currSnapshot: { commit: "new", entries: [{ id: "x", path: P("x.ts"), digest: fp("v2") }] } };
  const stale = D.observe({ program: progStale, context: { asOfEpochMs: T0 + 86400000, currentCommit: "new" } });
  check("L0 obsolete proof (component changed) surfaced in mustRevalidate (read-only, not re-executed)", stale.observation.mustRevalidate.includes("A") && stale.executedMission === false);

  // no level self-promotes.
  check("non-L0 level REFUSED (no auto-escalation)", D.observe({ program: progWork, context: {}, level: "L2_CONTROLLED_LOCAL" }).state === "ERROR");
  const sim = D.simulate({ program: progWork, context: { asOfEpochMs: T0, currentCommit: "c" } });
  check("L1 SIMULATE: prepares decision, zero persistence, wouldExecute=false, canTriggerL2=false", sim.level === "L1_SIMULATE" && sim.persisted === false && sim.simulatedDecision.wouldExecute === false && sim.canTriggerL2 === false);
  const l2 = D.l2Contract();
  check("L2 contract DECLARED but NOT activated (requires owner auth + independent validation)", l2.activated === false && l2.scope.production === false && l2.requires.some((r: string) => /owner authorization/.test(r)));

  // internal error ⇒ ERROR state, still no write.
  const err = D.observe({ program: null, context: null });
  check("internal error (unreadable program) ⇒ ERROR state, no business write", err.state === "ERROR" && err.modifiedBusinessState === false);

  // REAL L0 cycle on the host (= the VPS) over the committed consolidated roadmap, proving zero writes.
  const companion = JSON.parse(fs.readFileSync("docs/odg/v124-consolidated-roadmap.json", "utf8"));
  const realProgram = require("./odg-v124-consolidation.js").toContinuityProgram(companion);
  const realCycle = D.observe({ program: realProgram, context: { asOfEpochMs: T0, currentCommit: "94aeb0f" } });
  check("REAL L0 cycle over the committed V12.4 roadmap: produces a state, writes nothing, executes nothing", ["IDLE", "BLOCKED"].includes(realCycle.state) && realCycle.modifiedBusinessState === false && realCycle.writes.length === 0 && realCycle.executedMission === false && typeof realCycle.observation.missionsTotal === "number" && realCycle.observation.missionsTotal >= 10);

  // determinism + frozen + contract.
  check("deterministic + frozen", JSON.stringify(D.observe({ program: progWork, context: { asOfEpochMs: T0, currentCommit: "c" } })) === JSON.stringify(work) && Object.isFrozen(work) && Object.isFrozen(work.observation));
  check("contract: L0 read-only, no authority, composes continuity+emergency-stop, no 2nd scheduler/10th primitive", D.RESIDENT_DRIVER_CONTRACT.invariants.some((i: string) => /L0 OBSERVE is read-only/.test(i)) && D.RESIDENT_DRIVER_CONTRACT.invariants.some((i: string) => /builds NO second stop system, scheduler/.test(i)) && D.RESIDENT_DRIVER_CONTRACT.invariants.some((i: string) => /no level self-promotes/.test(i)));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — resident-driver (V241: L0 OBSERVE read-only — no business write / no execution / no status change / no provider call; explicit lifecycle; IDLE when no work; reports-not-executes when work exists; emergency-stop honoured; blocked + obsolete-proof surfaced; no level self-promotes [L1≠>L2, L2 declared-only]; REAL L0 cycle over the committed roadmap; composes program-continuity + emergency-stop, no 2nd scheduler)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
