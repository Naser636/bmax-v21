#!/usr/bin/env node
"use strict";
const assert = require("assert");
const S = require("./eval-significance");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 22 — EVAL SIGNIFICANCE (Wilson / two-proportion z / McNemar)");

// Wilson 95% CI for 18/20 ≈ [0.699, 0.972] (known value).
{
  const w = S.wilsonInterval(18, 20);
  check(w.verdict === "OK" && w.rate === 0.9, "Wilson rate = 0.9");
  check(w.lo > 0.68 && w.lo < 0.72 && w.hi > 0.95 && w.hi < 0.99, `Wilson CI ≈ [0.699,0.972] (got [${w.lo},${w.hi}])`);
  check(w.lo >= 0 && w.hi <= 1, "Wilson CI clamped to [0,1]");
}
// n=0 ⇒ NO_DATA (never a fabricated rate).
check(S.wilsonInterval(0, 0).verdict === "NO_DATA" && S.wilsonInterval(0, 0).rate === null, "n=0 ⇒ NO_DATA (no fabricated rate)");
// invalid successes>n ⇒ NO_DATA (fail-closed).
check(S.wilsonInterval(25, 20).verdict === "NO_DATA", "successes>n ⇒ NO_DATA (fail-closed)");

// two-proportion z: 18/20 vs 10/20 ⇒ significant difference.
{
  const t = S.twoProportionZ({ successes: 18, n: 20 }, { successes: 10, n: 20 });
  check(t.significant === true && t.verdict === "DIFFERENT" && t.ciLo > 0, `large gap ⇒ significant (z=${t.z}, CI [${t.ciLo},${t.ciHi}])`);
}
// two-proportion z: 11/20 vs 10/20 ⇒ NOT significant (noise).
{
  const t = S.twoProportionZ({ successes: 11, n: 20 }, { successes: 10, n: 20 });
  check(t.significant === false && t.verdict === "INCONCLUSIVE" && t.ciLo < 0 && t.ciHi > 0, "tiny gap ⇒ INCONCLUSIVE (CI includes 0)");
}
check(S.twoProportionZ({ successes: 0, n: 0 }, { successes: 1, n: 2 }).verdict === "NO_DATA", "z-test n=0 ⇒ NO_DATA");

// McNemar paired: 8 fixed, 0 regressed ⇒ significant improvement.
{
  const before = [true, true, true, true, true, true, true, true, true, true, false, false, false, false, false, false, false, false, false, false]; // 10 pass
  const after = [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, false, false]; // 18 pass (8 fixed, 0 regressed)
  const m = S.mcnemarPaired(before, after);
  check(m.b === 0 && m.c === 8, `discordant counts b=0 c=8 (got b=${m.b} c=${m.c})`);
  check(m.significant === true && m.verdict === "SIGNIFICANT" && m.direction === "improved", `McNemar significant improvement (χ²=${m.chiSq})`);
}
// McNemar: identical before/after ⇒ NO_CHANGE.
check(S.mcnemarPaired([true, false, true], [true, false, true]).verdict === "NO_CHANGE", "identical paired ⇒ NO_CHANGE");
// McNemar: unequal lengths ⇒ NO_DATA (fail-closed).
check(S.mcnemarPaired([true], [true, false]).verdict === "NO_DATA", "unequal-length paired ⇒ NO_DATA (fail-closed)");

// significanceGate — unpaired real improvement.
check(S.significanceGate({ before: { successes: 10, n: 20 }, after: { successes: 18, n: 20 } }).verdict === "IMPROVEMENT", "gate: large gap ⇒ IMPROVEMENT");
// significanceGate — noise is NOT an improvement (the core 2026 rule).
check(S.significanceGate({ before: { successes: 9, n: 10 }, after: { successes: 10, n: 10 } }).verdict === "INCONCLUSIVE", "gate: 9/10→10/10 ⇒ INCONCLUSIVE (noise, not a win)");
// significanceGate — paired path uses McNemar.
{
  const before = [true, true, false, false, false, false]; const after = [true, true, true, true, true, true]; // 4 fixed, 0 regressed, small N
  const g = S.significanceGate({ before: { cases: before }, after: { cases: after } });
  check(g.method === "mcnemar", "gate: paired cases ⇒ McNemar method");
}
check(S.significanceGate({ before: {}, after: {} }).verdict === "NO_DATA", "gate: no data ⇒ NO_DATA (fail-closed)");

check(S.EVAL_SIGNIFICANCE_CONTRACT.invariants.some((i: any) => /noise is never a win/.test(i)), "contract: noise is never a win");

console.log(failures === 0 ? "ALL PASS — SÉRIE 22 EVAL SIGNIFICANCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
