#!/usr/bin/env node
"use strict";
/* Tests for odg-btp-chantier-schedule (precedence CPM). PURE. Hand-verified classic diamond A→{B,C}→D. */
const S = require("./odg-btp-chantier-schedule.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
function t(sch: any, id: string): any { return sch.tasks.find((x: any) => x.id === id); }

/* Diamond: A(3) → B(2),C(4) → D(2). Forward: A es0 ef3; B es3 ef5; C es3 ef7; D es7 ef9. end=9.
   Backward (end 9): D lf9 ls7; C lf7 ls3; B lf7 ls5; A lf3 ls0. Float: A0 B2 C0 D0. Critical: A,C,D. */
function diamond(): any { return { tasks: [
  { id: "A", label: "Terrassement", durationDays: 3 },
  { id: "B", durationDays: 2, deps: ["A"] },
  { id: "C", durationDays: 4, deps: ["A"] },
  { id: "D", durationDays: 2, deps: ["B", "C"] },
] }; }

function main(): void {
  const sch = S.computeSchedule(diamond());
  check("schedule ok, 4 tasks, project duration 9", sch.ok === true && sch.tasks.length === 4 && sch.projectDurationDays === 9 && sch.projectEndDay === 9);
  check("A: es0 ef3 ls0 lf3 float0 critical", t(sch, "A").es === 0 && t(sch, "A").ef === 3 && t(sch, "A").ls === 0 && t(sch, "A").lf === 3 && t(sch, "A").floatDays === 0 && t(sch, "A").critical === true);
  check("B: es3 ef5 ls5 lf7 float2 NOT critical", t(sch, "B").es === 3 && t(sch, "B").ef === 5 && t(sch, "B").ls === 5 && t(sch, "B").lf === 7 && t(sch, "B").floatDays === 2 && t(sch, "B").critical === false);
  check("C: es3 ef7 ls3 lf7 float0 critical", t(sch, "C").es === 3 && t(sch, "C").ef === 7 && t(sch, "C").ls === 3 && t(sch, "C").floatDays === 0 && t(sch, "C").critical === true);
  check("D: es7 ef9 ls7 lf9 float0 critical", t(sch, "D").es === 7 && t(sch, "D").ef === 9 && t(sch, "D").floatDays === 0 && t(sch, "D").critical === true);
  check("criticalTaskIds = [A,C,D] (B excluded)", JSON.stringify(sch.criticalTaskIds) === JSON.stringify(["A", "C", "D"]));

  // critical path chain
  const cp = S.criticalPath(sch);
  check("criticalPath A→C→D, chain duration 9", JSON.stringify(cp.path) === JSON.stringify(["A", "C", "D"]) && cp.chainDurationDays === 9);

  // startDay offset shifts everything, duration unchanged
  const off = S.computeSchedule({ ...diamond(), startDay: 10 });
  check("startDay 10 ⇒ A es10 ef13, end 19, duration still 9", t(off, "A").es === 10 && t(off, "A").ef === 13 && off.projectEndDay === 19 && off.projectDurationDays === 9);

  // milestone (duration 0) handled
  const ms = S.computeSchedule({ tasks: [{ id: "A", durationDays: 2 }, { id: "M", durationDays: 0, deps: ["A"] }, { id: "B", durationDays: 3, deps: ["M"] }] });
  check("zero-duration milestone: M es2 ef2, project duration 5", t(ms, "M").es === 2 && t(ms, "M").ef === 2 && ms.projectDurationDays === 5);

  // fail-closed
  check("no tasks ⇒ NO_TASKS", S.computeSchedule({ tasks: [] }).code === "NO_TASKS");
  check("duplicate id ⇒ DUP_ID", S.computeSchedule({ tasks: [{ id: "A", durationDays: 1 }, { id: "A", durationDays: 2 }] }).code === "DUP_ID");
  check("bad duration ⇒ BAD_DURATION", S.computeSchedule({ tasks: [{ id: "A", durationDays: -1 }] }).code === "BAD_DURATION");
  check("non-int duration ⇒ BAD_DURATION", S.computeSchedule({ tasks: [{ id: "A", durationDays: 1.5 }] }).code === "BAD_DURATION");
  check("unknown dep ⇒ UNKNOWN_DEP", S.computeSchedule({ tasks: [{ id: "A", durationDays: 1, deps: ["Z"] }] }).code === "UNKNOWN_DEP");

  // cycle detected (never a partial schedule), cycle members reported
  const cyc = S.computeSchedule({ tasks: [{ id: "A", durationDays: 1, deps: ["B"] }, { id: "B", durationDays: 1, deps: ["A"] }] });
  check("cycle ⇒ CYCLE_DETECTED + members [A,B]", cyc.code === "CYCLE_DETECTED" && JSON.stringify(cyc.cycleMembers) === JSON.stringify(["A", "B"]));
  const cyc3 = S.computeSchedule({ tasks: [{ id: "A", durationDays: 1, deps: ["C"] }, { id: "B", durationDays: 1, deps: ["A"] }, { id: "C", durationDays: 1, deps: ["B"] }] });
  check("3-cycle detected", cyc3.code === "CYCLE_DETECTED" && cyc3.cycleMembers.length === 3);

  // float is slack: B has 2 days float ⇒ can slip 2 days without delaying the project (ef5 vs lf7)
  check("float semantics: B can finish as late as lf7 (2 days after ef5)", t(sch, "B").lf - t(sch, "B").ef === 2);

  // honesty: note flags no-resource-leveling + estimates
  check("note flags precedence-only (no resource leveling) + planning estimates", /does NOT level resources/.test(sch.note) && /PLANNING ESTIMATES/.test(sch.note));

  // determinism + frozen
  check("deterministic", JSON.stringify(S.computeSchedule(diamond())) === JSON.stringify(sch));
  check("frozen output", Object.isFrozen(sch) && Object.isFrozen(sch.tasks) && Object.isFrozen(t(sch, "A")) && Object.isFrozen(sch.criticalTaskIds));

  check("contract: precedence-CPM, fail-closed cycle, no resource leveling, estimates-not-commitments",
    S.CHANTIER_SCHEDULE_CONTRACT.invariants.some((s: string) => /forward pass ES\/EF \+ backward pass LS\/LF/.test(s)) &&
    S.CHANTIER_SCHEDULE_CONTRACT.invariants.some((s: string) => /CYCLE ⇒ typed refusal/.test(s)) &&
    S.CHANTIER_SCHEDULE_CONTRACT.invariants.some((s: string) => /does NOT level resources/.test(s)) &&
    S.CHANTIER_SCHEDULE_CONTRACT.invariants.some((s: string) => /PLANNING ESTIMATES/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-btp-chantier-schedule (precedence CPM: hand-verified diamond ES/EF/LS/LF/float/critical; critical path A→C→D=9; cycle/dup/unknown-dep/bad-duration fail-closed; day-indices not calendar; no resource leveling flagged; durations=estimates; PURE/deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
