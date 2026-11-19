#!/usr/bin/env node
"use strict";
/*
 * CONCENTRATION INDICES (HHI, Gini, effective-N, CRn) over a non-negative distribution. PURE, deterministic, fail-closed.
 *
 * THE GAP (reconciled): the only "concentration" logic in the repo is commercial-portfolio's crude single-threshold flag
 * (maxShare > 60% ⇒ HIGH) — a declared heuristic, not a concentration measure. No module computes a real index. This adds
 * the standard ones so questions like "is our revenue/cost/client-book dangerously concentrated?" get a reproducible
 * number (e.g. revenue per client → HHI/Gini/effective-N → the portfolio flag's proper backing).
 *
 * Standard definitions:
 *  - HHI (Herfindahl-Hirschman) = Σ sᵢ²  (sᵢ = share), range [1/n, 1]; antitrust scale ×10000; normalized = (HHI−1/n)/(1−1/n).
 *  - Gini = Σ (2i−n−1)·x₍ᵢ₎ / (n·Σx)   on ascending-sorted values, range [0, (n−1)/n].
 *  - effective-N (numbers-equivalent, inverse Simpson) = 1/HHI — "as concentrated as this many equal entities".
 *  - CRk (concentration ratio) = combined share of the top k.
 *
 * Honesty: a concentration index describes DISTRIBUTION SHAPE (how unevenly a total is split) — it is NOT a risk verdict
 * (high concentration is not automatically bad; context decides) and this module invents NO threshold (unlike the >60%
 * heuristic — the caller interprets). Values must be NON-NEGATIVE observables; empty/negative/all-zero ⇒ fail-closed
 * (concentration of nothing is UNDEFINED, never fabricated). No network/clock/randomness.
 */

function isNonNegFiniteNums(v: any): boolean { return Array.isArray(v) && v.length > 0 && v.every((x: any) => typeof x === "number" && Number.isFinite(x) && x >= 0); }
function freeze(o: any): any { return Object.freeze(o); }
function r4(n: number): number { return Number(n.toFixed(4)); }

/**
 * concentration(values) -> { ok, n, total, hhi, hhiPoints, normalizedHHI, gini, effectiveN, top1Share, sharesDesc, note }.
 * values = non-negative numbers (e.g. revenue per client). Fail-closed: empty/non-array ⇒ NO_VALUES; any negative/NaN ⇒
 * NEGATIVE_OR_INVALID; total 0 (all zero) ⇒ ZERO_TOTAL (concentration UNDEFINED, not fabricated).
 */
function concentration(values: any): any {
  if (!Array.isArray(values) || values.length === 0) return freeze({ ok: false, code: "NO_VALUES" });
  if (!isNonNegFiniteNums(values)) return freeze({ ok: false, code: "NEGATIVE_OR_INVALID", detail: "all values must be finite and ≥ 0 (no imputation of missing/negative)" });
  const n = values.length;
  const total = values.reduce((a: number, b: number) => a + b, 0);
  if (total === 0) return freeze({ ok: false, code: "ZERO_TOTAL", detail: "every value is 0 — concentration of a zero total is UNDEFINED" });
  const shares = values.map((x: number) => x / total);
  const hhi = shares.reduce((a: number, s: number) => a + s * s, 0);
  const asc = values.slice().sort((a: number, b: number) => a - b);
  let giniNum = 0; for (let i = 0; i < n; i++) giniNum += (2 * (i + 1) - n - 1) * asc[i]; // i is 1-based in the formula
  const gini = giniNum / (n * total);
  const normalizedHHI = n > 1 ? (hhi - 1 / n) / (1 - 1 / n) : null; // n=1 is trivially fully concentrated; normalized is undefined
  const sharesDesc = shares.slice().sort((a: number, b: number) => b - a);
  return freeze({ ok: true, n, total,
    hhi: r4(hhi), hhiPoints: Math.round(hhi * 10000), normalizedHHI: normalizedHHI === null ? null : r4(normalizedHHI),
    gini: r4(gini), effectiveN: r4(1 / hhi), top1Share: r4(sharesDesc[0]), sharesDesc: freeze(sharesDesc.map(r4)),
    note: "HHI/Gini/effective-N describe DISTRIBUTION SHAPE, not a risk verdict; no threshold invented (caller interprets). n=1 ⇒ normalizedHHI null (trivially concentrated). Standard definitions; values are non-negative observables." });
}

/** concentrationRatio(values, k) -> CRk = combined share of the top k values. Fail-closed on bad inputs. */
function concentrationRatio(values: any, k: any): any {
  if (!isNonNegFiniteNums(values)) return freeze({ ok: false, code: "NEGATIVE_OR_INVALID" });
  if (!(typeof k === "number" && Number.isSafeInteger(k) && k >= 1)) return freeze({ ok: false, code: "BAD_K", detail: "k must be a positive integer" });
  const total = values.reduce((a: number, b: number) => a + b, 0);
  if (total === 0) return freeze({ ok: false, code: "ZERO_TOTAL" });
  const desc = values.slice().sort((a: number, b: number) => b - a);
  const kk = Math.min(k, desc.length);
  const topSum = desc.slice(0, kk).reduce((a: number, b: number) => a + b, 0);
  return freeze({ ok: true, k: kk, requestedK: k, crK: r4(topSum / total), topSum, total,
    note: `CR${kk} = combined share of the top ${kk} of ${desc.length}` + (kk < k ? ` (k clamped: only ${desc.length} values)` : "") });
}

const CONCENTRATION_INDEX_CONTRACT = Object.freeze({
  id: "ANALYTICS-CONCENTRATION-INDEX",
  purpose: "standard concentration indices (HHI, Gini, effective-N, CRk) — the real measure behind commercial-portfolio's crude >60% maxShare heuristic",
  reuses: Object.freeze(["applies to any non-negative distribution (revenue/cost/supplier/client shares); backs commercial-portfolio's concentration flag with a proper index"]),
  invariants: Object.freeze([
    "indices describe DISTRIBUTION SHAPE — NOT a risk verdict; this module invents NO threshold (caller interprets)",
    "standard definitions: HHI=Σsᵢ², Gini=Σ(2i−n−1)x₍ᵢ₎/(n·Σx), effective-N=1/HHI, CRk=top-k share",
    "values must be NON-NEGATIVE observables; empty/negative/all-zero ⇒ fail-closed (concentration UNDEFINED, never fabricated)",
    "n=1 ⇒ normalizedHHI null (trivially concentrated; normalized is undefined) — not forced",
    "PURE + deterministic; no network/clock/randomness",
  ]),
});

module.exports = { concentration, concentrationRatio, CONCENTRATION_INDEX_CONTRACT };
export {};
