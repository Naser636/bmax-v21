#!/usr/bin/env node
"use strict";
/* Tests for odg-multiple-testing-correction (Bonferroni/Holm FWER, Benjamini–Hochberg FDR). PURE. Hand-computed. */
const MT = require("./odg-multiple-testing-correction.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
function rej(res: any): number { return res.rejectedCount; }
function adj(res: any, i: number): number { return res.results[i].pAdjusted; }

function main(): void {
  // Headline family (shows FDR more powerful than FWER): p=[0.001,0.02,0.025,0.03,0.9], m=5, α=0.05
  const P = [0.001, 0.02, 0.025, 0.03, 0.9];
  const bon = MT.bonferroni(P, {});
  const hol = MT.holm(P, {});
  const bh = MT.benjaminiHochberg(P, {});

  // Bonferroni: adjusted = p·5 ⇒ [0.005,0.1,0.125,0.15,1]; reject only 0.001
  check("Bonferroni adjusted = p·m, capped", adj(bon, 0) === 0.005 && adj(bon, 1) === 0.1 && adj(bon, 4) === 1);
  check("Bonferroni rejects 1 (only p=0.001)", rej(bon) === 1 && bon.results[0].reject === true && bon.results[1].reject === false);

  // Holm: same 1 rejection here (step-down stops at 0.02: 4·0.02=0.08>0.05)
  check("Holm rejects 1; adjusted monotone non-decreasing by rank", rej(hol) === 1 && adj(hol, 0) === 0.005 && adj(hol, 1) === 0.08);

  // BH: q=[0.005,0.0375,0.0375,0.0375,0.9] ⇒ rejects 4 (FDR more powerful than FWER)
  check("BH q-values hand-match [0.005,0.0375,0.0375,0.0375,0.9]", adj(bh, 0) === 0.005 && adj(bh, 1) === 0.0375 && adj(bh, 2) === 0.0375 && adj(bh, 3) === 0.0375 && adj(bh, 4) === 0.9);
  check("BH rejects 4 (vs FWER's 1) — FDR more powerful", rej(bh) === 4 && bh.results[3].reject === true && bh.results[4].reject === false);

  // Holm ≥ Bonferroni power always (same or more rejections)
  const P2 = [0.001, 0.008, 0.039, 0.041, 0.9];
  check("Holm rejections ≥ Bonferroni rejections", rej(MT.holm(P2, {})) >= rej(MT.bonferroni(P2, {})));

  // all-significant tiny p ⇒ everyone rejects under all methods
  const tiny = [0.0001, 0.0002, 0.0003];
  check("tiny p's ⇒ all reject under all three", rej(MT.bonferroni(tiny, {})) === 3 && rej(MT.holm(tiny, {})) === 3 && rej(MT.benjaminiHochberg(tiny, {})) === 3);

  // none significant ⇒ zero rejects
  const big = [0.5, 0.6, 0.7];
  check("large p's ⇒ 0 rejects all methods", rej(MT.bonferroni(big, {})) === 0 && rej(MT.holm(big, {})) === 0 && rej(MT.benjaminiHochberg(big, {})) === 0);

  // adjusted p capped at 1 (never > 1)
  check("adjusted p never exceeds 1", MT.bonferroni([0.9, 0.9, 0.9], {}).results.every((r: any) => r.pAdjusted <= 1));

  // single test ⇒ adjusted == raw (m=1)
  check("single p ⇒ adjusted equals raw (m=1)", MT.bonferroni([0.03], {}).results[0].pAdjusted === 0.03 && MT.benjaminiHochberg([0.03], {}).results[0].pAdjusted === 0.03);

  // alpha override
  check("stricter alpha ⇒ fewer/equal rejections", MT.benjaminiHochberg(P, { alpha: 0.001 }).rejectedCount <= bh.rejectedCount);
  check("default alpha 0.05", bon.alpha === 0.05);

  // results preserve original order + index
  check("results keep original order + index", bon.results.map((r: any) => r.index).join(",") === "0,1,2,3,4" && bon.results[0].p === 0.001);

  // fail-closed
  check("p>1 ⇒ BAD_PVALUES", MT.bonferroni([0.5, 1.2], {}).code === "BAD_PVALUES");
  check("p<0 ⇒ BAD_PVALUES", MT.holm([-0.1, 0.5], {}).code === "BAD_PVALUES");
  check("non-array ⇒ BAD_PVALUES", MT.benjaminiHochberg("x", {}).code === "BAD_PVALUES");
  check("empty ⇒ BAD_PVALUES", MT.bonferroni([], {}).code === "BAD_PVALUES");
  check("NaN ⇒ BAD_PVALUES", MT.holm([0.5, NaN], {}).code === "BAD_PVALUES");

  // honesty + determinism + frozen + contract
  check("note: FWER vs FDR, conservative, not 'no effect'", /FWER/.test(bon.note) && /FDR/.test(bh.note) && /NOT 'no effect'/.test(bon.note));
  check("deterministic", JSON.stringify(MT.benjaminiHochberg(P, {})) === JSON.stringify(bh));
  check("frozen", Object.isFrozen(bh) && Object.isFrozen(bh.results) && Object.isFrozen(bh.results[0]));
  check("contract: FWER≠FDR, conservative, p-values-are-inputs, fail-closed",
    MT.MULTIPLE_TESTING_CONTRACT.invariants.some((s: string) => /NOT interchangeable/.test(s)) &&
    MT.MULTIPLE_TESTING_CONTRACT.invariants.some((s: string) => /CONSERVATIVE/.test(s)) &&
    MT.MULTIPLE_TESTING_CONTRACT.invariants.some((s: string) => /p-values are INPUTS/.test(s)) &&
    MT.MULTIPLE_TESTING_CONTRACT.invariants.some((s: string) => /fail-closed/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-multiple-testing-correction (Bonferroni/Holm FWER + Benjamini–Hochberg FDR, hand-verified: [0.001,0.02,0.025,0.03,0.9]⇒BH rejects 4 vs FWER's 1; BH q monotone step-up; Holm≥Bonferroni power; adjusted capped [0,1]; order preserved; p∉[0,1] fail-closed; FWER≠FDR, conservative-not-no-effect; PURE/deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
