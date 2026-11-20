#!/usr/bin/env node
"use strict";
/*
 * V327 §P3 — LOCAL-MODEL OUTCOME → CALIBRATED P(success). PURE, deterministic, fail-closed.
 *
 * WHY THIS IS A GENUINE (non-façade) CONNECTION: calibrated-P(success) is meaningful ONLY over a history with REAL
 * successes AND failures (its survivorship-bias + sample-size guards serve pForPlanner=null otherwise). The DETERMINISTIC
 * native catalog (odg-native-engineering) always accepts ⇒ a survivorship-biased all-success history ⇒ calibrated-P is
 * honestly BIASED/null there (documented in V324 §P3 as artificial-to-connect). ODG's OWN LOCAL MODEL
 * (ODG_LOCAL_MODEL_EXECUTION — qwen2.5-coder via native-project-builder, UNTRUSTED output accepted ONLY on the independent
 * test) genuinely produces a MIX of accept/reject ⇒ real probabilistic outcomes. THIS module maps those real outcomes into
 * the calibrated-P history and derives the honest verdict — making calibrated-P operationally meaningful on the one flow
 * where it has real signal. It composes odg-calibrated-psuccess (no re-implementation); it authorizes NOTHING.
 *
 * Honesty: `verified` is the INDEPENDENT verifier's real pass/fail (native-project-builder accepts ONLY on independentTest),
 * never the generator's self-report. The executor tier is ODG_LOCAL_MODEL_EXECUTION — ODG's own local compute, distinct
 * from the Claude-Code provider and from deterministic-native. No network/clock/randomness here (outcomes are supplied).
 */

const CP = require("./odg-calibrated-psuccess.js");

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

const EXECUTOR = "ODG_LOCAL_MODEL_EXECUTION";
const MISSION_TYPE = "ODG_LOCAL_MODEL";

/**
 * outcomeToRecord(o) -> a calibrated-P history record. o is a native-project-builder-style outcome
 * { verified:boolean, id?, model? }. Maps the INDEPENDENT verifier's verdict (verified) to the history's
 * success/failure signal; ambiguous/malformed ⇒ an unverified (failure-side) record is NOT fabricated — only a
 * boolean `verified` is honored (non-boolean ⇒ the record carries no decided outcome and is ignored by the tally).
 */
function outcomeToRecord(o: any): any {
  const verifiedKnown = typeof (o && o.verified) === "boolean";
  // carry an `at` timestamp (ISO string or epoch ms) when supplied, so belief-refresh.evidenceAgeDays can assess recency
  // (anti self-reinforcing error). Absent ⇒ omitted (the belief is then treated as fresh — absence ≠ staleness).
  const at = o && (typeof o.at === "string" || typeof o.at === "number") ? o.at : undefined;
  return freeze({
    missionType: MISSION_TYPE,
    executor: EXECUTOR,
    id: o && typeof o.id === "string" ? o.id : null,
    model: o && typeof o.model === "string" ? o.model : null,
    // Only a boolean verified becomes a decided outcome; anything else leaves status undecided (not counted).
    ...(verifiedKnown ? { verified: o.verified === true } : {}),
    ...(at !== undefined ? { at } : {}),
  });
}

function buildHistory(outcomes: any): any[] {
  return (Array.isArray(outcomes) ? outcomes : []).filter(isObj).map(outcomeToRecord);
}

/**
 * calibrateLocalModel(outcomes, opts?) -> { ok, executor, observations, successes, failures, measuredP, quality,
 * pForPlanner, uncertainty, reason, note }. Routes REAL ODG-local-model outcomes through the production calibrated-P.
 * CALIBRATED (⇒ non-null pForPlanner) requires ≥MIN_OBSERVATIONS decided outcomes WITH recorded failures; an all-success
 * (survivorship) or thin/empty history ⇒ BIASED/DEGRADED/UNKNOWN ⇒ pForPlanner=null (fail-closed, honest).
 */
function calibrateLocalModel(outcomes: any, opts: any = {}): any {
  if (!Array.isArray(outcomes)) return freeze({ ok: false, code: "BAD_OUTCOMES", detail: "outcomes must be an array of {verified} records" });
  const history = buildHistory(outcomes);
  const d = CP.derivePsuccess(MISSION_TYPE, history, isObj(opts) ? opts : {});
  return freeze({
    ok: d.ok === true,
    executor: EXECUTOR,
    observations: d.observations, successes: d.successes, failures: d.failures,
    measuredP: d.measuredP, quality: d.quality, pForPlanner: d.pForPlanner, uncertainty: d.uncertainty,
    authorizes: false,
    reason: d.reason,
    note: "calibrated P(success) over REAL ODG-local-model outcomes (independent-verifier verdicts, executor=ODG_LOCAL_MODEL_EXECUTION). pForPlanner is non-null ONLY when CALIBRATED (≥MIN_OBSERVATIONS with recorded failures) — a survivorship-biased all-success or thin history ⇒ null (fail-closed). This estimate informs the planner's benefit factor; it AUTHORIZES NOTHING. Distinct from the deterministic catalog (always-accept ⇒ biased) — the local-model flow is where calibrated-P has real signal.",
  });
}

const LOCAL_MODEL_CALIBRATION_CONTRACT = Object.freeze({
  id: "V327-LOCAL-MODEL-OUTCOME-CALIBRATION",
  purpose: "§P3 — make calibrated-P(success) OPERATIONALLY MEANINGFUL by feeding it REAL ODG-local-model outcomes (a genuine accept/reject mix), the one flow with real probabilistic signal — vs the deterministic catalog where it is survivorship-biased",
  reuses: Object.freeze(["odg-calibrated-psuccess.derivePsuccess (survivorship-bias + sample-size guard — NOT reimplemented)", "native-project-builder independent-verifier `verified` verdict (real accept/reject, not generator self-report)"]),
  invariants: Object.freeze([
    "`verified` is the INDEPENDENT verifier's real verdict (accept ONLY on independentTest) — never the generator's self-report; non-boolean ⇒ undecided (not counted, no fabricated failure)",
    "CALIBRATED (⇒ non-null pForPlanner) requires ≥MIN_OBSERVATIONS decided outcomes WITH recorded failures; all-success (survivorship) ⇒ BIASED ⇒ null; thin ⇒ DEGRADED ⇒ null; empty ⇒ UNKNOWN ⇒ null (fail-closed)",
    "executor tier is ODG_LOCAL_MODEL_EXECUTION — ODG's own local compute, distinct from the Claude-Code provider and from deterministic-native",
    "authorizes NOTHING — informs the planner's benefit factor only; a plan is a hypothesis, not a result",
    "composes calibrated-P; builds NO second estimator; PURE/deterministic/frozen",
  ]),
});

module.exports = { outcomeToRecord, buildHistory, calibrateLocalModel, EXECUTOR, LOCAL_MODEL_CALIBRATION_CONTRACT };
export {};
