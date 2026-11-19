#!/usr/bin/env node
"use strict";
/* Tests for odg-interval-optimization (max concurrency + max non-overlapping selection). PURE. Hand-verified. */
const O = require("./odg-interval-optimization.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
function iv(s: number, e: number, id?: string): any { return id ? { id, start: s, end: e } : { start: s, end: e }; }

function main(): void {
  // maxConcurrency: triple overlap [1,4],[2,5],[3,6] ⇒ 3 resources needed
  const mc = O.maxConcurrency([iv(1, 4), iv(2, 5), iv(3, 6)]);
  check("maxConcurrency triple overlap ⇒ 3", mc.ok === true && mc.maxConcurrency === 3 && mc.minResourcesNeeded === 3);
  // disjoint ⇒ 1 resource
  check("disjoint ⇒ 1 resource", O.maxConcurrency([iv(1, 2), iv(3, 4), iv(5, 6)]).maxConcurrency === 1);
  // touching does NOT need a new resource: [1,3],[3,5] ⇒ 1
  check("touching ⇒ 1 resource (strict, back-to-back reuse)", O.maxConcurrency([iv(1, 3), iv(3, 5)]).maxConcurrency === 1);
  // partial overlaps: [1,10],[2,3],[4,5] ⇒ 2 (the wide one + one at a time)
  check("[1,10],[2,3],[4,5] ⇒ 2 resources", O.maxConcurrency([iv(1, 10), iv(2, 3), iv(4, 5)]).maxConcurrency === 2);
  // nested ⇒ 2
  check("nested [1,10]⊃[3,5] ⇒ 2", O.maxConcurrency([iv(1, 10), iv(3, 5)]).maxConcurrency === 2);
  check("empty ⇒ 0 resources", O.maxConcurrency([]).maxConcurrency === 0);
  // 'at' reports a point where the max occurs
  check("maxConcurrency reports 'at' point", typeof mc.at === "number" && mc.at >= 1);

  // maxNonOverlapping: [1,3],[2,5],[4,7],[6,8] ⇒ greedy-by-end keeps [1,3],[4,7] (count 2)
  const sel = O.maxNonOverlapping([iv(1, 3, "A"), iv(2, 5, "B"), iv(4, 7, "C"), iv(6, 8, "D")]);
  check("maxNonOverlapping ⇒ count 2, keeps A+C, drops 2", sel.count === 2 && sel.droppedCount === 2 && sel.selected.map((s: any) => s.id).join(",") === "A,C");
  // touching allowed (back-to-back): [1,3],[3,5],[5,7] ⇒ all 3 selected
  check("back-to-back [1,3],[3,5],[5,7] ⇒ all 3 selected", O.maxNonOverlapping([iv(1, 3), iv(3, 5), iv(5, 7)]).count === 3);
  // all overlapping ⇒ only 1 selectable
  check("all mutually overlapping ⇒ 1 selected", O.maxNonOverlapping([iv(1, 5), iv(2, 6), iv(3, 7)]).count === 1);
  // greedy-by-end optimal: [1,10],[2,3],[4,5] ⇒ pick [2,3],[4,5] (count 2), not the wide [1,10] (count 1)
  check("greedy-by-end optimal: picks 2 short over 1 wide", O.maxNonOverlapping([iv(1, 10, "wide"), iv(2, 3, "s1"), iv(4, 5, "s2")]).count === 2);
  check("empty ⇒ 0 selected", O.maxNonOverlapping([]).count === 0);
  check("single ⇒ 1 selected, 0 dropped", O.maxNonOverlapping([iv(1, 5)]).count === 1 && O.maxNonOverlapping([iv(1, 5)]).droppedCount === 0);

  // consistency: with k = maxConcurrency resources, all intervals schedulable; maxNonOverlapping ≤ total
  check("maxNonOverlapping count ≤ n", sel.count <= 4 && sel.count + sel.droppedCount === 4);

  // unsorted input handled deterministically
  check("unsorted input handled", O.maxConcurrency([iv(3, 6), iv(1, 4), iv(2, 5)]).maxConcurrency === 3);

  // fail-closed
  check("start>end ⇒ START_AFTER_END", O.maxConcurrency([iv(5, 2)]).code === "START_AFTER_END");
  check("non-finite ⇒ BAD_BOUNDS", O.maxNonOverlapping([{ start: 1, end: Infinity }]).code === "BAD_BOUNDS");
  check("non-array ⇒ NOT_ARRAY", O.maxConcurrency("x").code === "NOT_ARRAY");
  check("bad interval ⇒ BAD_INTERVAL", O.maxNonOverlapping([[1, 2]]).code === "BAD_INTERVAL");

  // honesty + determinism + frozen + contract
  check("note: geometric minimum not staffing; count not total-time", /GEOMETRIC minimum/.test(mc.note) && /not a staffing decision/.test(mc.note) && /NOT total covered time/.test(sel.note));
  check("deterministic", JSON.stringify(O.maxNonOverlapping([iv(1, 3, "A"), iv(2, 5, "B"), iv(4, 7, "C"), iv(6, 8, "D")])) === JSON.stringify(sel));
  check("frozen", Object.isFrozen(mc) && Object.isFrozen(sel) && Object.isFrozen(sel.selected));
  check("contract: concurrency-geometric-not-staffing, selection-count-not-time, no-clock, fail-closed",
    O.INTERVAL_OPTIMIZATION_CONTRACT.invariants.some((s: string) => /GEOMETRIC minimum/.test(s)) &&
    O.INTERVAL_OPTIMIZATION_CONTRACT.invariants.some((s: string) => /NOT total covered time/.test(s)) &&
    O.INTERVAL_OPTIMIZATION_CONTRACT.invariants.some((s: string) => /NO clock/.test(s)) &&
    O.INTERVAL_OPTIMIZATION_CONTRACT.invariants.some((s: string) => /fail-closed/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-interval-optimization (maxConcurrency: triple⇒3, touching⇒1, nested⇒2, disjoint⇒1 [= min resources, strict overlap]; maxNonOverlapping greedy-by-end: A+C count2, back-to-back⇒all, 2-short-over-1-wide optimal; start>end/non-finite/non-array fail-closed; geometric-not-staffing, count-not-time; PURE/deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
