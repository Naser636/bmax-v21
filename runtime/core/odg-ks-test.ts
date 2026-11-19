#!/usr/bin/env node
"use strict";
/*
 * P4 DATA DRIFT — TWO-SAMPLE KOLMOGOROV–SMIRNOV test. PURE, deterministic, fail-closed.
 *
 * THE GAP (reconciled): p4-distribution-drift computes PSI — but PSI needs BINNING (arbitrary bin edges on continuous
 * data) and is a threshold heuristic, not a test. The two-sample KS test is the standard DISTRIBUTION-FREE complement:
 * it needs NO binning, works directly on the raw continuous samples, and yields a statistic D = sup|F_a(x) − F_b(x)|
 * plus an asymptotic p-value. It is FULLY deterministic (ECDF max-gap + the Numerical-Recipes series Q_KS — no
 * resampling/randomness, unlike a bootstrap, which is why bootstrap was NOT chosen here). Complements PSI; no new engine.
 *
 * Honesty:
 *  - KS is distribution-FREE and needs NO binning — it tests whether two samples came from the SAME continuous
 *    distribution; a NOT_DIFFERENT result is NOT proof of sameness (absence of evidence ≠ evidence of absence);
 *  - the p-value is the ASYMPTOTIC approximation — flagged as unreliable for very small samples (n or m < ~8);
 *  - it makes no causal/"drift is bad" claim — just whether the two samples are statistically distinguishable;
 *  - fail-closed: non-array / < 2 values / any non-finite value ⇒ typed refusal (no imputation). No clock/randomness.
 */

function isNums(v: any): boolean { return Array.isArray(v) && v.every((x: any) => typeof x === "number" && Number.isFinite(x)); }
function freeze(o: any): any { return Object.freeze(o); }

// Kolmogorov distribution Q_KS(λ) — Numerical Recipes "probks": P(D > observed) under H0. Deterministic series.
function probKS(lambda: number): number {
  if (lambda <= 0) return 1;
  const a2 = -2 * lambda * lambda;
  let fac = 2, sum = 0, termbf = 0;
  for (let j = 1; j <= 100; j++) {
    const term = fac * Math.exp(a2 * j * j);
    sum += term;
    if (Math.abs(term) <= 0.001 * termbf || Math.abs(term) <= 1e-8 * sum) return Math.min(1, Math.max(0, sum));
    fac = -fac;
    termbf = Math.abs(term);
  }
  return 1; // did not converge (λ tiny) ⇒ p = 1
}

/** KS statistic D = sup_x |F_a(x) − F_b(x)| via a two-pointer walk over the merged sorted samples (exact, deterministic). */
function ksStatistic(a: number[], b: number[]): number {
  const A = a.slice().sort((x, y) => x - y);
  const B = b.slice().sort((x, y) => x - y);
  const n = A.length, m = B.length;
  let i = 0, j = 0, d = 0;
  while (i < n && j < m) {
    const x = Math.min(A[i], B[j]);
    while (i < n && A[i] <= x) i++;
    while (j < m && B[j] <= x) j++;
    const gap = Math.abs(i / n - j / m);
    if (gap > d) d = gap;
  }
  return d; // after either sample is exhausted the other's CDF is 1 while this stays ≤1 — max gap already captured
}

/**
 * ksTwoSample(sampleA, sampleB, opts?) -> { ok, d, n, m, pValue, alpha, reject, verdict, criticalD, smallSample, note }.
 * opts = { alpha? (default 0.05) }. Fail-closed: non-array / <2 values / non-finite ⇒ typed refusal.
 */
function ksTwoSample(sampleA: any, sampleB: any, opts: any): any {
  if (!isNums(sampleA) || !isNums(sampleB)) return freeze({ ok: false, code: "NOT_NUMERIC_ARRAYS", detail: "both samples must be arrays of finite numbers (no imputation)" });
  const n = sampleA.length, m = sampleB.length;
  if (n < 2 || m < 2) return freeze({ ok: false, code: "TOO_FEW", detail: "each sample needs ≥ 2 values" });
  const alpha = opts && typeof opts.alpha === "number" && opts.alpha > 0 && opts.alpha < 1 ? opts.alpha : 0.05;
  const d = ksStatistic(sampleA, sampleB);
  const ne = (n * m) / (n + m);
  const sne = Math.sqrt(ne);
  const lambda = (sne + 0.12 + 0.11 / sne) * d;
  const pValue = probKS(lambda);
  // critical D at alpha (asymptotic): c(alpha)·sqrt((n+m)/(n·m)); c(alpha) = sqrt(-ln(alpha/2)/2)
  const cAlpha = Math.sqrt(-Math.log(alpha / 2) / 2);
  const criticalD = cAlpha * Math.sqrt((n + m) / (n * m));
  const reject = pValue < alpha;
  return freeze({ ok: true, d: Number(d.toFixed(6)), n, m,
    pValue: Number(pValue.toFixed(6)), alpha, reject,
    verdict: reject ? "DIFFERENT" : "NOT_DIFFERENT", criticalD: Number(criticalD.toFixed(6)),
    smallSample: n < 8 || m < 8,
    note: "two-sample KS (distribution-free, no binning): D=sup|Fa−Fb|; reject H0(same dist) at α ⇒ DIFFERENT. NOT_DIFFERENT is NOT proof of sameness (absence of evidence). p-value is asymptotic — unreliable for n or m < ~8 (smallSample flag). No causal/'drift is bad' claim." });
}

const KS_TEST_CONTRACT = Object.freeze({
  id: "P4-KS-TWO-SAMPLE",
  purpose: "two-sample Kolmogorov–Smirnov test — distribution-free continuous drift detector complementing p4-distribution-drift's binned PSI",
  reuses: Object.freeze(["complements p4-distribution-drift.psi (PSI needs binning; KS does not) — distinct statistic, no overlap"]),
  invariants: Object.freeze([
    "distribution-FREE, NO binning — D = sup|Fa−Fb| over the raw samples; deterministic ECDF walk (no resampling/randomness)",
    "NOT_DIFFERENT is NOT proof of sameness (absence of evidence ≠ evidence of absence)",
    "p-value is the ASYMPTOTIC approximation — flagged unreliable for very small samples (smallSample when n or m < 8)",
    "makes no causal / 'drift is bad' claim — only statistical distinguishability",
    "fail-closed: non-array / < 2 values / non-finite ⇒ typed refusal (no imputation); PURE/deterministic; no clock/randomness",
  ]),
});

module.exports = { ksStatistic, probKS, ksTwoSample, KS_TEST_CONTRACT };
export {};
