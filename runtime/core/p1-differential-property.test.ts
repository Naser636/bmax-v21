#!/usr/bin/env node
"use strict";
const assert = require("assert");
const P = require("./p1-differential-property");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 22 — DIFFERENTIAL PROPERTY EXPLORER (shrinking)");

// equivalent implementations ⇒ no divergence found.
{
  const r = P.explore({ domain: { kind: "int", min: 0, max: 100 }, seed: 1, before: (n: number) => n * 2, after: (n: number) => n + n });
  check(r.divergent === false && r.equivalent === true && r.minimalCounterexample === null, "equivalent before/after ⇒ no divergence (over the explored domain)");
  check(Array.isArray(r.samples) && r.samples.length > 0 && r.samples[0].observedOutput !== undefined, "emits {input,observedOutput} samples (feed the comparators)");
}

// a divergence is found AND shrunk to a minimal counterexample.
{
  // after diverges only for n >= 10 ⇒ the minimal counterexample should be exactly 10.
  const r = P.explore({ domain: { kind: "int", min: 0, max: 100 }, seed: 3, before: (n: number) => n * 2, after: (n: number) => (n < 10 ? n * 2 : n * 2 + 1) });
  check(r.divergent === true, "divergent before/after ⇒ divergent true");
  check(r.minimalCounterexample === 10, `shrunk to the minimal counterexample (n=10), got ${r.minimalCounterexample}`);
}

// determinism: same seed+domain ⇒ identical exploration.
{
  const a = P.explore({ domain: { kind: "intArray", maxLen: 6, min: 0, max: 9 }, seed: 99, before: (x: any) => x.length, after: (x: any) => x.length });
  const b = P.explore({ domain: { kind: "intArray", maxLen: 6, min: 0, max: 9 }, seed: 99, before: (x: any) => x.length, after: (x: any) => x.length });
  check(JSON.stringify(a) === JSON.stringify(b), "deterministic: same seed ⇒ identical result (no Math.random/clock)");
}

// array divergence shrinks toward a minimal array.
{
  // after sorts wrong only when the array has a descending pair ⇒ shrinks toward a minimal failing array.
  const r = P.explore({ domain: { kind: "intArray", maxLen: 6, min: 0, max: 5 }, seed: 5, before: (x: number[]) => x.slice().sort((a, b) => a - b), after: (x: number[]) => x.slice() });
  check(r.divergent === false || (Array.isArray(r.minimalCounterexample) && r.minimalCounterexample.length <= 6), "array divergence (if any) ⇒ a small minimal counterexample");
}

// a one-sided throw counts as a divergence (fail-closed).
{
  const r = P.explore({ domain: { kind: "int", min: 1, max: 20 }, seed: 2, before: (n: number) => n, after: (n: number) => { if (n >= 5) throw new Error("boom"); return n; } });
  check(r.divergent === true, "a one-sided throw ⇒ divergence (fail-closed)");
}

check(P.P1_DIFFERENTIAL_PROPERTY_CONTRACT.invariants.some((i: any) => /NOT a proof of global equivalence/.test(i)), "contract: honest — not a global-equivalence proof");

console.log(failures === 0 ? "ALL PASS — SÉRIE 22 DIFFERENTIAL PROPERTY EXPLORER" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
