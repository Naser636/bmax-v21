#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 22 (P1/P6 — world-research gap, transversal) — DIFFERENTIAL PROPERTY EXPLORER with deterministic SHRINKING.
 * PURE, deterministic (seeded LCG — no Math.random, no clock). World reference: property-based testing (fast-check /
 * Hypothesis) whose defining feature vs example tests is SHRINKING a failing input to a MINIMAL counterexample
 * (fast-check reduces a 50-elt array to [1,0]); differential testing runs one input through two implementations and a
 * mismatch localizes the bug (a black-box answer to the oracle problem). Every ODG P1/P6 behaviour module
 * (characterization-baseline, p1-semantic-regression-guard, p6-mutation-testing) operates on a FIXED caller-supplied
 * sample set and can only FLAG an INCOMPLETE/coverage gap — none GENERATES inputs or SHRINKS a divergence. This fills
 * that: it enumerates a bounded input domain deterministically, runs `before` vs `after`, and shrinks any divergence
 * to a minimal counterexample. Its generated {input,observedOutput} samples feed the existing comparators. Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function num(v: any, d = 0): number { return typeof v === "number" && isFinite(v) ? v : d; }

// Deterministic LCG (Numerical Recipes constants) — no Math.random, no clock. Seed drives the whole run.
function lcg(seed: number): () => number { let s = (seed >>> 0) || 1; return () => { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 4294967296; }; }

/** generate(domain, rnd) -> one input value from a bounded domain spec. kinds: int, intArray, string. */
function genValue(domain: any, rnd: () => number): any {
  const d = isObj(domain) ? domain : { kind: "int", min: 0, max: 100 };
  if (d.kind === "int") { const lo = num(d.min, 0), hi = num(d.max, 100); return lo + Math.floor(rnd() * (hi - lo + 1)); }
  if (d.kind === "intArray") { const maxLen = num(d.maxLen, 8), lo = num(d.min, 0), hi = num(d.max, 100); const n = Math.floor(rnd() * (maxLen + 1)); return Array.from({ length: n }, () => lo + Math.floor(rnd() * (hi - lo + 1))); }
  if (d.kind === "string") { const maxLen = num(d.maxLen, 8); const n = Math.floor(rnd() * (maxLen + 1)); const alpha = typeof d.alphabet === "string" && d.alphabet ? d.alphabet : "ab"; return Array.from({ length: n }, () => alpha[Math.floor(rnd() * alpha.length)]).join(""); }
  return 0;
}

// shrink candidates (smaller-first): deterministic, monotone. int→toward 0; array→drop elements / shrink elements; string→drop chars.
function shrinkCandidates(v: any): any[] {
  if (typeof v === "number") { const out: any[] = []; if (v !== 0) { out.push(0); const h = Math.trunc(v / 2); if (h !== 0 && h !== v) out.push(h); if (v > 0) out.push(v - 1); else out.push(v + 1); } return out; }
  if (Array.isArray(v)) { const out: any[] = []; if (v.length > 0) { out.push([]); out.push(v.slice(0, Math.floor(v.length / 2))); out.push(v.slice(1)); out.push(v.slice(0, v.length - 1)); } return out; }
  if (typeof v === "string") { const out: any[] = []; if (v.length > 0) { out.push(""); out.push(v.slice(0, Math.floor(v.length / 2))); out.push(v.slice(1)); } return out; }
  return [];
}

function diverges(before: any, after: any, input: any): boolean {
  try { return JSON.stringify(before(input)) !== JSON.stringify(after(input)); } catch { return true; } // a throw on one side is a divergence
}

/** shrink(input, before, after) -> the minimal still-diverging input (deterministic, bounded steps). */
function shrink(input: any, before: any, after: any): any {
  let current = input; let improved = true; let steps = 0;
  while (improved && steps < 200) {
    improved = false; steps++;
    for (const cand of shrinkCandidates(current)) {
      if (diverges(before, after, cand)) { current = cand; improved = true; break; }
    }
  }
  return current;
}

/** explore({domain, seed, before, after, maxCases}) -> { casesRun, divergent, minimalCounterexample, samples }. */
function explore(input: any): any {
  const o = isObj(input) ? input : {};
  const before = typeof o.before === "function" ? o.before : ((x: any) => x);
  const after = typeof o.after === "function" ? o.after : ((x: any) => x);
  const rnd = lcg(num(o.seed, 42));
  const maxCases = Math.max(1, Math.min(num(o.maxCases, 200), 5000));
  const samples: any[] = []; let firstDivergence: any = undefined; let divergentCount = 0;
  for (let i = 0; i < maxCases; i++) {
    const v = genValue(o.domain, rnd);
    let outBefore: any; let threw = false;
    try { outBefore = before(v); } catch { threw = true; }
    if (!threw) samples.push({ input: v, observedOutput: outBefore });
    if (diverges(before, after, v)) { divergentCount++; if (firstDivergence === undefined) firstDivergence = v; }
  }
  const minimal = firstDivergence === undefined ? null : shrink(firstDivergence, before, after);
  return Object.freeze({
    casesRun: maxCases, divergent: divergentCount > 0, divergentCount,
    minimalCounterexample: minimal,
    equivalent: divergentCount === 0,
    samples: Object.freeze(samples),   // {input, observedOutput} — feed characterization-baseline / p1-semantic-regression-guard
    note: divergentCount > 0 ? "before vs after DIVERGE; minimalCounterexample is the shrunk root-cause input" : "before ≡ after across the explored domain (no divergence found; NOT a proof of global equivalence)",
  });
}

const P1_DIFFERENTIAL_PROPERTY_CONTRACT = Object.freeze({
  id: "V124-P1-DIFFERENTIAL-PROPERTY",
  source: "SÉRIE 22 P1/P6 — differential property testing + deterministic shrinking (fast-check/Hypothesis 2026; differential testing)",
  reuses: Object.freeze(["feeds characterization-baseline + p1-semantic-regression-guard (generated samples) + p6-mutation-testing (input set)"]),
  notAuthority: "a deterministic input generator + shrinker over before/after; it is NOT a global-equivalence proof",
  invariants: Object.freeze([
    "deterministic: a seeded LCG (no Math.random, no clock) ⇒ the same seed+domain yields the same exploration",
    "a divergence (before(x) ≠ after(x), or a one-sided throw) is SHRUNK to a minimal counterexample (monotone, bounded steps)",
    "no divergence found ⇒ equivalent over the explored domain ONLY — explicitly NOT a proof of global equivalence",
    "emits {input,observedOutput} samples that fill the INCOMPLETE/coverage gap the existing P1/P6 modules can only flag; no new engine",
  ]),
});

module.exports = { lcg, genValue, shrink, explore, P1_DIFFERENTIAL_PROPERTY_CONTRACT };

if (require.main === module) {
  const demo = explore({ domain: { kind: "int", min: 0, max: 50 }, seed: 7, before: (n: number) => n * 2, after: (n: number) => (n < 10 ? n * 2 : n + n + 1) });
  process.stdout.write(JSON.stringify({ ...P1_DIFFERENTIAL_PROPERTY_CONTRACT, demo: { divergent: demo.divergent, minimalCounterexample: demo.minimalCounterexample, casesRun: demo.casesRun } }, null, 2) + "\n");
}

export {};
