#!/usr/bin/env node
"use strict";

/*
 * WI-META-07 — meta-intelligence detectors. Locks each verdict tier (NO_DATA/NONE/SUSPECTED/DETECTED) for
 * benchmark-contamination, evaluator-capture and metric-gaming, the "suspicion is never DETECTED without hard
 * evidence" discipline, the aggregate posture, and determinism. Synthetic reproducible inputs; pure (no I/O).
 * Run: node_modules/.bin/tsx runtime/core/meta-intelligence.test.ts
 */
const assert = require("assert");
const M = require("./meta-intelligence");

let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }

console.log("WI-META-07 — META-INTELLIGENCE");

// benchmark-contamination
check(M.detectBenchmarkContamination({ benchmarkDigests: ["h1", "h2", "h3"], seenDigests: ["x", "h2"] }).verdict === "DETECTED", "contamination: exact digest overlap ⇒ DETECTED (hard)");
check(M.detectBenchmarkContamination({ benchmarkDigests: ["h1", "h2"], seenDigests: ["x", "y"] }).verdict === "NONE", "contamination: no overlap ⇒ NONE");
check(M.detectBenchmarkContamination({ benchmarkDigests: [], seenDigests: ["x"] }).verdict === "NO_DATA", "contamination: missing benchmark ⇒ NO_DATA");
{
  const f = M.detectBenchmarkContamination({ benchmarkDigests: ["h1", "h2", "h3", "h4"], seenDigests: ["h2", "h4"] });
  check(f.evidence.length === 2 && f.signals.find((s: any) => s.name === "leakedItems").value === 2, "contamination: evidence lists the leaked digests + signal count");
}

// evaluator-capture
check(M.detectEvaluatorCapture({ evaluator: { provenance: "P1" }, subject: { provenance: "P1" } }).verdict === "DETECTED", "capture: shared provenance ⇒ DETECTED");
check(M.detectEvaluatorCapture({ evaluator: { id: "A" }, subject: { id: "A" } }).verdict === "DETECTED", "capture: identical id ⇒ DETECTED");
check(M.detectEvaluatorCapture({ evaluator: { provenance: "P1", model: "m5" }, subject: { provenance: "P2", model: "m5" } }).verdict === "SUSPECTED", "capture: same model family ⇒ SUSPECTED (not conclusive)");
check(M.detectEvaluatorCapture({ evaluator: { provenance: "P1", model: "m5" }, subject: { provenance: "P2", model: "m6" } }).verdict === "NONE", "capture: distinct provenance + model ⇒ NONE");
check(M.detectEvaluatorCapture({ evaluator: {}, subject: { provenance: "P2" } }).verdict === "NO_DATA", "capture: missing evaluator identity ⇒ NO_DATA");

// metric-gaming
check(M.detectMetricGaming({ metric: { before: 0.6, after: 0.9 }, independentCheck: { before: 0.6, after: 0.6 } }).verdict === "SUSPECTED", "gaming: metric up / independent flat ⇒ SUSPECTED (Goodhart)");
check(M.detectMetricGaming({ metric: { before: 0.6, after: 0.9 }, scope: { total: 10, retestedImproved: 9 } }).verdict === "SUSPECTED", "gaming: gain concentrated on re-tested items ⇒ SUSPECTED");
check(M.detectMetricGaming({ metric: { before: 0.6, after: 0.9 }, independentCheck: { before: 0.6, after: 0.85 } }).verdict === "NONE", "gaming: metric + independent both improve ⇒ NONE");
check(M.detectMetricGaming({ metric: { before: 0.9, after: 0.6 } }).verdict === "NONE", "gaming: no improvement ⇒ NONE");
check(M.detectMetricGaming({ metric: {} }).verdict === "NO_DATA", "gaming: missing before/after ⇒ NO_DATA");
check(M.detectMetricGaming({ metric: { before: 0.6, after: 0.9 }, manipulationMarker: true }).verdict === "DETECTED", "gaming: explicit hard marker ⇒ DETECTED");
// DISCIPLINE: a heuristic signal NEVER becomes DETECTED without a hard marker.
check(M.detectMetricGaming({ metric: { before: 0.6, after: 0.99 }, independentCheck: { before: 0.6, after: 0.5 } }).verdict === "SUSPECTED", "gaming: even a strong heuristic divergence stays SUSPECTED (never a certain accusation)");

// aggregate posture
{
  const a = M.assessIntegrity({ contamination: { benchmarkDigests: ["h1"], seenDigests: ["h1"] }, evaluator: { evaluator: { provenance: "P2" }, subject: { provenance: "P3" } }, gaming: { metric: { before: 1, after: 2 }, independentCheck: { before: 1, after: 2 } } });
  check(a.overall === "DETECTED" && a.findings.length === 3, "assessIntegrity: worst-of ⇒ DETECTED (contamination) with 3 findings");
  const b = M.assessIntegrity({});
  check(b.overall === "NO_DATA", "assessIntegrity: empty bundle ⇒ NO_DATA");
}

// determinism
check(JSON.stringify(M.detectBenchmarkContamination({ benchmarkDigests: ["a", "b"], seenDigests: ["b"] })) === JSON.stringify(M.detectBenchmarkContamination({ benchmarkDigests: ["a", "b"], seenDigests: ["b"] })), "deterministic: identical inputs ⇒ identical finding");

console.log(failures === 0 ? "ALL PASS — WI-META-07 META-INTELLIGENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

// Module-scope marker (TS2451/TS2588 guard; matches world-model/causal-graph test discipline).
export {};
