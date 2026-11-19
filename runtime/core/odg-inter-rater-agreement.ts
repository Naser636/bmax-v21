#!/usr/bin/env node
"use strict";
/*
 * P6 EVAL — INTER-RATER AGREEMENT (Cohen's κ for 2 raters, Fleiss' κ for ≥2 raters). PURE, deterministic, fail-closed.
 *
 * THE GAP (reconciled): the eval stack has eval-significance (effect/CI), evaluator-independence (STRUCTURAL: are the
 * raters independent?), champion-challenger, fairness-eval — but NOTHING quantifies how much two/N raters AGREE BEYOND
 * CHANCE. This project leans on independent evaluators everywhere (e.g. a 3b model judging a 7b's output); κ is the
 * standard statistic for "is that agreement real or just chance?". This adds it.
 *
 * Honesty (κ is widely misread):
 *  - κ measures agreement BEYOND CHANCE — it is NOT accuracy and NOT a ground-truth/correctness measure (two raters can
 *    agree perfectly and BOTH be wrong); the interpretation label (Landis & Koch) is a convention, not a verdict;
 *  - when there is NO category variability (expected agreement pe = 1), κ is mathematically UNDEFINED — returned as
 *    null + flagged, never forced to a number (the classic "high agreement, κ=0-or-NaN paradox");
 *  - categories are the OBSERVED label set — none invented; mismatched/missing ratings ⇒ fail-closed (no imputation).
 *  No network/clock/randomness.
 */

function isFiniteNum(v: any): boolean { return typeof v === "number" && Number.isFinite(v); }
function freeze(o: any): any { return Object.freeze(o); }
function key(v: any): string { return typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : ""; }
function r4(n: number): number { return Number(n.toFixed(4)); }

/** Landis & Koch (1977) convention — a label, NOT a verdict. */
function interpret(k: number | null): string {
  if (k === null) return "UNDEFINED";
  if (k < 0) return "POOR";
  if (k <= 0.20) return "SLIGHT";
  if (k <= 0.40) return "FAIR";
  if (k <= 0.60) return "MODERATE";
  if (k <= 0.80) return "SUBSTANTIAL";
  return "ALMOST_PERFECT";
}

/**
 * cohenKappa(ratingsA, ratingsB) -> { ok, kappa, po, pe, n, categories, agreement, interpretation }.
 * Two raters, SAME N items (aligned by index), categorical labels. Fail-closed: non-array / unequal length / <2 items /
 * a rating that isn't a string|number|boolean ⇒ typed refusal. pe=1 (no variability) ⇒ kappa null (UNDEFINED), flagged.
 */
function cohenKappa(ratingsA: any, ratingsB: any): any {
  if (!Array.isArray(ratingsA) || !Array.isArray(ratingsB)) return freeze({ ok: false, code: "NOT_ARRAYS" });
  if (ratingsA.length !== ratingsB.length) return freeze({ ok: false, code: "LENGTH_MISMATCH", detail: `${ratingsA.length} vs ${ratingsB.length} — raters must score the same items` });
  const n = ratingsA.length;
  if (n < 2) return freeze({ ok: false, code: "TOO_FEW_ITEMS", detail: "need at least 2 items" });
  const a: string[] = []; const b: string[] = [];
  for (let i = 0; i < n; i++) { const ka = key(ratingsA[i]); const kb = key(ratingsB[i]); if (ka === "" || kb === "") return freeze({ ok: false, code: "BAD_RATING", detail: `item ${i}: ratings must be string|number|boolean (no missing/imputation)` }); a.push(ka); b.push(kb); }
  const cats = Array.from(new Set([...a, ...b])).sort();
  let agree = 0; for (let i = 0; i < n; i++) if (a[i] === b[i]) agree++;
  const po = agree / n;
  const countA: Record<string, number> = {}; const countB: Record<string, number> = {};
  for (const c of cats) { countA[c] = 0; countB[c] = 0; }
  for (const x of a) countA[x]++; for (const x of b) countB[x]++;
  let pe = 0; for (const c of cats) pe += (countA[c] / n) * (countB[c] / n);
  if (pe >= 1) return freeze({ ok: true, kappa: null, po: r4(po), pe: r4(pe), n, categories: freeze(cats), agreement: agree,
    interpretation: "UNDEFINED", note: "expected agreement pe=1 (no category variability) ⇒ κ is mathematically UNDEFINED — not forced to a number" });
  const kappa = (po - pe) / (1 - pe);
  return freeze({ ok: true, kappa: r4(kappa), po: r4(po), pe: r4(pe), n, categories: freeze(cats), agreement: agree,
    interpretation: interpret(r4(kappa)), note: "Cohen's κ: agreement BEYOND CHANCE for 2 raters — NOT accuracy/ground-truth (raters can agree and both be wrong); interpretation label is Landis & Koch convention." });
}

/**
 * fleissKappa(items) -> { ok, kappa, pBar, pBarE, n, raters, categories, interpretation }.
 * items: array of arrays; each inner array = the labels the raters gave that item. Fleiss' κ requires a FIXED number of
 * raters per item (≥2) and ≥2 items. Fail-closed: ragged rater counts / <2 raters / <2 items / bad rating ⇒ refusal.
 */
function fleissKappa(items: any): any {
  if (!Array.isArray(items) || items.length < 2) return freeze({ ok: false, code: "TOO_FEW_ITEMS", detail: "need at least 2 items" });
  if (!items.every((it: any) => Array.isArray(it))) return freeze({ ok: false, code: "BAD_ITEMS", detail: "each item must be an array of rater labels" });
  const nRaters = items[0].length;
  if (nRaters < 2) return freeze({ ok: false, code: "TOO_FEW_RATERS", detail: "Fleiss' κ needs ≥2 raters per item" });
  if (!items.every((it: any) => it.length === nRaters)) return freeze({ ok: false, code: "RAGGED_RATERS", detail: "Fleiss' κ requires the SAME number of raters on every item" });
  const N = items.length;
  const labelItems: string[][] = [];
  for (let i = 0; i < N; i++) { const row: string[] = []; for (const v of items[i]) { const k = key(v); if (k === "") return freeze({ ok: false, code: "BAD_RATING", detail: `item ${i}: ratings must be string|number|boolean` }); row.push(k); } labelItems.push(row); }
  const cats = Array.from(new Set(labelItems.flat())).sort();
  // n_ij: raters assigning item i to category j
  let sumPi = 0;
  const catTotals: Record<string, number> = {}; for (const c of cats) catTotals[c] = 0;
  for (let i = 0; i < N; i++) {
    const nij: Record<string, number> = {}; for (const c of cats) nij[c] = 0;
    for (const lab of labelItems[i]) nij[lab]++;
    let sqSum = 0; for (const c of cats) { sqSum += nij[c] * nij[c]; catTotals[c] += nij[c]; }
    sumPi += (sqSum - nRaters) / (nRaters * (nRaters - 1));
  }
  const pBar = sumPi / N;
  let pBarE = 0; const denom = N * nRaters; for (const c of cats) { const pj = catTotals[c] / denom; pBarE += pj * pj; }
  if (pBarE >= 1) return freeze({ ok: true, kappa: null, pBar: r4(pBar), pBarE: r4(pBarE), n: N, raters: nRaters, categories: freeze(cats),
    interpretation: "UNDEFINED", note: "expected agreement pBarE=1 (no variability) ⇒ κ UNDEFINED — not forced" });
  const kappa = (pBar - pBarE) / (1 - pBarE);
  return freeze({ ok: true, kappa: r4(kappa), pBar: r4(pBar), pBarE: r4(pBarE), n: N, raters: nRaters, categories: freeze(cats),
    interpretation: interpret(r4(kappa)), note: "Fleiss' κ: agreement BEYOND CHANCE for a fixed set of N raters — NOT accuracy/ground-truth; interpretation is Landis & Koch convention." });
}

const INTER_RATER_AGREEMENT_CONTRACT = Object.freeze({
  id: "P6-INTER-RATER-AGREEMENT",
  purpose: "P6 eval: quantify agreement BEYOND CHANCE between evaluators (Cohen's κ for 2 raters, Fleiss' κ for ≥2) — the gap next to structural evaluator-independence",
  reuses: Object.freeze(["complements evaluator-independence (structural) + eval-significance (effect/CI) — a distinct statistic, no overlap"]),
  invariants: Object.freeze([
    "κ measures agreement BEYOND CHANCE — NOT accuracy/ground-truth (raters can agree perfectly and both be wrong)",
    "no category variability (pe/pBarE = 1) ⇒ κ UNDEFINED (null + flagged), never forced to a number",
    "categories are the OBSERVED label set — none invented; mismatched/missing/ragged ratings ⇒ fail-closed (no imputation)",
    "the interpretation label is the Landis & Koch convention — a label, not a verdict",
    "PURE + deterministic; no network/clock/randomness",
  ]),
});

module.exports = { cohenKappa, fleissKappa, interpret, INTER_RATER_AGREEMENT_CONTRACT };
export {};
