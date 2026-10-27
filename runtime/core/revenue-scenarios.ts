#!/usr/bin/env node
/**
 * revenue-scenarios — builds prudent / central / ambitious scenarios for the €500k TARGET (mandate §4) from EXPLICIT,
 * separately-stated assumptions. It does NOT pick conversion rates to make the target look reachable: it takes the
 * caller's assumptions and computes the REQUIRED prospect volume, acquisition pace, cash (lag-aware) and gross margin,
 * then labels feasibility HONESTLY (INFEASIBLE_SOLO / STRETCH / PLAUSIBLE_HYPOTHESIS) against a stated solo-capacity
 * ceiling. Every output is a HYPOTHESIS, never a forecast or a result. Signed ≠ cashed ≠ margin are kept distinct.
 * Pure, deterministic; reuses revenue-model.contractsForTarget. €500k is a TARGET, not achieved.
 */
"use strict";

const RM = require("./revenue-model.js");

// Honest solo-capacity ceilings (HYPOTHESIS — a single operator): monthly prospects workable, concurrent deliveries.
const SOLO_CEILING = { monthlyProspects: 120, monthlySignings: 4, concurrentDeliveries: 3 };

function num(v: number, d = 0): number { return typeof v === "number" && isFinite(v) && v >= 0 ? v : d; }
function pct(v: number): number { return typeof v === "number" && v > 0 && v <= 1 ? v : 0; }

/**
 * assessScenario(a, target): a = { name, avgContractValue, recurringMonthly?, months?, costRatio?,
 *   conv: { prospectToInterested, interestedToProposal, proposalToSigned } }.
 * Returns required contracts/prospects/pace, lag-aware cash note, gross margin, and an HONEST feasibility label.
 */
function assessScenario(a: any, target = 500000): any {
  const name = (a && a.name) || "scenario";
  const acv = num(a && a.avgContractValue);
  const recurringMonthly = num(a && a.recurringMonthly);
  const months = num(a && a.months, 12) || 12;
  const costRatio = pct(a && a.costRatio);                       // direct cost as a fraction of revenue (HYPOTHESIS)
  const conv = (a && a.conv) || {};
  const c1 = pct(conv.prospectToInterested), c2 = pct(conv.interestedToProposal), c3 = pct(conv.proposalToSigned);

  // Recurring contributes over the remaining months (lag-aware, conservative: recognised from signing month onward).
  const recurringAnnualPerContract = recurringMonthly > 0 ? recurringMonthly * Math.max(0, months - 2) : 0; // ~2-month ramp/lag
  const valuePerContract = acv + recurringAnnualPerContract;
  const contractsNeeded = valuePerContract > 0 ? RM.contractsForTarget(target, valuePerContract) : Infinity;

  const funnel = c1 * c2 * c3;                                    // overall prospect→signed conversion
  const prospectsNeeded = funnel > 0 && isFinite(contractsNeeded) ? Math.ceil(contractsNeeded / funnel) : Infinity;
  const monthlyProspects = isFinite(prospectsNeeded) ? Math.ceil(prospectsNeeded / months) : Infinity;
  const monthlySignings = isFinite(contractsNeeded) ? Math.ceil(contractsNeeded / months) : Infinity;
  const grossMarginPct = Math.round((1 - costRatio) * 1000) / 10;

  // HONEST feasibility: driven by solo capacity, not by wishful conversion.
  let feasibility: string, why: string;
  if (!isFinite(prospectsNeeded) || funnel === 0 || valuePerContract === 0) { feasibility = "UNDETERMINED"; why = "missing/zero assumptions (price or conversions) — cannot compute"; }
  else if (monthlyProspects > SOLO_CEILING.monthlyProspects || monthlySignings > SOLO_CEILING.monthlySignings) { feasibility = "INFEASIBLE_SOLO"; why = `requires ${monthlyProspects}/mo prospects + ${monthlySignings}/mo signings > solo ceiling (${SOLO_CEILING.monthlyProspects}/${SOLO_CEILING.monthlySignings}) — needs higher price, partners, or subcontracting`; }
  else if (monthlyProspects > SOLO_CEILING.monthlyProspects * 0.5 || monthlySignings >= SOLO_CEILING.monthlySignings) { feasibility = "STRETCH"; why = "within ceiling but demanding; requires disciplined pace + partner leverage"; }
  else { feasibility = "PLAUSIBLE_HYPOTHESIS"; why = "within stated solo ceiling IF the assumed conversions hold (unvalidated)"; }

  return { name, target, assumptions: { avgContractValue: acv, recurringMonthly, months, costRatio, conv: { c1, c2, c3 } }, valuePerContract, contractsNeeded, prospectsNeeded, monthlyProspects, monthlySignings, grossMarginPct, feasibility, why, hypothesis: true };
}

/** buildScenarios(input, target): input = { prudent, central, ambitious } assumption objects. */
function buildScenarios(input: any, target = 500000): any {
  const i = input || {};
  const scenarios = ["prudent", "central", "ambitious"].filter((k) => i[k]).map((k) => assessScenario(Object.assign({ name: k }, i[k]), target));
  const notes = [
    "€500k is a TARGET, not a forecast or a result. All figures are HYPOTHESIS until measured against real pipeline data.",
    "Conversions are caller inputs, NOT tuned to make the target reachable; feasibility is judged against a solo-capacity ceiling.",
    "Signed ≠ invoiced ≠ cashed ≠ margin. Recurring is recognised lag-aware (≈2-month ramp). Validate prices vs observed data.",
  ];
  return { target, scenarios, soloCeiling: SOLO_CEILING, notes };
}

export { assessScenario, buildScenarios, SOLO_CEILING };
module.exports = { assessScenario, buildScenarios, SOLO_CEILING };
