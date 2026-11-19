#!/usr/bin/env node
"use strict";
/* Tests for odg-apportion (largest-remainder exact split). PURE. Hand-verified + sum-exactness invariant. */
const A = require("./odg-apportion.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
function sum(a: number[]): number { return a.reduce((x, y) => x + y, 0); }

function main(): void {
  // equal weights, remainder to lowest index: 100 / [1,1,1] ⇒ [34,33,33]
  const eq = A.apportion(100, [1, 1, 1]);
  check("100/[1,1,1] ⇒ [34,33,33], sums to 100", eq.ok === true && JSON.stringify(eq.parts) === JSON.stringify([34, 33, 33]) && eq.sumsExactly === true);

  // unequal: 10 / [1,2,3] ⇒ ideal 1.667/3.333/5.0 ⇒ floor 1,3,5 rem1 to idx0 (frac .667) ⇒ [2,3,5]
  check("10/[1,2,3] ⇒ [2,3,5]", JSON.stringify(A.apportion(10, [1, 2, 3]).parts) === JSON.stringify([2, 3, 5]));

  // exact shares (no remainder): 100 / [50,30,20] ⇒ [50,30,20]
  check("100/[50,30,20] ⇒ [50,30,20] (no remainder)", JSON.stringify(A.apportion(100, [50, 30, 20]).parts) === JSON.stringify([50, 30, 20]));

  // remainder > 1 distributed to the largest fracs: 7/[1,1,1] ⇒ [3,2,2]
  check("7/[1,1,1] ⇒ [3,2,2]", JSON.stringify(A.apportion(7, [1, 1, 1]).parts) === JSON.stringify([3, 2, 2]));
  // 8/[1,1,1] ⇒ floor 2,2,2 rem2 to idx0,1 ⇒ [3,3,2]
  check("8/[1,1,1] ⇒ [3,3,2] (2 units to lowest indices)", JSON.stringify(A.apportion(8, [1, 1, 1]).parts) === JSON.stringify([3, 3, 2]));

  // fractional tie-break by index: 5/[2,1,2] ⇒ ideal 2.0,1.0,2.0 ⇒ exact [2,1,2]
  check("5/[2,1,2] ⇒ [2,1,2] (exact)", JSON.stringify(A.apportion(5, [2, 1, 2]).parts) === JSON.stringify([2, 1, 2]));
  // largest frac wins: 10/[3,3,4] ⇒ ideal 3.0,3.0,4.0 ⇒ [3,3,4]
  check("10/[3,3,4] ⇒ [3,3,4]", JSON.stringify(A.apportion(10, [3, 3, 4]).parts) === JSON.stringify([3, 3, 4]));

  // float weights (percentages): 1000 / [33.33, 33.33, 33.34] sums exactly to 1000
  const pct = A.apportion(1000, [33.33, 33.33, 33.34]);
  check("float-weight split sums exactly to 1000", pct.ok === true && sum(pct.parts) === 1000 && pct.sumsExactly === true);

  // zero total ⇒ all zeros; a zero weight gets 0
  check("0 total ⇒ [0,0]", JSON.stringify(A.apportion(0, [1, 2]).parts) === JSON.stringify([0, 0]));
  check("zero weight among nonzero ⇒ that part 0, sums exact", (() => { const r = A.apportion(10, [0, 1, 1]); return r.parts[0] === 0 && sum(r.parts) === 10; })());
  // single weight ⇒ whole total
  check("single weight ⇒ whole total", JSON.stringify(A.apportion(99, [5]).parts) === JSON.stringify([99]));

  // SUM-EXACTNESS invariant across many deterministic cases (the core guarantee)
  let exact = true;
  for (let total = 0; total <= 300; total += 7) {
    for (const w of [[1, 1, 1], [1, 2, 3, 4], [7, 11, 13], [100, 1], [1, 1, 1, 1, 1, 1, 1], [2, 3, 5, 7, 11]]) {
      const r = A.apportion(total, w);
      if (!r.ok || sum(r.parts) !== total || r.parts.length !== w.length || r.parts.some((p: number) => !Number.isInteger(p) || p < 0)) { exact = false; break; }
    }
    if (!exact) break;
  }
  check("sum-exactness invariant holds across many totals×weights (integer, non-negative parts)", exact);

  // parts proportional-ish: larger weight ⇒ ≥ part
  check("monotone: larger weight gets ≥ part", (() => { const r = A.apportion(100, [1, 5, 10]); return r.parts[0] <= r.parts[1] && r.parts[1] <= r.parts[2]; })());

  // fail-closed
  check("negative total ⇒ BAD_TOTAL", A.apportion(-1, [1, 1]).code === "BAD_TOTAL");
  check("float total ⇒ BAD_TOTAL", A.apportion(10.5, [1, 1]).code === "BAD_TOTAL");
  check("empty weights ⇒ NO_WEIGHTS", A.apportion(10, []).code === "NO_WEIGHTS");
  check("negative weight ⇒ BAD_WEIGHT", A.apportion(10, [1, -1]).code === "BAD_WEIGHT");
  check("NaN weight ⇒ BAD_WEIGHT", A.apportion(10, [1, NaN]).code === "BAD_WEIGHT");
  check("all-zero weights ⇒ ZERO_WEIGHTS", A.apportion(10, [0, 0, 0]).code === "ZERO_WEIGHTS");

  // honesty + determinism + frozen + contract
  check("note: sums exactly, largest-remainder, NOT a fairness guarantee", /sum EXACTLY/.test(eq.note) && /largest-remainder/.test(eq.note) && /NOT a fairness guarantee/.test(eq.note));
  check("deterministic", JSON.stringify(A.apportion(100, [1, 1, 1])) === JSON.stringify(eq));
  check("frozen", Object.isFrozen(eq) && Object.isFrozen(eq.parts));
  check("contract: sums-exactly, largest-remainder-deterministic, not-fairness, fail-closed",
    A.APPORTION_CONTRACT.invariants.some((s: string) => /sum EXACTLY to the total/.test(s)) &&
    A.APPORTION_CONTRACT.invariants.some((s: string) => /ties → lowest index/.test(s)) &&
    A.APPORTION_CONTRACT.invariants.some((s: string) => /NOT a fairness guarantee/.test(s)) &&
    A.APPORTION_CONTRACT.invariants.some((s: string) => /fail-closed/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-apportion (largest-remainder: 100/[1,1,1]⇒[34,33,33], 10/[1,2,3]⇒[2,3,5], 8/[1,1,1]⇒[3,3,2]; float-weight pct sums exact; SUM-EXACTNESS invariant across many totals×weights [integer non-neg parts]; monotone; negative/float/empty/NaN/all-zero fail-closed; NOT-fairness honest; PURE/deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
