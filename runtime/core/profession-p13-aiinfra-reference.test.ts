#!/usr/bin/env node
"use strict";
const assert = require("assert");
const P13 = require("./profession-p13-aiinfra-reference");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V12.4 §43 P13 — AI INFRA/GPU REFERENCE (E2/E3)");

// E2: cpu-reference metrics deterministic (simulated false); gpu metrics honestly flagged simulated.
{
  const r = P13.runReferenceProject({});
  check(r.synthetic === true && r.profession === "P13" && r.cpu.simulated === false && r.cpu.honest === true && r.gpu.simulated === true && r.gpu.honest === true && r.degraded === false, "E2: cpu OBSERVED-deterministic, gpu HONESTLY simulated, not degraded");
}

// honesty gate: gpu-simulated must report simulatedLatency true.
{
  const g = P13.serveAndMeasure("gpu-simulated", [{ input: "abc" }], null);
  check(g.simulated === true && g.honest === true && g.kind === "gpu-simulated", "gpu-simulated latency flagged SIMULATED (never measured hardware)");
}

// E3: a capacity boundary fails closed.
{
  const r = P13.serveAndMeasure("cpu-reference", [{ input: "abcdefghij" }], 2); // 10 units > maxUnits 2
  check(r.failures >= 1, "E3: units over maxUnits ⇒ CAPACITY_EXCEEDED (benchmark failure)");
}

check(P13.P13_AIINFRA_REFERENCE_CONTRACT.invariants.some((i: any) => /E5.*owner-gated NOT_RUN/.test(i)), "honesty: SYNTHETIC only, E5 owner-gated NOT_RUN");

// V254 §2 — tail-latency percentiles + SLO gate (on p95, not mean).
{
  const reqs = [{ input: "a" }, { input: "bb" }, { input: "cccc" }, { input: "dddddddd" }];  // latencies 1,2,4,8
  const prof = P13.latencyProfile("cpu-reference", reqs, 10);
  check(prof.ok === true && prof.p50 === 2 && prof.p95 === 8 && prof.p99 === 8 && prof.max === 8 && prof.min === 1 && prof.samples === 4, "latency: nearest-rank p50=2 p95=8 p99=8 over latencies [1,2,4,8]");
  check(prof.meetsSlo === true && prof.breaches === 0, "latency: SLO 10 ⇒ p95(8)<=10 ⇒ meetsSlo, 0 breaches");
  const slo5 = P13.latencyProfile("cpu-reference", reqs, 5);
  check(slo5.meetsSlo === false && slo5.breaches === 1, "latency SLO gate on the TAIL: SLO 5 ⇒ p95(8)>5 ⇒ meetsSlo false, 1 breach (a good mean would hide this)");
  const gpu = P13.latencyProfile("gpu-simulated", reqs, 100);
  check(gpu.simulated === true && gpu.measuredHardware === false, "latency honesty: gpu profile is SIMULATED, never measured hardware");
  const noslo = P13.latencyProfile("cpu-reference", reqs);
  check(noslo.sloMs === null && noslo.meetsSlo === null, "latency: no SLO supplied ⇒ meetsSlo null (no false pass/fail)");
  check(JSON.stringify(P13.latencyProfile("cpu-reference", reqs, 10)) === JSON.stringify(prof) && Object.isFrozen(prof), "latency deterministic + frozen");
  const integ = P13.runReferenceProject({ requests: reqs, sloMs: 5 });
  check(integ.latency && integ.latency.meetsSlo === false && integ.degraded === true, "integration: a p95 SLO breach ⇒ degraded");
  const base = P13.runReferenceProject({});
  check(base.latency === null && base.degraded === false, "integration: default path unchanged (no latency profile unless sloMs supplied)");
}

console.log(failures === 0 ? "ALL PASS — V12.4 §43 P13 AI INFRA REFERENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
