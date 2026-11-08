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

function runReferenceProject(opts: any): any {
  const o = isObj(opts) ? opts : {};
  const cpu = serveAndMeasure("cpu-reference", o.requests, o.maxUnits);
  const gpu = serveAndMeasure("gpu-simulated", o.requests, o.maxUnits);
  const degraded = !cpu.honest || !gpu.honest;
  return Object.freeze({
    synthetic: true, profession: "P13", cpu, gpu,
    level: "E2", degraded, note: "SYNTHETIC inference workload (not real model weights/hardware, not E5); cpu-reference metrics are deterministic, gpu metrics are HONESTLY flagged SIMULATED (never measured-hardware); real GPU serving/benchmark (E5) owner-gated NOT_RUN",
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
  ]),
});

module.exports = { serveAndMeasure, runReferenceProject, P13_AIINFRA_REFERENCE_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...P13_AIINFRA_REFERENCE_CONTRACT, demo: runReferenceProject({}) }, null, 2) + "\n"); }

export {};
