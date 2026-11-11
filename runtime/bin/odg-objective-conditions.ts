#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V57 (§8) — OBJECTIVE NECESSARY-CONDITIONS LEDGER. For the two canonical objectives (minimum €5M net /
 * ambition €500M net, first 12 months) it enumerates the CONCRETE necessary conditions — clients, conversion, average
 * basket, contracts, delivery capacity, headcount, working capital, financing — and confronts each REQUIRED value with
 * its OBSERVED value (mostly 0: no clients, no conversion, no cash). It computes the gap and marks each condition's basis
 * (OBSERVED / HYPOTHESIS) and whether it is owner/external-GATED. It REUSES the V55 economic scenarios (already derived
 * from the FR tax formula). HONEST: a mathematically-defined requirement is NEVER a commercial result; objectives are
 * recorded with their gaps, never lowered. Pure read/compute; no new engine. Run: `odg-objective-conditions.ts`.
 */

const fs = require("fs");
const path = require("path");
const D = path.join(__dirname, "..", "..", "docs", "odg");
function readJson(f: string): any { try { return JSON.parse(fs.readFileSync(path.join(D, f), "utf8")); } catch { return null; } }

const eco = readJson("V55_ECONOMIC_SCENARIOS.json");
const sc = readJson("V55_15_METIERS_GLOBAL_SCORECARD.json");

// OBSERVED reality (from the tri-status / scorecard / register): 0 paying clients, 0 conversion, 0 cash in.
const OBSERVED = { payingClients: 0, observedConversionRate: 0, signedContracts: 0, cashCollected: 0, externalFinancing: 0, references: 0 };

function conditionsFor(key: string): any {
  const s = eco && eco.scenarios ? eco.scenarios[key] : null;
  if (!s) return null;
  const requiredContracts = s.contracts || s.clients || null;
  const requiredHeadcount = s.headcount || null;
  const requiredWC = s.workingCapital || null;
  const requiredCapital = s.requiredCapital || null;
  const conds = [
    { condition: "paying clients signed", required: requiredContracts, observed: OBSERVED.payingClients, basis: "OBSERVED", gated: "owner/market (requires real sales — prospecting NOT authorized here)" },
    { condition: "observed conversion rate > 0", required: ">0 (sustained)", observed: OBSERVED.observedConversionRate, basis: "OBSERVED", gated: "market (no conversion observed yet)" },
    { condition: "signed contracts", required: requiredContracts, observed: OBSERVED.signedContracts, basis: "OBSERVED", gated: "owner (contracts NOT authorized here)" },
    { condition: "average basket (€)", required: s.avgBasket || null, observed: null, basis: "HYPOTHESIS", gated: "market (pricing unvalidated — 0 quotes accepted)" },
    { condition: "delivery capacity (FTE)", required: requiredHeadcount, observed: "ODG-native automation (no payroll FTE)", basis: "HYPOTHESIS", gated: "owner (hiring NOT authorized; automation must cover the gap)" },
    { condition: "working capital (€)", required: requiredWC, observed: OBSERVED.cashCollected, basis: "OBSERVED", gated: "owner/financing (no cash collected; financing NOT authorized here)" },
    { condition: "required capital (€)", required: requiredCapital, observed: OBSERVED.externalFinancing, basis: "OBSERVED", gated: "owner/financing" },
    { condition: "demonstrated world-superiority (credibility lever)", required: "independent benchmark per métier", observed: `${sc ? sc.tally.superior_to_reference : 0} demonstrated`, basis: "OBSERVED", gated: "controller + head-to-head reference execution (V57 §2: designed+executed ODG-side, superiority fail-closed 0)" },
  ];
  const openGaps = conds.filter((c) => c.basis === "OBSERVED" && (c.observed === 0 || c.observed === "0" || (typeof c.observed === "string" && /^0/.test(String(c.observed))))).length;
  return {
    objective: s.name, targetNet: s.targetNet || null, requiredRevenue: s.revenue, requiredContracts, requiredHeadcount, requiredWorkingCapital: requiredWC, requiredCapital,
    feasibility: s.feasibilityFromZero || "HYPOTHESIS (0 observed conversion)",
    conditions: conds, openObservedGaps: openGaps,
    verdict: "NOT MET — necessary conditions are unmet (0 clients / 0 conversion / 0 cash); objective recorded, NOT lowered; mathematically-defined ≠ commercially-accessible",
  };
}

const min5 = conditionsFor("min_5M_net");
const amb500 = conditionsFor("ambition_500M_net");

const out = {
  "//": "CTO V57 §8 — objective necessary-conditions ledger. REQUIRED (from the V55 economic model) vs OBSERVED (0 clients/conversion/cash). Each condition carries a basis and whether it is owner/external-gated. Reuses V55 scenarios; no new engine. Objectives recorded with gaps, never lowered; a math requirement is never a commercial result.",
  generatedFrom: ["V55_ECONOMIC_SCENARIOS.json", "V55_15_METIERS_GLOBAL_SCORECARD.json"],
  canonicalObjectives: { minimum: "€5,000,000 NET (12 months)", ambition: "€500,000,000 NET (12 months)" },
  observedReality: OBSERVED,
  minimum_5M_net: min5,
  ambition_500M_net: amb500,
  concreteLevers: [
    "convert the 3 prepared pilots (P3/P9/P10) into real E5 engagements (owner authorization + real client required)",
    "run head-to-head reference benchmarks (V57 §2) to earn a credible superiority claim (controller-confirmed)",
    "validate pricing with real accepted quotes (currently 0) to replace the HYPOTHESIS basket",
    "cover delivery capacity by automation (V55 §5) rather than hiring (hiring not authorized)",
    "secure working capital / financing (owner-gated) before scaling contract volume",
  ],
  honestConclusion: "Neither objective's necessary conditions are met: 0 paying clients, 0 observed conversion, 0 cash, 0 demonstrated superiority. €5M net needs ~" + (min5 ? min5.requiredContracts : "?") + " contracts; €500M net needs ~" + (amb500 ? amb500.requiredContracts : "?") + " (INFEASIBLE in 12 months from €0). Objectives recorded with explicit gaps and concrete levers; NOT lowered, NOT declared feasible.",
  invariant: "A required value is never an observed value. Objectives are confronted with observed reality (0) and kept at their canonical level with documented gaps. No client/contract/conversion is fabricated.",
};
process.stdout.write(JSON.stringify(out, null, 2) + "\n");
fs.writeFileSync(path.join(D, "V57_OBJECTIVE_CONDITIONS.json"), JSON.stringify(out, null, 2) + "\n");
export {};
