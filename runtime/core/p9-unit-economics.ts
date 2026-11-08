#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 13 (P9 excellence) — AI UNIT ECONOMICS. PURE, deterministic. FinOps frontier for AI/agentic systems: the
 * decision metric is cost per SUCCESSFUL OUTCOME (e.g. €/resolved-task), NOT total cost or cost-per-attempt — because
 * failed/retried attempts consume budget without delivering value. ODG's P9 reference separated OBSERVED/ESTIMATED/
 * SIMULATED cost; this adds the unit-economics computation ON OBSERVED COST ONLY (never SIMULATED), fail-closed: with
 * zero successes the unit cost is undefined (NOT zero), and it reports the WASTE RATIO (spend on failed attempts).
 * Complements profession-p9-finops-reference; no new engine. Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function num(v: any, d = 0): number { return typeof v === "number" && isFinite(v) ? v : d; }
function round(n: number): number { return Number(n.toFixed(4)); }

/** unitEconomics({observedCostEur, attempts, successes}) -> cost per attempt vs per SUCCESS + waste ratio.
 * OBSERVED cost only. Fail-closed: zero successes ⇒ costPerSuccess null (undefined, never 0). */
function unitEconomics(input: any): any {
  const o = isObj(input) ? input : {};
  const cost = Math.max(0, num(o.observedCostEur));
  const attempts = Math.max(0, Math.floor(num(o.attempts)));
  const successes = Math.max(0, Math.min(Math.floor(num(o.successes)), attempts));
  const failures = attempts - successes;
  const costPerAttempt = attempts > 0 ? round(cost / attempts) : null;
  const costPerSuccess = successes > 0 ? round(cost / successes) : null;   // null (NOT 0) when nothing succeeded
  const successRate = attempts > 0 ? round(successes / attempts) : 0;
  // waste ratio = fraction of spend attributable to failed attempts (assuming uniform per-attempt cost).
  const wasteRatio = attempts > 0 ? round(failures / attempts) : 0;
  return Object.freeze({
    costBasis: "OBSERVED", observedCostEur: round(cost), attempts, successes, failures,
    costPerAttempt, costPerSuccess, successRate, wasteRatio,
    viable: costPerSuccess !== null,   // a unit economic exists only if something actually succeeded
    note: "cost per SUCCESSFUL outcome (OBSERVED only); zero successes ⇒ costPerSuccess undefined (null, never 0); wasteRatio = spend on failed attempts",
  });
}

/** withinUnitBudget(econ, maxCostPerSuccessEur) -> boolean. Fail-closed: no success ⇒ false (not within budget). */
function withinUnitBudget(econ: any, maxCostPerSuccessEur: any): boolean {
  if (!isObj(econ) || econ.costPerSuccess === null || typeof econ.costPerSuccess !== "number") return false;
  return econ.costPerSuccess <= num(maxCostPerSuccessEur, Infinity);
}

const P9_UNIT_ECONOMICS_CONTRACT = Object.freeze({
  id: "V124-P9-UNIT-ECONOMICS",
  source: "SÉRIE 13 P9 — AI FinOps unit economics (cost per successful outcome; FOCUS/unit-economics frontier)",
  complements: "profession-p9-finops-reference (OBSERVED/ESTIMATED/SIMULATED separation); adds cost-per-success",
  notAuthority: "a pure unit-economics computation over OBSERVED spend; it bills nothing and calls no API",
  invariants: Object.freeze([
    "unit economics use OBSERVED cost ONLY — never ESTIMATED or SIMULATED",
    "the decision metric is cost per SUCCESSFUL outcome, not total cost or cost-per-attempt",
    "zero successes ⇒ costPerSuccess is undefined (null, never 0) and viable=false (fail-closed)",
    "withinUnitBudget fails closed when nothing succeeded; wasteRatio surfaces spend on failed attempts",
  ]),
});

module.exports = { unitEconomics, withinUnitBudget, P9_UNIT_ECONOMICS_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...P9_UNIT_ECONOMICS_CONTRACT, demo: unitEconomics({ observedCostEur: 10, attempts: 100, successes: 40 }) }, null, 2) + "\n"); }

export {};
