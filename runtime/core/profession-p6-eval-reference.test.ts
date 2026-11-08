#!/usr/bin/env node
"use strict";
const assert = require("assert");
const P6 = require("./profession-p6-eval-reference");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V12.4 §43 P6 — EVAL REFERENCE (E2/E3)");

// synthetic corpus: deterministic, labelled synthetic, train/test split.
{
  const c = P6.syntheticCorpus(20);
  check(c.synthetic === true && c.train.length + c.test.length === 20 && c.train.every((i: any) => i.synthetic === true), "synthetic corpus: deterministic train/test, clearly labelled synthetic");
  check(JSON.stringify(P6.syntheticCorpus(20)) === JSON.stringify(P6.syntheticCorpus(20)), "corpus is reproducible (deterministic)");
}

// confusion-matrix metrics.
{
  const m = P6.evaluate({ a: 1, b: 0, c: 1, d: 0 }, { a: 1, b: 0, c: 0, d: 1 });
  check(m.tp === 1 && m.fp === 1 && m.fn === 1 && m.tn === 1 && m.precision === 0.5 && m.recall === 0.5 && m.accuracy === 0.5, "evaluate: correct confusion matrix + precision/recall/accuracy");
}

// E2 reference project — a competent model (the true parity rule) ⇒ strong held-out, no gaming, level E2.
{
  const r = P6.runReferenceProject({ corpus: P6.syntheticCorpus(20), model: (it: any) => (it.feature % 2 === 0 ? 1 : 0) });
  check(r.synthetic === true && r.profession === "P6" && r.heldOut.accuracy === 1 && r.gamingSuspected === false && r.level === "E2", "E2: competent model ⇒ strong held-out metrics, no gaming, level E2");
  check(r.discrimination > 0, "E2: measured discrimination (held-out f1) reported");
}

// E3 adversarial — a model that MEMORIZES train but fails held-out ⇒ metric-gaming flagged.
{
  const corpus = P6.syntheticCorpus(20);
  const trainIds = new Set(corpus.train.map((i: any) => i.id));
  const trainLabel: any = {}; for (const i of corpus.train) trainLabel[i.id] = i.label;
  // memorizer: correct on train, wrong (inverted) on anything unseen.
  const memorizer = (it: any) => (trainIds.has(it.id) ? trainLabel[it.id] : (it.feature % 2 === 0 ? 0 : 1));
  const r = P6.runReferenceProject({ corpus, model: memorizer });
  check(r.train.accuracy === 1 && r.heldOut.accuracy < 0.7 && r.holdoutGap >= 0.3 && r.gamingSuspected === true, "E3 adversarial: train-memorizing model collapses on held-out ⇒ metric-gaming FLAGGED (not capability)");
}

// honesty: E5 stays owner-gated / NOT_RUN; synthetic never presented as real.
check(P6.P6_EVAL_REFERENCE_CONTRACT.invariants.some((i: any) => /E5 stays owner-gated/.test(i)) && P6.P6_EVAL_REFERENCE_CONTRACT.levels.some((l: any) => /E5.*NOT_RUN/.test(l)), "honesty: SYNTHETIC-only, E5 owner-gated NOT_RUN (no inflated level)");

console.log(failures === 0 ? "ALL PASS — V12.4 §43 P6 EVAL REFERENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
