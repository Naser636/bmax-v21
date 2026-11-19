#!/usr/bin/env node
"use strict";
/* Tests for odg-passk-estimator (unbiased pass@k, Chen et al. 2021). PURE. Values hand-verified vs 1−C(n−c,k)/C(n,k). */
const P = require("./odg-passk-estimator.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
function pk(n: number, c: number, k: number): number { return P.passAtK(n, c, k).passAtK; }

function main(): void {
  // pass@1 = c/n exactly
  check("pass@1 = c/n: (5,1,1)=0.2", pk(5, 1, 1) === 0.2);
  check("pass@1 (5,0,1)=0 (no correct)", pk(5, 0, 1) === 0);
  check("pass@1 (5,5,1)=1 (all correct)", pk(5, 5, 1) === 1);

  // n=10,c=2,k=5 ⇒ 1 − C(8,5)/C(10,5) = 1 − 56/252 = 0.777778
  check("(10,2,5) = 0.777778 (= 1 − C(8,5)/C(10,5))", pk(10, 2, 5) === 0.777778);
  // n=5,c=1,k=5 ⇒ draw all ⇒ must include the 1 correct ⇒ 1 (n−c=4 < k=5)
  check("(5,1,5) = 1 (fewer than k incorrect ⇒ guaranteed hit)", pk(5, 1, 5) === 1);
  // n=4,c=2,k=2 ⇒ 1 − C(2,2)/C(4,2) = 1 − 1/6 = 0.833333
  check("(4,2,2) = 0.833333 (= 1 − 1/6)", pk(4, 2, 2) === 0.833333);
  // n=200,c=100,k=100 — numerically-stable form must not overflow (naive C(100,100)/C(200,100) would)
  // numerically-stable form must not overflow (naive C(100,100)/C(200,100) would); value is finite & valid (≈1: hitting ≥1 of 100 correct when drawing 100 of 200 is near-certain)
  check("(200,100,100) computes finite & valid (no overflow)", (() => { const v = pk(200, 100, 100); return Number.isFinite(v) && v > 0.99 && v <= 1; })());

  // pass@k monotonic non-decreasing in k (more budget ⇒ ≥ chance of ≥1 hit)
  check("monotone in k: (10,2,1) ≤ (10,2,3) ≤ (10,2,8)", pk(10, 2, 1) <= pk(10, 2, 3) && pk(10, 2, 3) <= pk(10, 2, 8));
  check("pass@k ≥ pass@1 (capability rises with budget)", pk(10, 3, 5) >= pk(10, 3, 1));

  // DISTINCTION from pass^k: pass@k (≥1 of k) ≠ reliability (all k). For c=1/n=5/k=5, pass@5=1 but reliability would be low.
  check("pass@k is capability not reliability: (5,1,5)=1 (≥1 hit), not an all-pass claim", pk(5, 1, 5) === 1);

  // fail-closed
  check("non-integer ⇒ NOT_NON_NEG_INT", P.passAtK(5.5, 1, 1).code === "NOT_NON_NEG_INT");
  check("c > n ⇒ C_GT_N", P.passAtK(3, 5, 1).code === "C_GT_N");
  check("k > n ⇒ K_GT_N (need n ≥ k)", P.passAtK(4, 2, 5).code === "K_GT_N");
  check("k < 1 ⇒ K_TOO_SMALL", P.passAtK(4, 2, 0).code === "K_TOO_SMALL");
  check("n < 1 ⇒ N_TOO_SMALL", P.passAtK(0, 0, 1).code === "N_TOO_SMALL");

  // aggregate across tasks (n/c form and rollouts form)
  const agg = P.estimatePassAtK([{ id: "a", n: 10, c: 2 }, { id: "b", n: 10, c: 5 }], 5);
  check("aggregate mean pass@5 over 2 tasks", agg.ok === true && agg.tasks === 2 && agg.meanPassAtK === Number(((pk(10, 2, 5) + pk(10, 5, 5)) / 2).toFixed(6)));
  const aggR = P.estimatePassAtK([{ rollouts: [true, false, true, false] }], 2); // n=4,c=2
  check("aggregate from boolean rollouts (n=4,c=2,k=2 ⇒ 0.833333)", aggR.perTask[0].passAtK === 0.833333);
  check("aggregate fail-closed: a task with k>n ⇒ TASK_INVALID (not skipped)", P.estimatePassAtK([{ n: 3, c: 1 }], 5).code === "TASK_INVALID");
  check("aggregate bad rollouts ⇒ BAD_ROLLOUTS", P.estimatePassAtK([{ rollouts: [true, "x"] }], 1).code === "BAD_ROLLOUTS");
  check("no tasks ⇒ NO_TASKS", P.estimatePassAtK([], 1).code === "NO_TASKS");

  // honesty + determinism + frozen + contract
  const r = P.passAtK(10, 2, 5);
  check("note: capability complement of pass^k reliability, estimate", /CAPABILITY/.test(r.note) && /complement of pass\^k/i.test(r.note) && /estimate/.test(r.note));
  check("deterministic", JSON.stringify(P.passAtK(10, 2, 5)) === JSON.stringify(r));
  check("frozen", Object.isFrozen(r) && Object.isFrozen(agg) && Object.isFrozen(agg.perTask));
  check("contract: capability≠reliability, stable product, unbiased estimate, fail-closed",
    P.PASSK_ESTIMATOR_CONTRACT.invariants.some((s: string) => /COMPLEMENT of pass\^k/.test(s)) &&
    P.PASSK_ESTIMATOR_CONTRACT.invariants.some((s: string) => /numerically-stable product/.test(s)) &&
    P.PASSK_ESTIMATOR_CONTRACT.invariants.some((s: string) => /UNBIASED ESTIMATOR/.test(s)) &&
    P.PASSK_ESTIMATOR_CONTRACT.invariants.some((s: string) => /fail-closed/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-passk-estimator (unbiased pass@k: (10,2,5)=0.7778=1−C(8,5)/C(10,5), (4,2,2)=0.8333, pass@1=c/n; numerically-stable product no-overflow at (200,100,100); monotone in k; CAPABILITY distinct from pass^k reliability; c>n/k>n/non-int fail-closed; PURE/deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
