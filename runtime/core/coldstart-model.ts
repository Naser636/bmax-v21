#!/usr/bin/env node
"use strict";

/*
 * V5-E / ENGINEERING INTELLIGENCE — E-COLDSTART MODEL. PURE, deterministic. Models the validation-gate wall-clock
 * under different runner strategies given MEASURED per-suite costs, and — critically — gates a strategy's ADOPTION on
 * CORRECTNESS PRESERVATION, not speed. Measured 2026-11-08: a per-suite `tsx` process costs ~1.85 s cold-start
 * (node ~0.18 s), ≈95% of each suite's time; 369 × 1.85 s ≈ 683 s serial, ≈187 s across ~8 cores (reconciling the
 * ~727 s cumulative estimate with the real parallel gate). ADVERSARIAL RESULT: the obvious "bundle each suite with
 * esbuild + run on node" shortcut (~0.17 s/suite, ~11×) is REJECTED_UNSAFE — it swallowed a failing assertion (exit 0
 * on `assert.ok(false)`) and broke the dual CJS/ESM export interop. A speed win that masks a failure is forbidden
 * (§4). This module encodes that: a strategy with correctnessPreserved !== true is NEVER adoptable, however fast. It
 * projects/recommends; it changes no runner and grants no authority. Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function num(v: any, d = 0): number { return typeof v === "number" && isFinite(v) && v >= 0 ? v : d; }
function round(n: number): number { return Number(n.toFixed(2)); }

// measured runner strategies (coldStartMs per suite) + whether correctness is preserved (verified adversarially).
const STRATEGIES = Object.freeze({
  TSX_PER_SUITE: { coldStartMs: 1850, correctnessPreserved: true, note: "current: one tsx process per suite; preserves failure propagation + dual-export interop" },
  NODE_BUNDLED: { coldStartMs: 180, correctnessPreserved: false, note: "REJECTED_UNSAFE: esbuild-bundle+node swallowed a failing assertion (exit 0) and broke dual-export interop — masks failures (§4)" },
});

/**
 * projectGate({ suiteCount, coldStartMs, workMs, workers, cores, correctnessPreserved }) ->
 *   { serialMs, parallelMs, effectiveWorkers, perSuiteMs, adoptable, reasons }.
 * A strategy is ADOPTABLE only if correctnessPreserved === true — speed never excuses masking a failure (§4).
 */
function projectGate(input: any): any {
  const o = isObj(input) ? input : {};
  const suiteCount = Math.max(0, Math.floor(num(o.suiteCount, 0)));
  const cores = Math.max(1, Math.floor(num(o.cores, 1)));
  const workers = Math.max(1, Math.floor(num(o.workers, 1)));
  const effectiveWorkers = Math.min(workers, cores);        // never over-subscribe beyond cores
  const perSuiteMs = num(o.coldStartMs, 0) + num(o.workMs, 0);
  const serialMs = round(suiteCount * perSuiteMs);
  const parallelMs = round(Math.ceil(suiteCount / effectiveWorkers) * perSuiteMs);
  const reasons: string[] = [];
  const adoptable = o.correctnessPreserved === true;
  if (!adoptable) reasons.push("strategy does NOT preserve correctness (masks/alters failures) ⇒ NOT adoptable regardless of speed (§4)");
  if (workers > cores) reasons.push(`workers ${workers} > cores ${cores} ⇒ capped at ${cores} (over-subscription does not help)`);
  return Object.freeze({ serialMs, parallelMs, effectiveWorkers, perSuiteMs, adoptable, reasons: Object.freeze(reasons) });
}

/** recommendWorkers(cores) -> optimal worker count (leave one core for the OS; never exceed cores). */
function recommendWorkers(cores: any): number { const c = Math.max(1, Math.floor(num(cores, 1))); return Math.max(1, c - 1); }

/** compareStrategies({ suiteCount, workMs, cores }) -> ranked projections (adoptable first, then faster). */
function compareStrategies(input: any): any {
  const o = isObj(input) ? input : {};
  const workers = recommendWorkers(o.cores);
  const rows = Object.keys(STRATEGIES).map((name) => {
    const s = (STRATEGIES as any)[name];
    const p = projectGate({ suiteCount: o.suiteCount, coldStartMs: s.coldStartMs, workMs: o.workMs, workers, cores: o.cores, correctnessPreserved: s.correctnessPreserved });
    return Object.freeze({ strategy: name, parallelMs: p.parallelMs, adoptable: p.adoptable, note: s.note });
  }).sort((a, b) => (Number(b.adoptable) - Number(a.adoptable)) || (a.parallelMs - b.parallelMs));
  const best = rows.find((r) => r.adoptable) || null;
  return Object.freeze({ recommendedWorkers: workers, ranked: Object.freeze(rows), bestAdoptable: best, note: "the fastest NON-adoptable strategy is NOT chosen — correctness gates adoption (§4)" });
}

const COLDSTART_MODEL_CONTRACT = Object.freeze({
  id: "V5-E-COLDSTART-MODEL",
  source: "ODG Engineering Intelligence — E-COLDSTART (measure/model per-suite startup; correctness-gated adoption)",
  strategies: Object.keys(STRATEGIES),
  reuses: Object.freeze(["consumes gate-instrumentation measurements", "informs odg-test-report worker count + the test-impact selector (validation-selector)"]),
  notAuthority: "a projection/recommendation model; it changes no runner and adopts nothing by itself",
  invariants: Object.freeze([
    "a runner strategy is ADOPTABLE only if it PRESERVES correctness (failure propagation + output) — speed never excuses masking a failure (§4)",
    "the esbuild-bundle+node strategy is REJECTED_UNSAFE: it swallowed a failing assertion (exit 0) and broke dual-export interop",
    "worker count never exceeds cores (over-subscription does not help); recommendation leaves one core for the OS",
    "measured: tsx ~1.85s cold-start/suite ≈95% of per-suite cost; reconciles ~683s serial with ~187s parallel gate",
    "pure/deterministic: measured costs in → projection out; no clock/random/network; adopts nothing",
  ]),
});

module.exports = { STRATEGIES, projectGate, recommendWorkers, compareStrategies, COLDSTART_MODEL_CONTRACT };

if (require.main === module) {
  const cmp = compareStrategies({ suiteCount: 369, workMs: 80, cores: 8 });
  process.stdout.write(JSON.stringify({ ...COLDSTART_MODEL_CONTRACT, demo: { recommendedWorkers: cmp.recommendedWorkers, bestAdoptable: cmp.bestAdoptable } }, null, 2) + "\n");
}

export {};
