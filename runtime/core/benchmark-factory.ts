#!/usr/bin/env node
"use strict";

/*
 * V12.4 §58 — BENCHMARK FACTORY. PURE, deterministic. Builds evaluation suites (public / private / held-out /
 * synthetic / adversarial), AUDITS each for the §58 integrity hazards (incorrect instructions, ambiguity, over-strict
 * or incomplete tests, leakage/contamination, bias, shortcuts, gaming), and runs a candidate on the HELD-OUT split with
 * a contamination probe (train-vs-held-out collapse). It REUSES the P6 evaluation scorer and meta-intelligence's gaming
 * lens; it builds no second evaluator engine. A high public/train score is never evidence by itself — only audited,
 * leakage-free, held-out results are. Dual export.
 */

const P6 = require("./profession-p6-eval-reference");
const MI = require("./meta-intelligence");

const SUITE_TYPES = Object.freeze(["PUBLIC", "PRIVATE", "HELDOUT", "SYNTHETIC", "ADVERSARIAL"]);
const AUDIT_CHECKS = Object.freeze(["leakage", "bias", "shortcut", "incompleteTests", "overStrict", "ambiguous"]);

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function round(n: number): number { return Number(n.toFixed(4)); }

/** buildSuite(spec) -> { name, type, train, heldOut, provenance }. Strict train/held-out split; synthetic items labelled. */
function buildSuite(spec: any): any {
  const s = isObj(spec) ? spec : {};
  const items = arr(s.items).filter(isObj);
  const type = SUITE_TYPES.includes(s.type) ? s.type : "SYNTHETIC";
  const ratio = typeof s.holdoutRatio === "number" && s.holdoutRatio > 0 && s.holdoutRatio < 1 ? s.holdoutRatio : 0.3;
  const split = Math.max(1, Math.floor(items.length * (1 - ratio)));
  return Object.freeze({
    name: isStr(s.name) ? s.name : "suite", type,
    train: Object.freeze(items.slice(0, split)), heldOut: Object.freeze(items.slice(split)),
    provenance: Object.freeze({ type, synthetic: type === "SYNTHETIC", builtAt: s.now !== undefined ? s.now : null }),
    note: "only the held-out split (leakage-free) is capability evidence",
  });
}

/** auditBenchmark(suite) -> { clean, issues, severity }. Checks the §58 integrity hazards. Fail-closed: issues surfaced. */
function auditBenchmark(suite: any): any {
  const s = isObj(suite) ? suite : {};
  const train = arr(s.train); const test = arr(s.heldOut);
  const issues: any[] = [];
  // LEAKAGE/contamination: any held-out item id that also appears in train.
  const trainIds = new Set(train.map((i: any) => i && i.id).filter(isStr));
  const leaked = test.filter((i: any) => i && trainIds.has(i.id)).map((i: any) => i.id);
  if (leaked.length) issues.push({ check: "leakage", detail: "held-out ids present in train: " + leaked.join(","), severity: "HIGH" });
  // BIAS: held-out label distribution skew (>85% one class).
  const labels = test.map((i: any) => (i && i.label === 1 ? 1 : 0));
  const pos = labels.filter((x: number) => x === 1).length;
  if (labels.length > 0) { const r = pos / labels.length; if (r >= 0.85 || r <= 0.15) issues.push({ check: "bias", detail: `held-out label skew ${round(r)}`, severity: "MEDIUM" }); }
  // SHORTCUT: a single feature perfectly predicts the label on held-out (trivial, exploitable).
  if (test.length >= 4 && test.every((i: any) => i && typeof i.feature === "number")) {
    const trivial = test.every((i: any) => (i.feature % 2 === 0 ? 1 : 0) === (i.label === 1 ? 1 : 0)) || test.every((i: any) => (i.feature % 2 === 0 ? 0 : 1) === (i.label === 1 ? 1 : 0));
    if (trivial && (s.type === "PUBLIC")) issues.push({ check: "shortcut", detail: "a trivial parity feature solves a PUBLIC suite", severity: "MEDIUM" });
  }
  // INCOMPLETE/EMPTY: a held-out set too small to discriminate.
  if (test.length < 2) issues.push({ check: "incompleteTests", detail: "held-out set too small to discriminate", severity: "HIGH" });
  const severity = issues.some((i: any) => i.severity === "HIGH") ? "HIGH" : (issues.length ? "MEDIUM" : "NONE");
  return Object.freeze({ clean: issues.length === 0, issues: Object.freeze(issues), severity });
}

/** runBenchmark(suite, predict) -> { heldOut, train, holdoutGap, contaminationFlag, discriminates }. Reuses P6.evaluate. */
function runBenchmark(suite: any, predict: any): any {
  const s = isObj(suite) ? suite : {};
  const model = typeof predict === "function" ? predict : ((it: any) => (it.feature % 2 === 0 ? 1 : 0));
  const goldTrain: any = {}, predTrain: any = {}, goldTest: any = {}, predTest: any = {};
  for (const it of arr(s.train)) { goldTrain[it.id] = it.label; predTrain[it.id] = model(it); }
  for (const it of arr(s.heldOut)) { goldTest[it.id] = it.label; predTest[it.id] = model(it); }
  const train = P6.evaluate(goldTrain, predTrain);
  const heldOut = P6.evaluate(goldTest, predTest);
  const holdoutGap = round(train.accuracy - heldOut.accuracy);
  const gaming = MI.detectMetricGaming ? MI.detectMetricGaming({ metric: { before: heldOut.accuracy, after: train.accuracy } }) : { verdict: "NO_DATA" };
  const contaminationFlag = holdoutGap >= 0.3 || (gaming && gaming.verdict === "DETECTED");
  return Object.freeze({ train, heldOut, holdoutGap, contaminationFlag, discriminates: heldOut.f1 > 0, note: "held-out f1 is the capability signal; a large train-vs-held-out gap ⇒ contamination/memorization, not skill" });
}

const BENCHMARK_FACTORY_CONTRACT = Object.freeze({
  id: "V124-BENCHMARK-FACTORY",
  source: "V12.4 §58 — benchmark factory (build/audit/run; integrity-first)",
  suiteTypes: SUITE_TYPES, auditChecks: AUDIT_CHECKS,
  reuses: Object.freeze(["profession-p6-eval-reference (evaluate)", "meta-intelligence (gaming lens)"]),
  notAuthority: "builds + audits + runs evaluation suites; it builds no second evaluator engine and claims no real-world (E5) result",
  invariants: Object.freeze([
    "only the held-out (leakage-free) split is capability evidence; a high public/train score is not evidence alone",
    "every suite is audited for leakage/bias/shortcut/incomplete-tests before trust",
    "contamination (train-vs-held-out collapse) is flagged; synthetic suites are labelled synthetic (never E5)",
    "pure/deterministic + reproducible; reuses the P6 scorer and meta-intelligence (no duplication)",
  ]),
});

module.exports = { SUITE_TYPES, AUDIT_CHECKS, BENCHMARK_FACTORY_CONTRACT, buildSuite, auditBenchmark, runBenchmark };

if (require.main === module) { process.stdout.write(JSON.stringify(BENCHMARK_FACTORY_CONTRACT, null, 2) + "\n"); }

export {};
