#!/usr/bin/env node
"use strict";
/*
 * V327 §5 — NATIVE-BUILD-OUTCOME → CALIBRATED-P bridge (closes the learning loop; no new store). PURE, deterministic,
 * fail-closed. native-build-outcome already ACCUMULATES per-class native build outcomes (SUCCESS/FAILURE/UNKNOWN,
 * independently verified) and exposes nativeReliabilityByClass — but that is a RAW success rate (no survivorship /
 * sample-size guard). This bridges the SAME accumulated outcomes into odg-local-model-outcome-calibration (the
 * survivorship-guarded calibrated-P), so ODG's reliability belief over REAL accumulated data is the HONEST guarded
 * verdict (CALIBRATED only with ≥MIN_OBSERVATIONS decided outcomes WITH failures), consumable by the resource policy /
 * routing / belief-refresh. It REUSES native-build-outcome's store (no second memory) + #769 (now consumed, not orphan).
 *
 * Honesty: only INDEPENDENTLY-VERIFIED SUCCESS/FAILURE outcomes are mapped (UNKNOWN is censored, never counted); a
 * timestamp (`at`) is carried through for belief-refresh staleness. No network/clock (asOf injected by the caller).
 */

const CAL = require("./odg-local-model-outcome-calibration.js");

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/**
 * calibrateFromBuildOutcomes(outcomes, opts?) -> the calibrated-P verdict over REAL accumulated native-build outcomes.
 *   outcomes: native-build-outcome records [{ type, outcome:"SUCCESS"|"FAILURE"|"UNKNOWN", independentlyVerified, at? }].
 *   opts: { missionType? (filter by native-build class `type`), maxAgeDays?, ... passed through to calibrated-P }.
 * Maps only INDEPENDENTLY-VERIFIED SUCCESS/FAILURE outcomes (UNKNOWN censored) → {verified} and defers to the
 * survivorship-guarded calibrateLocalModel. Returns { ...calibration, mappedFrom, censoredUnknown }.
 */
function calibrateFromBuildOutcomes(outcomes: any, opts: any = {}): any {
  const o = isObj(opts) ? opts : {};
  const all = Array.isArray(outcomes) ? outcomes.filter(isObj) : [];
  const wantType = typeof o.missionType === "string" ? o.missionType : null;
  const scoped = wantType === null ? all : all.filter((x: any) => x.type === wantType || x.missionType === wantType);
  let censoredUnknown = 0;
  const rows = scoped.map((x: any) => {
    if (x.outcome === "SUCCESS" && x.independentlyVerified === true) return { verified: true, id: x.missionId, at: x.at === null ? undefined : x.at };
    if (x.outcome === "FAILURE" && x.independentlyVerified === true) return { verified: false, id: x.missionId, at: x.at === null ? undefined : x.at };
    censoredUnknown += 1; return null; // UNKNOWN / unverified ⇒ censored (never counted as success or failure)
  }).filter(Boolean);
  const cal = CAL.calibrateLocalModel(rows, { maxAgeDays: o.maxAgeDays, asOfMs: o.asOfMs });
  return freeze({ ...cal, mappedFrom: scoped.length, censoredUnknown, note: "survivorship-GUARDED calibrated-P over REAL accumulated native-build outcomes (UNKNOWN censored); a more honest belief than the raw success rate (nativeReliabilityByClass). Reuses native-build-outcome's store + odg-local-model-outcome-calibration; no second memory." });
}

const NATIVE_OUTCOME_CALIBRATION_CONTRACT = Object.freeze({
  id: "V327-NATIVE-OUTCOME-CALIBRATION-BRIDGE",
  purpose: "§5 — bridge the EXISTING native-build-outcome accumulator into the survivorship-guarded calibrated-P, so ODG's reliability belief over real accumulated data is the honest guarded verdict (not a raw rate); closes the learning loop and the #769 orphan with no new store",
  reuses: Object.freeze(["native-build-outcome accumulated outcomes (the existing per-class store — NOT a second memory)", "odg-local-model-outcome-calibration.calibrateLocalModel (survivorship/sample-size guard — now consumed)"]),
  invariants: Object.freeze([
    "only INDEPENDENTLY-VERIFIED SUCCESS/FAILURE outcomes are mapped; UNKNOWN is censored (never counted) — no fabricated data",
    "defers the verdict to the survivorship-guarded calibrated-P (CALIBRATED only with ≥MIN_OBSERVATIONS + recorded failures) — more honest than the raw rate",
    "carries `at` timestamps through so belief-refresh staleness stays operational over real outcomes",
    "reuses the existing accumulator + calibrator — NO second store/estimator; PURE/deterministic/frozen/fail-closed",
  ]),
});

module.exports = { calibrateFromBuildOutcomes, NATIVE_OUTCOME_CALIBRATION_CONTRACT };
export {};
