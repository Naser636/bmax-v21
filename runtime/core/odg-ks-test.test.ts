#!/usr/bin/env node
"use strict";
/* Tests for odg-ks-test (two-sample Kolmogorov–Smirnov). PURE. D values hand-computed from the ECDFs. */
const KS = require("./odg-ks-test.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  // identical samples ⇒ D=0, p=1, NOT_DIFFERENT
  const same = KS.ksTwoSample([1, 2, 3, 4], [1, 2, 3, 4]);
  check("identical ⇒ D 0, p 1, NOT_DIFFERENT", same.ok === true && same.d === 0 && same.pValue === 1 && same.verdict === "NOT_DIFFERENT");

  // hand-computed D: A=[1,2,3,4] (n4), B=[1..8] (m8). Max gap at x=4: Fa=1.0, Fb=0.5 ⇒ D=0.5
  check("ksStatistic hand-check: [1,2,3,4] vs [1..8] ⇒ D=0.5", KS.ksStatistic([1, 2, 3, 4], [1, 2, 3, 4, 5, 6, 7, 8]) === 0.5);

  // disjoint ranges ⇒ D=1 (max possible), significant ⇒ DIFFERENT
  const disj = KS.ksTwoSample([1, 2, 3, 4, 5], [6, 7, 8, 9, 10]);
  check("disjoint ⇒ D 1, DIFFERENT, p<0.05", disj.d === 1 && disj.verdict === "DIFFERENT" && disj.pValue < 0.05 && disj.reject === true);

  // D is symmetric (order of samples doesn't change the statistic)
  check("D symmetric: KS(A,B).d == KS(B,A).d", KS.ksTwoSample([1, 5, 9, 13], [2, 6, 10, 14]).d === KS.ksTwoSample([2, 6, 10, 14], [1, 5, 9, 13]).d);

  // order-independence within a sample (shuffle ⇒ identical result)
  check("within-sample order-independent", JSON.stringify(KS.ksTwoSample([4, 2, 3, 1], [8, 1, 5, 3, 7, 2, 6, 4])) === JSON.stringify(KS.ksTwoSample([1, 2, 3, 4], [1, 2, 3, 4, 5, 6, 7, 8])));

  // probKS bounds: 0 ⇒ 1; large λ ⇒ ~0; monotone-ish
  check("probKS(0)=1, probKS(large)→~0", KS.probKS(0) === 1 && KS.probKS(3) < 0.001 && KS.probKS(0.3) > 0.9);

  // p-value in [0,1], criticalD present; smallSample flagged
  check("p in [0,1], criticalD>0, smallSample flagged for tiny n", same.pValue >= 0 && same.pValue <= 1 && disj.criticalD > 0 && disj.smallSample === true);

  // D exceeds criticalD iff reject (consistency between the two decision routes, approx)
  check("reject ⇒ D ≥ criticalD (disjoint)", disj.d >= disj.criticalD);

  // alpha override changes the critical value (stricter α ⇒ larger criticalD)
  check("stricter alpha ⇒ larger criticalD", KS.ksTwoSample([1, 2, 3, 4, 5], [6, 7, 8, 9, 10], { alpha: 0.01 }).criticalD > KS.ksTwoSample([1, 2, 3, 4, 5], [6, 7, 8, 9, 10], { alpha: 0.05 }).criticalD);

  // large similar samples ⇒ NOT_DIFFERENT (same underlying values ⇒ D small)
  const big = Array.from({ length: 50 }, (_, i) => i + 1);
  check("identical 50-sample ⇒ NOT_DIFFERENT, not flagged small", (() => { const r = KS.ksTwoSample(big, big.slice()); return r.verdict === "NOT_DIFFERENT" && r.smallSample === false; })());

  // fail-closed
  check("non-array ⇒ NOT_NUMERIC_ARRAYS", KS.ksTwoSample("x", [1, 2]).code === "NOT_NUMERIC_ARRAYS");
  check("non-finite (NaN) ⇒ NOT_NUMERIC_ARRAYS (no imputation)", KS.ksTwoSample([1, NaN, 3], [1, 2, 3]).code === "NOT_NUMERIC_ARRAYS");
  check("string element ⇒ NOT_NUMERIC_ARRAYS", KS.ksTwoSample([1, "2", 3], [1, 2, 3]).code === "NOT_NUMERIC_ARRAYS");
  check("<2 values ⇒ TOO_FEW", KS.ksTwoSample([1], [1, 2, 3]).code === "TOO_FEW");

  // honesty + determinism + frozen + contract
  check("note: distribution-free, no binning, NOT proof of sameness, asymptotic", /distribution-free, no binning/.test(disj.note) && /NOT proof of sameness/.test(disj.note) && /asymptotic/.test(disj.note));
  check("deterministic", JSON.stringify(KS.ksTwoSample([1, 2, 3, 4, 5], [6, 7, 8, 9, 10])) === JSON.stringify(disj));
  check("frozen", Object.isFrozen(disj));
  check("contract: distribution-free no-binning, not-proof-of-sameness, asymptotic, fail-closed",
    KS.KS_TEST_CONTRACT.invariants.some((s: string) => /distribution-FREE, NO binning/.test(s)) &&
    KS.KS_TEST_CONTRACT.invariants.some((s: string) => /NOT proof of sameness/.test(s)) &&
    KS.KS_TEST_CONTRACT.invariants.some((s: string) => /ASYMPTOTIC approximation/.test(s)) &&
    KS.KS_TEST_CONTRACT.invariants.some((s: string) => /fail-closed/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-ks-test (two-sample KS: identical⇒D0/p1, [1-4]vs[1-8]⇒D0.5 hand-verified, disjoint⇒D1/DIFFERENT; symmetric + order-independent; probKS(0)=1; distribution-free no-binning; NOT_DIFFERENT≠proof-of-sameness; asymptotic p flagged smallSample; non-finite/<2 fail-closed; PURE/deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
