#!/usr/bin/env node
"use strict";

/*
 * V5-E / ENGINEERING INTELLIGENCE — E-MEASURE (gate instrumentation). PURE, deterministic. Structures the measured
 * durations of the validation chain (test:report, campaign-controller, tsc, odg verify, build:runtime, per-suite tsx
 * cold-start, waits, bookkeeping) into a P50/P95 decomposition and identifies the bottleneck — the mandatory FIRST
 * step of the ENGINEERING INTELLIGENCE & SELF-OPTIMIZING ENGINEERING program (§3: "measure before optimizing"). The
 * MODULE is pure — durations are INPUTS supplied by a timing harness (the module holds no clock); it fabricates no
 * timing. Fail-closed: a step with no samples ⇒ NOT_MEASURED (never a fabricated P50). It measures/reports; it
 * changes no gate and grants no authority. Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function round(n: number): number { return Number(n.toFixed(3)); }

/** percentile(samples, p) -> the p-th percentile (0..100) by nearest-rank; deterministic. null if empty. */
function percentile(samples: any[], p: number): number | null {
  const xs = arr(samples).filter((x) => typeof x === "number" && isFinite(x) && x >= 0).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const rank = Math.ceil((Math.min(100, Math.max(0, p)) / 100) * xs.length);
  return round(xs[Math.min(xs.length - 1, Math.max(0, rank - 1))]);
}

/** statsOf(samples) -> { n, p50, p95, mean, min, max } or NOT_MEASURED. */
function statsOf(samples: any[]): any {
  const xs = arr(samples).filter((x) => typeof x === "number" && isFinite(x) && x >= 0);
  if (xs.length === 0) return Object.freeze({ n: 0, status: "NOT_MEASURED", p50: null, p95: null, mean: null, min: null, max: null });
  const sum = xs.reduce((a, b) => a + b, 0);
  return Object.freeze({ n: xs.length, status: "MEASURED", p50: percentile(xs, 50), p95: percentile(xs, 95), mean: round(sum / xs.length), min: round(Math.min(...xs)), max: round(Math.max(...xs)) });
}

/**
 * decompose({ steps, weights }) -> { perStep, bottleneck, totalP50, measuredSteps, reasons }.
 *   steps: { stepName: [durationMs|s, ...] }. weights (optional): { stepName: callsPerGate } (default 1) — a step run
 *   N times per gate contributes N × its p50 to the gate total (e.g. a per-suite cost × suiteCount).
 * Fail-closed: a step with no samples ⇒ NOT_MEASURED (excluded from the bottleneck ranking, surfaced in reasons).
 */
function decompose(input: any): any {
  const o = isObj(input) ? input : {};
  const steps = isObj(o.steps) ? o.steps : {};
  const weights = isObj(o.weights) ? o.weights : {};
  const perStep: any = {}; const reasons: string[] = [];
  let totalP50 = 0; let bottleneck: any = null;

  for (const name of Object.keys(steps)) {
    const st = statsOf(steps[name]);
    const w = typeof weights[name] === "number" && weights[name] > 0 ? weights[name] : 1;
    const contribution = st.status === "MEASURED" ? round(st.p50 * w) : null;
    perStep[name] = Object.freeze({ ...st, weight: w, gateContributionP50: contribution });
    if (contribution !== null) { totalP50 += contribution; if (!bottleneck || contribution > bottleneck.gateContributionP50) bottleneck = { step: name, gateContributionP50: contribution, p50: st.p50, weight: w }; }
    else reasons.push(`step '${name}' NOT_MEASURED (no samples) — excluded from bottleneck ranking (fail-closed)`);
  }

  return Object.freeze({
    perStep: Object.freeze(perStep),
    bottleneck: bottleneck ? Object.freeze(bottleneck) : null,
    totalP50: round(totalP50),
    bottleneckShare: bottleneck && totalP50 > 0 ? round(bottleneck.gateContributionP50 / totalP50) : null,
    measuredSteps: Object.keys(perStep).filter((k) => perStep[k].status === "MEASURED").length,
    reasons: Object.freeze(reasons),
    note: bottleneck ? `bottleneck: ${bottleneck.step} (${bottleneck.gateContributionP50} per gate, ${totalP50 > 0 ? Math.round(100 * bottleneck.gateContributionP50 / totalP50) : 0}% of total P50)` : "no measured step",
  });
}

/** speedupTarget(before, after) -> { reductionPct, met75, met80 } — honest before/after comparison. */
function speedupTarget(before: any, after: any): any {
  if (!(typeof before === "number" && before > 0 && typeof after === "number" && after >= 0)) return Object.freeze({ reductionPct: null, met75: false, met80: false, note: "need positive before and non-negative after (fail-closed)" });
  const reductionPct = round(100 * (before - after) / before);
  return Object.freeze({ reductionPct, met75: reductionPct >= 75, met80: reductionPct >= 80, note: `median validation time reduced ${reductionPct}% (target 75%, stretch 80%)` });
}

const GATE_INSTRUMENTATION_CONTRACT = Object.freeze({
  id: "V5-E-GATE-INSTRUMENTATION",
  source: "ODG Engineering Intelligence program — E-MEASURE (measure the validation chain before optimizing, §3/§5)",
  reuses: Object.freeze(["consumes durations from a timing harness around test:report / campaign-controller / tsc / odg verify / build:runtime"]),
  notAuthority: "a measurement/decomposition lens; it changes no gate and grants no authority",
  invariants: Object.freeze([
    "durations are INPUTS supplied by a timing harness; the module holds no clock and fabricates no timing",
    "a step with no samples ⇒ NOT_MEASURED (never a fabricated P50); excluded from the bottleneck ranking (fail-closed)",
    "gate contribution = p50 × calls-per-gate (a per-suite cost × suite count); the bottleneck is the largest contribution",
    "speedupTarget reports an honest before/after reduction % against the 75%/80% targets; a speedup is only credited by measurement",
    "pure/deterministic: samples in → decomposition out; no clock/random/network",
  ]),
});

module.exports = { percentile, statsOf, decompose, speedupTarget, GATE_INSTRUMENTATION_CONTRACT };

if (require.main === module) {
  // the REAL measured baseline (elapsed seconds) captured 2026-11-08: per-suite tsx cold-start × 367 suites dominates.
  const demo = decompose({ steps: { tscNoEmit: [6.40, 6.27, 6.18], campaignController: [1.64, 1.77], odgVerify: [35.77], perSuiteTsx: [1.98], buildRuntime: [1.80] }, weights: { perSuiteTsx: 367 } });
  process.stdout.write(JSON.stringify({ ...GATE_INSTRUMENTATION_CONTRACT, demo: { bottleneck: demo.bottleneck, totalP50: demo.totalP50 } }, null, 2) + "\n");
}

export {};
