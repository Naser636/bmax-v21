#!/usr/bin/env node
"use strict";
/*
 * CYCLE HYPOTHESIS VERDICT — adjudicate an evolution/improvement cycle's PRE-REGISTERED prediction against its
 * MEASURED delta. PURE, deterministic, fail-closed, read-only. Composes odg-hypothesis-adjudicator.
 *
 * THE GAP (reconciled): evolution-loop.startCycle REQUIRES a falsifiable hypothesis up front (hypothesis +
 * refutationConditions + successCriteria), yet the loop's BASELINE_COMPARE stage only checks the GENERIC
 * measurement counts (regressed===0, improved>0) — it NEVER tests the cycle's own prediction against the measured
 * delta. So a cycle "succeeds" on ANY coincidental improvement; its prediction is never confirmed or refuted and
 * the loop never learns from being right or wrong. odg-hypothesis-adjudicator (the predicted-vs-measured step) had
 * ZERO non-test consumers. This closes the loop: it makes the adjudicator LIVE over cycle records, WITHOUT altering
 * any tested loop (read-only; promotes nothing, re-measures nothing).
 *
 * Pre-registration is GENUINE here: the structured prediction lives in the hypothesis recorded at startCycle — i.e.
 * BEFORE the experiment's measurement. The real cycle timestamps (createdAt < the measurement-stage time) are passed
 * to the adjudicator, which enforces preRegisteredAt < measuredAt. A cycle whose hypothesis carries NO structured
 * prediction (signal + direction) is INCONCLUSIVE — never counted as confirmed (the author's expectation never
 * grades itself). No network/clock/randomness.
 */

const ADJ = require("./odg-hypothesis-adjudicator.js") as {
  adjudicateHypothesis: (prediction: any, measured: any) => any;
  VERDICT: Record<string, string>;
};

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function toMs(v: any): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") { const t = Date.parse(v); return Number.isFinite(t) ? t : null; }
  return null;
}
// The cycle's latest recorded timestamp (post-measurement) — history grows append-only, so the tip is ≥ createdAt.
function measuredAtOf(cycle: any): number | null {
  const h = Array.isArray(cycle.history) ? cycle.history : [];
  for (let i = h.length - 1; i >= 0; i--) { const t = toMs(h[i] && h[i].at); if (t !== null) return t; }
  return null;
}

/**
 * adjudicateCycle(cycle) -> { ok, cycleId, verdict, adjudicable, reason, prediction, adjudication }.
 * Extracts cycle.hypothesis.prediction ({ signal, direction:"improved"|"regressed", magnitude? }) and adjudicates it
 * against cycle.measurement (a measureDelta result {metrics}) via odg-hypothesis-adjudicator, with preRegisteredAtMs
 * = cycle.createdAt and measuredAtMs = the cycle's latest history timestamp. A cycle without a structured prediction,
 * or without a measurement, is INCONCLUSIVE + adjudicable:false.
 */
function adjudicateCycle(cycle: any): any {
  if (!isObj(cycle)) return freeze({ ok: false, code: "BAD_CYCLE", detail: "cycle must be an object record" });
  const cycleId = cycle.id !== undefined ? cycle.id : null;
  const h = isObj(cycle.hypothesis) ? cycle.hypothesis : null;
  const pred = h && isObj(h.prediction) ? h.prediction : null;

  if (!pred || typeof pred.signal !== "string" || (pred.direction !== "improved" && pred.direction !== "regressed"))
    return freeze({ ok: true, cycleId, verdict: ADJ.VERDICT.INCONCLUSIVE, adjudicable: false, reason: "cycle hypothesis carries no structured pre-registered prediction (signal + direction) — nothing to adjudicate (never counted as confirmed)", prediction: null, adjudication: null });
  if (!isObj(cycle.measurement))
    return freeze({ ok: true, cycleId, verdict: ADJ.VERDICT.INCONCLUSIVE, adjudicable: false, reason: "cycle has no measurement (measureDelta result) — cannot adjudicate", prediction: freeze({ signal: pred.signal, direction: pred.direction, magnitude: pred.magnitude ?? null }), adjudication: null });

  const prediction = {
    signal: pred.signal,
    direction: pred.direction,
    magnitude: pred.magnitude,
    preRegistered: true, // the prediction lives in the hypothesis recorded at startCycle (before measurement)
    preRegisteredAtMs: toMs(cycle.createdAt) ?? undefined,
    measuredAtMs: measuredAtOf(cycle) ?? undefined,
  };
  const adjudication = ADJ.adjudicateHypothesis(prediction, cycle.measurement);
  return freeze({
    ok: true,
    cycleId,
    verdict: adjudication.verdict !== undefined ? adjudication.verdict : ADJ.VERDICT.INCONCLUSIVE,
    adjudicable: adjudication.ok === true,
    reason: adjudication.reason !== undefined ? adjudication.reason : (adjudication.detail || "adjudication failed"),
    prediction: freeze({ signal: pred.signal, direction: pred.direction, magnitude: pred.magnitude ?? null }),
    adjudication,
  });
}

/**
 * adjudicateCycles(cycles) -> { ok, total, adjudicable, confirmed, refuted, inconclusive, confirmedRateOfAdjudicable, verdicts[] }.
 * Batch roll-up over cycle records. The confirmed rate is over ADJUDICABLE cycles ONLY (those carrying a structured
 * pre-registered prediction AND a measurement) — explicit denominator, NO blended score; non-adjudicable cycles are
 * reported separately, never counted as confirmed.
 */
function adjudicateCycles(cycles: any): any {
  if (!Array.isArray(cycles)) return freeze({ ok: false, code: "BAD_INPUT", detail: "cycles must be an array" });
  const verdicts = cycles.map((c) => adjudicateCycle(c));
  const adjudicable = verdicts.filter((v: any) => v.adjudicable === true);
  const confirmed = adjudicable.filter((v: any) => v.verdict === ADJ.VERDICT.CONFIRMED).length;
  const refuted = adjudicable.filter((v: any) => v.verdict === ADJ.VERDICT.REFUTED).length;
  const inconclusive = adjudicable.length - confirmed - refuted;
  return freeze({
    ok: true,
    total: verdicts.length,
    adjudicable: adjudicable.length,
    confirmed,
    refuted,
    inconclusive,
    confirmedRateOfAdjudicable: adjudicable.length > 0 ? Number((confirmed / adjudicable.length).toFixed(4)) : null,
    verdicts: freeze(verdicts),
    note: "confirmed rate is over ADJUDICABLE cycles ONLY (a structured pre-registered prediction + a measurement); non-adjudicable cycles are reported separately and NEVER counted as confirmed. CONFIRMED requires the measured delta to match the pre-registered prediction (direction + magnitude); the author's expectation never confirms itself. No blended score.",
  });
}

const CYCLE_HYPOTHESIS_VERDICT_CONTRACT = Object.freeze({
  id: "CYCLE-HYPOTHESIS-VERDICT",
  purpose: "adjudicate an evolution/improvement cycle's PRE-REGISTERED prediction against its MEASURED delta — makes odg-hypothesis-adjudicator live over cycle records and closes the self-improvement learning loop (evolution-loop BASELINE_COMPARE only checks generic improved/regressed, never the prediction)",
  reuses: Object.freeze(["odg-hypothesis-adjudicator.adjudicateHypothesis (predicted-vs-measured — not reimplemented)", "consumes evolution-loop cycle records (hypothesis.prediction + measurement + createdAt + history); composes with improvement-baseline.measureDelta upstream"]),
  invariants: Object.freeze([
    "read-only — adjudicates a SUPPLIED cycle record; promotes nothing, re-measures nothing, mutates nothing",
    "pre-registration is genuine: the structured prediction lives in the hypothesis recorded at startCycle (before measurement); createdAt < measurement-stage time is enforced via the adjudicator when timestamps resolve",
    "CONFIRMED only when the measured delta matches the pre-registered prediction (direction + magnitude); the author's expectation never confirms itself",
    "a cycle without a structured prediction (signal + direction) or without a measurement ⇒ INCONCLUSIVE + adjudicable:false — never counted as confirmed",
    "the batch confirmed rate is over ADJUDICABLE cycles ONLY (explicit denominator, no blended score); PURE/deterministic/frozen/clock-free",
  ]),
});

module.exports = { adjudicateCycle, adjudicateCycles, CYCLE_HYPOTHESIS_VERDICT_CONTRACT };
export {};
