#!/usr/bin/env node
"use strict";
/*
 * BTP RÉVISION / ACTUALISATION DE PRIX (price-index revision). PURE, deterministic, fail-closed, integer minor units.
 *
 * THE GAP (reconciled): odg-btp-quote-revision is a quote VERSIONING/approval brick (reason + source + explicit
 * approval); it does NOT implement the BTP price-revision index FORMULA. No module computes the révision/actualisation
 * coefficient. This does: the classic marché formula
 *     P = P0 · ( a + Σ_i b_i · I1_i / I0_i )
 * where `a` is the terme fixe and each indexed term weights a published index ratio (current / base).
 *
 * Honesty: the revision coefficient K and the revised price are MODEL outputs — NEVER a billed, due, or collected
 * amount. The INDICES (INSEE BT/TP/…) and the COEFFICIENTS are CALLER-SUPPLIED; the legal minimum terme fixe and the
 * eligibility of a revision clause are CONTRACT/jurisdiction facts, NOT asserted here (this computes arithmetic, not
 * legal compliance). The coefficients (terme fixe + indexed) MUST sum to 1 — a well-formed revision formula — else
 * fail-closed. A missing / zero base index ⇒ refusal (no division by zero). No network/clock/randomness.
 */

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isNonNegInt(v: any): boolean { return typeof v === "number" && Number.isSafeInteger(v) && v >= 0; }
function isPosFinite(v: any): boolean { return typeof v === "number" && Number.isFinite(v) && v > 0; }
function isNonNegFinite(v: any): boolean { return typeof v === "number" && Number.isFinite(v) && v >= 0; }
const COEFF_SUM_EPS = 1e-9;

/**
 * revisePrice(input) -> { ok, baseAmountMinor, revisionCoefficient, revisedAmountMinor, deltaMinor, terms[], note } | refusal.
 *   input = { baseAmountMinor (P0, integer cents ≥ 0), fixedTermCoeff (a, 0..1),
 *             indexedTerms: [ { name?, coeff (b_i > 0), baseIndex (I0 > 0), currentIndex (I1 ≥ 0) } ] }.
 * K = a + Σ b_i·(I1_i/I0_i); revisedAmountMinor = round(P0·K). Fail-closed: coefficients not summing to 1, a bad/zero
 * base index, or any out-of-range value ⇒ typed refusal (indices/coefficients are caller-supplied, never assumed).
 */
function revisePrice(input: any): any {
  if (!isObj(input)) return freeze({ ok: false, code: "BAD_INPUT", detail: "input must be an object" });
  const base = input.baseAmountMinor;
  if (!isNonNegInt(base)) return freeze({ ok: false, code: "BAD_BASE_AMOUNT", detail: "baseAmountMinor (P0) must be a non-negative integer (minor units)" });
  const a = input.fixedTermCoeff;
  if (typeof a !== "number" || !Number.isFinite(a) || a < 0 || a > 1) return freeze({ ok: false, code: "BAD_FIXED_TERM", detail: "fixedTermCoeff (a) must be a finite number in [0,1] (caller-supplied — no legal minimum assumed)" });
  const terms = input.indexedTerms;
  if (!Array.isArray(terms) || terms.length === 0) return freeze({ ok: false, code: "NO_INDEXED_TERMS", detail: "indexedTerms must be a non-empty array of { coeff, baseIndex, currentIndex }" });

  const out: any[] = [];
  let coeffSum = a;
  let k = a;
  for (let i = 0; i < terms.length; i++) {
    const t = terms[i];
    if (!isObj(t)) return freeze({ ok: false, code: "BAD_TERM", detail: `indexedTerms[${i}] must be an object` });
    if (!isPosFinite(t.coeff)) return freeze({ ok: false, code: "BAD_TERM_COEFF", detail: `indexedTerms[${i}].coeff must be a finite number > 0` });
    if (!isPosFinite(t.baseIndex)) return freeze({ ok: false, code: "BAD_BASE_INDEX", detail: `indexedTerms[${i}].baseIndex (I0) must be a finite number > 0 (no division by zero)` });
    if (!isNonNegFinite(t.currentIndex)) return freeze({ ok: false, code: "BAD_CURRENT_INDEX", detail: `indexedTerms[${i}].currentIndex (I1) must be a finite number ≥ 0` });
    const ratio = t.currentIndex / t.baseIndex;
    const contribution = t.coeff * ratio;
    coeffSum += t.coeff;
    k += contribution;
    out.push(freeze({ name: typeof t.name === "string" ? t.name : `I${i + 1}`, coeff: t.coeff, baseIndex: t.baseIndex, currentIndex: t.currentIndex, ratio: Number(ratio.toFixed(6)), contribution: Number(contribution.toFixed(6)) }));
  }

  if (Math.abs(coeffSum - 1) > COEFF_SUM_EPS) return freeze({ ok: false, code: "BAD_COEFFICIENTS", detail: `coefficients (terme fixe + indexed) must sum to 1 — got ${Number(coeffSum.toFixed(6))}; a well-formed revision formula sums to 1` });

  const revised = Math.round(base * k);
  // Output-finiteness guard: finite inputs can still overflow to Infinity at extreme index magnitudes (e.g. a base
  // index ~1e-300 against a current index ~1e300). Never return a non-finite price in an ok:true envelope (fail-closed).
  if (!Number.isFinite(k) || !Number.isFinite(revised)) return freeze({ ok: false, code: "NON_FINITE_RESULT", detail: "K or the revised amount overflowed to a non-finite value (extreme index magnitudes) — refused" });
  return freeze({
    ok: true,
    baseAmountMinor: base,
    revisionCoefficient: Number(k.toFixed(6)),
    revisedAmountMinor: revised,
    deltaMinor: revised - base,
    terms: freeze(out),
    note: "K = a + Σ b·(I1/I0); revisedAmountMinor = round(P0·K). K and the revised price are MODEL outputs — NEVER a billed, due, or collected amount. Indices and coefficients are CALLER-SUPPLIED; the legal terme-fixe minimum and clause eligibility are not asserted here (arithmetic, not legal compliance).",
  });
}

const REVISION_PRIX_CONTRACT = Object.freeze({
  id: "BTP-REVISION-PRIX",
  purpose: "compute the BTP price-revision/actualisation coefficient K = a + Σ b·(I1/I0) and the revised price P = P0·K — the index FORMULA odg-btp-quote-revision (versioning/approval only) does not provide",
  reuses: Object.freeze(["integer minor-unit convention; composes with billing/devis as a model input (not a billed amount)"]),
  invariants: Object.freeze([
    "K and the revised price are MODEL outputs — NEVER a billed, due, or collected amount",
    "INDICES (INSEE BT/TP/…) and COEFFICIENTS are CALLER-SUPPLIED; the legal terme-fixe minimum and revision-clause eligibility are CONTRACT/jurisdiction facts, NOT asserted here (arithmetic, not legal compliance)",
    "the coefficients (terme fixe a + indexed b_i) MUST sum to 1 — a well-formed revision formula; otherwise fail-closed (BAD_COEFFICIENTS)",
    "a missing / zero / non-positive base index ⇒ refusal (NO division by zero); revisedAmountMinor = round(P0·K), integer minor units",
    "fail-closed: bad base amount / fixed term / term coeff / index ⇒ typed refusal; PURE/deterministic/frozen/clock-free",
  ]),
});

module.exports = { revisePrice, REVISION_PRIX_CONTRACT };
export {};
