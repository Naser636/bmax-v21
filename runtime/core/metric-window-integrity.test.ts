#!/usr/bin/env node
"use strict";
const assert = require("assert");
const W = require("./metric-window-integrity");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 23/W7 — METRIC WINDOW INTEGRITY");
// full coverage ⇒ TRUSTWORTHY.
{
  const ts = Array.from({ length: 101 }, (_, i) => i * 10);
  const r = W.assessWindowIntegrity({ timestamps: ts, windowStart: 0, windowEnd: 1000, expectedIntervalMs: 10 });
  check(r.verdict === "TRUSTWORTHY" && r.coverageRatio >= 0.99, "dense full coverage ⇒ TRUSTWORTHY");
}
// interior hole ⇒ UNTRUSTWORTHY.
{
  const r = W.assessWindowIntegrity({ timestamps: [0, 10, 20, 980, 990, 1000], windowStart: 0, windowEnd: 1000, expectedIntervalMs: 10 });
  check(r.verdict === "UNTRUSTWORTHY" && r.largestInteriorGap === 960, "interior hole ⇒ UNTRUSTWORTHY (gap 960)");
}
// trailing truncation (stale) ⇒ UNTRUSTWORTHY.
{
  const r = W.assessWindowIntegrity({ timestamps: [0, 10, 20, 30], windowStart: 0, windowEnd: 1000, expectedIntervalMs: 10 });
  check(r.verdict === "UNTRUSTWORTHY" && r.trailingGap === 970, "trailing truncation ⇒ UNTRUSTWORTHY");
}
// non-monotonic ⇒ UNTRUSTWORTHY.
check(W.assessWindowIntegrity({ timestamps: [0, 50, 20, 100], windowStart: 0, windowEnd: 100, expectedIntervalMs: 50 }).monotonic === false, "out-of-order timestamps ⇒ monotonic false");
// fail-closed: missing window bound / empty / single point.
check(W.assessWindowIntegrity({ timestamps: [1, 2], windowStart: 0 }).verdict === "UNTRUSTWORTHY", "missing windowEnd ⇒ UNTRUSTWORTHY");
check(W.assessWindowIntegrity({ timestamps: [], windowStart: 0, windowEnd: 100 }).verdict === "UNTRUSTWORTHY", "empty series ⇒ UNTRUSTWORTHY");
check(W.assessWindowIntegrity({ timestamps: [50], windowStart: 0, windowEnd: 100 }).verdict === "UNTRUSTWORTHY", "single point ⇒ UNTRUSTWORTHY");
check(W.METRIC_WINDOW_INTEGRITY_CONTRACT.invariants.some((i: any) => /never a silent pass/.test(i)), "contract: never a silent pass");
console.log(failures === 0 ? "ALL PASS — SÉRIE 23/W7 METRIC WINDOW INTEGRITY" : "FAILURES: " + failures);
process.exit(failures === 0 ? 0 : 1);
export {};
