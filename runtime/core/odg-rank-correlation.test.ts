#!/usr/bin/env node
"use strict";
/* Tests for odg-rank-correlation (Spearman ρ, Kendall τ-b). PURE. Values hand-computed from the definitions. */
const R = require("./odg-rank-correlation.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  // perfect / inverse monotonic
  check("Spearman perfect: [1,2,3,4,5] vs [1,2,3,4,5] ⇒ ρ=1 STRONG", (() => { const r = R.spearman([1, 2, 3, 4, 5], [1, 2, 3, 4, 5]); return r.rho === 1 && r.strength === "STRONG"; })());
  check("Spearman inverse: vs [5,4,3,2,1] ⇒ ρ=-1", R.spearman([1, 2, 3, 4, 5], [5, 4, 3, 2, 1]).rho === -1);
  check("Kendall perfect ⇒ τ=1; inverse ⇒ τ=-1", R.kendall([1, 2, 3, 4, 5], [1, 2, 3, 4, 5]).tau === 1 && R.kendall([1, 2, 3, 4, 5], [5, 4, 3, 2, 1]).tau === -1);

  // hand-computed no-ties example: x=[1..5], y=[2,1,4,3,5] ⇒ Spearman ρ=0.8 (Σd²=4), Kendall τ=0.6 (8 conc, 2 disc of 10)
  const sp = R.spearman([1, 2, 3, 4, 5], [2, 1, 4, 3, 5]);
  const kd = R.kendall([1, 2, 3, 4, 5], [2, 1, 4, 3, 5]);
  check("Spearman [1..5] vs [2,1,4,3,5] ⇒ ρ=0.8", sp.rho === 0.8);
  check("Kendall same ⇒ τ=0.6, 8 concordant / 2 discordant", kd.tau === 0.6 && kd.concordant === 8 && kd.discordant === 2);

  // TIES — Spearman via Pearson-of-average-ranks (NOT the no-ties shortcut)
  // x=[1,1,2,3] ranks[1.5,1.5,3,4]; y=[1,2,2,3] ranks[1,2.5,2.5,4] ⇒ ρ=3.75/4.5=0.833333
  check("Spearman ties: [1,1,2,3] vs [1,2,2,3] ⇒ ρ=0.833333 (tie-correct)", R.spearman([1, 1, 2, 3], [1, 2, 2, 3]).rho === 0.833333);
  // Kendall τ-b same: 4 concordant, 0 discordant, tx=1 (one x-tie pair), ty=1 ⇒ τ-b=4/√(5·5)=0.8
  const kdt = R.kendall([1, 1, 2, 3], [1, 2, 2, 3]);
  check("Kendall τ-b ties: ⇒ τ=0.8 (4 conc, 0 disc, tie-corrected denom)", kdt.tau === 0.8 && kdt.concordant === 4 && kdt.discordant === 0);

  // avgRanks tie handling direct
  check("avgRanks ties: [10,10,20,30] ⇒ [1.5,1.5,3,4]", JSON.stringify(R.avgRanks([10, 10, 20, 30])) === JSON.stringify([1.5, 1.5, 3, 4]));

  // TIES ON BOTH SIDES — pins the both-tied branch (a pair tied on x AND y must go to BOTH tie corrections, NOT concordant).
  // [1,1,2,2,3,4] vs [2,2,2,1,3,4]: pair(0,1) tied on both ⇒ τ-b=0.560449 (nc 9, nd 2), ρ=0.656571 (scipy-equivalent)
  check("Kendall both-tie branch: [1,1,2,2,3,4] vs [2,2,2,1,3,4] ⇒ τ-b=0.560449 (nc 9, nd 2)", (() => { const k = R.kendall([1, 1, 2, 2, 3, 4], [2, 2, 2, 1, 3, 4]); return k.tau === 0.560449 && k.concordant === 9 && k.discordant === 2; })());
  check("Spearman both-tie: same ⇒ ρ=0.656571", R.spearman([1, 1, 2, 2, 3, 4], [2, 2, 2, 1, 3, 4]).rho === 0.656571);

  // Spearman differs from the no-ties shortcut when ties exist (robustness proof): shortcut would give a different number
  check("tie-correct ρ (0.8333) ≠ naive-shortcut value", R.spearman([1, 1, 2, 3], [1, 2, 2, 3]).rho === 0.833333);

  // zero variance ⇒ UNDEFINED (not forced)
  check("Spearman all-tied x ⇒ ρ null UNDEFINED", R.spearman([5, 5, 5], [1, 2, 3]).rho === null && R.spearman([5, 5, 5], [1, 2, 3]).strength === "UNDEFINED");
  check("Kendall all-tied x ⇒ τ null UNDEFINED", R.kendall([5, 5, 5], [1, 2, 3]).tau === null);

  // strength labels (rough convention)
  check("strengthOf bands", R.strengthOf(null) === "UNDEFINED" && R.strengthOf(0.05) === "NEGLIGIBLE" && R.strengthOf(0.3) === "WEAK" && R.strengthOf(0.5) === "MODERATE" && R.strengthOf(-0.9) === "STRONG");

  // fail-closed
  check("length mismatch ⇒ LENGTH_MISMATCH", R.spearman([1, 2, 3], [1, 2]).code === "LENGTH_MISMATCH");
  check("n<3 ⇒ TOO_FEW", R.kendall([1, 2], [1, 2]).code === "TOO_FEW");
  check("non-numeric ⇒ NOT_NUMERIC_ARRAYS", R.spearman([1, "x", 3], [1, 2, 3]).code === "NOT_NUMERIC_ARRAYS");
  check("NaN ⇒ NOT_NUMERIC_ARRAYS (no imputation)", R.kendall([1, NaN, 3], [1, 2, 3]).code === "NOT_NUMERIC_ARRAYS");

  // honesty + determinism + frozen + contract
  check("note: monotonic order, NOT causation/accuracy", /MONOTONIC order/.test(sp.note) && /NOT causation/.test(sp.note));
  check("deterministic", JSON.stringify(R.spearman([1, 2, 3, 4, 5], [2, 1, 4, 3, 5])) === JSON.stringify(sp));
  check("frozen", Object.isFrozen(sp) && Object.isFrozen(kd));
  check("contract: pearson-of-ranks tie-correct, tau-b, order-not-accuracy, undefined-not-forced",
    R.RANK_CORRELATION_CONTRACT.invariants.some((s: string) => /PEARSON of AVERAGE RANKS/.test(s)) &&
    R.RANK_CORRELATION_CONTRACT.invariants.some((s: string) => /τ-b \(tie-corrected\)/.test(s)) &&
    R.RANK_CORRELATION_CONTRACT.invariants.some((s: string) => /NOT causation/.test(s)) &&
    R.RANK_CORRELATION_CONTRACT.invariants.some((s: string) => /UNDEFINED/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-rank-correlation (Spearman ρ=Pearson-of-avg-ranks + Kendall τ-b, hand-verified: [1..5]vs[2,1,4,3,5]⇒ρ0.8/τ0.6, ties⇒ρ0.8333/τ-b0.8; perfect±1; zero-variance⇒UNDEFINED not forced; order-NOT-accuracy; mismatch/n<3/non-finite fail-closed; PURE/deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
