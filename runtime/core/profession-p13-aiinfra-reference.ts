#!/usr/bin/env node
"use strict";

/*
 * V12.4 §43 P13 — AI Infrastructure / GPU-serving reference project (E2 + E3). PURE, deterministic. It REUSES
 * inference-engine (defineProvider + infer + benchmark) with NO second engine, and DEMONSTRATES: a cpu-reference
 * provider yields OBSERVED-deterministic metrics (simulatedLatency=false); a gpu-simulated provider's latency/cost
 * are HONESTLY flagged SIMULATED (never presented as measured hardware — the core P13 honesty gate); a capacity
 * boundary fails closed (CAPACITY_EXCEEDED). Real GPU hardware serving/benchmark (E5) is owner-gated NOT_RUN.
 * Dual export.
 */

const IE = require("./inference-engine");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/** serveAndMeasure(kind, requests, maxUnits) -> { bench, simulated, honest }. simulated must match the provider kind. */
function serveAndMeasure(kind: any, requests: any, maxUnits: any): any {
  const k = kind === "gpu-simulated" ? "gpu-simulated" : "cpu-reference";
  const provider = IE.defineProvider({ name: "p13-" + k, kind: k, fn: (x: any) => String(x).length, maxUnits: typeof maxUnits === "number" ? maxUnits : null });
  const reqs = Array.isArray(requests) ? requests : [{ input: "ab" }, { input: "abcd" }];
  const bench = IE.benchmark(provider, reqs);
  const one = IE.infer(provider, reqs[0]);
  const simulated = one.ok ? one.metrics.simulatedLatency : null;
  // honesty: a gpu-simulated provider MUST report simulatedLatency true; a cpu-reference MUST report false.
  const honest = (k === "gpu-simulated" && simulated === true) || (k === "cpu-reference" && simulated === false);
  return Object.freeze({ kind: k, bench, simulated, honest, failures: bench.failures });
}

// V254/V255 §2 — serveAndMeasure gave an AGGREGATE latency, but the capability that matters for AI serving is TAIL latency:
// p50/p95/p99 percentiles vs an SLO (a good mean hides a bad p99). latencyProfile collects per-request estLatencyMs (reusing
// inference-engine.infer — no second engine), computes nearest-rank percentiles, and gates on the SLO. The gpu-simulated
// honesty flag is preserved: a SIMULATED profile is NEVER presented as measured hardware. Deterministic; fail-closed.
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sorted.length);               // nearest-rank method
  const idx = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[idx];
}
/** latencyProfile(kind, requests, sloMs) -> { p50, p95, p99, max, sloMs, breaches, meetsSlo, simulated }. */
function latencyProfile(kind: any, requests: any, sloMs: any): any {
  const k = kind === "gpu-simulated" ? "gpu-simulated" : "cpu-reference";
  const provider = IE.defineProvider({ name: "p13lat-" + k, kind: k, fn: (x: any) => String(x).length });
  const reqs = Array.isArray(requests) && requests.length ? requests : [{ input: "a" }, { input: "bb" }, { input: "cccc" }, { input: "dddddddd" }];
  const lat: number[] = []; let simulated: any = null; let failures = 0;
  for (const r of reqs) { const one = IE.infer(provider, r); if (one.ok) { lat.push(typeof one.metrics.estLatencyMs === "number" ? one.metrics.estLatencyMs : 0); if (simulated === null) simulated = one.metrics.simulatedLatency; } else failures++; }
  if (lat.length === 0) return Object.freeze({ ok: false, code: "NO_SAMPLES", detail: "no successful inferences to profile (fail-closed)", failures });
  const sorted = lat.slice().sort((a, b) => a - b);
  const slo = typeof sloMs === "number" && sloMs > 0 ? sloMs : null;
  const breaches = slo !== null ? lat.filter((x) => x > slo).length : 0;
  const p95 = percentile(sorted, 95);
  return Object.freeze({
    ok: true, kind: k, samples: lat.length, failures,
    p50: percentile(sorted, 50), p95, p99: percentile(sorted, 99), max: sorted[sorted.length - 1], min: sorted[0],
    sloMs: slo, breaches, meetsSlo: slo === null ? null : p95 <= slo,   // SLO gate on the p95 tail, not the mean
    simulated, measuredHardware: false,
    note: "per-request tail latency (nearest-rank p50/p95/p99) vs SLO (gated on p95, not mean); gpu-simulated latencies are SIMULATED, never measured hardware (P13 honesty gate). SYNTHETIC; real GPU benchmark (E5) owner-gated NOT_RUN.",
  });
}

function runReferenceProject(opts: any): any {
  const o = isObj(opts) ? opts : {};
  const cpu = serveAndMeasure("cpu-reference", o.requests, o.maxUnits);
  const gpu = serveAndMeasure("gpu-simulated", o.requests, o.maxUnits);
  // V254/V255 opt-in tail-latency SLO profile (default path unchanged).
  const latency = typeof o.sloMs === "number" ? latencyProfile("cpu-reference", o.requests, o.sloMs) : null;
  const degraded = !cpu.honest || !gpu.honest || (latency && latency.ok === true && latency.meetsSlo === false);
  return Object.freeze({
    synthetic: true, profession: "P13", cpu, gpu, latency,
    level: "E2", degraded: !!degraded, note: "SYNTHETIC inference workload (not real model weights/hardware, not E5); cpu-reference metrics are deterministic, gpu metrics are HONESTLY flagged SIMULATED (never measured-hardware); real GPU serving/benchmark (E5) owner-gated NOT_RUN",
  });
}

const P13_AIINFRA_REFERENCE_CONTRACT = Object.freeze({
  id: "V124-P13-AIINFRA-REFERENCE",
  source: "V12.4 §43 P13 (AI Infra/GPU) — E2 reference + E3 (capacity boundary / simulated-vs-measured honesty)",
  levels: Object.freeze(["E0", "E1", "E2", "E3", "E4(owner/independent)", "E5(owner-gated NOT_RUN)"]),
  reuses: Object.freeze(["inference-engine.defineProvider + infer + benchmark"]),
  notAuthority: "a runnable inference-serving reference; no real model/hardware, no E5 claim",
  invariants: Object.freeze([
    "gpu-simulated latency/cost are flagged SIMULATED (never presented as measured hardware) — the P13 honesty gate",
    "a capacity boundary fails closed (CAPACITY_EXCEEDED), surfaced as a benchmark failure",
    "SYNTHETIC workload only; real GPU serving/benchmark (E5) owner-gated NOT_RUN (no inflated level)",
    "reuses inference-engine; no second inference/benchmark engine",
    "V254 tail-latency: latencyProfile computes nearest-rank p50/p95/p99 and gates the SLO on p95 (not mean); a SIMULATED profile is never measured hardware; no samples ⇒ fail-closed",
  ]),
});

module.exports = { serveAndMeasure, latencyProfile, runReferenceProject, P13_AIINFRA_REFERENCE_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...P13_AIINFRA_REFERENCE_CONTRACT, demo: runReferenceProject({}) }, null, 2) + "\n"); }

export {};
