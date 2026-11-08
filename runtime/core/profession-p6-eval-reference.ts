#!/usr/bin/env node
"use strict";

/*
 * V12.4 §43 P6 — QUALITY/AI-EVALUATION reference project (E2 executed + E3 adversarial). PURE, deterministic. A
 * runnable independent-evaluation capability over a CLEARLY-LABELLED SYNTHETIC corpus (never presented as real/client
 * data, never E5). It enforces a strict TRAIN/TEST (hold-out) separation, computes confusion-matrix metrics
 * (precision/recall/f1) on the HELD-OUT set, and runs an adversarial metric-gaming check: a model that memorizes TRAIN
 * but fails TEST is flagged (train-vs-holdout gap) — a high public-train score is NOT evidence of capability. It REUSES
 * the measurement discipline (improvement-baseline-style delta) and composes meta-intelligence's gaming lens; it builds
 * no second evaluator engine. Levels: E0 structural, E1 behavioral, E2 reference-project executed, E3 adversarial. E4
 * (independent) is a separate audit; E5 (external reality) stays owner-gated. Dual export.
 */

const MI = require("./meta-intelligence");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function round(n: number): number { return Number(n.toFixed(4)); }

/** syntheticCorpus(n, seedBias) -> { train, test }. Deterministic, clearly-labelled SYNTHETIC binary-label items. */
function syntheticCorpus(n: number, seedBias?: number): any {
  const items: any[] = [];
  const total = Math.max(2, Math.floor(n) || 20);
  for (let i = 0; i < total; i++) {
    // deterministic label from a simple parity rule + a fixed bias; SYNTHETIC — no real data.
    const label = ((i + (seedBias || 0)) % 2 === 0) ? 1 : 0;
    items.push({ id: "syn-" + i, feature: i, label, synthetic: true });
  }
  const split = Math.floor(total * 0.7);
  return Object.freeze({ train: Object.freeze(items.slice(0, split)), test: Object.freeze(items.slice(split)), synthetic: true });
}

/** evaluate(gold, predictions) -> confusion + precision/recall/f1/accuracy. gold/predictions keyed by id, value ∈ {0,1}. */
function evaluate(gold: any, predictions: any): any {
  const g = isObj(gold) ? gold : {};
  const p = isObj(predictions) ? predictions : {};
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const id of Object.keys(g)) {
    const y = g[id] === 1 ? 1 : 0; const yhat = p[id] === 1 ? 1 : 0;
    if (y === 1 && yhat === 1) tp++; else if (y === 0 && yhat === 1) fp++; else if (y === 1 && yhat === 0) fn++; else tn++;
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
  const total = tp + fp + fn + tn;
  const accuracy = total > 0 ? (tp + tn) / total : 0;
  return Object.freeze({ tp, fp, fn, tn, precision: round(precision), recall: round(recall), f1: round(f1), accuracy: round(accuracy) });
}

function goldOf(items: any): any { const o: any = {}; for (const it of items) o[it.id] = it.label; return o; }
function predict(items: any, model: any): any { const o: any = {}; for (const it of items) o[it.id] = model(it); return o; }

/**
 * runReferenceProject({corpus, model, now}) -> E2/E3 reference-project result. model is an injected predictor
 * (item)->0|1. Evaluates on the HELD-OUT test set; computes the train-vs-holdout gap; flags metric-gaming when the
 * model scores high on train but collapses on held-out (memorization). Measured, reproducible.
 */
function runReferenceProject(opts: any): any {
  const o = isObj(opts) ? opts : {};
  const corpus = isObj(o.corpus) ? o.corpus : syntheticCorpus(20);
  const model = typeof o.model === "function" ? o.model : ((it: any) => (it.feature % 2 === 0 ? 1 : 0));
  const trainEval = evaluate(goldOf(corpus.train), predict(corpus.train, model));
  const testEval = evaluate(goldOf(corpus.test), predict(corpus.test, model)); // HELD-OUT
  const holdoutGap = round(trainEval.accuracy - testEval.accuracy);
  // adversarial metric-gaming: strong train, weak held-out ⇒ memorization, not capability (meta-intelligence lens).
  const gaming = MI.detectMetricGaming ? MI.detectMetricGaming({ metric: { before: testEval.accuracy, after: trainEval.accuracy }, scope: { total: corpus.train.length, retestedImproved: corpus.train.length } }) : { verdict: "NO_DATA" };
  const gamingSuspected = holdoutGap >= 0.3 || (gaming && (gaming.verdict === "SUSPECTED" || gaming.verdict === "DETECTED"));
  const level = gamingSuspected ? "E3-FLAGGED" : (testEval.f1 > 0 ? "E2" : "E1");
  return Object.freeze({
    synthetic: true, profession: "P6",
    train: trainEval, heldOut: testEval, holdoutGap, gamingSuspected,
    discrimination: round(testEval.f1), level,
    note: "SYNTHETIC corpus (not real/client data, not E5); held-out metrics only are capability evidence; a high train score with a large holdout gap is metric-gaming, not skill",
  });
}

const P6_EVAL_REFERENCE_CONTRACT = Object.freeze({
  id: "V124-P6-EVAL-REFERENCE",
  source: "V12.4 §43 P6 (Quality/AI-Evaluation) — E2 reference project + E3 adversarial metric-gaming check",
  levels: Object.freeze(["E0", "E1", "E2", "E3", "E4(owner/independent)", "E5(owner-gated NOT_RUN)"]),
  reuses: Object.freeze(["meta-intelligence (metric-gaming lens)"]),
  notAuthority: "a runnable independent-evaluation reference over a SYNTHETIC corpus; it builds no second evaluator engine and claims no E5",
  invariants: Object.freeze([
    "SYNTHETIC data only, clearly labelled — never presented as real/client data; E5 stays owner-gated (NOT_RUN)",
    "strict train/test hold-out separation; only HELD-OUT metrics are capability evidence",
    "metric-gaming (high train / low held-out gap) is flagged; a high public score is not proof of capability",
    "pure/deterministic + reproducible; confusion-matrix metrics (precision/recall/f1/accuracy)",
  ]),
});

module.exports = { syntheticCorpus, evaluate, runReferenceProject, P6_EVAL_REFERENCE_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...P6_EVAL_REFERENCE_CONTRACT, demo: runReferenceProject({}) }, null, 2) + "\n"); }

export {};
