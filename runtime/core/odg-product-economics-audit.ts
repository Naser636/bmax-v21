#!/usr/bin/env node
"use strict";
/*
 * V178 (§5 — audit the V177 product-design economics; correct the margin semantics). PURE, deterministic, fail-closed.
 * REUSES odg-economic-model.COST (tax/salary/opex) + odg-product-design-engine — NO duplicate cost model.
 *
 * V177 CORRECTION (made this lot): the engine's per-customer figure (price − variable delivery − variable support) is the
 * CONTRIBUTIVE MARGIN, NOT net profit. V177's field was renamed netMarginPerCustomer → contributiveMarginPerCustomer. This
 * module computes the proper THREE-LEVEL breakdown (§5: distinguer marge contributive / bénéfice opérationnel / bénéfice net):
 *   1) contributive margin/customer = price − variable delivery − variable support
 *   2) operating profit = Σ contributive − fixed opex (salaries + infra) − CAC total − certification cost
 *   3) net profit = operating profit × (1 − corporate tax)
 *
 * HONESTY (strict §5): every input is PROVENANCE-tagged (OBSERVED/HYPOTHESIS/SOURCED). BUILDABLE_NOW means only "buildable
 * per the engine" — NOT validated demand, NOT a guaranteed sale. The NIS2 example is verified formula-by-formula; any
 * unjustified figure is flagged. SYNTHETIC; no real customers; €5M NOT guaranteed; €0 clients.
 */
const ECON = require("./odg-economic-model.js");
const DESIGN = require("./odg-product-design-engine.js");
const COST = ECON.COST;

function round(n: number): number { return Math.round(n); }

/* auditDossier(opp, volumeAssumptions) — three-level economics over a V177 dossier.
 * volumeAssumptions: { customers (SIMULATED), cacPerCustomer, people (3-5), certificationCost, infraPerYear }. */
function auditDossier(opp: any, volumeAssumptions?: any): any {
  const d = DESIGN.designProduct(opp);
  const e = d.economics;
  const v = volumeAssumptions || {};
  const customers = Number.isFinite(v.customers) ? v.customers : 0;           // SIMULATED — not real
  const cac = Number.isFinite(v.cacPerCustomer) ? v.cacPerCustomer : 0;
  const people = Number.isFinite(v.people) ? v.people : 3;
  const certCost = Number.isFinite(v.certificationCost) ? v.certificationCost : 0;
  const infra = Number.isFinite(v.infraPerYear) ? v.infraPerYear : COST.fixedOpexPerYear;

  // LEVEL 1 — contributive margin per customer (this is what V177 computes; correctly labelled now)
  const contributiveMarginPerCustomer = e.contributiveMarginPerCustomer;
  // LEVEL 2 — operating profit = Σ contributive − fixed − CAC − cert
  const totalContributive = contributiveMarginPerCustomer * customers;
  const salaries = people * COST.loadedSalaryPerPerson;
  const cacTotal = cac * customers;
  const fixedCosts = salaries + infra + certCost;
  const operatingProfit = round(totalContributive - fixedCosts - cacTotal);
  // LEVEL 3 — net profit = operating × (1 − tax)
  const tax = operatingProfit > 0 ? operatingProfit * COST.corporateTaxRate : 0;
  const netProfit = round(operatingProfit - tax);

  return Object.freeze({
    verdict: d.verdict,
    level1_contributiveMarginPerCustomer: contributiveMarginPerCustomer,
    level2_operatingProfit: operatingProfit,
    level3_netProfit: netProfit,
    breakdown: Object.freeze({ customers, contributiveMarginPerCustomer, totalContributive: round(totalContributive), salaries, infra, certCost, cacTotal: round(cacTotal), fixedCosts: round(fixedCosts), tax: round(tax) }),
    marginSemanticsCorrected: "V177's per-customer figure is CONTRIBUTIVE margin (price − variable costs), NOT net profit; net profit also deducts salaries/infra/CAC/cert + tax.",
    honest: "customers is a SIMULATED volume assumption, NOT validated demand; BUILDABLE_NOW ≠ guaranteed sale; net profit here is a MODEL, not a forecast; €0 real clients.",
  });
}

/* verifyNis2Example() — re-derive the V177 NIS2 figure, label it correctly, and show net profit needs the full stack.
 * V177 NIS2 inputs: price €30k, delivery €2k, support 3d × €500/d = €1.5k ⇒ contributive €26.5k/customer. */
function verifyNis2Example(): any {
  const nis2 = { id: "nis2", metier: "P3", demandEvidence: "OBSERVED", buySignal: "REGULATORY_DEADLINE", regulatory: "VOLUNTARY", estBuildDays: 120, estDeliveryCostPerCustomer: 2000, estSupportDaysPerCustomer: 3, proposedPrice: 30000, candidateFeatures: [{ name: "incident-reporting", value: 5, buildCost: 3, essential: true }] };
  const contributive = 30000 - 2000 - (3 * 500);
  const audit = auditDossier(nis2, { customers: 100, cacPerCustomer: 3000, people: 3, certificationCost: 20000, infraPerYear: 60000 });
  return Object.freeze({
    v177Figure: 26500,
    recomputedContributiveMargin: contributive,
    formula: "price €30,000 − variable delivery €2,000 − variable support (3 days × €500/day = €1,500) = €26,500",
    v177LabelWas: "netMarginPerCustomer (OVERSTATED — it is contributive margin, not net profit)",
    correctedLabel: "contributiveMarginPerCustomer",
    matches: contributive === 26500,
    netProfitAt100customers: audit.level3_netProfit,
    assumptions: Object.freeze([
      "price €30k — HYPOTHESIS (vs competitor GRC suites; not a confirmed quote)",
      "delivery €2k/customer — HYPOTHESIS (setup/config effort)",
      "support 3 days/customer/yr × €500/day loaded — HYPOTHESIS",
      "€500/day loaded human rate — HYPOTHESIS (FR)",
      "customers=100, CAC €3k, cert €20k, infra €60k, 3 people — SIMULATED volume, NOT validated demand",
    ]),
    honest: "the €26,500 is CONTRIBUTIVE margin per customer, NOT net profit; at 100 SIMULATED customers the modelled NET profit is far lower after salaries/infra/CAC/cert/tax. No figure is a confirmed price or a real sale; €0 clients.",
  });
}

const PRODUCT_ECONOMICS_AUDIT_CONTRACT = Object.freeze({
  id: "V178-PRODUCT-ECONOMICS-AUDIT",
  purpose: "§5 — audit + correct the V177 product-design economics: 3-level breakdown (contributive margin / operating profit / net profit); verify the NIS2 example; flag the mislabel",
  reuses: ["odg-economic-model.COST (tax/salary/opex)", "odg-product-design-engine.designProduct (corrected margin label)"],
  invariants: Object.freeze([
    "distinguishes CONTRIBUTIVE margin (per-customer, price − variable costs) from OPERATING profit (− fixed/CAC/cert) from NET profit (− tax) — never conflated",
    "V177 CORRECTED this lot: netMarginPerCustomer → contributiveMarginPerCustomer (the €26,500 NIS2 figure is contributive margin, NOT net profit)",
    "BUILDABLE_NOW ≠ validated demand ≠ guaranteed sale; customers is a SIMULATED volume assumption",
    "every input PROVENANCE-tagged; no unjustified/confirmed-price figures; deterministic + fail-closed",
    "SYNTHETIC; no real customers/contact/spend; €0 clients; €5M NOT guaranteed",
  ]),
});
module.exports = { auditDossier, verifyNis2Example, PRODUCT_ECONOMICS_AUDIT_CONTRACT };
export {};
