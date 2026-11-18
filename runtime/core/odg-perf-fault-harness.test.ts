#!/usr/bin/env node
"use strict";
/* V295 — tests for odg-perf-fault-harness (qual C8). Deterministic via an INJECTED clock (known-answer percentiles),
 * REAL fail-closed components in the fault scenarios (recovery-drill, closed-executor), deny-by-default thresholds,
 * anti-FALSE-PASS, and the honest C8 = PARTIAL (synthetic ≠ real VPS). Reuses latency-measure.percentile. */
const H = require("./odg-perf-fault-harness.js");
const R = require("./recovery-drill-benchmark.js");
const CEX = require("./odg-closed-executor.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }
const noop = () => {};

function main() {
  // measure with a scripted clock: t0, then (start,end) per iter, then wall. Latencies [10,20,30,40,50]; wall=150.
  const seq = [0, 0, 10, 10, 30, 30, 60, 60, 100, 100, 150, 150];
  let k = 0; const clk = () => seq[k++];
  const m = H.measure(noop, { iterations: 5, warmup: 0, now: clk });
  check("measure: known-answer percentiles (p50=30, p95=48, p99≈49.6, mean=30)", m.p50Ms === 30 && m.p95Ms === 48 && Math.abs(m.p99Ms - 49.6) < 1e-9 && m.meanMs === 30 && m.minMs === 10 && m.maxMs === 50);
  check("measure: throughput + zero errors", Math.abs(m.throughputPerSec - (5 / 0.15)) < 1e-6 && m.errors === 0 && m.successes === 5 && m.errorRate === 0);

  // errors are counted, never silent success. target throws on even i.
  let c2 = 0; const clk2 = () => c2++;
  const mErr = H.measure((i: number) => { if (i % 2 === 0) throw new Error("boom"); }, { iterations: 5, warmup: 0, now: clk2 });
  check("measure: a throwing call is an ERROR (never silent success)", mErr.errors === 3 && mErr.successes === 2 && mErr.errorRate === 0.6);

  // warmup does not consume the scripted clock (warmup calls target only).
  let k3 = 0; const clk3 = () => seq[k3++];
  const mW = H.measure(noop, { iterations: 5, warmup: 3, now: clk3 });
  check("measure: warmup runs the target but does not consume the timing clock", mW.p50Ms === 30 && mW.count === 5);

  check("measure: fail-closed on missing target/iterations", H.measure(null, { iterations: 5 }).measurable === false && H.measure(noop, {}).measurable === false);

  // evaluateThresholds: deny-by-default; breach ⇒ FAIL; within ⇒ PASS; missing ⇒ NOT_EVALUATED.
  const thr = { p95MaxMs: 50, p99MaxMs: 50, errorRateMax: 0.01, minThroughput: 10 };
  check("thresholds within ⇒ PASS (all dimensions)", H.evaluateThresholds(m, thr).verdict === "PASS");
  check("threshold breach (p95 48 > 40) ⇒ FAIL", H.evaluateThresholds(m, { p95MaxMs: 40 }).verdict === "FAIL" && H.evaluateThresholds(m, { p95MaxMs: 40 }).dimensions.some((d: any) => d.name === "p95Ms" && d.status === "FAIL"));
  check("no thresholds declared ⇒ NOT_EVALUATED (never PASS by omission)", H.evaluateThresholds(m, {}).verdict === "NOT_EVALUATED");
  check("throughput below min ⇒ FAIL", H.evaluateThresholds(m, { minThroughput: 1e9 }).verdict === "FAIL");

  // runFaultScenarios driving REAL fail-closed components.
  const good = [
    { name: "recovery-drill: corrupt checkpoint ⇒ refuse", expectFailClosed: true, run: () => { const cp = R.checkpoint({ v: 1 }); const bad = JSON.parse(JSON.stringify(cp)); bad.state.v = 9; return R.resume(bad); } },
    { name: "closed-executor: unknown op ⇒ deny", expectFailClosed: true, run: () => CEX.executeOp("no_such_op@9", [1]) },
    { name: "recovery-drill: resume(null) ⇒ refuse", expectFailClosed: true, run: () => R.resume(null) },
    { name: "closed-executor: valid op succeeds", expectFailClosed: false, run: () => CEX.executeOp("sum@1", [2, 3]) },
  ];
  const fr = H.runFaultScenarios(good);
  check("fault scenarios on REAL components ⇒ all PASS (fail-closed verified; valid op succeeds)", fr.verdict === "PASS" && fr.total === 4 && fr.falsePass === 0 && fr.failed === 0);

  // anti-FALSE-PASS: a fail-closed-expected scenario that returns success ⇒ FALSE_PASS ⇒ verdict FAIL.
  const falsePass = H.runFaultScenarios([{ name: "bad target returns ok on a fault", expectFailClosed: true, run: () => ({ ok: true }) }]);
  check("anti-FALSE-PASS: success on an expected fail-closed fault ⇒ FALSE_PASS ⇒ FAIL", falsePass.verdict === "FAIL" && falsePass.falsePass === 1);
  // a throw is a handled refusal (fail-closed).
  check("a throwing fault scenario is treated as fail-closed (PASS when expected)", H.runFaultScenarios([{ name: "throws", expectFailClosed: true, run: () => { throw new Error("x"); } }]).verdict === "PASS");
  check("empty scenarios ⇒ NOT_MEASURED (never PASS by omission)", H.runFaultScenarios([]).verdict === "NOT_MEASURED");

  // qualifyC8: PARTIAL while synthetic-only; FAIL on breach/false-pass; PASS only with real VPS; deny-by-default.
  check("C8: synthetic perf+fault PASS but VPS NOT measured ⇒ PARTIAL (not PASS)", H.qualifyC8({ perf: "PASS", fault: "PASS", vpsMeasured: false }).c8Status === "PARTIAL");
  check("C8: perf+fault PASS AND real VPS measured ⇒ PASS", H.qualifyC8({ perf: "PASS", fault: "PASS", vpsMeasured: true }).c8Status === "PASS");
  check("C8: any perf FAIL or fault FAIL ⇒ FAIL", H.qualifyC8({ perf: "FAIL", fault: "PASS" }).c8Status === "FAIL" && H.qualifyC8({ perf: "PASS", fault: "FAIL" }).c8Status === "FAIL");
  check("C8: deny-by-default ⇒ NOT_MEASURED (empty / perf not evaluated)", H.qualifyC8({}).c8Status === "NOT_MEASURED" && H.qualifyC8({ perf: "NOT_EVALUATED", fault: "PASS" }).c8Status === "NOT_MEASURED");

  // determinism + frozen + contract + percentile reuse.
  check("deterministic + frozen", (() => { let a = 0, b = 0; const r1 = H.measure(noop, { iterations: 5, warmup: 0, now: () => seq[a++] }); const r2 = H.measure(noop, { iterations: 5, warmup: 0, now: () => seq[b++] }); return JSON.stringify(r1) === JSON.stringify(r2) && Object.isFrozen(r1) && Object.isFrozen(fr); })());
  check("contract: reuses latency-measure (no 2nd percentile); thresholds pre-declared deny-by-default; anti-false-pass; PARTIAL-until-VPS", H.PERF_FAULT_HARNESS_CONTRACT.reuses.some((r: string) => /latency-measure/.test(r)) && H.PERF_FAULT_HARNESS_CONTRACT.invariants.some((i: string) => /FALSE_PASS/.test(i)) && H.PERF_FAULT_HARNESS_CONTRACT.invariants.some((i: string) => /PARTIAL while only synthetic/.test(i)));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-perf-fault-harness (V295 qual C8: injected-clock known-answer percentiles [p50/p95/p99] + throughput + error counting, deny-by-default pre-declared thresholds, REAL fail-closed fault scenarios [recovery-drill/closed-executor] with anti-FALSE-PASS, C8=PARTIAL while synthetic-only [synthetic ≠ real VPS]; reuses latency-measure; no new engine)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
