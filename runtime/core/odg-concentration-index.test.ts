#!/usr/bin/env node
"use strict";
/* Tests for odg-concentration-index (HHI, Gini, effective-N, CRk). PURE. Values hand-computed from the standard definitions. */
const K = require("./odg-concentration-index.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  // perfect equality [10,10,10,10]: HHI=1/n=0.25, Gini=0, effectiveN=4, top1=0.25
  const eq = K.concentration([10, 10, 10, 10]);
  check("equality: HHI 0.25, Gini 0, effectiveN 4, normalizedHHI 0", eq.hhi === 0.25 && eq.gini === 0 && eq.effectiveN === 4 && eq.normalizedHHI === 0 && eq.top1Share === 0.25);

  // perfect concentration [100,0,0,0]: HHI=1, Gini=(n-1)/n=0.75, effectiveN=1, top1=1, normalizedHHI=1
  const mono = K.concentration([100, 0, 0, 0]);
  check("monopoly: HHI 1, Gini 0.75, effectiveN 1, top1 1, normalizedHHI 1", mono.hhi === 1 && mono.gini === 0.75 && mono.effectiveN === 1 && mono.top1Share === 1 && mono.normalizedHHI === 1 && mono.hhiPoints === 10000);

  // [75,25]: HHI=0.625, Gini=0.25, effectiveN=1.6, top1=0.75
  const two = K.concentration([75, 25]);
  check("[75,25]: HHI 0.625, Gini 0.25, effectiveN 1.6, top1 0.75", two.hhi === 0.625 && two.gini === 0.25 && two.effectiveN === 1.6 && two.top1Share === 0.75);

  // [50,50]: HHI 0.5, Gini 0, effectiveN 2
  const half = K.concentration([50, 50]);
  check("[50,50]: HHI 0.5, Gini 0, effectiveN 2", half.hhi === 0.5 && half.gini === 0 && half.effectiveN === 2);

  // order-independence (same multiset ⇒ same indices)
  check("order-independent", JSON.stringify(K.concentration([25, 75])) === JSON.stringify(K.concentration([75, 25])));

  // single value: HHI 1, Gini 0, normalizedHHI null (undefined, not forced)
  const one = K.concentration([42]);
  check("n=1: HHI 1, Gini 0, normalizedHHI null (not forced)", one.n === 1 && one.hhi === 1 && one.gini === 0 && one.normalizedHHI === null);

  // hhiPoints antitrust scale; sharesDesc sorted descending
  check("hhiPoints = round(hhi*10000); sharesDesc descending", two.hhiPoints === 6250 && two.sharesDesc[0] >= two.sharesDesc[1]);

  // concentrationRatio CRk
  check("CR1 of [60,30,10] = 0.6", K.concentrationRatio([60, 30, 10], 1).crK === 0.6);
  check("CR2 of [60,30,10] = 0.9", K.concentrationRatio([60, 30, 10], 2).crK === 0.9);
  check("CRk clamps k to n (CR9 of 3 values ⇒ CR3 = 1.0)", (() => { const r = K.concentrationRatio([60, 30, 10], 9); return r.k === 3 && r.crK === 1 && r.requestedK === 9; })());

  // fail-closed
  check("empty ⇒ NO_VALUES", K.concentration([]).code === "NO_VALUES");
  check("non-array ⇒ NO_VALUES", K.concentration("x").code === "NO_VALUES");
  check("negative value ⇒ NEGATIVE_OR_INVALID (no imputation)", K.concentration([10, -1]).code === "NEGATIVE_OR_INVALID");
  check("NaN value ⇒ NEGATIVE_OR_INVALID", K.concentration([10, NaN]).code === "NEGATIVE_OR_INVALID");
  check("all-zero total ⇒ ZERO_TOTAL (undefined, not fabricated)", K.concentration([0, 0, 0]).code === "ZERO_TOTAL");
  check("CRk bad k (0) ⇒ BAD_K", K.concentrationRatio([1, 2], 0).code === "BAD_K");
  check("CRk zero total ⇒ ZERO_TOTAL", K.concentrationRatio([0, 0], 1).code === "ZERO_TOTAL");

  // honesty + determinism + frozen + contract
  check("note: distribution shape, not a risk verdict, no threshold invented", /not a risk verdict/i.test(eq.note) && /no threshold invented/i.test(eq.note));
  check("deterministic", JSON.stringify(K.concentration([75, 25])) === JSON.stringify(two));
  check("frozen", Object.isFrozen(two) && Object.isFrozen(two.sharesDesc));
  check("contract: distribution-shape not verdict, no invented threshold, fail-closed, standard defs",
    K.CONCENTRATION_INDEX_CONTRACT.invariants.some((s: string) => /NOT a risk verdict/.test(s)) &&
    K.CONCENTRATION_INDEX_CONTRACT.invariants.some((s: string) => /invents NO threshold/.test(s)) &&
    K.CONCENTRATION_INDEX_CONTRACT.invariants.some((s: string) => /fail-closed/.test(s)) &&
    K.CONCENTRATION_INDEX_CONTRACT.invariants.some((s: string) => /standard definitions/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-concentration-index (HHI/Gini/effective-N/CRk hand-verified: equality⇒HHI0.25/Gini0, monopoly⇒HHI1/Gini0.75, [75,25]⇒0.625/0.25/1.6; n=1 normalizedHHI null; order-independent; distribution-shape NOT risk verdict, no invented threshold; empty/negative/zero-total fail-closed; PURE/deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
