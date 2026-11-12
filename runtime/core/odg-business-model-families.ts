#!/usr/bin/env node
"use strict";
/*
 * V172 (§3/§4 — business-model family comparison + product selection + the €5M path services-only couldn't reach).
 * PURE, deterministic, fail-closed. REUSES odg-economic-model.COST (tax/salary/opex) — NO duplicate cost model.
 *
 * V170 proved human-services CANNOT reach €5M net yr-1 (delivery-days ≫ ≤5-person capacity). This module compares six
 * model families to find which CAN mathematically reach €5M with ≤5 people + ODG automation, and the EXACT customer-count
 * condition. HONESTY (strict): all demand is SIMULATED under stated assumptions — NO real customers/contracts/revenue; the
 * customer counts are MODELLED requirements, not validated demand (which is OWNER_GATED). Nothing is guaranteed; €0 real clients.
 */
const ECON = require("./odg-economic-model.js");
const COST = ECON.COST;

// Family profiles. arpu = annual revenue/customer €; grossMargin; deliveryDaysPerCustomerPerYear = support/delivery burden
// (the capacity driver — low for SaaS/license where ODG automates, high for human services); recurringShare; churn; cac €;
// capitalMonthsRunway = months of opex to fund before break-even. All HYPOTHESIS unless a prior dossier sourced it.
const FAMILIES = Object.freeze([
  { id: "human_services", name: "human-delivered specialist services", arpu: 18000, grossMargin: 0.72, deliveryDaysPerCustomer: 9.0, recurringShare: 0.30, churn: 0.20, cac: 2500, capitalMonths: 6, provenance: "HYPOTHESIS (V170 baseline)" },
  { id: "productized_odg", name: "productized services with ODG automation", arpu: 30000, grossMargin: 0.80, deliveryDaysPerCustomer: 3.0, recurringShare: 0.55, churn: 0.14, cac: 3000, capitalMonths: 9, provenance: "HYPOTHESIS (ODG automates delivery)" },
  { id: "saas", name: "SaaS / recurring subscription", arpu: 24000, grossMargin: 0.85, deliveryDaysPerCustomer: 0.6, recurringShare: 0.92, churn: 0.10, cac: 3500, capitalMonths: 18, provenance: "HYPOTHESIS (€2k/mo self-serve + ODG support)" },
  { id: "licensing_api", name: "licensing / API / technology product", arpu: 12000, grossMargin: 0.92, deliveryDaysPerCustomer: 0.3, recurringShare: 0.80, churn: 0.12, cac: 2000, capitalMonths: 15, provenance: "HYPOTHESIS (per-seat/usage license)" },
  { id: "platform_marketplace", name: "platform / marketplace (take-rate)", arpu: 9000, grossMargin: 0.88, deliveryDaysPerCustomer: 0.4, recurringShare: 0.70, churn: 0.18, cac: 1800, capitalMonths: 30, provenance: "HYPOTHESIS (take-rate on GMV; network effects; capital-heavy)" },
  { id: "hybrid", name: "hybrid: recurring software + premium services", arpu: 40000, grossMargin: 0.78, deliveryDaysPerCustomer: 4.0, recurringShare: 0.65, churn: 0.12, cac: 3500, capitalMonths: 12, provenance: "HYPOTHESIS (software €24k + premium services €16k)" },
]);

const TARGET_NET = 5000000;
function round(n: number): number { return Math.round(n); }

/* evaluateFamily(f, people, leverage) — solve the customer count N needed for €5M net, and whether ≤people (with ODG
 * automation leverage) can DELIVER that N within capacity. Net = (N·arpu·GM − fixed − salaries − N·(cac/capitalMonths amort;
 * approximated as cac spread over year))·(1−tax). We solve N for net = TARGET_NET. */
function evaluateFamily(f: any, people: number, leverage: number): any {
  const fixed = COST.fixedOpexPerYear + people * COST.loadedSalaryPerPerson;
  // per-customer annual contribution to pre-tax profit = arpu*GM − cac (acquisition, charged in year 1).
  const perCustomerContribution = f.arpu * f.grossMargin - f.cac;
  const preTaxNeeded = TARGET_NET / (1 - COST.corporateTaxRate);
  const customersNeeded = perCustomerContribution > 0 ? Math.ceil((preTaxNeeded + fixed) / perCustomerContribution) : Infinity;

  const capacityDays = people * COST.workingDaysPerPersonYear * leverage;
  const deliveryDaysNeeded = Number.isFinite(customersNeeded) ? round(customersNeeded * f.deliveryDaysPerCustomer) : Infinity;
  const capacityFeasible = Number.isFinite(customersNeeded) && deliveryDaysNeeded <= capacityDays;

  const revenueAtTarget = Number.isFinite(customersNeeded) ? round(customersNeeded * f.arpu) : Infinity;
  const capitalRequired = round(fixed * (f.capitalMonths / 12)); // runway to fund fixed cost before break-even

  return Object.freeze({
    family: f.id, name: f.name,
    arpu: f.arpu, grossMargin: f.grossMargin, recurringShare: f.recurringShare,
    perCustomerContribution: round(perCustomerContribution),
    customersNeededFor5MNet: Number.isFinite(customersNeeded) ? customersNeeded : "INFEASIBLE (per-customer contribution ≤ 0)",
    revenueAtTarget,
    deliveryDaysNeeded, capacityDays: round(capacityDays), capacityFeasible,
    capitalRequiredEUR: capitalRequired,
    reaches5MWithinTeam: capacityFeasible,
    provenance: f.provenance,
  });
}

/* compareFamilies(opts?) — evaluate all families at the 5-person + aggressive-leverage frontier (the best case for reaching
 * €5M), rank by feasibility then by the LOWEST customer bar (easiest demand to validate). */
function compareFamilies(opts?: any): any {
  const people = opts && opts.people ? opts.people : 5;
  const leverage = opts && typeof opts.leverage === "number" ? opts.leverage : COST.odgAutonomyLeverage.aggressive;
  const rows = FAMILIES.map((f) => evaluateFamily(f, people, leverage));
  const feasible = rows.filter((r: any) => r.reaches5MWithinTeam && typeof r.customersNeededFor5MNet === "number");
  feasible.sort((a: any, b: any) => (a.customersNeededFor5MNet as number) - (b.customersNeededFor5MNet as number));
  return Object.freeze({ people, leverage, rows: Object.freeze(rows), feasibleFamilies: Object.freeze(feasible.map((r: any) => r.family)), lowestDemandBar: feasible.length ? feasible[0].family : null });
}

/* selectPrimaryProduct — pick the primary product family: feasible within ≤5 people AND the lowest customer bar (least
 * demand risk), with explicit justification. Services-only is NOT selected (V170 infeasibility). */
function selectPrimaryProduct(): any {
  const cmp = compareFamilies();
  const primary = cmp.lowestDemandBar;
  const primaryRow = cmp.rows.find((r: any) => r.family === primary);
  const servicesRow = cmp.rows.find((r: any) => r.family === "human_services");
  return Object.freeze({
    primaryProduct: primary,
    justification: primary
      ? `${primaryRow.name}: reaches €5M net within ≤5 people (${primaryRow.deliveryDaysNeeded} delivery-days ≤ ${primaryRow.capacityDays} capacity) at the LOWEST customer bar (${primaryRow.customersNeededFor5MNet} customers) — least demand-validation risk. Recurring share ${Math.round(primaryRow.recurringShare * 100)}%.`
      : "no family reaches €5M net within ≤5 people under these assumptions",
    customersNeeded: primaryRow ? primaryRow.customersNeededFor5MNet : null,
    capitalRequiredEUR: primaryRow ? primaryRow.capitalRequiredEUR : null,
    servicesOnlyRejected: `human-services needs ${servicesRow.deliveryDaysNeeded} delivery-days ≫ ${servicesRow.capacityDays} capacity ⇒ INFEASIBLE within ≤5 people (confirms V170)`,
    secondaryCandidates: Object.freeze(cmp.feasibleFamilies.filter((f: string) => f !== primary)),
    honest: "customersNeeded is a MODELLED requirement under SIMULATED demand — NOT validated demand (which is OWNER_GATED). €5M is NOT guaranteed; €0 real clients. Reaching it requires acquiring the modelled customer volume at the assumed ARPU/margin/churn.",
  });
}

const BUSINESS_MODEL_FAMILIES_CONTRACT = Object.freeze({
  id: "V172-BUSINESS-MODEL-FAMILIES",
  purpose: "§3/§4 — compare 6 business-model families for the €5M-net-yr1 path, select a primary product, state exact customer conditions + capacity/capital",
  reuses: ["odg-economic-model.COST (tax/salary/opex) — NO duplicate cost model"],
  invariants: Object.freeze([
    "solves the EXACT customer count for €5M net per family + tests ≤5-person+ODG-automation delivery capacity",
    "human-services is INFEASIBLE within ≤5 people (confirms V170); recurring/automation families are the only €5M path",
    "all demand SIMULATED — customer counts are MODELLED requirements, NOT validated demand (OWNER_GATED); nothing guaranteed; €0 real clients",
    "€500M platform-scale handled separately (odg-economic-model.ambition500M) — not confused with the €5M yr-1 commitment",
    "deterministic + fail-closed; reuses the canonical cost model; no fabricated demand/contracts/revenue",
  ]),
});
module.exports = { FAMILIES, evaluateFamily, compareFamilies, selectPrimaryProduct, BUSINESS_MODEL_FAMILIES_CONTRACT };
export {};
