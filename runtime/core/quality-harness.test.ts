#!/usr/bin/env node
"use strict";

/*
 * WI-P6-18 — quality-harness. Locks: regression vs baseline, affected-coverage fail-closed, eval metrics,
 * contamination reuse, fail-closed verdict (FAIL>REVIEW>PASS), determinism. Pure.
 * Run: node_modules/.bin/tsx runtime/core/quality-harness.test.ts
 */
const assert = require("assert");
const Q = require("./quality-harness");

let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }

console.log("WI-P6-18 — QUALITY HARNESS");

// regression vs baseline
{
  const r = Q.regression({ t1: "pass", t2: "fail", t3: "pass" }, { t1: "pass", t2: "pass", t3: "fail" });
  check(r.passed === 2 && r.failed === 1 && JSON.stringify(r.regressions) === JSON.stringify(["t2"]) && JSON.stringify(r.newPasses) === JSON.stringify(["t3"]), "regression: t2 regressed, t3 newly passes");
}
// affected coverage fail-closed
check(Q.affectedCoverage(["a", "b", "c"], ["a", "b"]).complete === false && JSON.stringify(Q.affectedCoverage(["a", "b", "c"], ["a", "b"]).uncovered) === JSON.stringify(["c"]), "uncovered affected test 'c' ⇒ not complete");
check(Q.affectedCoverage(["a"], ["a", "x"]).complete === true, "all required ran ⇒ complete");
// eval metrics
{
  const m = Q.evalMetrics({ tp: 8, fp: 2, fn: 2, tn: 8 });
  check(m.precision === 0.8 && m.recall === 0.8 && m.f1 === 0.8 && m.accuracy === 0.8, "confusion ⇒ precision/recall/f1/accuracy");
  check(Q.evalMetrics({}).verdict === "NO_DATA", "no confusion data ⇒ NO_DATA");
}
// qualityReport verdict precedence
check(Q.qualityReport({ testResults: { t: "fail" }, baseline: { t: "pass" } }).verdict === "FAIL", "regression ⇒ FAIL");
check(Q.qualityReport({ testResults: { t: "pass" }, benchmarkDigests: ["h"], seenDigests: ["h"] }).verdict === "FAIL", "benchmark contamination ⇒ FAIL (reuses meta-intelligence)");
check(Q.qualityReport({ testResults: { t: "pass" }, requiredTests: ["a"], ranTests: [] }).verdict === "REVIEW", "uncovered affected test ⇒ REVIEW");
check(Q.qualityReport({ testResults: { t: "fail" } }).verdict === "REVIEW", "a failed test (no baseline regression) ⇒ REVIEW");
check(Q.qualityReport({ testResults: { t: "pass" }, requiredTests: ["a"], ranTests: ["a"] }).verdict === "PASS", "all pass + covered + clean ⇒ PASS");
// determinism
check(JSON.stringify(Q.qualityReport({ testResults: { t: "pass" } })) === JSON.stringify(Q.qualityReport({ testResults: { t: "pass" } })), "deterministic report");

console.log(failures === 0 ? "ALL PASS — WI-P6-18 QUALITY HARNESS" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

// Module-scope marker (TS2451/TS2588 guard).
export {};
