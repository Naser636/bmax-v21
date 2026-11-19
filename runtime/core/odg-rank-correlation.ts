#!/usr/bin/env node
"use strict";
/*
 * P6 EVAL — RANK CORRELATION (Spearman's ρ, Kendall's τ-b). PURE, deterministic, fail-closed, tie-correct.
 *
 * THE GAP (reconciled): odg-inter-rater-agreement (κ) measures CATEGORICAL agreement (same label); profession-p6
 * McNemar tests a PAIRED binary difference; eval-significance does CIs/ranking-uncertainty. NONE measures whether two
 * evaluators RANK the same items in the same ORDER. Rank correlation is the standard statistic for that ("do judges
 * agree on the ordering, even if their absolute scores differ?") — and it leans on the same independent-evaluator theme.
 *
 * Correctness details that matter:
 *  - Spearman = PEARSON of the AVERAGE (fractional) RANKS — the tie-correct form, NOT the 1−6Σd²/(n(n²−1)) shortcut,
 *    which is only valid with NO ties;
 *  - Kendall's τ-b (not τ-a) — the tie-corrected variant with the √((n0−n1)(n0−n2)) denominator.
 *
 * Honesty:
 *  - rank correlation measures MONOTONIC ORDER association — NOT causation, NOT accuracy, NOT linear agreement on the
 *    raw values; high ρ between two evaluators means they ORDER items alike, not that either is correct;
 *  - zero variance (all values tied in a sample) ⇒ correlation UNDEFINED (null + flagged), never forced to 0/1;
 *  - fail-closed: unequal length / n<3 / non-finite ⇒ typed refusal (no imputation). No clock/randomness.
 */

function isNums(v: any): boolean { return Array.isArray(v) && v.every((x: any) => typeof x === "number" && Number.isFinite(x)); }
function freeze(o: any): any { return Object.freeze(o); }
function r6(n: number): number { return Number(n.toFixed(6)); }

/** Average (fractional) ranks, 1-based, ties share the mean of their positions. */
function avgRanks(a: number[]): number[] {
  const n = a.length;
  const idx = a.map((v, i) => [v, i] as [number, number]).sort((p, q) => p[0] - q[0]);
  const ranks = new Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j++;
    const avg = ((i + 1) + (j + 1)) / 2; // mean of 1-based positions in the tie group
    for (let t = i; t <= j; t++) ranks[idx[t][1]] = avg;
    i = j + 1;
  }
  return ranks;
}

/** Pearson correlation; null if either side has zero variance. */
function pearson(x: number[], y: number[]): number | null {
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
  let cov = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; cov += dx * dy; vx += dx * dx; vy += dy * dy; }
  if (vx === 0 || vy === 0) return null;
  return cov / Math.sqrt(vx * vy);
}

function strengthOf(r: number | null): string {
  if (r === null) return "UNDEFINED";
  const a = Math.abs(r);
  if (a < 0.1) return "NEGLIGIBLE";
  if (a < 0.4) return "WEAK";
  if (a < 0.7) return "MODERATE";
  return "STRONG";
}

function validatePair(x: any, y: any): any {
  if (!isNums(x) || !isNums(y)) return { code: "NOT_NUMERIC_ARRAYS" };
  if (x.length !== y.length) return { code: "LENGTH_MISMATCH", detail: `${x.length} vs ${y.length}` };
  if (x.length < 3) return { code: "TOO_FEW", detail: "need at least 3 paired observations" };
  return null;
}

/** spearman(x, y) -> { ok, n, rho, strength, note }. Spearman ρ = Pearson of average ranks (tie-correct). */
function spearman(x: any, y: any): any {
  const err = validatePair(x, y); if (err) return freeze({ ok: false, ...err });
  const r = pearson(avgRanks(x), avgRanks(y));
  return freeze({ ok: true, n: x.length, rho: r === null ? null : r6(r), strength: strengthOf(r),
    note: r === null ? "zero variance (all tied in a sample) ⇒ ρ UNDEFINED, not forced" : "Spearman ρ = Pearson of average ranks (tie-correct); measures MONOTONIC order association — NOT causation/accuracy/linear agreement on raw values." });
}

/** kendall(x, y) -> { ok, n, tau, concordant, discordant, strength, note }. Kendall's τ-b (tie-corrected). */
function kendall(x: any, y: any): any {
  const err = validatePair(x, y); if (err) return freeze({ ok: false, ...err });
  const n = x.length;
  let nc = 0, nd = 0, tx = 0, ty = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const dx = Math.sign(x[i] - x[j]), dy = Math.sign(y[i] - y[j]);
    if (dx === 0 && dy === 0) { tx++; ty++; }       // tied in both — counts toward BOTH tie corrections
    else if (dx === 0) tx++;                         // tied in x only
    else if (dy === 0) ty++;                         // tied in y only
    else if (dx === dy) nc++;                        // concordant
    else nd++;                                       // discordant
  }
  const n0 = (n * (n - 1)) / 2;
  const denom = Math.sqrt((n0 - tx) * (n0 - ty));
  const tau = denom === 0 ? null : (nc - nd) / denom;
  return freeze({ ok: true, n, tau: tau === null ? null : r6(tau), concordant: nc, discordant: nd, strength: strengthOf(tau),
    note: tau === null ? "all pairs tied on one side ⇒ τ UNDEFINED, not forced" : "Kendall's τ-b (tie-corrected); measures MONOTONIC order association — NOT causation/accuracy. Concordant − discordant over the tie-adjusted pair count." });
}

const RANK_CORRELATION_CONTRACT = Object.freeze({
  id: "P6-RANK-CORRELATION",
  purpose: "rank correlation (Spearman ρ, Kendall τ-b) — do two evaluators ORDER items the same way? (distinct from κ categorical agreement and McNemar paired-binary)",
  reuses: Object.freeze(["complements odg-inter-rater-agreement (κ=categorical) + eval-significance (CIs) — ordering, not label-match"]),
  invariants: Object.freeze([
    "Spearman ρ = PEARSON of AVERAGE RANKS (tie-correct) — NOT the 1−6Σd²/(n(n²−1)) shortcut (invalid with ties)",
    "Kendall τ-b (tie-corrected) — √((n0−tx)(n0−ty)) denominator, not τ-a",
    "measures MONOTONIC ORDER association — NOT causation, NOT accuracy, NOT linear agreement on raw values",
    "zero variance (all tied) ⇒ correlation UNDEFINED (null + flagged), never forced to 0/1",
    "strength label is a rough convention (negligible/weak/moderate/strong), not a verdict",
    "fail-closed: unequal length / n<3 / non-finite ⇒ typed refusal (no imputation); PURE/deterministic; no clock/randomness",
  ]),
});

module.exports = { avgRanks, spearman, kendall, strengthOf, RANK_CORRELATION_CONTRACT };
export {};
