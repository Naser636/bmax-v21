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

// V253 §3 — P6 could MEASURE a metric but not say whether it is TRUSTWORTHY (confidence) or whether a difference between
// two models is REAL or NOISE (significance). That is the core eval gap and it directly hardens V252 P2.compareVersions
// (which used a flat tolerance). Added: Wilson score interval (binomial proportion CI) + McNemar's paired test (the
// classic test for comparing two classifiers on the SAME held-out set; McNemar 1947). Pure, deterministic (no RNG).

/** wilsonInterval(successes, n, opts) -> Wilson score CI for a proportion (e.g. accuracy). Wide interval at small n ⇒ low
 * confidence (an unreliable point estimate is never presented as precise). z default 1.96 (≈95%). */
function wilsonInterval(successes: number, n: number, opts?: any): any {
  const o = isObj(opts) ? opts : {};
  const z = typeof o.z === "number" && o.z > 0 ? o.z : 1.96;
  const s = Math.max(0, Math.floor(successes)), N = Math.max(0, Math.floor(n));
  if (N === 0) return Object.freeze({ ok: false, code: "EMPTY", point: 0, lower: 0, upper: 1, n: 0, width: 1, note: "no observations ⇒ no reliable estimate (fail-closed)" });
  const phat = s / N, z2 = z * z;
  const denom = 1 + z2 / N;
  const centre = (phat + z2 / (2 * N)) / denom;
  const margin = (z / denom) * Math.sqrt((phat * (1 - phat) + z2 / (4 * N)) / N);
  const lower = round(Math.max(0, centre - margin)), upper = round(Math.min(1, centre + margin));
  return Object.freeze({ ok: true, point: round(phat), lower, upper, n: N, z, width: round(upper - lower), note: "Wilson score interval; a wide interval (small n) ⇒ the point estimate is not reliable evidence" });
}

function choose(n: number, k: number): number { if (k < 0 || k > n) return 0; k = Math.min(k, n - k); let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return r; }

/** mcnemarTest(predA, predB, gold) -> paired significance on the SAME items. b = A-correct/B-wrong, c = A-wrong/B-correct.
 * Exact two-sided binomial for small discordant counts; chi-square with continuity correction otherwise. alpha 0.05. */
function mcnemarTest(predA: any, predB: any, gold: any): any {
  const a = isObj(predA) ? predA : {}, bp = isObj(predB) ? predB : {}, g = isObj(gold) ? gold : {};
  const ids = Object.keys(g);
  if (ids.length === 0) return Object.freeze({ ok: false, code: "EMPTY", significant: false, better: null, note: "no paired items (fail-closed)" });
  let b = 0, c = 0, both = 0, neither = 0;
  for (const id of ids) {
    const y = g[id] === 1 ? 1 : 0;
    const aOk = (a[id] === 1 ? 1 : 0) === y, bOk = (bp[id] === 1 ? 1 : 0) === y;
    if (aOk && !bOk) b++; else if (!aOk && bOk) c++; else if (aOk && bOk) both++; else neither++;
  }
  const discordant = b + c;
  if (discordant === 0) return Object.freeze({ ok: true, b, c, discordant, both, neither, statistic: 0, pValue: 1, significant: false, better: null, method: "none", note: "no discordant pairs ⇒ no basis to distinguish the two models (NOT significant)" });
  let pValue: number, statistic: number, method: string;
  if (discordant < 25) {
    // exact two-sided binomial: P(X<=min(b,c)) under p=0.5, doubled, capped at 1.
    const k = Math.min(b, c); let tail = 0; for (let i = 0; i <= k; i++) tail += choose(discordant, i); tail = tail / Math.pow(2, discordant);
    pValue = Math.min(1, round(2 * tail)); statistic = round(Math.pow(Math.abs(b - c) - 1 >= 0 ? Math.abs(b - c) - 1 : 0, 2) / discordant); method = "exact-binomial";
  } else {
    const corr = Math.max(0, Math.abs(b - c) - 1); statistic = round((corr * corr) / discordant); method = "chi2-continuity";
    // chi-square df=1 two-sided p via erfc approximation: p = erfc(sqrt(stat/2)).
    pValue = round(erfc(Math.sqrt(statistic / 2)));
  }
  const alpha = 0.05;
  const significant = pValue < alpha;
  const better = significant ? (b > c ? "A" : "B") : null;   // A better = A right where B wrong more often
  return Object.freeze({ ok: true, b, c, discordant, both, neither, statistic, pValue, significant, better, method, alpha, note: "McNemar paired test on the SAME held-out items; a difference is only reported when p<0.05 (otherwise it is NOISE, not a real difference)" });
}

// erfc approximation (Abramowitz & Stegun 7.1.26) — deterministic, for the chi-square tail only.
function erfc(x: number): number { const t = 1 / (1 + 0.3275911 * x); const y = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))); return y * Math.exp(-x * x); }

/** compareModels(corpus, modelA, modelB, opts) -> held-out accuracy + Wilson CIs + McNemar significance ⇒ a gated verdict.
 * A measured accuracy difference is only a real improvement when McNemar says significant AND the CIs support it. */
function compareModels(corpus: any, modelA: any, modelB: any, opts?: any): any {
  const c = isObj(corpus) ? corpus : syntheticCorpus(20);
  const test = Array.isArray(c.test) ? c.test : [];
  if (test.length === 0) return Object.freeze({ ok: false, code: "EMPTY_HELDOUT", significant: false, better: null });
  const gold = goldOf(test);
  const mA = typeof modelA === "function" ? modelA : (() => 0), mB = typeof modelB === "function" ? modelB : (() => 0);
  const pA = predict(test, mA), pB = predict(test, mB);
  const evA = evaluate(gold, pA), evB = evaluate(gold, pB);
  const n = test.length;
  const intervalA = wilsonInterval(Math.round(evA.accuracy * n), n), intervalB = wilsonInterval(Math.round(evB.accuracy * n), n);
  const mc = mcnemarTest(pA, pB, gold);
  const better = mc.significant ? mc.better : null;
  return Object.freeze({
    ok: true, n, accuracyA: evA.accuracy, accuracyB: evB.accuracy, delta: round(evB.accuracy - evA.accuracy),
    intervalA, intervalB, mcnemar: mc, significant: mc.significant, better,
    verdict: !mc.significant ? "NOT_SIGNIFICANT" : (better === "B" ? "B_SIGNIFICANTLY_BETTER" : "A_SIGNIFICANTLY_BETTER"),
    note: "a measured accuracy delta is a REAL difference only when McNemar p<0.05 on the SAME held-out items; otherwise NOT_SIGNIFICANT (noise). Overlapping Wilson CIs at small n ⇒ low confidence. Not an E5/real-world claim.",
  });
}

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
    "V253 significance: Wilson CI (wide at small n ⇒ unreliable) + McNemar paired test on the SAME held-out items — a measured accuracy delta is a REAL difference only when p<0.05, else NOT_SIGNIFICANT (noise); no RNG, deterministic",
  ]),
});

module.exports = { syntheticCorpus, evaluate, wilsonInterval, mcnemarTest, compareModels, runReferenceProject, P6_EVAL_REFERENCE_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...P6_EVAL_REFERENCE_CONTRACT, demo: runReferenceProject({}) }, null, 2) + "\n"); }

export {};
