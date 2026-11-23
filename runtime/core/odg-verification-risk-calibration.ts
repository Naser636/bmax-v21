#!/usr/bin/env node
"use strict";
/*
 * V16.8 mission H — H1 = odg-verification-risk-calibration: an ADDITIVE, ADVISORY verification-risk score over the plan
 * returned by odg-verification-level.chooseLevel (#902). Contract: docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json#H
 * WORK_ITEM_CONTRACT.preRegistration.mechanism.improvement (functional form, features and hyper-parameters copied
 * verbatim; nothing here is tuned after seeing a result).
 *
 * NOT a second selector / graph / parser: it only READS a plan chooseLevel already produced. It NEVER changes the plan's
 * level, reinforced flag, independentInspection, mandatoryPreMergeCI (always true) or selected tests; nothing here is wired
 * into chooseLevel or any gate (adoptionScope: a PASS makes H1 an ADOPTION CANDIDATE only). PURE: no I/O, no randomness.
 *
 *   features(plan, changedFiles) = [f1 levelRank (DOCS_ONLY 0, L1 1, L2 2, L3 3), f2 reinforced (0/1),
 *     f3 #DISTINCT sensitive-category labels over plan.files[].sensitive, f4 log1p(#changedFiles), f5 log1p(#plan.tests.L2),
 *     f6 log1p(plan.graph.reverseClosure), f7 log1p(#plan.unresolved), f8 (#plan.files class DOC)/(#plan.files) (0 if none)]
 *   fit (DEV only): standardize with DEV mean + population sd (sd = 0 ⇒ weight fixed at 0); L2-regularized logistic
 *     regression, loss = mean log-loss + (λ/(2·n))·‖w‖², λ = 1, intercept not penalized; batch gradient descent from
 *     all-zero weights, learning rate 0.1, 5000 iterations.
 *   score = intercept + w · standardized features.
 *   B0 (current mechanism ordering) = levelRank + (reinforced ? 1 : 0);  B1 (breadth) = log1p(#changedFiles).
 *   rocAuc = Mann–Whitney U / (n_pos · n_neg), ties count 0.5.
 */
const crypto = require("crypto");

const LEVEL_RANK: any = Object.freeze({ DOCS_ONLY: 0, L1: 1, L2: 2, L3: 3 });
const FEATURE_NAMES = Object.freeze(["f1_levelRank", "f2_reinforced", "f3_distinctSensitiveLabels", "f4_log1pChangedFiles", "f5_log1pTestsL2", "f6_log1pReverseClosure", "f7_log1pUnresolved", "f8_docFileFraction"]);
const HYPER = Object.freeze({ lambda: 1, learningRate: 0.1, iterations: 5000, init: "all-zero", sd: "population", interceptPenalized: false });

const arr = (v: any): any[] => (Array.isArray(v) ? v : []);
function levelRank(level: any): number {
  if (!Object.prototype.hasOwnProperty.call(LEVEL_RANK, level)) throw new Error(`unknown verification level ${JSON.stringify(level)}`);
  return LEVEL_RANK[level];
}

/** features(plan, changedFiles) → number[8] (order = FEATURE_NAMES). Throws on a malformed plan (caller fails closed). */
function features(plan: any, changedFiles: any): number[] {
  if (!plan || plan.schema !== "ODG_VERIFICATION_PLAN") throw new Error("not an ODG_VERIFICATION_PLAN");
  if (!Array.isArray(changedFiles)) throw new Error("changedFiles must be an array");
  const files = arr(plan.files);
  const labels = new Set<string>();
  for (const f of files) for (const s of arr(f && f.sensitive)) labels.add(String(s));
  const docs = files.filter((f: any) => f && f.class === "DOC").length;
  const rc = plan.graph && Number.isFinite(plan.graph.reverseClosure) ? plan.graph.reverseClosure : 0;
  return [
    levelRank(plan.level),
    plan.reinforced === true ? 1 : 0,
    labels.size,
    Math.log1p(changedFiles.length),
    Math.log1p(arr(plan.tests && plan.tests.L2).length),
    Math.log1p(rc),
    Math.log1p(arr(plan.unresolved).length),
    files.length ? docs / files.length : 0,
  ];
}

/** B0 — the CURRENT mechanism's own ordering of verification need (chooseLevel unchanged). */
function b0Score(plan: any): number { return levelRank(plan.level) + (plan.reinforced === true ? 1 : 0); }
/** B1 — change breadth alone, no fitting. */
function b1Score(changedFiles: any): number { return Math.log1p(arr(changedFiles).length); }

/** standardizer over DEV rows: mean + POPULATION sd per feature. */
function fitStandardizer(X: number[][]): any {
  const n = X.length, d = X.length ? X[0].length : 0;
  const mean = new Array(d).fill(0), sd = new Array(d).fill(0);
  for (const x of X) for (let j = 0; j < d; j++) mean[j] += x[j];
  for (let j = 0; j < d; j++) mean[j] /= n;
  for (const x of X) for (let j = 0; j < d; j++) sd[j] += (x[j] - mean[j]) ** 2;
  // a feature CONSTANT over DEV has sd exactly 0 (not a floating residue of the mean) ⇒ its weight is fixed at 0
  for (let j = 0; j < d; j++) sd[j] = X.every((x) => x[j] === X[0][j]) ? 0 : Math.sqrt(sd[j] / n);
  return { mean, sd };
}
/** standardized feature vector; a feature with sd = 0 maps to 0 (its weight is fixed at 0 anyway). */
function standardize(x: number[], st: any): number[] { return x.map((v, j) => (st.sd[j] === 0 ? 0 : (v - st.mean[j]) / st.sd[j])); }
const sigmoid = (z: number): number => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));

/**
 * fit(Xdev, ydev) — DEV ONLY. y ∈ {0,1} (1 = HIGH_ITERATION). Deterministic batch gradient descent:
 *   grad_b = (1/n) Σ (p − y);  grad_wj = (1/n) Σ (p − y) z_j + (λ/n) w_j  (gradient of mean log-loss + (λ/(2n))‖w‖²);
 *   sd_j = 0 ⇒ w_j fixed at 0.
 */
function fit(Xdev: number[][], ydev: number[], hyper: any = HYPER): any {
  const n = Xdev.length;
  if (!n || ydev.length !== n) throw new Error("fit needs a non-empty X and a y of the same length");
  if (!ydev.every((y) => y === 0 || y === 1)) throw new Error("labels must be 0/1");
  const st = fitStandardizer(Xdev);
  const Z = Xdev.map((x) => standardize(x, st));
  const d = st.mean.length;
  const frozen = st.sd.map((s: number) => s === 0);
  let b = 0; const w = new Array(d).fill(0);
  for (let it = 0; it < hyper.iterations; it++) {
    let gb = 0; const gw = new Array(d).fill(0);
    for (let i = 0; i < n; i++) {
      let z = b; for (let j = 0; j < d; j++) z += w[j] * Z[i][j];
      const e = sigmoid(z) - ydev[i];
      gb += e / n;
      for (let j = 0; j < d; j++) gw[j] += (e * Z[i][j]) / n;
    }
    b -= hyper.learningRate * gb;
    for (let j = 0; j < d; j++) { if (frozen[j]) { w[j] = 0; continue; } w[j] -= hyper.learningRate * (gw[j] + (hyper.lambda / n) * w[j]); }
  }
  let loss = 0;
  for (let i = 0; i < n; i++) { let z = b; for (let j = 0; j < d; j++) z += w[j] * Z[i][j]; const p = Math.min(1 - 1e-15, Math.max(1e-15, sigmoid(z))); loss += -(ydev[i] * Math.log(p) + (1 - ydev[i]) * Math.log(1 - p)) / n; }
  loss += (hyper.lambda / (2 * n)) * w.reduce((s, v) => s + v * v, 0);
  const finite = Number.isFinite(b) && w.every(Number.isFinite) && st.mean.every(Number.isFinite) && st.sd.every(Number.isFinite);
  return Object.freeze({ schema: "odg-verification-risk-model/1", featureNames: FEATURE_NAMES.slice(), hyper: { ...hyper }, nDev: n, mean: st.mean, sd: st.sd, frozenFeatures: FEATURE_NAMES.filter((_, j) => frozen[j]), intercept: b, weights: w, finalLoss: loss, finite });
}

/** score(model, x) = intercept + w · standardize(x). */
function score(model: any, x: number[]): number { const z = standardize(x, model); let s = model.intercept; for (let j = 0; j < z.length; j++) s += model.weights[j] * z[j]; return s; }

/** advisory(plan, changedFiles, model) — the ADVISORY risk score; the plan is returned untouched (same reference). */
function advisory(plan: any, changedFiles: any, model: any): any {
  return Object.freeze({ advisory: true, riskScore: score(model, features(plan, changedFiles)), plan, controlsChanged: false,
    note: "advisory only — level / reinforced / independentInspection / mandatoryPreMergeCI / tests are the chooseLevel plan's, unchanged" });
}

/** canonical JSON (keys sorted) + sha256 — used to pin the fitted model BEFORE any held-out label is read. */
function canon(v: any): string {
  if (v === undefined) return "null";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  return "{" + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
}
function modelSha256(model: any): string { return crypto.createHash("sha256").update(canon(model)).digest("hex"); }

/** rocAuc(scores, labels) — Mann–Whitney U / (n_pos·n_neg), ties 0.5; null when a class is absent. */
function rocAuc(scores: number[], labels: number[]): number | null {
  const pos: number[] = [], neg: number[] = [];
  for (let i = 0; i < scores.length; i++) (labels[i] === 1 ? pos : neg).push(scores[i]);
  if (!pos.length || !neg.length) return null;
  let u = 0;
  for (const p of pos) for (const q of neg) u += p > q ? 1 : p === q ? 0.5 : 0;
  return u / (pos.length * neg.length);
}

const VERIFICATION_RISK_CALIBRATION_CONTRACT = Object.freeze({
  id: "ODG-VERIFICATION-RISK-CALIBRATION", mission: "H (V16.8)", featureNames: FEATURE_NAMES, hyper: HYPER, levelRank: LEVEL_RANK,
  invariants: Object.freeze([
    "ADDITIVE ADVISORY score only: never changes chooseLevel's level / reinforced / independentInspection / mandatoryPreMergeCI / tests",
    "composes chooseLevel's plan — no second selector, graph or parser",
    "fit is DEV-only and deterministic (zero init, fixed lr/iterations, no randomness); additions/deletions are NOT features",
    "not wired into chooseLevel or any gate — adoption needs a separate decision",
  ]),
});

module.exports = { LEVEL_RANK, FEATURE_NAMES, HYPER, levelRank, features, b0Score, b1Score, fitStandardizer, standardize, fit, score, advisory, canon, modelSha256, rocAuc, VERIFICATION_RISK_CALIBRATION_CONTRACT };
export {};
