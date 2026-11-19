#!/usr/bin/env node
"use strict";
/*
 * CALIBRATED P(success) for the planner. PURE, deterministic, fail-closed. Composes calibration.calibratedEstimate.
 *
 * THE GAP (reconciled): plan-evaluator.scorePlan consumes each mission's `Psuccess` as a raw [0,1] benefit factor.
 * continuous-planner.estimateSuccess feeds it `accepted / total` from history — and LABELS that "calibrated from N
 * verified observation(s)" while applying NO survivorship-bias guard and NO sample-size degradation. calibration.ts
 * DOES implement exactly that guard (calibratedEstimate → quality CALIBRATED|DEGRADED|BIASED|UNKNOWN) but is never
 * wired into planning. So a source with many successes and ~zero recorded failures (survivorship-biased) yields an
 * over-confident P(success) ≈ 1.0 that inflates a plan's score. This module is the HONEST estimator that closes the
 * hole: it routes mission history through calibration and only serves a usable Psuccess when the estimate is actually
 * CALIBRATED; otherwise the planner gets null ⇒ 0 success-credit (fail-closed).
 *
 * Honesty: A PLAN IS A HYPOTHESIS, NOT A RESULT. The raw success RATE (measuredP) is reported for transparency but is
 * NOT the same as a usable confidence. pForPlanner is non-null ONLY for a CALIBRATED estimate (sufficient sample, with
 * recorded failures, not stale); a biased / thin / stale history never earns a flattering default. No network/clock/rng.
 */

const CAL = require("./calibration.js") as {
  calibratedEstimate: (raw: any, opts?: any) => { p: number | null; quality: string; uncertainty: number | null; reason: string };
  MIN_OBSERVATIONS: number;
};

function freeze<T>(o: T): T { return Object.freeze(o) as T; }

// Count decided outcomes for a mission type. ACCEPTED/VALIDATED/verified===true ⇒ success; REJECTED/FAILED/
// verified===false ⇒ failure. OPEN/PENDING/anything undecided is NOT counted as an outcome (not a success, not a
// failure) — an undecided mission must never pad the success rate.
function tally(missionType: any, history: any[]): { observations: number; successes: number; failures: number } {
  let successes = 0, failures = 0;
  for (const i of history) {
    if (!i || typeof i !== "object") continue;
    if (missionType != null && i.missionType !== missionType && i.type !== missionType) continue;
    const st = i.status;
    const success = st === "ACCEPTED" || st === "VALIDATED" || i.verified === true;
    const failure = st === "REJECTED" || st === "FAILED" || i.verified === false;
    if (success && !failure) successes++;
    else if (failure && !success) failures++;
    // ambiguous (both or neither) ⇒ not counted
  }
  return { observations: successes + failures, successes, failures };
}

/**
 * derivePsuccess(missionType, history, opts?) ->
 *   { ok, missionType, observations, successes, failures, measuredP, quality, pForPlanner, uncertainty, basis, reason, note }
 *
 * `history`: array of prior mission records, each e.g. { missionType|type, status|verified, ... }.
 * `measuredP`  = raw successes/observations (transparency; may be biased/thin — NOT necessarily usable).
 * `quality`    = calibration verdict: CALIBRATED | DEGRADED | BIASED | UNKNOWN.
 * `pForPlanner`= the value plan-evaluator may consume as Psuccess: measuredP ONLY when CALIBRATED, else null
 *                (⇒ the planner's benefit() reads it as 0 success-credit — fail-closed, never a biased default).
 * opts: { source?, ageDays?, maxAgeDays? } forwarded to calibration.
 */
function derivePsuccess(missionType: any, history: any, opts: any = {}): any {
  if (!Array.isArray(history)) return freeze({ ok: false, code: "BAD_HISTORY", detail: "history must be an array of prior mission records" });
  const t = tally(missionType, history);
  const measuredP = t.observations > 0 ? Number((t.successes / t.observations).toFixed(4)) : null;
  const est = CAL.calibratedEstimate(
    { p: measuredP, observations: t.observations, successes: t.successes, failures: t.failures, source: typeof opts.source === "string" ? opts.source : "mission-history", ageDays: opts.ageDays },
    { maxAgeDays: opts.maxAgeDays },
  );
  const pForPlanner = est.quality === "CALIBRATED" ? est.p : null;
  return freeze({
    ok: true,
    missionType: missionType == null ? null : missionType,
    observations: t.observations,
    successes: t.successes,
    failures: t.failures,
    measuredP,
    quality: est.quality,
    pForPlanner,
    uncertainty: est.uncertainty,
    basis: est.quality === "CALIBRATED" ? "CALIBRATED_HISTORY" : est.quality,
    authorizes: false, // an estimate NEVER authorizes an action — it only informs the planner's benefit factor
    reason: est.reason,
    note: "measuredP is the raw success RATE (transparency); pForPlanner is non-null ONLY when the estimate is CALIBRATED (≥MIN_OBSERVATIONS with recorded failures, not stale). A survivorship-biased (successes, ~0 failures), thin, or stale history ⇒ quality≠CALIBRATED ⇒ pForPlanner=null ⇒ the planner grants 0 success-credit (fail-closed), never a flattering biased default. A plan is a hypothesis, not a result; this estimate AUTHORIZES NOTHING.",
  });
}

const CALIBRATED_PSUCCESS_CONTRACT = Object.freeze({
  id: "CALIBRATED-PSUCCESS",
  purpose: "serve plan-evaluator a P(success) that survives a survivorship-bias + sample-size guard — the honest replacement for continuous-planner.estimateSuccess's raw accepted/total ratio mislabeled 'calibrated'",
  reuses: Object.freeze(["calibration.calibratedEstimate (bias/sample/staleness verdict — not reimplemented)", "plan-evaluator MAY consume pForPlanner as the Psuccess benefit factor — this module is standalone and is NOT wired into the planner here"]),
  invariants: Object.freeze([
    "measuredP (raw success RATE) ≠ usable confidence; pForPlanner is non-null ONLY when the estimate is CALIBRATED",
    "survivorship-biased history (successes with ~0 recorded failures) ⇒ quality BIASED ⇒ pForPlanner=null — a biased rate is never served as planner confidence",
    "thin (< MIN_OBSERVATIONS) or stale history ⇒ DEGRADED ⇒ pForPlanner=null; no observations ⇒ UNKNOWN ⇒ null",
    "pForPlanner=null makes plan-evaluator grant 0 success-credit — fail-closed; an under-evidenced plan is never favoured by a flattering default (a plan is a hypothesis, not a result)",
    "only DECIDED outcomes are counted (ACCEPTED/VALIDATED/verified⇒success, REJECTED/FAILED/¬verified⇒failure); OPEN/PENDING never pad the rate; PURE/deterministic/frozen",
  ]),
});

module.exports = { derivePsuccess, CALIBRATED_PSUCCESS_CONTRACT };
export {};
