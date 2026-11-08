#!/usr/bin/env node
"use strict";

/*
 * V5 PHASE 5 / M-C-01 (Native Autonomy — program §5). PURE, deterministic. Two capabilities:
 *  (1) fallbackDecision — the §5.5 PROVIDER-FALLBACK scenario model (genuinely absent): given a provider scenario
 *      (available / unavailable / incorrect / incomplete / timeout) + whether the mission needs a provider + whether
 *      ODG is natively capable + whether a delegated result validated, it decides the execution path:
 *      NATIVE_EXECUTION / PROVIDER_EXECUTION / NATIVE_FALLBACK / NEEDS_VALIDATION / BLOCKED. Fail-closed: a delegated
 *      result is NEVER accepted without validation; an unknown scenario ⇒ BLOCKED.
 *  (2) scorecard — COMPOSES autonomy-measure.measureAutonomy (retrospective NATIVE/PROVIDER/HUMAN share) +
 *      provider-dependency-projection.projectProviderDependency (forward native-continuity floor) into one unified
 *      Program-C view. UNKNOWN is never counted NATIVE; empty/unmeasurable ⇒ measurable:false (no fabricated %).
 * It measures/decides; it executes nothing and grants no authority. Dual export.
 */

const AM = require("./autonomy-measure");                // measureAutonomy — retrospective autonomy share
const PDP = require("./provider-dependency-projection");  // projectProviderDependency — forward native-continuity floor

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

const SCENARIO = Object.freeze(["PROVIDER_AVAILABLE", "PROVIDER_UNAVAILABLE", "PROVIDER_INCORRECT", "PROVIDER_INCOMPLETE", "PROVIDER_TIMEOUT"]);
const PATH = Object.freeze(["NATIVE_EXECUTION", "PROVIDER_EXECUTION", "NATIVE_FALLBACK", "NEEDS_VALIDATION", "BLOCKED"]);

/** fallbackDecision(scenario, { missionNeedsProvider, nativeCapable, delegatedResultValid }) -> { path, resultTrusted, reasons }. */
function fallbackDecision(scenario: any, opts: any): any {
  const o = isObj(opts) ? opts : {};
  const needs = o.missionNeedsProvider === true;
  const nativeCapable = o.nativeCapable === true;
  const reasons: string[] = [];

  // a mission that needs no provider is always done natively.
  if (!needs) return path("NATIVE_EXECUTION", true, ["mission needs no provider ⇒ native execution"]);
  if (!SCENARIO.includes(scenario)) return path("BLOCKED", false, [`unknown provider scenario '${scenario}' ⇒ BLOCKED (fail-closed)`]);

  if (scenario === "PROVIDER_AVAILABLE") {
    // a delegated result is NEVER accepted without validation (fail-closed).
    if (o.delegatedResultValid === true) return path("PROVIDER_EXECUTION", true, ["provider available + delegated result VALIDATED ⇒ accept"]);
    if (o.delegatedResultValid === false) return nativeCapable ? path("NATIVE_FALLBACK", true, ["delegated result invalid ⇒ reject + native fallback"]) : path("NEEDS_VALIDATION", false, ["delegated result invalid and no native capability ⇒ NEEDS_VALIDATION (never accept a bad delegated result)"]);
    return path("NEEDS_VALIDATION", false, ["delegated result not yet validated ⇒ NEEDS_VALIDATION (fail-closed; never accept unvalidated)"]);
  }
  if (scenario === "PROVIDER_UNAVAILABLE" || scenario === "PROVIDER_TIMEOUT") {
    return nativeCapable ? path("NATIVE_FALLBACK", true, [`provider ${scenario} ⇒ native fallback`]) : path("BLOCKED", false, [`provider ${scenario} and no native capability ⇒ BLOCKED (needs provider/owner)`]);
  }
  // PROVIDER_INCORRECT / PROVIDER_INCOMPLETE — the delegated result is not trustworthy; never accept it.
  return nativeCapable ? path("NATIVE_FALLBACK", true, [`provider result ${scenario} ⇒ reject + native fallback`]) : path("NEEDS_VALIDATION", false, [`provider result ${scenario} and no native capability ⇒ NEEDS_VALIDATION (never accept an incorrect/incomplete delegated result)`]);
}

function path(p: string, resultTrusted: boolean, reasons: string[]): any { return Object.freeze({ path: p, resultTrusted, reasons: Object.freeze(reasons) }); }

/** scorecard({ units, queue, providerAvailable }) -> unified Program-C view (retrospective + forward). */
function scorecard(input: any): any {
  const o = isObj(input) ? input : {};
  const retrospective = AM.measureAutonomy(Array.isArray(o.units) ? o.units : []);   // NATIVE/PROVIDER/HUMAN share
  const forward = PDP.projectProviderDependency({ missions: Array.isArray(o.queue) ? o.queue : [], providerAvailable: o.providerAvailable });  // native-continuity floor
  return Object.freeze({
    retrospective: Object.freeze({ measurable: retrospective.measurable, autonomyPercent: retrospective.autonomyPercent, categories: retrospective.categories, note: "UNKNOWN/ambiguous attribution is never counted NATIVE (autonomy-measure fail-closed)" }),
    forward: Object.freeze({ measurable: forward.measurable, nativeContinuityFloor: forward.nativeContinuityFloor, blockedIfProviderDown: forward.blockedIfProviderDown }),
    note: "unified Program-C scorecard: retrospective share (what ODG actually executed) + forward floor (what ODG could progress with no provider); neither fabricates a percentage",
  });
}

const NATIVE_AUTONOMY_SCORECARD_CONTRACT = Object.freeze({
  id: "V5-NATIVE-AUTONOMY-SCORECARD",
  source: "ODG Master program §5 (Native Autonomy) — §5.5 provider-fallback scenarios + §5.6 unified scorecard",
  scenarios: SCENARIO, paths: PATH,
  reuses: Object.freeze(["autonomy-measure.measureAutonomy (retrospective share)", "provider-dependency-projection.projectProviderDependency (forward floor)"]),
  notAuthority: "a measurement + fallback-decision aid; it executes no mission, calls no provider, and grants no authority",
  invariants: Object.freeze([
    "a mission that needs no provider ⇒ NATIVE_EXECUTION; an unknown provider scenario ⇒ BLOCKED (fail-closed)",
    "a delegated result is NEVER accepted without validation; an incorrect/incomplete/unvalidated result ⇒ NATIVE_FALLBACK (if capable) or NEEDS_VALIDATION, never silent accept",
    "provider unavailable/timeout ⇒ NATIVE_FALLBACK if natively capable, else BLOCKED",
    "scorecard composes retrospective (measureAutonomy) + forward (provider-dependency-projection); UNKNOWN never counted NATIVE; empty ⇒ measurable:false (no fabricated %)",
    "pure/deterministic: scenario/opts in → path out; no clock/random/network",
  ]),
});

module.exports = { fallbackDecision, scorecard, NATIVE_AUTONOMY_SCORECARD_CONTRACT };

if (require.main === module) {
  const demo = { unavailableNoNative: fallbackDecision("PROVIDER_UNAVAILABLE", { missionNeedsProvider: true, nativeCapable: false }).path, incorrectNative: fallbackDecision("PROVIDER_INCORRECT", { missionNeedsProvider: true, nativeCapable: true }).path };
  process.stdout.write(JSON.stringify({ ...NATIVE_AUTONOMY_SCORECARD_CONTRACT, demo }, null, 2) + "\n");
}

export {};
