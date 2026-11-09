#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CUSTOMER OUTCOME INTELLIGENCE (Directive Maîtresse Part X, Domain H). PURE, deterministic. Measures whether a
 * client's problem was ACTUALLY solved and what value was created — NOT how many tasks/files/tests ran. It composes the
 * seven functions (§33): Problem Baseline · Outcome Contract · Value Model · Outcome Collector · Independent Outcome
 * Verifier · Attribution Engine · Outcome Memory. The non-negotiable honesty rule (§34): an outcome carries an explicit
 * ATTRIBUTION LEVEL and a REAL-vs-SIMULATED flag; a SIMULATED improvement is NEVER presented as a real client gain, and
 * an outcome without an independent verification never reaches the strongest level. Fail-closed: missing baseline/after,
 * an introduced regression, or a simulated source caps the level. It measures/reports; it delivers nothing and grants no
 * authority. Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function num(v: any, d: number): number { return Number.isFinite(v) ? v : d; }

// §34 honest attribution ladder (strict order; a SIMULATED source can never exceed OBSERVED).
const ATTRIBUTION = Object.freeze(["NOT_DEMONSTRATED", "OBSERVED", "VERIFIED", "PROBABLY_ATTRIBUTABLE", "ROBUSTLY_ATTRIBUTABLE"]);

/**
 * measureOutcome({ source, baseline, after, outcomeContract, independentlyVerified, controlComparison, errorsIntroduced,
 *   humanIntervention }) -> { solved, valueCreated, attribution, real, gainNet, caveats }.
 * source: "REAL" | "SIMULATED" (default SIMULATED — safe). A SIMULATED outcome is capped at OBSERVED and real=false.
 */
function measureOutcome(input: any): any {
  const o = isObj(input) ? input : {};
  const source = o.source === "REAL" ? "REAL" : "SIMULATED";
  const baseline = isObj(o.baseline) ? o.baseline : null;
  const after = isObj(o.after) ? o.after : null;
  const contract = isObj(o.outcomeContract) ? o.outcomeContract : null;
  const caveats: string[] = [];

  // can we even measure? need a baseline AND an after.
  if (!baseline || !after) {
    return Object.freeze({ solved: false, valueCreated: null, attribution: "NOT_DEMONSTRATED", real: false, gainNet: null, caveats: Object.freeze(["no baseline and/or after measurement ⇒ outcome NOT_DEMONSTRATED (fail-closed)"]) });
  }

  // value model: net gain = (time/cost saved) − (cost added) ; a regression introduced subtracts.
  const timeSaved = num(baseline.timeCost, 0) - num(after.timeCost, 0);
  const costSaved = num(baseline.moneyCost, 0) - num(after.moneyCost, 0);
  const costAdded = num(o.costAdded, 0);
  const errorsIntroduced = num(o.errorsIntroduced, 0);
  const gainNet = Number((timeSaved + costSaved - costAdded).toFixed(4));

  // did it meet the outcome contract's target?
  const metTarget = contract && typeof contract.target === "number" ? num(after.metric, -Infinity) >= contract.target : null;
  const solved = metTarget === true && errorsIntroduced === 0;

  // attribution ladder (fail-closed):
  let level = "OBSERVED";                                   // we observed a before/after delta
  if (errorsIntroduced > 0) { caveats.push(`${errorsIntroduced} error(s) introduced — gain is not clean`); }
  if (o.independentlyVerified === true) level = "VERIFIED"; // an independent verifier confirmed the measurement
  if (level === "VERIFIED" && o.controlComparison === true) level = "PROBABLY_ATTRIBUTABLE"; // vs a control/baseline arm
  if (level === "PROBABLY_ATTRIBUTABLE" && o.robustMethod === true) level = "ROBUSTLY_ATTRIBUTABLE"; // robust attribution method
  if (solved !== true && level !== "OBSERVED") { level = "OBSERVED"; caveats.push("target not met / errors introduced ⇒ attribution capped at OBSERVED"); }

  // §34: a SIMULATED outcome is NEVER a real client gain — capped at OBSERVED, real=false.
  let real = source === "REAL";
  if (source === "SIMULATED") {
    if (ATTRIBUTION.indexOf(level) > ATTRIBUTION.indexOf("OBSERVED")) level = "OBSERVED";
    caveats.push("SIMULATED source ⇒ never a real client gain; attribution capped at OBSERVED, real=false (§34)");
    real = false;
  }
  if (num(o.humanIntervention, 0) > 0) caveats.push(`${o.humanIntervention} human intervention step(s) — not fully autonomous`);

  return Object.freeze({
    solved, valueCreated: real ? gainNet : null, attribution: level, real,
    gainNet, timeSaved, costSaved, costAdded, errorsIntroduced,
    note: real ? `real outcome, attribution ${level}` : "SIMULATED/unverified — not a real client gain",
    caveats: Object.freeze(caveats),
  });
}

const CUSTOMER_OUTCOME_CONTRACT = Object.freeze({
  id: "V124-CUSTOMER-OUTCOME-INTELLIGENCE",
  source: "Directive Maîtresse Part X / Domain H — Customer Outcome Intelligence",
  attributionLadder: ATTRIBUTION,
  reuses: Object.freeze(["performance-observability (before/after)", "eval-significance (robust comparison)", "evidence-provenance — composes the measurement; no new metric engine"]),
  notAuthority: "measures client outcome + value with honest attribution; it delivers nothing and grants no authority",
  invariants: Object.freeze([
    "tasks/files/tests executed are NOT an outcome — outcome = the client's problem measurably solved (baseline → after vs the outcome contract)",
    "a SIMULATED improvement is NEVER presented as a real client gain — capped at OBSERVED, real=false, valueCreated=null (§34)",
    "attribution ladder is strict: NOT_DEMONSTRATED < OBSERVED < VERIFIED (independent) < PROBABLY_ATTRIBUTABLE (control) < ROBUSTLY_ATTRIBUTABLE (robust method)",
    "missing baseline/after ⇒ NOT_DEMONSTRATED; an introduced regression or unmet target caps attribution at OBSERVED (fail-closed)",
    "pure/deterministic: baseline + after + contract in → honest outcome out; no clock/random/network; measures, delivers nothing",
  ]),
});

module.exports = { ATTRIBUTION, measureOutcome, CUSTOMER_OUTCOME_CONTRACT };

if (require.main === module) {
  const realGood = measureOutcome({ source: "REAL", baseline: { timeCost: 100, moneyCost: 50, metric: 0.6 }, after: { timeCost: 30, moneyCost: 20, metric: 0.95 }, outcomeContract: { target: 0.9 }, independentlyVerified: true, controlComparison: true });
  const sim = measureOutcome({ source: "SIMULATED", baseline: { timeCost: 100, metric: 0.6 }, after: { timeCost: 30, metric: 0.95 }, outcomeContract: { target: 0.9 }, independentlyVerified: true });
  process.stdout.write(JSON.stringify({ ...CUSTOMER_OUTCOME_CONTRACT, demo: { real: { attribution: realGood.attribution, value: realGood.valueCreated }, simulated: { attribution: sim.attribution, real: sim.real } } }, null, 2) + "\n");
}

export {};
