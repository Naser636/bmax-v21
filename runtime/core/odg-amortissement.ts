#!/usr/bin/env node
"use strict";
/*
 * AMORTISSEMENT — asset depreciation schedule (linéaire + dégressif), prorata temporis. PURE, deterministic,
 * fail-closed, integer minor units. No clock/network/randomness.
 *
 * THE GAP (reconciled): no module computes an asset-depreciation schedule anywhere in runtime/ (the only
 * "amortiz*" is embodied CARBON in p13-software-carbon-intensity, not money; economic-model is empty;
 * net-cash-model applies flat social/income levies, not a depreciation schedule). Every company with fixed
 * assets needs one (BTP engins / véhicules / outillage included).
 *
 * Honesty: each line is a BOOK/ACCOUNTING allocation under the caller-supplied method, useful life, residual and
 * (for dégressif) coefficient — NOT a cash outflow, NOT a market/resale value, NOT a guaranteed fiscal deduction.
 * The dégressif coefficient, the useful life, the residual and the prorata convention are ALL CALLER-SUPPLIED; the
 * French régime defaults (1.25/1.75/2.25 by durée, mid-month/prorata conventions) are domain HINTS, NEVER hardcoded
 * as legal/fiscal truth. This module computes ARITHMETIC, not fiscal compliance. Invariants it guarantees: the sum
 * of depreciation == basis − residual EXACTLY (the final row absorbs rounding drift); the final closing == residual
 * EXACTLY; every row opening − depreciation == closing; accumulated is monotonic.
 */

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isPosInt(v: any): boolean { return typeof v === "number" && Number.isSafeInteger(v) && v > 0; }
function isNonNegInt(v: any): boolean { return typeof v === "number" && Number.isSafeInteger(v) && v >= 0; }

/**
 * computeDepreciationSchedule(input) -> { ok, method, basisMinor, residualMinor, rows[], totalDepreciatedMinor } | refusal.
 *   input = { basisMinor (>0 int), method "linear"|"declining", usefulLifeYears (>0 int), residualMinor? (default 0,
 *             0 ≤ residual < basis), decliningCoefficient? (REQUIRED & >0 for declining), firstYearProrataRatio?
 *             (default 1, in (0,1]), switchToLinearWhenBetter? (declining only, default false) }.
 * rows: per-year { year, openingMinor, depreciationMinor, accumulatedMinor, closingMinor }.
 */
function computeDepreciationSchedule(input: any): any {
  if (!isObj(input)) return freeze({ ok: false, code: "BAD_INPUT", detail: "input must be an object" });
  const basis = input.basisMinor;
  if (!isPosInt(basis)) return freeze({ ok: false, code: "INVALID_BASIS", detail: "basisMinor must be a positive integer (minor units)" });
  const method = input.method;
  if (method !== "linear" && method !== "declining") return freeze({ ok: false, code: "INVALID_METHOD", detail: 'method must be "linear" or "declining"' });
  const life = input.usefulLifeYears;
  if (!isPosInt(life)) return freeze({ ok: false, code: "INVALID_LIFE", detail: "usefulLifeYears must be a positive integer" });
  const residual = input.residualMinor === undefined ? 0 : input.residualMinor;
  if (!isNonNegInt(residual) || residual >= basis) return freeze({ ok: false, code: "INVALID_RESIDUAL", detail: "residualMinor must be a non-negative integer and strictly less than basisMinor" });
  const prorata = input.firstYearProrataRatio === undefined ? 1 : input.firstYearProrataRatio;
  if (typeof prorata !== "number" || !Number.isFinite(prorata) || prorata <= 0 || prorata > 1) return freeze({ ok: false, code: "INVALID_PRORATA", detail: "firstYearProrataRatio must be a finite number in (0,1]" });

  const depreciable = basis - residual; // the amount to allocate (above residual)
  const rawDeps: number[] = [];

  if (method === "linear") {
    const annual = depreciable / life;
    // year 1 is prorated; years 2..life full; if prorata < 1 the remainder spills into one extra year.
    rawDeps.push(annual * prorata);
    for (let y = 2; y <= life; y++) rawDeps.push(annual);
    if (prorata < 1) rawDeps.push(annual * (1 - prorata));
  } else {
    // declining (dégressif): rate = coefficient / life, applied to the REMAINING depreciable base (VNC above residual).
    const coeff = input.decliningCoefficient;
    if (coeff === undefined || coeff === null) return freeze({ ok: false, code: "MISSING_COEFFICIENT", detail: "decliningCoefficient (>0) is required for method 'declining' (caller-supplied; French 1.25/1.75/2.25 are not assumed)" });
    if (typeof coeff !== "number" || !Number.isFinite(coeff) || coeff <= 0) return freeze({ ok: false, code: "INVALID_COEFFICIENT", detail: "decliningCoefficient must be a finite number > 0" });
    const rate = coeff / life;
    const switchSL = input.switchToLinearWhenBetter === true;
    let remaining = depreciable;
    let switched = false;
    for (let y = 1; y <= life; y++) {
      if (y === life) { rawDeps.push(remaining); break; } // last year absorbs the remainder → closing == residual
      const yearsLeft = life - y + 1;
      let dep = remaining * rate * (y === 1 ? prorata : 1);
      if (switchSL || switched) {
        const sl = remaining / yearsLeft;
        if (switched || sl > dep) { dep = sl; switched = true; }
      }
      if (dep > remaining) dep = remaining;
      const depR = Math.round(dep);
      rawDeps.push(depR);
      remaining -= depR;
      if (remaining <= 0) { remaining = 0; break; }
    }
  }

  // round + make the sum EXACT by letting the final row absorb the drift (closing lands exactly on residual).
  const rounded = rawDeps.map((d) => Math.round(d));
  // trim trailing zeros that can appear if declining exhausted early
  while (rounded.length > 1 && rounded[rounded.length - 1] === 0 && rounded.reduce((a, b) => a + b, 0) === depreciable) rounded.pop();
  const sumSoFar = rounded.slice(0, -1).reduce((a, b) => a + b, 0);
  rounded[rounded.length - 1] = depreciable - sumSoFar; // final row absorbs drift

  const rows: any[] = [];
  let opening = basis;
  let accumulated = 0;
  for (let i = 0; i < rounded.length; i++) {
    const dep = rounded[i];
    accumulated += dep;
    const closing = opening - dep;
    rows.push(freeze({ year: i + 1, openingMinor: opening, depreciationMinor: dep, accumulatedMinor: accumulated, closingMinor: closing }));
    opening = closing;
  }

  return freeze({
    ok: true,
    method,
    basisMinor: basis,
    residualMinor: residual,
    rows: freeze(rows),
    totalDepreciatedMinor: accumulated, // == basis − residual exactly
    note: "each row is a BOOK allocation under the caller-supplied method/life/residual/coefficient — NOT a cash outflow, market value, or guaranteed fiscal deduction. Σ depreciation == basis − residual exactly (final row absorbs rounding); closing lands on residual. Coefficients/life/conventions are caller-supplied, never legal truth (arithmetic, not fiscal compliance).",
  });
}

const AMORTISSEMENT_CONTRACT = Object.freeze({
  id: "AMORTISSEMENT-SCHEDULE",
  purpose: "asset depreciation schedule (amortissement linéaire + dégressif, prorata temporis) in integer minor units — absent runtime-wide; every fixed-asset métier needs it",
  reuses: Object.freeze(["integer minor-unit convention; composes with net-cash-model / cost-accounting as a book input (not a cash flow)"]),
  invariants: Object.freeze([
    "each line is a BOOK/accounting allocation — NEVER a cash outflow, a market/resale value, or a guaranteed fiscal deduction",
    "the dégressif coefficient, useful life, residual and prorata convention are ALL CALLER-SUPPLIED — French régime defaults (1.25/1.75/2.25, mid-month) are hints, NEVER hardcoded as legal/fiscal truth (arithmetic, not fiscal compliance)",
    "Σ depreciation == basis − residual EXACTLY and the final closing == residual EXACTLY (the last row absorbs rounding drift); every row opening − depreciation == closing; accumulated is monotonic",
    "declining applies rate = coefficient/life to the REMAINING depreciable base; the final year absorbs the remainder; optional switch-to-linear when it depreciates more",
    "fail-closed: bad basis/method/life/residual/prorata, or a missing/invalid dégressif coefficient ⇒ typed refusal; PURE/deterministic/frozen/clock-free",
  ]),
});

module.exports = { computeDepreciationSchedule, AMORTISSEMENT_CONTRACT };
export {};
