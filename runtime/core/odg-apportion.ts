#!/usr/bin/env node
"use strict";
/*
 * EXACT PROPORTIONAL APPORTIONMENT (largest-remainder / Hamilton method). PURE, deterministic, fail-closed.
 *
 * THE GAP (reconciled): odg-btp-invoice-schedule has a NARROW case (last acompte line absorbs the remainder so a
 * schedule sums exactly); nothing provides a reusable split of an integer total by arbitrary weights. This does — e.g.
 * allocate a global discount/rebate across invoice lines, split shared overhead across chantiers, or pro-rate a VAT base.
 *
 * The guarantee: the integer parts sum EXACTLY to the total — no minor unit (centime) is created or lost. The remainder
 * left by flooring the ideal shares is distributed to the entries with the LARGEST fractional remainders (ties broken by
 * lowest index, deterministically).
 *
 * Honesty: this is the LARGEST-REMAINDER (Hamilton) method — ONE valid apportionment rule, NOT a fairness guarantee: it
 * is subject to the known apportionment paradoxes (Alabama / population / new-state), and divisor methods (Jefferson/
 * D'Hondt, Webster/Sainte-Laguë) distribute differently. It allocates a SUPPLIED total by SUPPLIED weights; it makes no
 * claim the split is "fair" beyond summing exactly. Fail-closed: negative total/weight, all-zero weights ⇒ refusal.
 * No network/clock/randomness.
 */

function isNonNegInt(v: any): boolean { return typeof v === "number" && Number.isSafeInteger(v) && v >= 0; }
function isNonNegFinite(v: any): boolean { return typeof v === "number" && Number.isFinite(v) && v >= 0; }
function freeze(o: any): any { return Object.freeze(o); }

/**
 * apportion(totalMinor, weights) -> { ok, totalMinor, parts[], sumsExactly, method, note }.
 * Splits the non-negative integer total into integer parts proportional to the non-negative weights, summing EXACTLY to
 * the total (largest-remainder). Fail-closed: non-array/empty weights, any negative/non-finite weight, all-zero weights,
 * or a bad total ⇒ typed refusal.
 */
function apportion(totalMinor: any, weights: any): any {
  if (!isNonNegInt(totalMinor)) return freeze({ ok: false, code: "BAD_TOTAL", detail: "totalMinor must be a non-negative safe integer (centimes)" });
  if (!Array.isArray(weights) || weights.length === 0) return freeze({ ok: false, code: "NO_WEIGHTS" });
  if (!weights.every(isNonNegFinite)) return freeze({ ok: false, code: "BAD_WEIGHT", detail: "every weight must be a finite number ≥ 0" });
  const sumW = weights.reduce((a: number, b: number) => a + b, 0);
  if (sumW <= 0) return freeze({ ok: false, code: "ZERO_WEIGHTS", detail: "weights sum to 0 — cannot apportion proportionally" });

  const n = weights.length;
  const ideal = weights.map((w: number) => totalMinor * (w / sumW));        // ≤ total ⇒ no overflow
  const base = ideal.map((x: number) => Math.floor(x));
  let distributed = base.reduce((a: number, b: number) => a + b, 0);
  let remainder = totalMinor - distributed;                                  // units still to hand out (0 ≤ remainder < n)
  // rank indices by fractional part desc, then by index asc (deterministic tie-break)
  const order = ideal.map((x: number, i: number) => ({ i, frac: x - base[i] }))
    .sort((a: any, b: any) => b.frac - a.frac || a.i - b.i);
  const parts = base.slice();
  for (let k = 0; k < order.length && remainder > 0; k++) { parts[order[k].i] += 1; remainder -= 1; }

  const sum = parts.reduce((a: number, b: number) => a + b, 0);
  return freeze({ ok: true, totalMinor, parts: freeze(parts), sumsExactly: sum === totalMinor, method: "largest-remainder",
    note: "integer parts sum EXACTLY to the total (no minor unit created or lost); largest-remainder (Hamilton), deterministic tie-break (lowest index). ONE valid method — NOT a fairness guarantee; subject to apportionment paradoxes; divisor methods (Jefferson/Webster) differ." });
}

const APPORTION_CONTRACT = Object.freeze({
  id: "APPORTION-LARGEST-REMAINDER",
  purpose: "split an integer total by weights into integer parts summing EXACTLY to the total (largest-remainder) — reusable beyond invoice-schedule's narrow last-line-absorbs case",
  reuses: Object.freeze(["integer minor-unit convention; composes with billing/discount/overhead allocation"]),
  invariants: Object.freeze([
    "the integer parts sum EXACTLY to the total — no minor unit is created or lost (by construction)",
    "largest-remainder (Hamilton): floor ideal shares, then give the leftover units to the largest fractional remainders; ties → lowest index (deterministic)",
    "ONE valid apportionment method — NOT a fairness guarantee; subject to Alabama/population paradoxes; divisor methods distribute differently",
    "allocates a SUPPLIED total by SUPPLIED weights — makes no claim the split is 'fair' beyond summing exactly",
    "fail-closed: negative/non-integer total, non-array/empty weights, negative/non-finite weight, all-zero weights ⇒ typed refusal; PURE/deterministic",
  ]),
});

module.exports = { apportion, APPORTION_CONTRACT };
export {};
