#!/usr/bin/env node
"use strict";
const assert = require("assert");
const L = require("./frontier-lab-experiment");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V5 PHASE 7 / M-CH5-01 — FRONTIER LAB EXPERIMENT");
// complete protocol ⇒ VALID.
{
  const r = L.registerExperiment({ id: "e1", hypothesis: "h", reference: "ref", baseline: {}, method: "m", expected: "e" });
  check(r.valid === true, "complete §7.3 protocol ⇒ VALID");
}
// missing fields ⇒ INVALID.
{
  const r = L.registerExperiment({ id: "e1", hypothesis: "h" });
  check(r.valid === false && r.missing.includes("baseline") && r.missing.includes("method"), "missing protocol fields ⇒ INVALID (fail-closed)");
}
// candidate demonstrates value ⇒ PROMOTE_CANDIDATE (recommendation, external).
{
  const r = L.evaluateExperiment({ baseline: { signals: { successRate: 0.8 } }, candidate: { signals: { successRate: 0.9 } }, reproducible: true });
  check(r.decision === "PROMOTE_CANDIDATE" && r.selfAuthorized === false && r.grantsNoPromotion === true, "improvement + reproducible ⇒ PROMOTE_CANDIDATE (external)");
}
// regression ⇒ KEEP_BASELINE.
{
  const r = L.evaluateExperiment({ baseline: { signals: { successRate: 0.9 } }, candidate: { signals: { successRate: 0.7 } }, reproducible: true });
  check(r.decision === "KEEP_BASELINE", "regression ⇒ KEEP_BASELINE");
}
// not reproducible ⇒ INCONCLUSIVE.
check(L.evaluateExperiment({ baseline: { signals: { s: 1 } }, candidate: { signals: { s: 2 } }, reproducible: false }).decision === "INCONCLUSIVE", "not reproducible ⇒ INCONCLUSIVE");
// no improvement (newer but not better) ⇒ INCONCLUSIVE.
check(L.evaluateExperiment({ baseline: { signals: { s: 1 } }, candidate: { signals: { s: 1 } }, reproducible: true }).decision === "INCONCLUSIVE", "no improvement ⇒ INCONCLUSIVE (newer is not a reason)");
// improvement not statistically significant ⇒ INCONCLUSIVE.
{
  const r = L.evaluateExperiment({ baseline: { signals: { successRate: 0.8 } }, candidate: { signals: { successRate: 0.9 } }, reproducible: true, significanceEvidence: { before: { successes: 9, n: 10 }, after: { successes: 10, n: 10 } } });
  check(r.decision === "INCONCLUSIVE", "improvement not significant (noise) ⇒ INCONCLUSIVE");
}
// significant improvement ⇒ PROMOTE_CANDIDATE.
{
  const r = L.evaluateExperiment({ baseline: { signals: { successRate: 0.5 } }, candidate: { signals: { successRate: 0.9 } }, reproducible: true, significanceEvidence: { before: { successes: 10, n: 20 }, after: { successes: 18, n: 20 } } });
  check(r.decision === "PROMOTE_CANDIDATE", "significant improvement ⇒ PROMOTE_CANDIDATE");
}
check(L.FRONTIER_LAB_EXPERIMENT_CONTRACT.invariants.some((i: any) => /never integrated just because it is newer/i.test(i)), "contract: newer/popular is not a reason");
console.log(failures === 0 ? "ALL PASS — V5 M-CH5-01 FRONTIER LAB EXPERIMENT" : "FAILURES: " + failures);
process.exit(failures === 0 ? 0 : 1);
export {};
