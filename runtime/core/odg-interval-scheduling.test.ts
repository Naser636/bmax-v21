#!/usr/bin/env node
"use strict";
/* Tests for odg-interval-scheduling (merge / conflict / coverage / availability). PURE. Hand-verified. */
const I = require("./odg-interval-scheduling.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
function iv(s: number, e: number, id?: string): any { return id ? { id, start: s, end: e } : { start: s, end: e }; }

function main(): void {
  // classic merge: [1,3],[2,6],[8,10],[15,18] ⇒ [1,6],[8,10],[15,18]
  const m = I.mergeIntervals([iv(1, 3), iv(2, 6), iv(8, 10), iv(15, 18)]);
  check("merge classic ⇒ [1,6],[8,10],[15,18]", m.ok === true && JSON.stringify(m.merged) === JSON.stringify([{ start: 1, end: 6 }, { start: 8, end: 10 }, { start: 15, end: 18 }]));
  // touching merges: [1,3],[3,5] ⇒ [1,5]
  check("touching intervals merge ([1,3]+[3,5] ⇒ [1,5])", JSON.stringify(I.mergeIntervals([iv(1, 3), iv(3, 5)]).merged) === JSON.stringify([{ start: 1, end: 5 }]));
  // unsorted input handled
  check("merge handles unsorted input", JSON.stringify(I.mergeIntervals([iv(8, 10), iv(1, 3), iv(2, 6)]).merged) === JSON.stringify([{ start: 1, end: 6 }, { start: 8, end: 10 }]));
  check("empty ⇒ merged []", JSON.stringify(I.mergeIntervals([]).merged) === "[]");

  // conflicts (STRICT overlap): [1,4],[2,5],[7,9],[8,10] ⇒ (a,b) overlap [2,4], (c,d) overlap [8,9]
  const c = I.findConflicts([iv(1, 4, "A"), iv(2, 5, "B"), iv(7, 9, "C"), iv(8, 10, "D")]);
  check("conflicts: A∩B [2,4] and C∩D [8,9]", c.ok === true && c.conflicts.length === 2 && c.hasConflict === true &&
    c.conflicts[0].a === "A" && c.conflicts[0].b === "B" && c.conflicts[0].overlapStart === 2 && c.conflicts[0].overlapEnd === 4 &&
    c.conflicts[1].a === "C" && c.conflicts[1].overlapStart === 8 && c.conflicts[1].overlapEnd === 9);
  // touching is NOT a conflict (back-to-back booking): [1,3],[3,5] ⇒ no conflict
  check("touching endpoints are NOT a conflict", I.findConflicts([iv(1, 3), iv(3, 5)]).hasConflict === false);
  // nested interval is a conflict: [1,10] contains [3,5]
  check("nested interval ⇒ conflict [3,5]", (() => { const r = I.findConflicts([iv(1, 10, "big"), iv(3, 5, "small")]); return r.hasConflict && r.conflicts[0].overlapStart === 3 && r.conflicts[0].overlapEnd === 5; })());
  check("disjoint ⇒ no conflicts", I.findConflicts([iv(1, 2), iv(3, 4), iv(5, 6)]).hasConflict === false);
  // triple overlap ⇒ 3 pairs
  check("three mutually overlapping ⇒ 3 conflict pairs", I.findConflicts([iv(1, 5, "X"), iv(2, 6, "Y"), iv(3, 7, "Z")]).conflicts.length === 3);

  // totalCovered = union length: [1,3],[2,6],[8,10] ⇒ (6-1)+(10-8)=7
  check("totalCovered union = 7", (() => { const t = I.totalCovered([iv(1, 3), iv(2, 6), iv(8, 10)]); return t.covered === 7 && t.segments === 2; })());
  check("totalCovered no double-count of overlap", I.totalCovered([iv(1, 5), iv(2, 4)]).covered === 4);

  // isFree: booked [1,5],[8,10]; query [5,8] free (touches, no strict overlap); [4,6] NOT free
  const booked = [iv(1, 5, "b1"), iv(8, 10, "b2")];
  check("isFree [5,8] ⇒ free (back-to-back, touches only)", I.isFree(booked, iv(5, 8)).free === true);
  check("isFree [4,6] ⇒ NOT free (overlaps b1)", (() => { const r = I.isFree(booked, iv(4, 6)); return r.free === false && r.conflicts[0].id === "b1" && r.conflicts[0].overlapStart === 4 && r.conflicts[0].overlapEnd === 5; })());
  check("isFree against empty ⇒ free", I.isFree([], iv(1, 9)).free === true);

  // fail-closed
  check("start>end ⇒ START_AFTER_END", I.mergeIntervals([iv(5, 2)]).code === "START_AFTER_END");
  check("non-finite bound ⇒ BAD_BOUNDS", I.findConflicts([{ start: 1, end: NaN }]).code === "BAD_BOUNDS");
  check("non-array ⇒ NOT_ARRAY", I.mergeIntervals("x").code === "NOT_ARRAY");
  check("bad interval object ⇒ BAD_INTERVAL", I.totalCovered([[1, 2]]).code === "BAD_INTERVAL");
  check("bad query ⇒ BAD_QUERY", I.isFree([iv(1, 2)], { start: 5, end: 1 }).code === "BAD_QUERY");

  // honesty + determinism + frozen + contract
  check("note: strict overlap, touching allowed, geometric not verdict", /STRICT overlap/.test(c.note) && /not a 'disallowed' verdict/i.test(c.note) && /touching endpoints are NOT a conflict/.test(c.note));
  check("deterministic", JSON.stringify(I.findConflicts([iv(1, 4, "A"), iv(2, 5, "B"), iv(7, 9, "C"), iv(8, 10, "D")])) === JSON.stringify(c));
  check("frozen", Object.isFrozen(c) && Object.isFrozen(c.conflicts) && Object.isFrozen(m) && Object.isFrozen(m.merged));
  check("contract: closed-no-clock, merge-vs-strict-conflict, geometric-not-verdict, fail-closed",
    I.INTERVAL_SCHEDULING_CONTRACT.invariants.some((s: string) => /NO clock/.test(s)) &&
    I.INTERVAL_SCHEDULING_CONTRACT.invariants.some((s: string) => /touching endpoints are NOT a conflict/.test(s)) &&
    I.INTERVAL_SCHEDULING_CONTRACT.invariants.some((s: string) => /NOT a 'disallowed' verdict/.test(s)) &&
    I.INTERVAL_SCHEDULING_CONTRACT.invariants.some((s: string) => /fail-closed/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-interval-scheduling (merge [1,6]/[8,10]/[15,18] + touching-unions; findConflicts STRICT overlap [touching≠conflict, nested=conflict]; totalCovered union no-double-count; isFree back-to-back allowed; start>end/non-finite/non-array fail-closed; geometric-not-verdict; PURE/deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
