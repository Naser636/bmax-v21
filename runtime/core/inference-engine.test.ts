#!/usr/bin/env node
"use strict";

/*
 * WI-P13-17 — inference-engine. Locks: provider definition, request validation, real CPU inference + metrics,
 * capacity bound (simulated timeout), provider error handling, reproducible benchmark, provider comparison,
 * honest availability (no physical GPU), determinism. Pure. Run: node_modules/.bin/tsx runtime/core/inference-engine.test.ts
 */
const assert = require("assert");
const E = require("./inference-engine");

let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }

console.log("WI-P13-17 — INFERENCE ENGINE");

const cpu = E.defineProvider({ name: "cpu1", kind: "cpu-reference", fn: (x: any) => String(x).toUpperCase(), latencyPerUnit: 1, costPerUnit: 0.001 });
const gpu = E.defineProvider({ name: "gpuSim", kind: "gpu-simulated", fn: (x: any) => String(x).toUpperCase(), latencyPerUnit: 0.2, costPerUnit: 0.002, maxUnits: 100 });

// real CPU inference + metrics
{
  const r = E.infer(cpu, { input: "abcd" });
  check(r.ok && r.output === "ABCD" && r.metrics.units === 4 && r.metrics.estLatencyMs === 4 && r.metrics.simulatedLatency === false, "CPU inference ⇒ real output + metrics (not simulated latency)");
}
// gpu-simulated flagged
check(E.infer(gpu, { input: "abcd" }).metrics.simulatedLatency === true, "gpu-simulated ⇒ simulatedLatency true (explicit)");

// request validation
check(E.infer(cpu, {}).code === "INVALID_REQUEST", "missing input ⇒ INVALID_REQUEST");
check(E.infer(null, { input: "x" }).code === "NO_PROVIDER", "no provider ⇒ NO_PROVIDER");

// capacity bound (simulated timeout boundary)
check(E.infer(gpu, { input: "x".repeat(101) }).code === "CAPACITY_EXCEEDED", "units > maxUnits ⇒ CAPACITY_EXCEEDED");

// provider error handling
const broken = E.defineProvider({ name: "bad", kind: "cpu-reference", fn: () => { throw new Error("boom"); } });
check(E.infer(broken, { input: "x" }).code === "PROVIDER_ERROR", "fn throws ⇒ PROVIDER_ERROR (fail-closed)");

// defineProvider guards
check((() => { try { E.defineProvider({ name: "n", kind: "gpu-real", fn: () => 1 }); return false; } catch { return true; } })(), "gpu-real kind ⇒ throws (not a valid provider kind; no physical GPU)");

// reproducible benchmark
{
  const reqs = [{ input: "ab" }, { input: "abcd" }, { input: "x".repeat(200) }]; // last exceeds gpu maxUnits
  const bCpu = E.benchmark(cpu, reqs);
  check(bCpu.count === 3 && bCpu.totalUnits === 206 && bCpu.failures === 0, "CPU benchmark: 3 ok, totalUnits 206");
  const bGpu = E.benchmark(gpu, reqs);
  check(bGpu.count === 2 && bGpu.failures === 1, "GPU-sim benchmark: 1 failure (capacity) — honest");
  check(JSON.stringify(E.benchmark(cpu, reqs)) === JSON.stringify(E.benchmark(cpu, reqs)), "benchmark reproducible");
}

// compareProviders (sorted by estLatencyMs)
{
  const reqs = [{ input: "abcdefghij" }];
  const cmp = E.compareProviders([cpu, gpu], reqs);
  check(cmp[0].provider === "gpuSim" && cmp[0].estLatencyMs < cmp[1].estLatencyMs, "compareProviders: gpu-sim lower (simulated) latency ranks first");
}

// honest availability
check(E.availability()["cpu-reference"] === "OPERATIONAL" && E.availability()["gpu-real"].startsWith("UNAVAILABLE"), "availability: CPU OPERATIONAL, gpu-real UNAVAILABLE (no physical GPU claimed)");

console.log(failures === 0 ? "ALL PASS — WI-P13-17 INFERENCE ENGINE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

// Module-scope marker (TS2451/TS2588 guard).
export {};
