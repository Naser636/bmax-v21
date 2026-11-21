#!/usr/bin/env node
"use strict";
/*
 * V360 §14 C3 / §8 — MODEL INTELLIGENCE RUN (demonstrator). Answers "which model/route, and did it MEASURABLY win?" for a
 * couple of SYNTHETIC mission scenarios: calibrated route selection (odg-execution-routing) + reproducible before/after
 * latency (performance-observability). READ-ONLY, deterministic, recommends only. The history + latency samples are
 * SYNTHETIC (clearly labelled) — a mechanism demonstration, not real model benchmarks.
 *
 * Usage: npx tsx runtime/bin/odg-model-intelligence-run.ts
 */
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const MI = require(path.join(ROOT, "runtime", "core", "odg-model-intelligence.js"));

const hist = (n: number, s: number, type: string) => Array.from({ length: n }, (_, k) => ({ missionType: type, verified: k < s }));
const lat = (n: number, base: number) => Array.from({ length: n }, (_, k) => base + (k % 4 === 0 ? 2 : 0)); // low variance

// SYNTHETIC scenarios (NOT real model benchmarks).
const scenarios = [
  { label: "native-local, strong track record + reproducibly faster", missionType: "codegen", history: hist(40, 32, "codegen"), selected: { route: "native-local", latencyMs: lat(24, 48) }, baseline: { route: "provider", latencyMs: lat(24, 100) } },
  { label: "native-local calibrated-low ⇒ escalate; faster but route deprioritised", missionType: "proof", history: hist(40, 8, "proof"), selected: { route: "native-local", latencyMs: lat(24, 40) }, baseline: { route: "provider", latencyMs: lat(24, 100) } },
  { label: "thin history ⇒ probe (no confident pick)", missionType: "novel", history: hist(3, 2, "novel"), selected: { route: "native-local", latencyMs: lat(24, 40) }, baseline: { route: "provider", latencyMs: lat(24, 100) } },
  { label: "noisy one-off ⇒ not a credited win", missionType: "codegen", history: hist(40, 32, "codegen"), selected: { route: "native-local", latencyMs: [10, 10, 10, 10, 900, 10, 10, 10] }, baseline: { route: "provider", latencyMs: lat(24, 100) } },
];

const results = scenarios.map((s) => {
  const r = MI.assessModelIntelligence(s, { minSampleN: 20 });
  return { scenario: s.label, missionType: s.missionType, tier: r.selection.tier, calibrated: r.selection.calibrated, measuredPerformance: r.measuredPerformance, verdict: r.verdict, reductionPct: r.comparison ? r.comparison.reductionPct : null, recommendation: r.recommendation };
});

process.stdout.write(JSON.stringify({
  modelIntelligence: "V360 §14 C3 / §8 — which model/route, and did it MEASURABLY win? SYNTHETIC demonstration — not real benchmarks.",
  results,
}, null, 2) + "\n");
const wins = results.filter((r) => r.verdict === "MEASURED_WIN").length;
process.stdout.write(`\nMODEL-INTELLIGENCE: ${results.length} scenarios; ${wins} MEASURED_WIN (calibrated selection AND reproducible gain). ` +
  `WHICH route = calibrated P(success) over real outcomes (NOT popularity); a WIN requires a REPRODUCIBLE before/after gain (enough samples + low variance) — a noisy one-off / thin / no-baseline is NOT_MEASURED, never credited; a reproducible regression is surfaced, not hidden. Recommends only (applies nothing). SYNTHETIC demonstration.\n`);
process.exit(0);
export {};
