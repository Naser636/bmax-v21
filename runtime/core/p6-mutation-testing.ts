#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 15 (P6 excellence) — MUTATION TESTING. PURE, deterministic. World reference: mutation testing (Stryker / PIT /
 * mutmut) is the gold standard for TEST-SUITE EFFECTIVENESS — a passing test suite proves nothing about whether the
 * tests would CATCH a bug. You inject small faults ("mutants") into the code and measure how many the suite KILLS
 * (fails on) vs how many SURVIVE (suite still green = a real gap). ODG's P6 reference measured held-out accuracy +
 * metric-gaming but had NO test-effectiveness measure. This adds the mutation score, fail-closed (survivors are
 * surfaced; an empty mutant set is NOT a pass). Directly answers the doctrine "passing its own tests ≠ excellent".
 * Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function round(n: number): number { return Number(n.toFixed(4)); }

/** runMutationTest({original, mutants, oracle}) -> { mutationScore, killed, survived, total, survivors }.
 * oracle(fn) -> true when the TEST SUITE passes for `fn`. A mutant is KILLED if the suite FAILS on it (good), SURVIVED
 * if the suite still passes (a test gap). Fail-closed: a non-function oracle, a surviving original, or zero mutants ⇒
 * the result is flagged invalid (NOT a pass). */
function runMutationTest(input: any): any {
  const o = isObj(input) ? input : {};
  const oracle = typeof o.oracle === "function" ? o.oracle : null;
  const mutants = arr(o.mutants);
  if (!oracle) return Object.freeze({ valid: false, reason: "no test oracle", mutationScore: 0, killed: 0, survived: 0, total: 0, survivors: Object.freeze([]) });
  // Sanity: the ORIGINAL must pass its own suite; if the suite fails on the correct code, mutation results are meaningless.
  let originalPasses = true;
  if (typeof o.original !== "undefined") { try { originalPasses = oracle(o.original) === true; } catch { originalPasses = false; } }
  if (!originalPasses) return Object.freeze({ valid: false, reason: "the test suite fails on the ORIGINAL (correct) code — fix the suite first", mutationScore: 0, killed: 0, survived: 0, total: mutants.length, survivors: Object.freeze([]) });
  if (mutants.length === 0) return Object.freeze({ valid: false, reason: "no mutants — an empty mutant set is NOT a pass (nothing measured)", mutationScore: 0, killed: 0, survived: 0, total: 0, survivors: Object.freeze([]) });

  let killed = 0; const survivors: any[] = [];
  for (let i = 0; i < mutants.length; i++) {
    let caught = false;
    try { caught = oracle(mutants[i].fn !== undefined ? mutants[i].fn : mutants[i]) !== true; } catch { caught = true; } // a throw = caught
    if (caught) killed++; else survivors.push(mutants[i].id !== undefined ? mutants[i].id : i);
  }
  const total = mutants.length; const survived = total - killed;
  return Object.freeze({ valid: true, mutationScore: round(killed / total), killed, survived, total, survivors: Object.freeze(survivors), note: "survivors reveal test-suite gaps (the suite did not catch an injected fault)" });
}

/** effective(result, minScore) -> boolean. Fail-closed: an invalid run or a score below the threshold is NOT effective. */
function effective(result: any, minScore: number): boolean {
  if (!isObj(result) || result.valid !== true) return false;
  return result.mutationScore >= (typeof minScore === "number" ? minScore : 0.8);
}

const P6_MUTATION_CONTRACT = Object.freeze({
  id: "V124-P6-MUTATION-TESTING",
  source: "SÉRIE 15 P6 — mutation testing / test-suite effectiveness (Stryker / PIT / mutmut)",
  complements: "profession-p6-eval-reference + benchmark-factory (adds test-effectiveness, not a replacement)",
  notAuthority: "a pure mutation-score computer over injected mutants + a test oracle; it mutates no real source",
  invariants: Object.freeze([
    "mutationScore = killed / total; a SURVIVING mutant = a test-suite gap (the suite did not catch an injected fault)",
    "fail-closed: no oracle, the original failing its own suite, or ZERO mutants ⇒ invalid (NOT a pass)",
    "a passing test suite proves nothing about bug-catching; the mutation score does — 'passing its own tests ≠ excellent'",
    "complements the P6 eval reference; no new engine",
  ]),
});

module.exports = { runMutationTest, effective, P6_MUTATION_CONTRACT };

if (require.main === module) {
  // demo: original adds; a test oracle checks add(2,3)===5 and add(0,0)===0; mutants: sub, mul, const-5.
  const oracle = (fn: any) => fn(2, 3) === 5 && fn(0, 0) === 0;
  const demo = runMutationTest({ original: (a: number, b: number) => a + b, oracle, mutants: [
    { id: "sub", fn: (a: number, b: number) => a - b }, { id: "mul", fn: (a: number, b: number) => a * b }, { id: "const5", fn: () => 5 },
  ] });
  process.stdout.write(JSON.stringify({ ...P6_MUTATION_CONTRACT, demo }, null, 2) + "\n");
}

export {};
