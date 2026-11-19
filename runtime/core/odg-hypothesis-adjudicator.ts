#!/usr/bin/env node
"use strict";
/*
 * PRE-REGISTERED HYPOTHESIS ADJUDICATOR. PURE, deterministic, fail-closed. Composes improvement-baseline.measureDelta.
 *
 * THE GAP (reconciled): self-diagnostic.hypothesize proposes a candidate cause + the smallest discriminating test;
 * improvement-baseline.measureDelta measures a before→after delta; reuse-ledger.classifyReuseOutcome grades a delta;
 * champion-challenger-arbiter picks the best-of-N. But nothing records a PREDICTION *before* the experiment and
 * adjudicates the hypothesis against it. This closes the self-improvement loop: state a prediction (signal +
 * direction, optional minimum magnitude) up front, run the experiment, then CONFIRM / REFUTE / leave INCONCLUSIVE.
 *
 * Honesty invariants (the whole point):
 *   - The prediction must be PRE-REGISTERED (stated before measuring). A prediction that is not pre-registered CANNOT
 *     confirm or refute — the author's expectation never grades itself. We require an explicit attestation
 *     (preRegistered:true) and, if timestamps are given, preRegisteredAtMs < measuredAtMs.
 *   - CONFIRMED only when the MEASURED direction matches the PRE-REGISTERED predicted direction (and, if a magnitude
 *     was predicted, the measured |delta| meets it). A measured result in the OPPOSITE direction ⇒ REFUTED. No
 *     measured change (flat / unmeasured) ⇒ INCONCLUSIVE — never confirmed by expectation.
 * No network/clock/randomness (caller supplies any timestamps).
 */

const IB = require("./improvement-baseline.js") as {
  measureDelta: (before: any, after: any, senseMap?: any) => { metrics: Record<string, any>; summary: any };
};

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

const VERDICT = Object.freeze({ CONFIRMED: "CONFIRMED", REFUTED: "REFUTED", INCONCLUSIVE: "INCONCLUSIVE" });

// A prediction is validly pre-registered if it attests preRegistered:true AND, when both timestamps are supplied,
// the prediction was registered strictly before the measurement (no back-dating a post-hoc prediction).
function preRegisteredOK(prediction: any): { ok: boolean; reason: string } {
  if (prediction.preRegistered !== true) return { ok: false, reason: "prediction is not attested pre-registered (preRegistered:true) — a post-hoc prediction cannot confirm or refute a hypothesis" };
  const p = Number(prediction.preRegisteredAtMs), m = Number(prediction.measuredAtMs);
  if (Number.isFinite(p) && Number.isFinite(m) && !(p < m)) return { ok: false, reason: `pre-registration timestamp (${p}) is not before measurement (${m}) — cannot treat as pre-registered` };
  return { ok: true, reason: "" };
}

/**
 * adjudicateHypothesis(prediction, measured) -> { ok, verdict, preRegistered, signal, predicted, measured, reason, note }.
 *   prediction: { signal, direction ("improved"|"regressed"), magnitude?: number (min |delta|), preRegistered,
 *                 preRegisteredAtMs?, measuredAtMs? }.
 *   measured:   an improvement-baseline.measureDelta result ({ metrics: { <signal>: {before,after,delta,direction} } }).
 */
function adjudicateHypothesis(prediction: any, measured: any): any {
  if (!isObj(prediction)) return freeze({ ok: false, code: "BAD_PREDICTION", detail: "prediction must be an object" });
  const signal = typeof prediction.signal === "string" ? prediction.signal : null;
  const dir = prediction.direction;
  if (!signal) return freeze({ ok: false, code: "BAD_PREDICTION", detail: "prediction.signal (string) required" });
  if (dir !== "improved" && dir !== "regressed") return freeze({ ok: false, code: "BAD_PREDICTION", detail: 'prediction.direction must be "improved" or "regressed"' });
  const hasMag = prediction.magnitude !== undefined && prediction.magnitude !== null;
  if (hasMag && !(typeof prediction.magnitude === "number" && Number.isFinite(prediction.magnitude) && prediction.magnitude >= 0))
    return freeze({ ok: false, code: "BAD_PREDICTION", detail: "prediction.magnitude, if given, must be a finite number ≥ 0" });
  const metrics = isObj(measured) && isObj(measured.metrics) ? measured.metrics : (isObj(measured) ? measured : null);
  if (!metrics) return freeze({ ok: false, code: "BAD_MEASURED", detail: "measured must be a measureDelta result ({metrics}) or a metrics map" });

  const predicted = freeze({ direction: dir, magnitude: hasMag ? prediction.magnitude : null });
  const metric = metrics[signal];
  const base = { ok: true as const, signal, predicted };

  // pre-registration gate — a non-pre-registered prediction is methodologically void (never CONFIRMED/REFUTED)
  const pre = preRegisteredOK(prediction);

  // signal not measured ⇒ INCONCLUSIVE regardless (cannot adjudicate what wasn't measured)
  if (!isObj(metric) || metric.direction === "unmeasured" || metric.direction === undefined)
    return freeze({ ...base, verdict: VERDICT.INCONCLUSIVE, preRegistered: pre.ok, measured: null, reason: `signal "${signal}" was not measured — cannot adjudicate`, note: NOTE });

  const measuredOut = freeze({ direction: metric.direction, delta: metric.delta, before: metric.before, after: metric.after });

  if (!pre.ok)
    return freeze({ ...base, verdict: VERDICT.INCONCLUSIVE, preRegistered: false, measured: measuredOut, reason: pre.reason, note: NOTE });

  // flat ⇒ no measured change ⇒ INCONCLUSIVE (expectation never confirms)
  if (metric.direction === "flat")
    return freeze({ ...base, verdict: VERDICT.INCONCLUSIVE, preRegistered: true, measured: measuredOut, reason: "no measured change (flat) — neither confirms nor refutes", note: NOTE });

  // opposite direction ⇒ REFUTED
  if (metric.direction !== dir)
    return freeze({ ...base, verdict: VERDICT.REFUTED, preRegistered: true, measured: measuredOut, reason: `measured ${metric.direction} contradicts the pre-registered prediction (${dir})`, note: NOTE });

  // direction matches — check magnitude if one was predicted
  if (hasMag && Math.abs(metric.delta) < prediction.magnitude)
    return freeze({ ...base, verdict: VERDICT.INCONCLUSIVE, preRegistered: true, measured: measuredOut, reason: `direction matched but |delta| ${Math.abs(metric.delta)} < predicted magnitude ${prediction.magnitude} — under-powered / partial`, note: NOTE });

  return freeze({ ...base, verdict: VERDICT.CONFIRMED, preRegistered: true, measured: measuredOut, reason: hasMag ? `measured ${metric.direction} with |delta| ${Math.abs(metric.delta)} ≥ ${prediction.magnitude} — matches the pre-registered prediction` : `measured ${metric.direction} matches the pre-registered prediction`, note: NOTE });
}

const NOTE = "CONFIRMED requires a PRE-REGISTERED prediction whose direction (and, if given, minimum magnitude) matches the MEASURED delta; the author's expectation never confirms itself. Opposite direction ⇒ REFUTED; flat/unmeasured or a non-pre-registered prediction ⇒ INCONCLUSIVE.";

/** adjudicateFromBaselines(prediction, before, after, senseMap) — convenience: measure via the REAL
 * improvement-baseline.measureDelta, then adjudicate. */
function adjudicateFromBaselines(prediction: any, before: any, after: any, senseMap?: any): any {
  return adjudicateHypothesis(prediction, IB.measureDelta(before, after, senseMap));
}

const HYPOTHESIS_ADJUDICATOR_CONTRACT = Object.freeze({
  id: "HYPOTHESIS-ADJUDICATOR",
  purpose: "adjudicate a PRE-REGISTERED prediction against a measured before→after delta (CONFIRMED/REFUTED/INCONCLUSIVE) — the predicted-vs-measured step self-diagnostic/improvement-baseline/reuse-ledger/champion-challenger do not provide",
  reuses: Object.freeze(["improvement-baseline.measureDelta (sense-aware before→after direction — not reimplemented)", "pairs with self-diagnostic.hypothesize which proposes the discriminating test"]),
  invariants: Object.freeze([
    "the prediction must be PRE-REGISTERED (attested preRegistered:true; if timestamps given, registered strictly before measurement) — a post-hoc prediction can NEVER confirm or refute",
    "CONFIRMED only when the MEASURED direction matches the pre-registered predicted direction AND (if predicted) |delta| ≥ the predicted magnitude — the author's expectation never confirms itself",
    "measured OPPOSITE direction ⇒ REFUTED; flat / unmeasured / not-pre-registered ⇒ INCONCLUSIVE (never silently CONFIRMED)",
    "direction matched but magnitude below the predicted minimum ⇒ INCONCLUSIVE (under-powered / partial), not CONFIRMED",
    "composes improvement-baseline.measureDelta; adjudicates a SUPPLIED result — makes no measurement of its own; PURE/deterministic/frozen/clock-free",
  ]),
});

module.exports = { adjudicateHypothesis, adjudicateFromBaselines, VERDICT, HYPOTHESIS_ADJUDICATOR_CONTRACT };
export {};
