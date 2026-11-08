#!/usr/bin/env node
"use strict";
const assert = require("assert");
const P = require("./p6-mutation-testing");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 15 P6 — MUTATION TESTING");

const add = (a: number, b: number) => a + b;

// a STRONG suite kills all mutants ⇒ mutationScore 1.0.
{
  const oracle = (fn: any) => fn(2, 3) === 5 && fn(0, 0) === 0 && fn(-1, 1) === 0;
  const r = P.runMutationTest({ original: add, oracle, mutants: [
    { id: "sub", fn: (a: number, b: number) => a - b }, { id: "mul", fn: (a: number, b: number) => a * b }, { id: "const5", fn: () => 5 },
  ] });
  check(r.valid === true && r.mutationScore === 1 && r.survived === 0, "strong suite kills all mutants ⇒ score 1.0");
}

// a WEAK suite lets a mutant survive ⇒ score < 1, survivor surfaced.
{
  const weak = (fn: any) => fn(2, 3) === 5;   // only checks one case; const5 passes it
  const r = P.runMutationTest({ original: add, oracle: weak, mutants: [
    { id: "sub", fn: (a: number, b: number) => a - b }, { id: "const5", fn: () => 5 },
  ] });
  check(r.valid === true && r.survived >= 1 && r.survivors.includes("const5"), "weak suite ⇒ 'const5' SURVIVES (test gap surfaced)");
  check(r.mutationScore < 1, "surviving mutant ⇒ mutationScore < 1");
}

// fail-closed: no oracle ⇒ invalid.
{
  check(P.runMutationTest({ original: add, mutants: [{ fn: add }] }).valid === false, "no oracle ⇒ invalid");
}

// fail-closed: the original fails its own suite ⇒ invalid (fix the suite first).
{
  const brokenOracle = (fn: any) => fn(2, 3) === 999;  // wrong expectation
  const r = P.runMutationTest({ original: add, oracle: brokenOracle, mutants: [{ id: "x", fn: add }] });
  check(r.valid === false && /ORIGINAL/.test(r.reason), "original fails its own suite ⇒ invalid");
}

// fail-closed: ZERO mutants is NOT a pass.
{
  const r = P.runMutationTest({ original: add, oracle: (fn: any) => fn(1, 1) === 2, mutants: [] });
  check(r.valid === false && /empty mutant set is NOT a pass/.test(r.reason), "zero mutants ⇒ invalid (nothing measured)");
}

// effective() fail-closed on an invalid run or a low score.
{
  const oracle = (fn: any) => fn(2, 3) === 5 && fn(0, 0) === 0 && fn(-1, 1) === 0;
  const strong = P.runMutationTest({ original: add, oracle, mutants: [{ id: "s", fn: (a: number, b: number) => a - b }] });
  check(P.effective(strong, 0.8) === true, "score 1.0 ⇒ effective at 0.8");
  check(P.effective({ valid: false }, 0.8) === false, "an invalid run ⇒ NOT effective (fail-closed)");
}

check(P.P6_MUTATION_CONTRACT.invariants.some((i: any) => /passing its own tests ≠ excellent/.test(i)), "contract documents the doctrine");

console.log(failures === 0 ? "ALL PASS — SÉRIE 15 P6 MUTATION TESTING" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
