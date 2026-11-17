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

// V253 §3 — Wilson confidence interval + McNemar paired significance test.
{
  // Wilson CI: a point estimate at small n has a WIDE interval (unreliable); at large n it tightens.
  const small = P6.wilsonInterval(9, 10), large = P6.wilsonInterval(900, 1000);
  check(small.point === 0.9 && small.lower < 0.9 && small.upper <= 1 && small.width > large.width, "wilson: 9/10 ⇒ point 0.9 but WIDE interval; 900/1000 ⇒ much tighter (confidence grows with n)");
  check(P6.wilsonInterval(5, 0).ok === false && P6.wilsonInterval(5, 0).code === "EMPTY", "wilson: n=0 ⇒ fail-closed (no reliable estimate)");
  check(P6.wilsonInterval(50, 100).lower >= 0 && P6.wilsonInterval(50, 100).upper <= 1 && P6.wilsonInterval(50, 100).point === 0.5, "wilson: bounded to [0,1], symmetric point at 0.5");

  // McNemar: no discordant pairs ⇒ NOT significant (no basis to distinguish).
  const gold = { x1: 1, x2: 0, x3: 1, x4: 0 };
  const same = P6.mcnemarTest({ x1: 1, x2: 0, x3: 1, x4: 0 }, { x1: 1, x2: 0, x3: 1, x4: 0 }, gold);
  check(same.discordant === 0 && same.significant === false && same.better === null, "mcnemar: identical predictions ⇒ 0 discordant ⇒ NOT significant");
  // a TINY difference (1 discordant pair) is NOT significant (noise), not a win.
  const tiny = P6.mcnemarTest({ x1: 1, x2: 0, x3: 1, x4: 1 }, { x1: 1, x2: 0, x3: 1, x4: 0 }, gold);
  check(tiny.discordant === 1 && tiny.significant === false && tiny.better === null, "mcnemar: a single discordant pair ⇒ NOT significant (a tiny delta is noise, not a real difference)");
  // a LARGE, consistent one-sided difference ⇒ significant, A better (A right where B wrong many times).
  const bigGold: any = {}, aPred: any = {}, bPred: any = {};
  for (let i = 0; i < 40; i++) { const id = "g" + i; bigGold[id] = 1; aPred[id] = 1; bPred[id] = i < 30 ? 0 : 1; }   // A always right, B wrong on 30
  const big = P6.mcnemarTest(aPred, bPred, bigGold);
  check(big.b === 30 && big.c === 0 && big.significant === true && big.better === "A" && big.pValue < 0.05, "mcnemar: A right on 30 where B wrong, 0 reverse ⇒ SIGNIFICANT, A better, p<0.05");

  // compareModels: integrates accuracy + CIs + McNemar into a gated verdict.
  const corpus = P6.syntheticCorpus(40);
  const good = (it: any) => (it.feature % 2 === 0 ? 1 : 0);
  const bad = (it: any) => 0;
  const cmp = P6.compareModels(corpus, bad, good);
  check(cmp.ok === true && cmp.significant === true && cmp.better === "B" && cmp.verdict === "B_SIGNIFICANTLY_BETTER" && cmp.intervalA && cmp.intervalB, "compareModels: clearly-better B ⇒ B_SIGNIFICANTLY_BETTER with CIs + McNemar");
  const cmpEq = P6.compareModels(corpus, good, good);
  check(cmpEq.significant === false && cmpEq.better === null && cmpEq.verdict === "NOT_SIGNIFICANT", "compareModels: identical models ⇒ NOT_SIGNIFICANT (no false win)");
  check(JSON.stringify(P6.compareModels(corpus, bad, good)) === JSON.stringify(cmp) && Object.isFrozen(cmp), "compareModels: deterministic + frozen");
}

console.log(failures === 0 ? "ALL PASS — V12.4 §43 P6 EVAL REFERENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
