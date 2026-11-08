#!/usr/bin/env node
"use strict";

/*
 * WI-INT-24 — P13→P9→P6. Locks: benchmarks per provider, cost ranking (cheapest first), budget alert, quality
 * verdict, honest availability (gpu-real UNAVAILABLE), invalid provider kind rejected, determinism. Pure.
 * Run: node_modules/.bin/tsx runtime/core/integration-inference-cost.test.ts
 */
const assert = require("assert");
const I = require("./integration-inference-cost");

let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }

console.log("WI-INT-24 — INTEGRATION P13 → P9 → P6");
const requests = [{ input: "abcd" }, { input: "abcdef" }]; // 4 + 6 = 10 units

// two providers: cpu (cost 0.001/u) vs gpu-sim (cost 0.002/u) ⇒ cpu cheaper cost
{
  const r = I.runInferenceCost({ providers: [{ name: "cpu1", kind: "cpu-reference" }, { name: "gpuSim", kind: "gpu-simulated" }], requests });
  check(r.p13.benchmarks.length === 2 && r.p13.benchmarks.every((b: any) => b.count === 2 && b.failures === 0), "both providers benchmarked (2 requests each, 0 failures)");
  check(r.p9.ranking[0].name === "cpu1" && r.p9.ranking[0].cost < r.p9.ranking[1].cost, "P9 ranking: cheapest cost (cpu) first");
  check(r.verdict === "PASS", "clean benchmark ⇒ quality PASS");
  check(r.availability["gpu-real"].indexOf("UNAVAILABLE") === 0, "honest availability: gpu-real UNAVAILABLE (no physical GPU)");
}
// budget alert
{
  const r = I.runInferenceCost({ providers: [{ name: "cpu1", kind: "cpu-reference" }], requests, budgets: { cpu1: 0 } });
  check(r.p9.alerts.length === 1 && r.p9.alerts[0].id === "cpu1", "budget 0 ⇒ alert for cpu1");
}
// invalid provider kind (gpu-real) ⇒ define fails ⇒ quality not PASS
check(I.runInferenceCost({ providers: [{ name: "bad", kind: "gpu-real" }], requests }).verdict !== "PASS", "invalid provider kind (gpu-real) ⇒ define fails ⇒ not PASS");
// capacity failure ⇒ bench failure ⇒ not PASS
check(I.runInferenceCost({ providers: [{ name: "small", kind: "gpu-simulated", maxUnits: 1 }], requests }).verdict !== "PASS", "capacity-exceeded ⇒ bench failure ⇒ not PASS");

// determinism
check(JSON.stringify(I.runInferenceCost({ providers: [{ name: "cpu1", kind: "cpu-reference" }], requests })) === JSON.stringify(I.runInferenceCost({ providers: [{ name: "cpu1", kind: "cpu-reference" }], requests })), "deterministic cost/perf report");

console.log(failures === 0 ? "ALL PASS — WI-INT-24 P13→P9→P6" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

// Module-scope marker (TS2451/TS2588 guard).
export {};
