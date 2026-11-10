#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V55 (§7) — GLOBAL ECONOMIC MODEL. Reconciles the 15 métiers, Part XXXII and the canonical financial
 * objectives (minimum €5M net / ambition €500M net, first 12 months) into explicit scenarios: prudent / central /
 * ambitious / min-5M-net / ambition-500M-net. Each scenario carries revenue, margins, full costs, taxes, headcount,
 * clients, average basket, contracts, sales cycle, delivery capacity, working capital and required capital — all from
 * EXPLICIT assumptions. It REUSES the FR corporate-tax formula already used by odg-acquisition-model / odg-org-model.
 * HONEST: figures without evidence are HYPOTHESES; a mathematically-possible scenario is NEVER presented as commercially
 * accessible (observed conversion = 0 clients). Pure/deterministic; no new engine. Run: `odg-v55-economic-scenarios.ts`.
 */

const fs = require("fs");
const path = require("path");
const D = path.join(__dirname, "..", "..", "docs", "odg");

// FR corporate income tax (identical to odg-acquisition-model / odg-org-model): 15% up to €42,500 then 25%.
function isTaxFR(ebt: number): number { return 0.15 * Math.min(Math.max(ebt, 0), 42500) + 0.25 * Math.max(ebt - 42500, 0); }
// closed-form inverse for net>~€37k: net = 0.75*EBT + 4250 ⇒ EBT = (net - 4250)/0.75.
function ebtForNet(net: number): number { return net > 37000 ? (net - 4250) / 0.75 : net / 0.85; }
function round(n: number): number { return Math.round(n); }

// A scenario from demand assumptions (clients × basket) OR from a net target (reverse-engineered).
function fromDemand(name: string, clients: number, avgBasket: number, preTaxMargin: number, saleCycleMo: number, deliveryDaysPerContract: number, label: string): any {
  const revenue = clients * avgBasket;
  const ebt = revenue * preTaxMargin;
  const tax = isTaxFR(ebt);
  const net = ebt - tax;
  const contracts = clients;
  const deliveryCapacityContractsPerFTEyear = Math.floor(220 / Math.max(deliveryDaysPerContract, 0.1));
  const headcount = Math.max(1, Math.ceil(contracts / Math.max(deliveryCapacityContractsPerFTEyear, 1)));
  const workingCapital = round(revenue * (saleCycleMo / 12) * 0.5);      // rough WC ≈ half a sale-cycle of revenue
  const capital = round(workingCapital + headcount * 15000);            // WC + ramp cost/FTE (hypothesis)
  return { name, basis: label, revenue: round(revenue), preTaxMargin, ebt: round(ebt), tax: round(tax), net: round(net),
    clients, avgBasket, contracts, saleCycleMonths: saleCycleMo,
    deliveryCapacityContractsPerFTEyear, headcount, workingCapital, requiredCapital: capital };
}

function fromNetTarget(name: string, targetNet: number, preTaxMargin: number, avgBasket: number, label: string): any {
  const ebt = ebtForNet(targetNet);
  const revenue = ebt / preTaxMargin;
  const tax = isTaxFR(ebt);
  const net = ebt - tax;
  const contracts = Math.ceil(revenue / avgBasket);
  const deliveryDaysPerContract = 10;                                   // hypothesis
  const capPerFTE = Math.floor(220 / deliveryDaysPerContract);
  const headcount = Math.ceil(contracts / capPerFTE);
  const contractsPerWeek = Math.round(contracts / 52);
  const workingCapital = round(revenue * 0.25);
  const capital = round(workingCapital + headcount * 15000);
  return { name, basis: label, targetNet, revenue: round(revenue), preTaxMargin, ebt: round(ebt), tax: round(tax), net: round(net),
    avgBasket, contracts, contractsPerWeek, deliveryCapacityContractsPerFTEyear: capPerFTE, headcount,
    workingCapital, requiredCapital: capital,
    feasibilityFromZero: "HYPOTHESIS ONLY — observed conversion = 0 clients; mathematically defined ≠ commercially accessible" };
}

const scenarios = {
  prudent: fromDemand("prudent", 18, 28000, 0.30, 4, 12, "HYPOTHESIS (conservative demand; 0 observed conversion)"),
  central: fromDemand("central", 55, 42000, 0.30, 5, 12, "HYPOTHESIS (central demand; 0 observed conversion)"),
  ambitious: fromDemand("ambitious", 140, 60000, 0.32, 6, 10, "HYPOTHESIS (ambitious demand; 0 observed conversion)"),
  min_5M_net: fromNetTarget("min-5M-net", 5_000_000, 0.30, 50000, "OBJECTIVE (minimum) — reverse-engineered, HYPOTHESIS"),
  ambition_500M_net: fromNetTarget("ambition-500M-net", 500_000_000, 0.30, 500000, "OBJECTIVE (ambition) — reverse-engineered; INFEASIBLE in 12 months from €0 (per V51/V52)"),
};
// the ambition objective is INFEASIBLE in 12 months from a €0-client start (per V51/V52) — record on the scenario itself.
scenarios.ambition_500M_net.feasibilityFromZero = "INFEASIBLE in 12 months from €0 clients (~1000× the plausible range, per V51/V52); objective recorded, NOT lowered; mathematically defined ≠ commercially accessible";

const out = {
  "//": "CTO V55 §7 — global economic model. Scenarios prudent/central/ambitious + min €5M net + ambition €500M net. Reuses the FR tax formula (odg-acquisition/org-model). Figures without evidence are HYPOTHESES; a mathematically-possible scenario is NEVER commercially accessible (0 observed clients). No new engine.",
  canonicalObjectives: { minimum: "€5,000,000 NET after all charges+taxes, first 12 months", ambition: "€500,000,000 NET after all charges+taxes, first 12 months" },
  taxModel: "FR IS 15% up to €42,500 then 25% (identical to odg-acquisition-model / odg-org-model)",
  scenarios,
  reconciliation: {
    min5M: `€5M net ⇒ EBT ≈ €${round(scenarios.min_5M_net.ebt).toLocaleString("en-US")}, revenue ≈ €${round(scenarios.min_5M_net.revenue).toLocaleString("en-US")} at 30% margin ⇒ ~${scenarios.min_5M_net.contracts} contracts (~${scenarios.min_5M_net.contractsPerWeek}/wk), ~${scenarios.min_5M_net.headcount} FTE. HYPOTHESIS from €0 clients.`,
    ambition500M: `€500M net ⇒ EBT ≈ €${round(scenarios.ambition_500M_net.ebt).toLocaleString("en-US")}, revenue ≈ €${round(scenarios.ambition_500M_net.revenue).toLocaleString("en-US")} at 30% margin ⇒ ~${scenarios.ambition_500M_net.contracts} contracts (~${scenarios.ambition_500M_net.contractsPerWeek}/wk), ~${scenarios.ambition_500M_net.headcount} FTE. INFEASIBLE in 12 months from €0 (per V51/V52); recorded, not lowered.`,
  },
  honestConclusion: "The prudent/central/ambitious scenarios are HYPOTHESES (observed conversion = 0). €5M net is the minimum objective; €500M net is the ambition — both reverse-engineered and, from a €0-client standing start, NOT demonstrated commercially accessible in 12 months (€500M net INFEASIBLE per V51/V52). Objectives recorded, not lowered.",
  invariant: "Figures without proof are HYPOTHESES. A mathematically-possible scenario is never presented as commercially accessible. Objectives are recorded with their honest feasibility, never silently lowered.",
};
process.stdout.write(JSON.stringify(out, null, 2) + "\n");
fs.writeFileSync(path.join(D, "V55_ECONOMIC_SCENARIOS.json"), JSON.stringify(out, null, 2) + "\n");
export {};
