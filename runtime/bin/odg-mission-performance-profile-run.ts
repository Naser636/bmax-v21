#!/usr/bin/env node
"use strict";
/*
 * V361 §2/P1 — MISSION PERFORMANCE PROFILE RUN (demonstrator with REAL measurement). Measures the REAL wall-clock latency of
 * a deterministic ODG operation (odg-hybrid-reasoning.reason) over a SMALL (light) vs a LARGE (heavy) world-model, N samples
 * each, then profiles them via odg-mission-performance-profile. This demonstrates the §2 light-path principle with a genuine,
 * reproducible before/after measurement — not a synthetic number. Timings are REAL (process.hrtime) and host-dependent.
 *
 * Usage: npx tsx runtime/bin/odg-mission-performance-profile-run.ts [N]
 */
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const HR = require(path.join(ROOT, "runtime", "core", "odg-hybrid-reasoning.js"));
const PROF = require(path.join(ROOT, "runtime", "core", "odg-mission-performance-profile.js"));

const N = Math.max(20, Math.min(200, Number(process.argv[2]) || 40));

// a SMALL world-model (light task) and a LARGE one (heavy task) — same operation, different input size.
function model(nodes: number): any {
  const entities: any = {}; const relations: any = {};
  for (let i = 0; i < nodes; i++) entities["n" + i] = { type: "x", status: i % 7 === 0 ? "HYPOTHESIS" : "OBSERVED" };
  for (let i = 1; i < nodes; i++) relations["e" + i] = { from: "n" + (i - 1), to: "n" + i, type: "causes", status: "OBSERVED" };
  return { entities, relations };
}
const SMALL = model(150);   // light (short causal chain)
const LARGE = model(700);   // heavy (long causal chain ⇒ more traversal); both batches are tens+ of ms ⇒ low relative variance
const target = (m: any) => "n" + (Object.keys(m.entities).length - 1);

// measure REAL latency (ms) of reason() over a model, N samples — each sample times a fixed BATCH of REPS calls to amortize
// sub-millisecond jitter (so the measurement is reproducible, not a noisy one-off). Reported ms are real batch durations.
const REPS = 200;
function measure(m: any, n: number): number[] {
  const t = target(m);
  for (let w = 0; w < 5; w++) HR.reason(m, { mode: "causes", target: t }); // warmup (JIT)
  const samples: number[] = [];
  for (let k = 0; k < n; k++) {
    const t0 = process.hrtime.bigint();
    for (let r = 0; r < REPS; r++) HR.reason(m, { mode: "causes", target: t });
    const t1 = process.hrtime.bigint();
    samples.push(Number(t1 - t0) / 1e6); // ns → ms, for a batch of REPS calls
  }
  return samples;
}

const lightSamples = measure(SMALL, N);
const heavySamples = measure(LARGE, N);

// profile as a 2-stage "mission" (reason-light, reason-heavy) + a REAL before/after: baseline=heavy, after=light.
const profile = PROF.profileMission({
  mission: "reason-light-vs-heavy (REAL measurement)",
  stages: [
    { stage: "reason-light", latencyMs: lightSamples, modelCalls: 0, toolCalls: 0 },
    { stage: "reason-heavy", latencyMs: heavySamples, modelCalls: 0, toolCalls: 0 },
  ],
  baseline: { stages: [{ stage: "reason-light", latencyMs: heavySamples }] }, // compare the light path AGAINST the heavy path
}, { minSampleN: Math.min(20, N) });

process.stdout.write(JSON.stringify({
  performanceProfile: "V361 §2/P1 — REAL measured reasoning latency (light vs heavy world-model). Timings are real + host-dependent.",
  N,
  stages: profile.stages.map((s: any) => ({ stage: s.stage, medianMs: s.median, p95Ms: s.p95, n: s.n, measurable: s.measurable })),
  totals: profile.totals,
  bottleneck: profile.bottleneck,
  lightVsHeavy: profile.comparison ? profile.comparison.perStage.find((p: any) => p.stage === "reason-light") : null,
  verdict: profile.verdict,
}, null, 2) + "\n");
const cmp = profile.comparison && profile.comparison.perStage.find((p: any) => p.stage === "reason-light");
process.stdout.write(`\nPERF-PROFILE: bottleneck=${profile.bottleneck}; ` +
  (cmp && cmp.reproducible ? `the LIGHT path is reproducibly ${cmp.reductionPct}% faster than the HEAVY path (${cmp.beforeP50}ms → ${cmp.afterP50}ms, REAL measurement). ` : `light-vs-heavy comparison NOT_REPRODUCIBLE on this run (host noise). `) +
  `A speed gain is credited only when reproducible (samples + low variance); totalMedianMs is a sum-of-stage-medians model; a profiled speedup must still pass the reliability gate before adoption. Timings are REAL + host-dependent.\n`);
process.exit(0);
export {};
