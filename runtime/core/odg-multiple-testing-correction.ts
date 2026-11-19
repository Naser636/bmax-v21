#!/usr/bin/env node
"use strict";
/*
 * P6 EVAL — MULTIPLE-TESTING CORRECTION (Bonferroni + Holm FWER; Benjamini–Hochberg FDR). PURE, deterministic, fail-closed.
 *
 * THE GAP (reconciled): eval-significance produces individual p-values (two-proportion z, McNemar, etc.) but NOTHING
 * corrects for MULTIPLICITY. Running m comparisons at α each inflates the chance of a false positive to ≈ 1−(1−α)^m
 * (≈40% at m=10, α=0.05) — the classic p-hacking trap. This adds the standard corrections so "which comparisons are
 * REALLY significant across a family of tests?" is answered honestly. p-values are INPUTS (composed from the significance
 * module); this computes no test of its own.
 *
 * The methods control DIFFERENT error rates — NOT interchangeable:
 *  - Bonferroni / Holm → FWER (probability of ANY false positive); Holm is a uniformly more powerful step-down variant.
 *  - Benjamini–Hochberg → FDR (expected PROPORTION of false positives among rejections) — more powerful, weaker guarantee.
 *
 * Honesty: correction is CONSERVATIVE vs raw p<α (that is the point); a non-rejection after correction means "not
 * significant once multiplicity is controlled", NOT "no effect". Adjusted p-values are capped to [0,1] and the step
 * methods enforce monotonicity. Fail-closed: a p outside [0,1] / non-array / empty ⇒ typed refusal. No clock/randomness.
 */

function isProbArray(v: any): boolean { return Array.isArray(v) && v.length > 0 && v.every((x: any) => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1); }
function freeze(o: any): any { return Object.freeze(o); }
function r6(n: number): number { return Number(n.toFixed(6)); }
function clamp01(x: number): number { return x < 0 ? 0 : x > 1 ? 1 : x; }
function alphaOf(opts: any): number { return opts && typeof opts.alpha === "number" && opts.alpha > 0 && opts.alpha < 1 ? opts.alpha : 0.05; }

function result(method: string, m: number, alpha: number, adjusted: number[], ps: number[]): any {
  const results = ps.map((p, i) => freeze({ index: i, p: r6(p), pAdjusted: r6(adjusted[i]), reject: adjusted[i] <= alpha }));
  const rejectedCount = results.filter((r: any) => r.reject).length;
  return freeze({ ok: true, method, m, alpha, results: freeze(results), rejectedCount,
    note: `${method}: adjusted p ≤ α ⇒ reject. ${/Bonferroni|Holm/.test(method) ? "Controls FWER (prob of ANY false positive)" : "Controls FDR (expected proportion of false positives among rejections)"}. Correction is CONSERVATIVE vs raw p<α; a non-rejection means 'not significant after multiplicity control', NOT 'no effect'. p-values are inputs (no test computed here).` });
}

/** bonferroni(pValues, opts?) — FWER. adjusted = min(1, p·m); reject if ≤ α (⇔ p ≤ α/m). */
function bonferroni(pValues: any, opts: any): any {
  if (!isProbArray(pValues)) return freeze({ ok: false, code: "BAD_PVALUES", detail: "pValues must be a non-empty array of numbers in [0,1]" });
  const m = pValues.length, alpha = alphaOf(opts);
  return result("Bonferroni", m, alpha, pValues.map((p: number) => clamp01(p * m)), pValues);
}

/** holm(pValues, opts?) — step-down FWER (uniformly ≥ Bonferroni power). adjusted_(i)=min(1, running-max of (m−rank+1)·p). */
function holm(pValues: any, opts: any): any {
  if (!isProbArray(pValues)) return freeze({ ok: false, code: "BAD_PVALUES", detail: "pValues must be a non-empty array of numbers in [0,1]" });
  const m = pValues.length, alpha = alphaOf(opts);
  const order = pValues.map((p: number, i: number) => [p, i] as [number, number]).sort((a: [number, number], b: [number, number]) => a[0] - b[0]);
  const adj = new Array(m);
  let running = 0;
  for (let rank = 0; rank < m; rank++) { const [p, idx] = order[rank]; running = Math.max(running, clamp01((m - rank) * p)); adj[idx] = running; } // (m−rank) = m−(rank+1)+1
  return result("Holm", m, alpha, adj, pValues);
}

/** benjaminiHochberg(pValues, opts?) — step-up FDR. adjusted_(i)=min over j≥i of min(1, p_(j)·m/j), enforcing monotonicity. */
function benjaminiHochberg(pValues: any, opts: any): any {
  if (!isProbArray(pValues)) return freeze({ ok: false, code: "BAD_PVALUES", detail: "pValues must be a non-empty array of numbers in [0,1]" });
  const m = pValues.length, alpha = alphaOf(opts);
  const order = pValues.map((p: number, i: number) => [p, i] as [number, number]).sort((a: [number, number], b: [number, number]) => a[0] - b[0]);
  const adj = new Array(m);
  let prev = 1;
  for (let rank = m - 1; rank >= 0; rank--) { const [p, idx] = order[rank]; prev = Math.min(prev, clamp01((p * m) / (rank + 1))); adj[idx] = prev; } // step-up: non-decreasing in p
  return result("Benjamini-Hochberg", m, alpha, adj, pValues);
}

const MULTIPLE_TESTING_CONTRACT = Object.freeze({
  id: "P6-MULTIPLE-TESTING-CORRECTION",
  purpose: "multiplicity correction (Bonferroni/Holm FWER; Benjamini–Hochberg FDR) over a family of p-values — the gap next to eval-significance's single tests",
  reuses: Object.freeze(["consumes p-values (e.g. from eval-significance.twoProportionZ/mcnemarPaired) — composes, computes no test of its own"]),
  invariants: Object.freeze([
    "Bonferroni/Holm control FWER (prob of ANY false positive); Benjamini–Hochberg controls FDR (expected false-discovery proportion) — DIFFERENT guarantees, NOT interchangeable",
    "correction is CONSERVATIVE vs raw p<α; a non-rejection means 'not significant after multiplicity control', NOT 'no effect'",
    "adjusted p-values capped to [0,1]; Holm (step-down) and BH (step-up) enforce monotonicity",
    "p-values are INPUTS — no statistical test is computed here",
    "fail-closed: a p outside [0,1] / non-array / empty ⇒ typed refusal; PURE/deterministic; no clock/randomness",
  ]),
});

module.exports = { bonferroni, holm, benjaminiHochberg, MULTIPLE_TESTING_CONTRACT };
export {};
