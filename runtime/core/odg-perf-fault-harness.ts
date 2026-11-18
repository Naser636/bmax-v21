#!/usr/bin/env node
"use strict";
/*
 * V295 — PERFORMANCE & FAULT-TESTING HARNESS (qualification control C8). Deterministic + reproducible.
 *
 * REUSES the existing latency-measure.percentile (type-7) — no second percentile engine. It provides:
 *   - measure(target, opts): run a target fn over warmup+iterations, timing each call via an INJECTED clock (so the
 *     measurement logic is hermetically testable), collecting latency percentiles (p50/p95/p99), throughput, and
 *     success/error counts (a throwing call is an ERROR, never a silent success).
 *   - evaluateThresholds(measures, thresholds): deny-by-default per-dimension PASS/FAIL/NOT_EVALUATED against
 *     PRE-DECLARED (experimental) thresholds — a breach is FAIL, a missing threshold is NOT_EVALUATED (never PASS).
 *   - runFaultScenarios(scenarios): drive REAL fail-closed components under fault and classify — a scenario expected to
 *     fail-closed that instead returns success is a FALSE_PASS ⇒ FAIL (anti-false-PASS).
 *   - qualifyC8({perf, fault, vpsMeasured}): C8 is PARTIAL while only synthetic measures exist (VPS perf unmeasured);
 *     FAIL on any breach/false-pass; PASS only with real VPS measurement; deny-by-default ⇒ NOT_MEASURED.
 *
 * It builds no engine, deploys nothing, and NEVER injects faults into production — it measures caller-supplied targets.
 */

const LAT = require("./latency-measure.js");   // REUSE: percentile(sortedAsc, p) — no second percentile impl

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function nn(v: any): boolean { return typeof v === "number" && Number.isFinite(v); }

/** measure(target, {iterations, warmup, now}) -> perf summary. `now` is an injected monotonic clock (ms) for tests. */
function measure(target: any, opts: any = {}): any {
  const o = isObj(opts) ? opts : {};
  const iterations = Number.isInteger(o.iterations) && o.iterations > 0 ? o.iterations : 0;
  const warmup = Number.isInteger(o.warmup) && o.warmup >= 0 ? o.warmup : 0;
  const now = typeof o.now === "function" ? o.now : () => Number(process.hrtime.bigint()) / 1e6;
  if (typeof target !== "function" || iterations === 0) return Object.freeze({ measurable: false, reason: "target fn + iterations>0 required", count: 0 });
  for (let i = 0; i < warmup; i++) { try { target(i); } catch { /* warm-up errors ignored */ } }
  const latencies: number[] = []; let successes = 0, errors = 0; const t0 = now();
  for (let i = 0; i < iterations; i++) {
    const s = now(); let ok = true;
    try { target(i); } catch { ok = false; }
    const dt = now() - s;
    latencies.push(dt >= 0 ? dt : 0);
    if (ok) successes++; else errors++;
  }
  const wallMs = now() - t0;
  const sorted = latencies.slice().sort((a, b) => a - b);
  const sum = latencies.reduce((a, b) => a + b, 0);
  return Object.freeze({
    measurable: true, count: iterations, successes, errors,
    errorRate: iterations ? errors / iterations : 0,
    meanMs: iterations ? sum / iterations : 0,
    p50Ms: LAT.percentile(sorted, 0.5), p95Ms: LAT.percentile(sorted, 0.95), p99Ms: LAT.percentile(sorted, 0.99),
    minMs: sorted[0], maxMs: sorted[sorted.length - 1],
    wallMs, throughputPerSec: wallMs > 0 ? (iterations / (wallMs / 1000)) : null,
  });
}

/** evaluateThresholds(measures, thresholds) -> { verdict, dimensions }. Deny-by-default; breach ⇒ FAIL. */
function evaluateThresholds(measures: any, thresholds: any): any {
  const m = isObj(measures) ? measures : {}; const t = isObj(thresholds) ? thresholds : {};
  const dim: any[] = [];
  const cmp = (name: string, actual: any, max: any) => {
    if (!nn(max)) { dim.push(Object.freeze({ name, status: "NOT_EVALUATED", reason: "no threshold declared" })); return; }
    if (!nn(actual)) { dim.push(Object.freeze({ name, status: "NOT_EVALUATED", reason: "not measured" })); return; }
    dim.push(Object.freeze({ name, actual, max, status: actual <= max ? "PASS" : "FAIL" }));
  };
  cmp("p95Ms", m.p95Ms, t.p95MaxMs); cmp("p99Ms", m.p99Ms, t.p99MaxMs);
  cmp("errorRate", m.errorRate, t.errorRateMax);
  if (nn(t.minThroughput)) { const ok = nn(m.throughputPerSec) && m.throughputPerSec >= t.minThroughput; dim.push(Object.freeze({ name: "throughputPerSec", actual: m.throughputPerSec, min: t.minThroughput, status: nn(m.throughputPerSec) ? (ok ? "PASS" : "FAIL") : "NOT_EVALUATED" })); }
  const anyFail = dim.some((d) => d.status === "FAIL");
  const anyPass = dim.some((d) => d.status === "PASS");
  const verdict = anyFail ? "FAIL" : (anyPass ? "PASS" : "NOT_EVALUATED");
  return Object.freeze({ verdict, dimensions: Object.freeze(dim) });
}

/** runFaultScenarios(scenarios) -> results. Each: { name, run()->{ok|status}, expectFailClosed }. A fail-closed-expected
 *  scenario that returns success is a FALSE_PASS ⇒ FAIL. A throw is treated as a (handled) refusal = fail-closed. */
function runFaultScenarios(scenarios: any): any {
  const list = Array.isArray(scenarios) ? scenarios : [];
  const results = list.map((s: any) => {
    const sc = isObj(s) ? s : {};
    let outcomeOk: any = null, threw = false;
    try { const r = sc.run ? sc.run() : null; outcomeOk = isObj(r) ? (r.ok === true || r.status === "PASS" || r.status === "OK") : !!r; }
    catch { threw = true; outcomeOk = false; }
    const failedClosed = threw || outcomeOk === false;      // refused/threw = fail-closed
    const expectFailClosed = sc.expectFailClosed === true;
    let status: string;
    if (expectFailClosed) status = failedClosed ? "PASS" : "FALSE_PASS";   // success on a fault = FALSE_PASS
    else status = outcomeOk === true ? "PASS" : "FAIL";
    return Object.freeze({ name: String(sc.name || "scenario"), expectFailClosed, failedClosed, threw, status });
  });
  const falsePass = results.filter((r: any) => r.status === "FALSE_PASS").length;
  const failed = results.filter((r: any) => r.status === "FAIL").length;
  return Object.freeze({ verdict: (falsePass + failed) === 0 && results.length > 0 ? "PASS" : (results.length === 0 ? "NOT_MEASURED" : "FAIL"), total: results.length, falsePass, failed, results: Object.freeze(results) });
}

/** qualifyC8({perf, fault, vpsMeasured}) -> the honest C8 status. PARTIAL while only synthetic measures exist. */
function qualifyC8(input: any): any {
  const i = isObj(input) ? input : {};
  const perf = i.perf === "PASS" || i.perf === "FAIL" || i.perf === "NOT_EVALUATED" ? i.perf : "NOT_MEASURED";
  const fault = i.fault === "PASS" || i.fault === "FAIL" || i.fault === "NOT_MEASURED" ? i.fault : "NOT_MEASURED";
  const vpsMeasured = i.vpsMeasured === true;
  let status: string;
  if (perf === "FAIL" || fault === "FAIL") status = "FAIL";
  else if (perf === "NOT_MEASURED" || perf === "NOT_EVALUATED" || fault === "NOT_MEASURED") status = "NOT_MEASURED";
  else if (perf === "PASS" && fault === "PASS") status = vpsMeasured ? "PASS" : "PARTIAL";
  else status = "NOT_MEASURED";
  return Object.freeze({
    c8Status: status, perf, fault, vpsMeasured,
    note: status === "PARTIAL" ? "synthetic perf + fault scenarios PASS and are reproducible, but REAL VPS performance is NOT yet measured — C8 is PARTIAL, not PASS (synthetic ≠ production)" : status === "FAIL" ? "a threshold breach or a FALSE_PASS was detected" : status === "PASS" ? "synthetic + real VPS measures satisfy the declared thresholds" : "insufficient reproducible evidence",
  });
}

const PERF_FAULT_HARNESS_CONTRACT = Object.freeze({
  id: "V295-PERF-FAULT-HARNESS",
  source: "V295 — qualification control C8: reproducible performance + fault testing on REAL components",
  reuses: Object.freeze(["latency-measure.percentile (type-7) — no second percentile engine", "caller-supplied REAL targets (e.g. recovery-drill / closed-executor)"]),
  notAuthority: "a measurement + classification harness; builds no engine, deploys nothing, injects NO fault into production; deterministic with an injected clock",
  invariants: Object.freeze([
    "a throwing call is an ERROR, never a silent success; percentiles reuse latency-measure (no second impl)",
    "thresholds are PRE-DECLARED + experimental; deny-by-default — a breach is FAIL, a missing threshold is NOT_EVALUATED (never PASS)",
    "anti-false-PASS: a fail-closed-expected fault scenario that returns success is a FALSE_PASS ⇒ FAIL",
    "C8 is PARTIAL while only synthetic measures exist (synthetic ≠ real VPS performance); PASS requires real VPS measurement; deny-by-default ⇒ NOT_MEASURED",
    "deterministic (injected clock); no production fault injection; no new primitive/engine",
  ]),
});

module.exports = { measure, evaluateThresholds, runFaultScenarios, qualifyC8, PERF_FAULT_HARNESS_CONTRACT };
export {};
