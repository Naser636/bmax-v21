#!/usr/bin/env node
"use strict";

/*
 * WI-P6-18 — QUALITY HARNESS (P6 Quality Engineering — industrialisation). PURE, deterministic. COMPOSES the
 * quality signals into ONE reproducible report: regression (pass/fail + regressions vs a baseline), affected-
 * test coverage (did the run cover every test that touches a changed file?), evaluation metrics (precision/
 * recall/F1 from a confusion count), and benchmark-contamination (REUSES meta-intelligence). Fail-closed
 * verdict PASS/REVIEW/FAIL. It does not run tests itself — it classifies SUPPLIED results. Dual export.
 */

const META = require("./meta-intelligence");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function num(v: any): number { return typeof v === "number" && isFinite(v) ? v : 0; }

/** regression(results, baseline) -> { total, passed, failed, regressions[], newPasses[] }. */
function regression(results: any, baseline?: any): any {
  const r = isObj(results) ? results : {};
  const base = isObj(baseline) ? baseline : {};
  const ids = Object.keys(r).sort();
  const regressions: string[] = []; const newPasses: string[] = []; let passed = 0; let failed = 0;
  for (const id of ids) {
    const now = r[id] === true || r[id] === "pass";
    if (now) passed++; else failed++;
    const was = base[id] === true || base[id] === "pass";
    if (was && !now) regressions.push(id);
    if (!was && now && Object.prototype.hasOwnProperty.call(base, id)) newPasses.push(id);
  }
  return Object.freeze({ total: ids.length, passed, failed, regressions: regressions.sort(), newPasses: newPasses.sort() });
}

/** affectedCoverage(changedTouches, ranTests) -> { required, ran, uncovered }. changedTouches: testId->bool touched. */
function affectedCoverage(requiredTests: any, ranTests: any): any {
  const req = arr(requiredTests).filter((x: any) => typeof x === "string");
  const ran = new Set(arr(ranTests).filter((x: any) => typeof x === "string"));
  const uncovered = req.filter((t: string) => !ran.has(t)).sort();
  return Object.freeze({ required: req.length, ran: ran.size, uncovered, complete: uncovered.length === 0 });
}

/** evalMetrics({tp,fp,fn,tn}) -> precision/recall/f1/accuracy. Fail-closed on no data. */
function evalMetrics(c: any): any {
  const tp = num(c && c.tp), fp = num(c && c.fp), fn = num(c && c.fn), tn = num(c && c.tn);
  const n = tp + fp + fn + tn;
  if (n === 0) return Object.freeze({ verdict: "NO_DATA" });
  const precision = tp + fp === 0 ? null : Number((tp / (tp + fp)).toFixed(4));
  const recall = tp + fn === 0 ? null : Number((tp / (tp + fn)).toFixed(4));
  const f1 = precision && recall && precision + recall > 0 ? Number((2 * precision * recall / (precision + recall)).toFixed(4)) : null;
  return Object.freeze({ verdict: "OK", precision, recall, f1, accuracy: Number(((tp + tn) / n).toFixed(4)), n });
}

/**
 * qualityReport(input) -> { verdict, regression, coverage, evaluation, contamination }.
 * input: { testResults, baseline?, requiredTests?, ranTests?, confusion?, benchmarkDigests?, seenDigests? }.
 * Verdict: FAIL if regressions OR hard contamination; REVIEW if uncovered affected tests OR failed tests; else PASS.
 */
function qualityReport(input: any): any {
  const i = isObj(input) ? input : {};
  const reg = regression(i.testResults, i.baseline);
  const cov = affectedCoverage(i.requiredTests, i.ranTests);
  const ev = evalMetrics(i.confusion);
  const contam = META.detectBenchmarkContamination({ benchmarkDigests: i.benchmarkDigests, seenDigests: i.seenDigests });
  let verdict = "PASS";
  if (reg.regressions.length > 0 || contam.verdict === "DETECTED") verdict = "FAIL";
  else if (!cov.complete || reg.failed > 0) verdict = "REVIEW";
  return Object.freeze({ verdict, regression: reg, coverage: cov, evaluation: ev, contamination: contam });
}

const QUALITY_HARNESS_CONTRACT = Object.freeze({
  id: "WI-P6-18-QUALITY-HARNESS",
  source: "P6 Quality Engineering — composes regression + affected-coverage + eval-metrics + benchmark-contamination (reuses meta-intelligence)",
  notAuthority: "pure quality classifier over SUPPLIED results; runs no tests; reuses, does not duplicate",
  invariants: Object.freeze([
    "pure/deterministic: results in → report out; no clock/random; sorted outputs",
    "regression is relative to a baseline; a pass→fail is a regression (FAIL)",
    "affected-test coverage fail-closed: an uncovered required test ⇒ REVIEW",
    "benchmark contamination reuses meta-intelligence (hard digest overlap ⇒ FAIL)",
    "verdict fail-closed: FAIL (regression/contamination) > REVIEW (uncovered/failed) > PASS",
  ]),
});

module.exports = { QUALITY_HARNESS_CONTRACT, regression, affectedCoverage, evalMetrics, qualityReport };

if (require.main === module) {
  process.stdout.write(JSON.stringify(QUALITY_HARNESS_CONTRACT, null, 2) + "\n");
}

export {};
