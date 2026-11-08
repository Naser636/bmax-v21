#!/usr/bin/env node
"use strict";

/*
 * V5-E / ENGINEERING INTELLIGENCE WAVE-2 — PERFORMANCE OBSERVABILITY. PURE, deterministic. Consolidates a gate run's
 * performance into a structured record — duration P50/P95, CPU, memory, worker count, cold-start, suite count — and
 * provides a REPRODUCIBLE before/after comparison: a speed gain is credited ONLY when both sides have enough samples
 * AND low measurement variance (a noisy one-off is NOT a reproducible gain). REUSES gate-instrumentation.statsOf +
 * speedupTarget. Fail-closed: too few samples / high variance ⇒ NOT_REPRODUCIBLE (gain not credited). It reports; it
 * changes no runner and fabricates no number (durations are INPUTS). Dual export.
 */

const INSTR = require("./gate-instrumentation");       // statsOf (P50/P95) + speedupTarget (reduction)

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function num(v: any, d = 0): number { return typeof v === "number" && isFinite(v) && v >= 0 ? v : d; }
function round(n: number): number { return Number(n.toFixed(3)); }

/** recordRun({ durationSamples, cpuSamples, memSamples, workers, coldStartMs, suiteCount }) -> structured perf record. */
function recordRun(input: any): any {
  const o = isObj(input) ? input : {};
  return Object.freeze({
    duration: INSTR.statsOf(o.durationSamples),
    cpu: INSTR.statsOf(o.cpuSamples),
    memory: INSTR.statsOf(o.memSamples),
    workers: num(o.workers, 0) || null,
    coldStartMs: num(o.coldStartMs, 0) || null,
    suiteCount: num(o.suiteCount, 0) || null,
  });
}

/** variance ratio p95/p50 (measurement stability). High ratio ⇒ noisy ⇒ a gain is not reproducible. */
function varianceRatio(stats: any): number | null {
  if (!isObj(stats) || stats.status !== "MEASURED" || !(stats.p50 > 0)) return null;
  return round(stats.p95 / stats.p50);
}

/**
 * compareReproducible({ before, after, minSamples, maxVarianceRatio, targetPct }) ->
 *   { reproducible, reductionPct, beforeP50, afterP50, met75, met80, variance, reasons }.
 * A gain is credited ONLY when both sides have ≥ minSamples AND variance ≤ threshold (reproducible), else NOT_REPRODUCIBLE.
 */
function compareReproducible(input: any): any {
  const o = isObj(input) ? input : {};
  const minSamples = Math.max(2, Math.floor(num(o.minSamples, 3)));
  const maxVar = num(o.maxVarianceRatio, 1.5);
  const targetPct = typeof o.targetPct === "number" ? o.targetPct : 75;
  const bStats = INSTR.statsOf(isObj(o.before) ? o.before.durationSamples : o.before);
  const aStats = INSTR.statsOf(isObj(o.after) ? o.after.durationSamples : o.after);
  const reasons: string[] = [];

  if (bStats.status !== "MEASURED" || aStats.status !== "MEASURED" || bStats.n < minSamples || aStats.n < minSamples) {
    reasons.push(`need ≥ ${minSamples} samples on both sides (before n=${bStats.n || 0}, after n=${aStats.n || 0}) ⇒ NOT_REPRODUCIBLE`);
    return Object.freeze({ reproducible: false, reductionPct: null, beforeP50: bStats.p50, afterP50: aStats.p50, met75: false, met80: false, variance: null, reasons: Object.freeze(reasons) });
  }
  const bVar = varianceRatio(bStats); const aVar = varianceRatio(aStats);
  const stable = bVar !== null && aVar !== null && bVar <= maxVar && aVar <= maxVar;
  const sp = INSTR.speedupTarget(bStats.p50, aStats.p50);
  if (!stable) reasons.push(`measurement variance too high (before p95/p50 ${bVar}, after ${aVar} > ${maxVar}) ⇒ NOT_REPRODUCIBLE (a noisy one-off is not a credited gain)`);
  else reasons.push(`reproducible: ${bStats.n}+${aStats.n} samples, variance within ${maxVar}; reduction ${sp.reductionPct}% (target ${targetPct}%)`);
  return Object.freeze({
    reproducible: stable, reductionPct: stable ? sp.reductionPct : null,
    beforeP50: bStats.p50, afterP50: aStats.p50,
    met75: stable && sp.reductionPct >= 75, met80: stable && sp.reductionPct >= 80,
    variance: Object.freeze({ before: bVar, after: aVar }),
    reasons: Object.freeze(reasons),
  });
}

const PERFORMANCE_OBSERVABILITY_CONTRACT = Object.freeze({
  id: "V5-E-PERFORMANCE-OBSERVABILITY",
  source: "ODG Engineering Intelligence wave-2 — Performance Observability (P50/P95/CPU/memory/workers + reproducible before/after)",
  reuses: Object.freeze(["gate-instrumentation.statsOf (P50/P95)", "gate-instrumentation.speedupTarget (reduction)"]),
  notAuthority: "a performance record + reproducible comparison; it changes no runner and fabricates no number",
  invariants: Object.freeze([
    "records duration P50/P95 + CPU + memory + workers + cold-start + suite count (durations are INPUTS, no clock)",
    "a before/after speed gain is credited ONLY when reproducible: ≥ minSamples on both sides AND variance (p95/p50) ≤ threshold",
    "too few samples or high measurement variance ⇒ NOT_REPRODUCIBLE (a noisy one-off is never a credited gain)",
    "pure/deterministic: samples in → record/comparison out; no clock/random/network; fabricates no number",
  ]),
});

module.exports = { recordRun, varianceRatio, compareReproducible, PERFORMANCE_OBSERVABILITY_CONTRACT };

if (require.main === module) {
  const cmp = compareReproducible({ before: { durationSamples: [187, 190, 188, 186] }, after: { durationSamples: [5.3, 5.1, 5.4, 5.2] } });
  process.stdout.write(JSON.stringify({ ...PERFORMANCE_OBSERVABILITY_CONTRACT, demo: { reproducible: cmp.reproducible, reductionPct: cmp.reductionPct, met75: cmp.met75 } }, null, 2) + "\n");
}

export {};
