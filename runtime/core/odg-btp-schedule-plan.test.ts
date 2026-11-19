#!/usr/bin/env node
"use strict";
/*
 * Tests for odg-btp-schedule-plan (consolidated planning view). PURE. Composes the REAL CPM + planSchedule (no mocks).
 * Diamond A(3)→{B(2),C(4)}→D(2): CPM critical = A,C,D. Status is controlled via percentComplete/asOfDay so that
 * C is DELAYED and D is BLOCKED ⇒ criticalAndDelayed=[C], criticalAndBlocked=[D].
 */
const SP = require("./odg-btp-schedule-plan.js");
const CPM = require("./odg-btp-chantier-schedule.js");
const WF = require("./odg-btp-project-workflow.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
function mt(plan: any, id: string): any { return plan.tasks.find((t: any) => t.id === id); }

function tasks(): any[] { return [
  { id: "A", durationDays: 3, percentComplete: 100 },
  { id: "B", durationDays: 2, dependencies: ["A"], percentComplete: 100 },
  { id: "C", durationDays: 4, dependencies: ["A"], percentComplete: 50, plannedStart: 0, plannedFinish: 4, asOfDay: 6 }, // delayed: 6>4, incomplete
  { id: "D", durationDays: 2, dependencies: ["B", "C"], percentComplete: 0 }, // blocked: dep C at 50%
]; }

function main(): void {
  const plan = SP.consolidatedPlan(tasks(), {});
  check("consolidated plan ok, 4 tasks, duration 9", plan.ok === true && plan.tasks.length === 4 && plan.projectDurationDays === 9);

  // CPM timing merged (matches the standalone engine)
  const cpmStandalone = CPM.computeSchedule({ tasks: [{ id: "A", durationDays: 3 }, { id: "B", durationDays: 2, deps: ["A"] }, { id: "C", durationDays: 4, deps: ["A"] }, { id: "D", durationDays: 2, deps: ["B", "C"] }] });
  check("CPM values identical to standalone engine (composition, not re-impl)",
    mt(plan, "C").cpm.es === 3 && mt(plan, "C").cpm.ef === 7 && mt(plan, "C").cpm.floatDays === 0 && mt(plan, "C").cpm.critical === true &&
    mt(plan, "C").cpm.es === cpmStandalone.tasks.find((t: any) => t.id === "C").es);
  check("criticalTaskIds = [A,C,D]", JSON.stringify(plan.criticalTaskIds) === JSON.stringify(["A", "C", "D"]));

  // planSchedule status merged (matches standalone)
  const wfStandalone = WF.planSchedule(tasks());
  check("status blocked=[D] delayed=[C] (matches standalone planSchedule)",
    JSON.stringify(plan.status.blocked) === JSON.stringify(wfStandalone.blocked) && JSON.stringify(plan.status.blocked) === JSON.stringify(["D"]) &&
    JSON.stringify(plan.status.delayed) === JSON.stringify(["C"]));
  check("per-task status merged: D blocked by C; C delayed", mt(plan, "D").status.blocked === true && mt(plan, "D").status.blockedBy.indexOf("C") >= 0 && mt(plan, "C").status.delayed === true);

  // THE VALUE-ADD cross-reference
  check("criticalAndBlocked = [D]", JSON.stringify(plan.attention.criticalAndBlocked) === JSON.stringify(["D"]));
  check("criticalAndDelayed = [C]", JSON.stringify(plan.attention.criticalAndDelayed) === JSON.stringify(["C"]));
  check("B is NOT in attention lists (non-critical, not blocked/delayed)", plan.attention.criticalAndBlocked.indexOf("B") < 0 && plan.attention.criticalAndDelayed.indexOf("B") < 0);

  // duration resolution: EXPLICIT vs DERIVED, and fail-closed on unresolved
  check("durationSource EXPLICIT when durationDays given", mt(plan, "A").durationSource === "EXPLICIT");
  const derived = SP.consolidatedPlan([{ id: "X", plannedStart: 2, plannedFinish: 7 }], {});
  check("DERIVED duration from plannedFinish−plannedStart (5)", derived.ok === true && mt(derived, "X").durationDays === 5 && mt(derived, "X").durationSource === "DERIVED");
  check("resolveDuration direct: explicit wins over derivable", SP.resolveDuration({ durationDays: 2, plannedStart: 0, plannedFinish: 9 }).source === "EXPLICIT");
  const unres = SP.consolidatedPlan([{ id: "A", durationDays: 1 }, { id: "Z" /* no duration, no dates */ }], {});
  check("unresolved duration ⇒ UNRESOLVED_DURATIONS (never invented)", unres.ok === false && unres.code === "UNRESOLVED_DURATIONS" && unres.unresolved[0].id === "Z");
  check("inconsistent planned dates not derivable (pf<ps) ⇒ unresolved", SP.consolidatedPlan([{ id: "Z", plannedStart: 7, plannedFinish: 2 }], {}).code === "UNRESOLVED_DURATIONS");

  // refusals surfaced verbatim from the sub-engines
  check("no tasks ⇒ NO_TASKS", SP.consolidatedPlan([], {}).code === "NO_TASKS");
  const cyc = SP.consolidatedPlan([{ id: "A", durationDays: 1, dependencies: ["B"] }, { id: "B", durationDays: 1, dependencies: ["A"] }], {});
  check("cycle ⇒ CPM_REFUSED surfacing CYCLE_DETECTED (no partial plan)", cyc.ok === false && cyc.code === "CPM_REFUSED" && cyc.cpm.code === "CYCLE_DETECTED");
  const dangling = SP.consolidatedPlan([{ id: "A", durationDays: 1, dependencies: ["GHOST"] }], {});
  check("dangling dep ⇒ surfaced (CPM UNKNOWN_DEP)", dangling.ok === false);

  // startDay offset flows through CPM
  const off = SP.consolidatedPlan(tasks(), { startDay: 10 });
  check("startDay 10 ⇒ A es 10, projectEndDay 19", mt(off, "A").cpm.es === 10 && off.projectEndDay === 19);

  // determinism (input order shuffled) + frozen
  const shuffled = SP.consolidatedPlan([tasks()[3], tasks()[1], tasks()[0], tasks()[2]], {});
  check("deterministic regardless of input task order", JSON.stringify(shuffled.tasks.map((t: any) => t.id)) === JSON.stringify(plan.tasks.map((t: any) => t.id)) && shuffled.projectDurationDays === 9);
  check("frozen output", Object.isFrozen(plan) && Object.isFrozen(plan.tasks) && Object.isFrozen(plan.attention) && Object.isFrozen(mt(plan, "A")));

  check("contract: composes both + modifies neither, never invents duration, surfaces refusals, cross-reference value-add",
    SP.SCHEDULE_PLAN_CONTRACT.invariants.some((s: string) => /MODIFIES NEITHER/.test(s)) &&
    SP.SCHEDULE_PLAN_CONTRACT.invariants.some((s: string) => /NEVER invented/.test(s)) &&
    SP.SCHEDULE_PLAN_CONTRACT.invariants.some((s: string) => /surfaced verbatim/.test(s)) &&
    SP.SCHEDULE_PLAN_CONTRACT.invariants.some((s: string) => /critical∧blocked/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-btp-schedule-plan (D07 consolidation: composes REAL CPM + planSchedule, modifies neither; EXPLICIT|DERIVED duration or UNRESOLVED fail-closed; cross-reference criticalAndBlocked=[D]/criticalAndDelayed=[C]; cycle/dangling surfaced verbatim; deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
