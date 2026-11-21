#!/usr/bin/env node
"use strict";
/*
 * V361 §2/P1 — MISSION PERFORMANCE PROFILE. PURE, deterministic, fail-closed, READ-ONLY. The missing chain-level performance
 * qualification: given per-STAGE latency samples (+ model/tool call counts) for a mission, it produces a reproducible profile
 * — per-stage p50/p95 (latency-measure), total resolution time, model/tool call totals, the BOTTLENECK stage (the optimization
 * target), and a reproducible before/after comparison vs a baseline (performance-observability). It is NOT a second measurer:
 * it COMPOSES latency-measure.summarizeSamples + performance-observability.compareReproducible + gate-instrumentation.
 *
 * HONESTY (§2.H/§2.I): a stage with too few samples is NOT_MEASURED (never generalized); a speedup is credited ONLY when
 * reproducible (enough samples + low variance — a noisy one-off is not a gain); a reproducible regression is surfaced, not
 * hidden. totalMedianMs is an explicit SUM-OF-STAGE-MEDIANS model (not a single wall-clock), stated as such. This measures
 * COST only — it never asserts a speed win overrides reliability (that gate is odg-model-intelligence's job; a profiled
 * speedup must still pass the reliability check before adoption).
 */

const LAT = require("./latency-measure.js");               // per-stage latency summary (median/p95, thin ⇒ INSUFFICIENT)
const PERF = require("./performance-observability.js");     // reproducible before/after (samples + low variance)

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function nint(v: any): number { return Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0; }

/**
 * profileMission(input, opts?) -> frozen profile. input: {
 *   mission?, stages: [{ stage, latencyMs: number[], modelCalls?, toolCalls? }], baseline?: { stages:[{ stage, latencyMs:[] }] } }.
 *   opts: { minSampleN? (latency-measure floor, default 20), minSamples? (compareReproducible floor, default 3), maxVarianceRatio? }.
 * Per-stage latency + call totals + bottleneck; with a baseline, a reproducible per-stage before/after.
 */
function profileMission(input: any, opts: any = {}): any {
  const i = isObj(input) ? input : {};
  const o = isObj(opts) ? opts : {};
  const minSampleN = Math.max(1, Math.floor(o.minSampleN || 20));
  const stagesIn = arr(i.stages).filter(isObj);

  const stages = stagesIn.map((s: any) => {
    const summ = LAT.summarizeSamples(arr(s.latencyMs), minSampleN);
    return freeze({ stage: typeof s.stage === "string" ? s.stage : null, measurable: summ.measurable === true, median: summ.measurable ? summ.medianMs : null, p95: summ.measurable ? summ.p95Ms : null, n: summ.n || 0, modelCalls: nint(s.modelCalls), toolCalls: nint(s.toolCalls) });
  });

  const measured = stages.filter((s: any) => s.measurable);
  const totalMedianMs = measured.length ? +measured.reduce((a: number, s: any) => a + s.median, 0).toFixed(2) : null;
  const totalP95Ms = measured.length ? +measured.reduce((a: number, s: any) => a + s.p95, 0).toFixed(2) : null;
  const modelCalls = stages.reduce((a: number, s: any) => a + s.modelCalls, 0);
  const toolCalls = stages.reduce((a: number, s: any) => a + s.toolCalls, 0);
  // bottleneck = the measurable stage with the largest median (the optimization target).
  const bottleneck = measured.length ? measured.reduce((b: any, s: any) => (s.median > b.median ? s : b)).stage : null;

  // reproducible before/after vs a baseline, per stage (a gain credited ONLY when reproducible).
  let comparison: any = null; let verdict: string;
  const baseStages = isObj(i.baseline) ? arr(i.baseline.stages).filter(isObj) : [];
  if (baseStages.length) {
    const baseBy: Record<string, any> = {};
    for (const b of baseStages) if (typeof b.stage === "string") baseBy[b.stage] = arr(b.latencyMs);
    // only compare stages that are themselves MEASURABLE (same minSampleN floor as the top-line verdict), so a credited
    // improvement is never reported for a stage the profile calls NOT_MEASURED (keep verdict and comparison consistent).
    const measurableNames = new Set(measured.map((s: any) => s.stage));
    const perStage: any[] = [];
    for (const s of stagesIn) {
      const name = typeof s.stage === "string" ? s.stage : null;
      if (!name || !baseBy[name] || !measurableNames.has(name)) continue;
      const cmp = PERF.compareReproducible({ before: baseBy[name], after: arr(s.latencyMs), minSamples: o.minSamples, maxVarianceRatio: o.maxVarianceRatio });
      perStage.push(freeze({ stage: name, reproducible: cmp.reproducible === true, reductionPct: cmp.reproducible ? cmp.reductionPct : null, beforeP50: cmp.beforeP50, afterP50: cmp.afterP50 }));
    }
    const improved = perStage.filter((p) => p.reproducible && typeof p.reductionPct === "number" && p.reductionPct > 0).length;
    const regressed = perStage.filter((p) => p.reproducible && typeof p.reductionPct === "number" && p.reductionPct < 0).length;
    comparison = freeze({ perStage: freeze(perStage), improvedStages: improved, regressedStages: regressed });
    verdict = measured.length === 0 ? "NOT_MEASURED" : regressed > 0 ? "REGRESSED" : improved > 0 ? "IMPROVED" : "NO_REPRODUCIBLE_CHANGE";
  } else {
    verdict = measured.length === 0 ? "NOT_MEASURED" : "PROFILED";
  }

  return freeze({
    mission: typeof i.mission === "string" ? i.mission : null,
    stages: freeze(stages),
    totals: freeze({ totalMedianMs, totalP95Ms, modelCalls, toolCalls, measuredStages: measured.length, totalStages: stages.length }),
    bottleneck, comparison, verdict,
    note: "chain-level performance profile: per-stage p50/p95 (latency-measure, thin ⇒ NOT_MEASURED) + call totals + bottleneck; a before/after gain is credited ONLY when reproducible (performance-observability: samples + low variance), a regression is surfaced. totalMedianMs / totalP95Ms are SUM-OF-STAGE models, not a single wall-clock (p95-sum is an even looser proxy). Cost-only: a profiled speedup must still pass the reliability gate (odg-model-intelligence) before adoption — speed never overrides reliability.",
  });
}

const MISSION_PERFORMANCE_PROFILE_CONTRACT = Object.freeze({
  id: "V361-MISSION-PERFORMANCE-PROFILE",
  purpose: "§2/P1 — reproducible chain-level performance qualification: per-stage latency + total + call counts + bottleneck + reproducible before/after; composes latency-measure + performance-observability; no second measurer",
  reuses: Object.freeze([
    "latency-measure.summarizeSamples (per-stage p50/p95; thin sample ⇒ INSUFFICIENT_EVIDENCE)",
    "performance-observability.compareReproducible (a before/after gain credited ONLY when reproducible — samples + low variance)",
  ]),
  invariants: Object.freeze([
    "a stage with too few samples is NOT_MEASURED (never generalized); the bottleneck is the measurable stage with the largest median",
    "a before/after speedup is credited ONLY when reproducible (enough samples AND low variance); a reproducible regression is surfaced (REGRESSED), not hidden",
    "totalMedianMs is an explicit SUM-OF-STAGE-MEDIANS model, NOT a single wall-clock; no performance claim without a reproducible measurement",
    "cost-only: a profiled speedup must still pass the reliability gate (odg-model-intelligence) before adoption — speed never overrides reliability; PURE/deterministic/frozen; no second measurer",
  ]),
});

module.exports = { profileMission, MISSION_PERFORMANCE_PROFILE_CONTRACT };
export {};
