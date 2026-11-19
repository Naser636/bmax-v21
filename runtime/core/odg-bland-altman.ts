#!/usr/bin/env node
"use strict";
/*
 * P6 EVAL — BLAND–ALTMAN agreement for two CONTINUOUS measurement methods (bias + 95% limits of agreement). PURE,
 * deterministic, fail-closed.
 *
 * THE GAP (reconciled): the agreement suite covers CATEGORICAL (odg-inter-rater-agreement, Cohen's/Fleiss' κ) and
 * ORDINAL/ordering (odg-rank-correlation, Spearman/Kendall) — but NOTHING measures agreement of two CONTINUOUS
 * measurements. Bland & Altman (1986) is the standard method: correlation is the WRONG tool here (two methods can
 * correlate ~1.0 yet disagree by a large constant offset); the right answer is the BIAS (mean difference) and the
 * LIMITS OF AGREEMENT (bias ± 1.96·SD of the differences) — the range within which 95% of differences are expected.
 *
 * Honesty:
 *  - this measures AGREEMENT of two continuous methods — explicitly NOT correlation (a strong correlation can hide a
 *    systematic bias); the limits are a DESCRIPTIVE interval, NOT a verdict that the methods are interchangeable
 *    (acceptable limits are a domain judgment the caller owns);
 *  - the 95% limits assume the differences are ~normally distributed (stated, not hidden); PROPORTIONAL bias
 *    (differences growing with magnitude) is NOT assessed here — a known limitation, flagged, never silently ignored;
 *  - fail-closed: unequal length / n<2 (SD undefined) / non-finite ⇒ typed refusal (no imputation). No clock/randomness.
 */

const Z95 = 1.959963984540054; // standard normal 97.5th percentile (two-sided 95%) — matches eval-significance.Z95

function isNums(v: any): boolean { return Array.isArray(v) && v.every((x: any) => typeof x === "number" && Number.isFinite(x)); }
function freeze(o: any): any { return Object.freeze(o); }
function r6(n: number): number { return Number(n.toFixed(6)); }

/**
 * blandAltman(methodA, methodB, opts?) -> { ok, n, bias, sdDiff, biasSE, loaUpper, loaLower, z, withinLoa, note }.
 * Paired continuous measurements (aligned by index). bias = mean(A−B); LoA = bias ± z·SD(diff) (z=1.96 default, 95%).
 * Fail-closed: non-array / length mismatch / n<2 / non-finite ⇒ typed refusal.
 */
function blandAltman(methodA: any, methodB: any, opts: any): any {
  if (!isNums(methodA) || !isNums(methodB)) return freeze({ ok: false, code: "NOT_NUMERIC_ARRAYS" });
  if (methodA.length !== methodB.length) return freeze({ ok: false, code: "LENGTH_MISMATCH", detail: `${methodA.length} vs ${methodB.length} — methods must measure the same items` });
  const n = methodA.length;
  if (n < 2) return freeze({ ok: false, code: "TOO_FEW", detail: "need at least 2 paired measurements (SD of differences is undefined for n<2)" });
  const z = opts && typeof opts.z === "number" && opts.z > 0 ? opts.z : Z95;

  const diffs = methodA.map((a: number, i: number) => a - methodB[i]);
  const bias = diffs.reduce((s: number, d: number) => s + d, 0) / n;
  const variance = diffs.reduce((s: number, d: number) => s + (d - bias) * (d - bias), 0) / (n - 1); // sample SD (n−1)
  const sdDiff = Math.sqrt(variance);
  const biasSE = sdDiff / Math.sqrt(n);
  const loaUpper = bias + z * sdDiff;
  const loaLower = bias - z * sdDiff;
  const withinLoaCount = diffs.filter((d: number) => d >= loaLower && d <= loaUpper).length;

  return freeze({ ok: true, n, bias: r6(bias), sdDiff: r6(sdDiff), biasSE: r6(biasSE),
    loaUpper: r6(loaUpper), loaLower: r6(loaLower), z: r6(z),
    withinLoa: freeze({ count: withinLoaCount, proportion: r6(withinLoaCount / n) }),
    note: "Bland–Altman: bias = mean(A−B), limits of agreement = bias ± z·SD(diff) (z=1.96 ⇒ 95%). Measures AGREEMENT of two continuous methods — NOT correlation (a high correlation can hide a systematic bias). Limits are a DESCRIPTIVE interval, not a verdict of interchangeability; assumes differences ~normal; proportional bias NOT assessed here." });
}

const BLAND_ALTMAN_CONTRACT = Object.freeze({
  id: "P6-BLAND-ALTMAN",
  purpose: "Bland–Altman agreement (bias + 95% limits of agreement) for two CONTINUOUS measurement methods — completes the agreement suite (categorical κ / ordinal rank-corr / continuous Bland–Altman)",
  reuses: Object.freeze(["complements odg-inter-rater-agreement (categorical) + odg-rank-correlation (ordinal) — a distinct continuous-agreement statistic; Z95 matches eval-significance"]),
  invariants: Object.freeze([
    "measures AGREEMENT of two continuous methods — explicitly NOT correlation (strong correlation can hide a systematic bias)",
    "bias = mean(A−B); limits of agreement = bias ± z·SD(diff), sample SD (n−1), z=1.96 ⇒ 95%",
    "the limits are a DESCRIPTIVE interval — NOT a verdict of interchangeability (acceptable limits are the caller's domain judgment)",
    "assumes differences ~normal; PROPORTIONAL bias is NOT assessed here (flagged limitation, not silently ignored)",
    "fail-closed: unequal length / n<2 / non-finite ⇒ typed refusal (no imputation); PURE/deterministic; no clock/randomness",
  ]),
});

module.exports = { blandAltman, Z95, BLAND_ALTMAN_CONTRACT };
export {};
