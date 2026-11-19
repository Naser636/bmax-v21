#!/usr/bin/env node
"use strict";
/*
 * DATA-DRIFT VIEW — composes the two complementary, DISTINCT drift detectors into one assessment. PURE, deterministic,
 * fail-closed. MODIFIES NEITHER.
 *
 *  - p4-distribution-drift.psi : Population Stability Index over BINNED/categorical distributions (threshold heuristic;
 *    bins by distinct value ⇒ best for categorical or pre-binned data).
 *  - odg-ks-test.ksTwoSample   : two-sample Kolmogorov–Smirnov — DISTRIBUTION-FREE, no binning, for raw CONTINUOUS data
 *    (asymptotic p-value; small-sample caveat).
 *
 * They answer "did the distribution drift?" by different means and can LEGITIMATELY DISAGREE (different sensitivities and
 * data-type fit). This view runs BOTH on the same reference/current samples and reports a consensus cross-reference —
 * surfacing disagreement rather than hiding it or silently picking a winner.
 *
 * Honesty:
 *  - PSI and KS are COMPLEMENTARY; a DISAGREEMENT is a real, informative outcome (e.g. KS underpowered on a tiny sample
 *    while PSI's bins flag a shift) — reported, never resolved by fiat;
 *  - KS is NOT_MEASURED on non-numeric or <2-element data ⇒ the view falls back to PSI_ONLY (honest, not fabricated);
 *  - neither detector proves drift is "bad", causal, or action-required — this is a detection view, not a verdict;
 *  - fail-closed: both samples must be non-empty arrays; PURE/deterministic; no network/clock/randomness.
 */

const PSI = require("./p4-distribution-drift.js");
const KS = require("./odg-ks-test.js");

function freeze(o: any): any { return Object.freeze(o); }

/**
 * assessDrift(reference, current, opts?) -> { ok, psi, ks, consensus, drift, note }.
 * opts = { alpha? } (KS significance, default 0.05). Runs PSI (binned/categorical) AND KS (continuous) on the same
 * samples. consensus ∈ CONFIRMED_DRIFT | NO_DRIFT | DISAGREEMENT | PSI_ONLY. Fail-closed: empty/non-array ⇒ NO_DATA.
 */
function assessDrift(reference: any, current: any, opts: any): any {
  if (!Array.isArray(reference) || !Array.isArray(current) || reference.length === 0 || current.length === 0) {
    return freeze({ ok: false, code: "NO_DATA", detail: "reference and current must both be non-empty arrays" });
  }
  const alpha = opts && typeof opts.alpha === "number" && opts.alpha > 0 && opts.alpha < 1 ? opts.alpha : 0.05;

  const psi = PSI.psi(reference, current);                      // always returns a frozen result (categorical/binned)
  const ks = KS.ksTwoSample(reference, current, { alpha });      // {ok:false} on non-numeric / <2

  const psiSaysDrift = psi.drift !== "NONE";
  const ksMeasured = ks.ok === true;
  const ksSaysDrift = ksMeasured && ks.verdict === "DIFFERENT";

  let consensus: string, drift: string | null;
  if (!ksMeasured) {
    consensus = "PSI_ONLY"; drift = psiSaysDrift ? "DRIFT_DETECTED" : "NO_DRIFT_DETECTED";
  } else if (psiSaysDrift && ksSaysDrift) {
    consensus = "CONFIRMED_DRIFT"; drift = "DRIFT_DETECTED";
  } else if (!psiSaysDrift && !ksSaysDrift) {
    consensus = "NO_DRIFT"; drift = "NO_DRIFT_DETECTED";
  } else {
    consensus = "DISAGREEMENT"; drift = null;                   // inconclusive — detectors disagree
  }

  return freeze({ ok: true,
    psi: freeze({ psi: psi.psi, drift: psi.drift, bins: psi.bins }),
    ks: ksMeasured ? freeze({ measured: true, d: ks.d, pValue: ks.pValue, verdict: ks.verdict, smallSample: ks.smallSample })
                   : freeze({ measured: false, reason: ks.code || "NOT_MEASURED", detail: ks.detail || "KS needs ≥2 numeric values per sample (non-numeric/categorical ⇒ use PSI)" }),
    consensus, drift,
    detectedBy: freeze({ psi: psiSaysDrift, ks: ksMeasured ? ksSaysDrift : null }),
    note: "PSI (binned/categorical, threshold) + KS (distribution-free, continuous) are COMPLEMENTARY and can legitimately DISAGREE (reported, not resolved by fiat). KS NOT_MEASURED on non-numeric/<2 ⇒ PSI_ONLY. A detection, NOT a verdict that drift is bad/causal/actionable." });
}

const DATA_DRIFT_VIEW_CONTRACT = Object.freeze({
  id: "DATA-DRIFT-VIEW",
  purpose: "compose p4-distribution-drift.psi (binned) + odg-ks-test (distribution-free) into one drift assessment with an honest consensus cross-reference",
  reuses: Object.freeze(["p4-distribution-drift.psi", "odg-ks-test.ksTwoSample"]),
  invariants: Object.freeze([
    "composes BOTH drift detectors and MODIFIES NEITHER (no new drift math)",
    "PSI and KS are COMPLEMENTARY — a DISAGREEMENT is surfaced as an inconclusive outcome, never resolved by fiat",
    "KS NOT_MEASURED on non-numeric/<2 data ⇒ PSI_ONLY (honest fallback, not fabricated)",
    "a detection view, NOT a verdict that drift is bad/causal/action-required",
    "fail-closed: empty/non-array samples ⇒ NO_DATA; PURE/deterministic; no network/clock/randomness",
  ]),
});

module.exports = { assessDrift, DATA_DRIFT_VIEW_CONTRACT };
export {};
