#!/usr/bin/env node
"use strict";
const assert = require("assert");
const Q = require("./quantization-honesty-gate");
const ENGINE = require("./inference-engine");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 22 — QUANTIZATION HONESTY GATE");

const fp16 = ENGINE.defineProvider({ name: "fp16", kind: "cpu-reference", fn: (x: any) => x, latencyPerUnit: 10, costPerUnit: 0.001 });
const int8 = ENGINE.defineProvider({ name: "int8", kind: "gpu-simulated", fn: (x: any) => x, latencyPerUnit: 4, costPerUnit: 0.0004 });
const reqs = [{ input: "hello" }, { input: "world!!" }];
// clean rollouts: baseline all pass; int8 drops a little.
const baseR = { t1: [true, true], t2: [true, true], t3: [true, true] };

// ACCEPT: real speedup + accuracy drop within declared tolerance.
{
  const r = Q.assess({ baseline: { provider: fp16 }, quantized: { provider: int8 }, requests: reqs,
    baselineRollouts: baseR, quantizedRollouts: { t1: [true, true], t2: [true, true], t3: [true, true] }, maxAccuracyDrop: 0.05, maxReliabilityDrop: 0.05 });
  check(r.decision === "ACCEPT", `real win + 0 accuracy drop ⇒ ACCEPT (got ${r.decision})`);
  check(r.speedup > 1 && r.costReduction > 0, `measured speedup (${r.speedup}) + cost reduction (${r.costReduction})`);
}

// REFUSED_REGRESSION: real speedup BUT accuracy drop exceeds tolerance.
{
  const r = Q.assess({ baseline: { provider: fp16 }, quantized: { provider: int8 }, requests: reqs,
    baselineRollouts: baseR, quantizedRollouts: { t1: [true, true], t2: [false, false], t3: [false, false] }, maxAccuracyDrop: 0.05, maxReliabilityDrop: 1 });
  check(r.decision === "REFUSED_REGRESSION", `speed win but accuracy drop > tolerance ⇒ REFUSED_REGRESSION (got ${r.decision})`);
  check(r.accuracyDrop > 0.05, `accuracy drop ${r.accuracyDrop} exceeds 0.05`);
}

// REFUSED_REGRESSION on reliability (flakiness introduced) even if pass^k equal-ish.
{
  const r = Q.assess({ baseline: { provider: fp16 }, quantized: { provider: int8 }, requests: reqs,
    baselineRollouts: { t1: [true, true], t2: [true, true] }, quantizedRollouts: { t1: [true, false], t2: [true, false] }, maxAccuracyDrop: 1, maxReliabilityDrop: 0.1 });
  check(r.decision === "REFUSED_REGRESSION" && r.reliabilityRegression > 0.1, `reliability regression > tolerance ⇒ REFUSED_REGRESSION (got ${r.decision})`);
}

// NO_WIN: no speedup, no cost reduction ⇒ nothing to accept (same provider).
{
  const r = Q.assess({ baseline: { provider: fp16 }, quantized: { provider: fp16 }, requests: reqs,
    baselineRollouts: baseR, quantizedRollouts: baseR, maxAccuracyDrop: 0.5, maxReliabilityDrop: 0.5 });
  check(r.decision === "NO_WIN", `no speed/cost win ⇒ NO_WIN (got ${r.decision})`);
}

// INSUFFICIENT_EVIDENCE: speedup claim with NO held-out rollouts ⇒ never credited (fail-closed).
{
  const r = Q.assess({ baseline: { provider: fp16 }, quantized: { provider: int8 }, requests: reqs, baselineRollouts: {}, quantizedRollouts: {}, maxAccuracyDrop: 0.5 });
  check(r.decision === "INSUFFICIENT_EVIDENCE", `no rollouts ⇒ INSUFFICIENT_EVIDENCE (never credited) (got ${r.decision})`);
}

// fail-closed: missing providers ⇒ INSUFFICIENT_EVIDENCE.
check(Q.assess({}).decision === "INSUFFICIENT_EVIDENCE", "missing providers ⇒ INSUFFICIENT_EVIDENCE");
// fail-closed: missing tolerance treated as 0 (strict) — any drop refuses.
{
  const r = Q.assess({ baseline: { provider: fp16 }, quantized: { provider: int8 }, requests: reqs,
    baselineRollouts: baseR, quantizedRollouts: { t1: [true, true], t2: [false, false], t3: [true, true] } });
  check(r.decision === "REFUSED_REGRESSION", "missing tolerance ⇒ 0 (strict) ⇒ any drop REFUSED");
}

check(Q.QUANTIZATION_HONESTY_CONTRACT.invariants.some((i: any) => /speed never excuses silent quality loss/.test(i)), "contract: speed never excuses quality loss");

console.log(failures === 0 ? "ALL PASS — SÉRIE 22 QUANTIZATION HONESTY GATE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
