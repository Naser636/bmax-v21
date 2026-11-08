#!/usr/bin/env node
"use strict";
const assert = require("assert");
const BF = require("./benchmark-factory");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V12.4 §58 — BENCHMARK FACTORY");

function items(n: number, biasPos?: boolean): any[] {
  const out: any[] = [];
  for (let i = 0; i < n; i++) out.push({ id: "it-" + i, feature: i, label: biasPos ? 1 : (i % 2 === 0 ? 1 : 0) });
  return out;
}

// build a clean synthetic suite ⇒ strict train/held-out split, labelled synthetic.
{
  const s = BF.buildSuite({ name: "s1", type: "SYNTHETIC", items: items(20), holdoutRatio: 0.3 });
  check(s.type === "SYNTHETIC" && s.provenance.synthetic === true && s.train.length + s.heldOut.length === 20 && s.heldOut.length === 6, "build: strict train/held-out split, synthetic labelled");
  check(BF.auditBenchmark(s).clean === true, "a clean balanced synthetic suite ⇒ audit clean");
}

// AUDIT: leakage (held-out id also in train) ⇒ HIGH issue.
{
  const train = items(10); const leaked = [train[0], train[1], { id: "x", feature: 99, label: 1 }];
  const suite = { name: "leak", type: "HELDOUT", train, heldOut: leaked };
  const a = BF.auditBenchmark(suite);
  check(a.clean === false && a.severity === "HIGH" && a.issues.some((i: any) => i.check === "leakage"), "audit: held-out ids present in train ⇒ LEAKAGE (HIGH)");
}

// AUDIT: label bias on held-out ⇒ issue.
{
  const s = BF.buildSuite({ type: "SYNTHETIC", items: items(20, true), holdoutRatio: 0.3 }); // all label 1
  check(BF.auditBenchmark(s).issues.some((i: any) => i.check === "bias"), "audit: skewed held-out labels ⇒ BIAS issue");
}

// AUDIT: incomplete (held-out too small) ⇒ HIGH.
check(BF.auditBenchmark({ train: items(8), heldOut: [{ id: "a", feature: 1, label: 1 }] }).issues.some((i: any) => i.check === "incompleteTests"), "audit: held-out too small ⇒ incompleteTests (HIGH)");

// RUN: a competent model ⇒ strong held-out, no contamination.
{
  const s = BF.buildSuite({ type: "SYNTHETIC", items: items(20), holdoutRatio: 0.3 });
  const r = BF.runBenchmark(s, (it: any) => (it.feature % 2 === 0 ? 1 : 0));
  check(r.heldOut.accuracy === 1 && r.contaminationFlag === false && r.discriminates === true, "run: competent model ⇒ strong held-out, no contamination flag");
}

// RUN: a train-memorizing model ⇒ contamination flagged (large train-vs-held-out gap).
{
  const s = BF.buildSuite({ type: "SYNTHETIC", items: items(20), holdoutRatio: 0.3 });
  const trainIds = new Set(s.train.map((i: any) => i.id)); const tl: any = {}; for (const i of s.train) tl[i.id] = i.label;
  const memorizer = (it: any) => (trainIds.has(it.id) ? tl[it.id] : (it.feature % 2 === 0 ? 0 : 1));
  const r = BF.runBenchmark(s, memorizer);
  check(r.train.accuracy === 1 && r.heldOut.accuracy < 0.7 && r.holdoutGap >= 0.3 && r.contaminationFlag === true, "run: train-memorizer ⇒ held-out collapse ⇒ CONTAMINATION flagged");
}

// honesty: held-out-only evidence; synthetic never E5.
check(BF.BENCHMARK_FACTORY_CONTRACT.invariants.some((i: any) => /held-out.*capability evidence/.test(i)) && BF.BENCHMARK_FACTORY_CONTRACT.invariants.some((i: any) => /never E5/.test(i)), "contract: held-out-only evidence, synthetic never E5");

console.log(failures === 0 ? "ALL PASS — V12.4 §58 BENCHMARK FACTORY" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
