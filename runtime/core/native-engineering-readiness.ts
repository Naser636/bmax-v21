#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V38 LOT H — NATIVE ENGINEERING READINESS GATE. PURE, deterministic, fail-closed. It builds NO new estimator
 * — it COMPOSES decomposition-planner (the complexity class + strategy), native-build-outcome (the REAL failure-inclusive
 * reliability per class), and calibration (the honest quality of that reliability) into ONE readiness verdict: should ODG
 * attempt this project NATIVELY, or DEFER to the provider (Claude Code = last-resort provider)?
 *
 * This honestly encodes "the provider is a last resort": ODG attempts natively ONLY a complexity class for which it has
 * DEMONSTRATED sufficient, calibrated, failure-inclusive reliability; with insufficient / biased / degraded evidence it
 * DEFERS (fail-closed — it does not over-claim native autonomy on no proof), and reclaims autonomy as evidence accrues.
 * It authorizes nothing and executes nothing: ATTEMPT_NATIVE only recommends trying the native build (which is itself
 * independently verified before acceptance); ODG's independent controller still decides. Dual export.
 */

const DP = require("./decomposition-planner.js");
const NBO = require("./native-build-outcome.js");
const CAL = require("./calibration.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

const VERDICT = Object.freeze(["ATTEMPT_NATIVE", "DEFER_TO_PROVIDER", "INSUFFICIENT_DATA"]);

/**
 * assessReadiness(spec, outcomes, opts) -> { complexity, strategy, class, reliability, verifiedAttempts, quality, verdict,
 * recommendProvider, reason }. opts: { reliabilityThreshold? = 0.8 }. FAIL-CLOSED: unknown/degraded/biased evidence ⇒
 * DEFER_TO_PROVIDER (never ATTEMPT_NATIVE on no proof). ATTEMPT_NATIVE requires CALIBRATED quality AND reliability ≥ threshold.
 */
function assessReadiness(spec: any, outcomes: any, opts: any = {}): any {
  const o = isObj(opts) ? opts : {};
  const threshold = Number.isFinite(Number(o.reliabilityThreshold)) ? Math.max(0, Math.min(1, Number(o.reliabilityThreshold))) : 0.8;
  const complexity = DP.assessComplexity(spec).complexity;
  const strategy = DP.chooseStrategy(spec).strategy;
  const cls = `${strategy}:${complexity}`;
  const rel = NBO.nativeReliabilityByClass(outcomes);
  const b = rel.byClass[cls] || { attempts: 0, successes: 0, failures: 0, reliability: null };
  const est = CAL.calibratedEstimate({ p: b.reliability, observations: b.attempts, successes: b.successes, failures: b.failures, source: `native-build:${cls}` });

  const base = { complexity, strategy, class: cls, reliability: b.reliability, verifiedAttempts: b.attempts, successes: b.successes, failures: b.failures, quality: est.quality };
  // fail-closed ladder: only a CALIBRATED, sufficiently-reliable class earns a native attempt.
  if (b.attempts === 0 || est.quality === "UNKNOWN" || est.quality === "DEGRADED") {
    return Object.freeze({ ...base, verdict: "INSUFFICIENT_DATA", recommendProvider: true, reason: `insufficient demonstrated evidence for ${cls} (${b.attempts} verified attempts, quality ${est.quality}) — DEFER to the provider (fail-closed; native autonomy is earned by demonstrated reliability, not claimed)` });
  }
  if (est.quality === "BIASED") {
    return Object.freeze({ ...base, verdict: "DEFER_TO_PROVIDER", recommendProvider: true, reason: `reliability for ${cls} is selection-biased (observed but ~no recorded failures — not stress-tested) — DEFER to the provider until failures are also observed` });
  }
  if (est.quality === "CALIBRATED" && Number(b.reliability) >= threshold) {
    return Object.freeze({ ...base, verdict: "ATTEMPT_NATIVE", recommendProvider: false, reason: `${cls} has a CALIBRATED, failure-inclusive reliability ${b.reliability} ≥ ${threshold} over ${b.attempts} verified attempts — attempt natively (the build is still independently verified before acceptance)` });
  }
  return Object.freeze({ ...base, verdict: "DEFER_TO_PROVIDER", recommendProvider: true, reason: `${cls} reliability ${b.reliability} < ${threshold} (demonstrated insufficient) — DEFER to the provider (do not attempt natively below demonstrated competence)` });
}

/** shouldAttemptNative(spec, outcomes, opts) -> boolean. True ONLY on an ATTEMPT_NATIVE verdict (fail-closed default: false). */
function shouldAttemptNative(spec: any, outcomes: any, opts: any = {}): boolean {
  return assessReadiness(spec, outcomes, opts).verdict === "ATTEMPT_NATIVE";
}

const NATIVE_ENGINEERING_READINESS_CONTRACT = Object.freeze({
  id: "V124-NATIVE-ENGINEERING-READINESS",
  source: "CTO V38 LOT H — a fail-closed native-vs-provider readiness gate composing F (strategy) + G (measured reliability) + calibration (honest quality)",
  reuses: Object.freeze(["decomposition-planner (complexity class + strategy)", "native-build-outcome (REAL failure-inclusive reliability per class)", "calibration (the honest quality ladder: UNKNOWN/BIASED/DEGRADED/CALIBRATED, MIN_OBSERVATIONS)"]),
  notAuthority: "recommends ATTEMPT_NATIVE vs DEFER_TO_PROVIDER from demonstrated evidence; it executes nothing and authorizes nothing — ODG's independent controller decides, and a native attempt is still independently verified before acceptance",
  invariants: Object.freeze([
    "ATTEMPT_NATIVE requires a CALIBRATED, failure-inclusive reliability ≥ threshold over demonstrated verified attempts — native autonomy is EARNED, not claimed",
    "insufficient / UNKNOWN / DEGRADED evidence ⇒ INSUFFICIENT_DATA ⇒ DEFER to the provider (fail-closed; the provider is the last resort precisely when ODG lacks demonstrated capability)",
    "a selection-biased reliability (observed but ~no recorded failures) ⇒ DEFER (not yet stress-tested) — reuses the calibration bias guard",
    "demonstrated-but-below-threshold reliability ⇒ DEFER (do not attempt below demonstrated competence)",
    "pure/deterministic; authorizes nothing; reclaims native autonomy only as demonstrated evidence accrues",
  ]),
});

module.exports = { VERDICT, assessReadiness, shouldAttemptNative, NATIVE_ENGINEERING_READINESS_CONTRACT };

if (require.main === module) {
  const metaSpec = { name: "symbol detector", architecture: [{ path: "src/d.js", role: "analyze code symbols", contract: "parse references" }] };
  // no evidence yet ⇒ DEFER (fail-closed).
  const cold = assessReadiness(metaSpec, []);
  process.stdout.write(JSON.stringify({ ...NATIVE_ENGINEERING_READINESS_CONTRACT, demo: { class: cold.class, verdictColdStart: cold.verdict, recommendProvider: cold.recommendProvider } }, null, 2) + "\n");
}

export {};
