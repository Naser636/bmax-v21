#!/usr/bin/env node
"use strict";
const assert = require("assert");
const O = require("./optimization-experiment");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V5-E / OPTIMIZATION EXPERIMENT (controlled promotion)");
// fast + detection preserved + correct ⇒ PROMOTE.
{
  const r = O.evaluateOptimization({ beforeMs: 187000, afterMs: 5000, beforeDetection: 0.9, afterDetection: 0.9, correctnessPreserved: true });
  check(r.decision === "PROMOTE" && r.met75 === true && r.selfAuthorized === false, "fast + no quality loss ⇒ PROMOTE (external)");
}
// fast BUT detection degraded ⇒ REJECT (speed never excuses quality loss).
{
  const r = O.evaluateOptimization({ beforeMs: 187000, afterMs: 5000, beforeDetection: 0.9, afterDetection: 0.7, correctnessPreserved: true });
  check(r.decision === "REJECT", "fast but detection degraded ⇒ REJECT");
}
// fast BUT correctness not preserved ⇒ REJECT.
check(O.evaluateOptimization({ beforeMs: 187000, afterMs: 5000, correctnessPreserved: false }).decision === "REJECT", "correctness not preserved ⇒ REJECT (masking forbidden)");
// speedup below target ⇒ INCONCLUSIVE.
check(O.evaluateOptimization({ beforeMs: 100, afterMs: 60, beforeDetection: 0.9, afterDetection: 0.9, correctnessPreserved: true }).decision === "INCONCLUSIVE", "40% < 75% target ⇒ INCONCLUSIVE");
// significant speedup ⇒ PROMOTE; noise ⇒ INCONCLUSIVE.
{
  const noise = O.evaluateOptimization({ beforeMs: 200, afterMs: 40, beforeDetection: 0.9, afterDetection: 0.9, correctnessPreserved: true, significanceEvidence: { before: { successes: 9, n: 10 }, after: { successes: 10, n: 10 } } });
  check(noise.decision === "INCONCLUSIVE", "speedup not statistically significant ⇒ INCONCLUSIVE");
  const sig = O.evaluateOptimization({ beforeMs: 200, afterMs: 40, beforeDetection: 0.9, afterDetection: 0.9, correctnessPreserved: true, significanceEvidence: { before: { successes: 10, n: 20 }, after: { successes: 18, n: 20 } } });
  check(sig.decision === "PROMOTE", "significant speedup + no quality loss ⇒ PROMOTE");
}
// unmeasurable speedup ⇒ INCONCLUSIVE.
check(O.evaluateOptimization({ beforeMs: 0, afterMs: 5, correctnessPreserved: true, detectionPreserved: true }).decision === "INCONCLUSIVE", "unmeasurable speedup ⇒ INCONCLUSIVE");
check(O.OPTIMIZATION_EXPERIMENT_CONTRACT.invariants.some((i: any) => /only if quality guarantees stay demonstrated/i.test(i)), "contract: speed accepted only if quality demonstrated");
console.log(failures === 0 ? "ALL PASS — V5-E OPTIMIZATION EXPERIMENT" : "FAILURES: " + failures);
process.exit(failures === 0 ? 0 : 1);
export {};
