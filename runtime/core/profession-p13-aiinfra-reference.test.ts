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

console.log(failures === 0 ? "ALL PASS — V12.4 §43 P13 AI INFRA REFERENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
