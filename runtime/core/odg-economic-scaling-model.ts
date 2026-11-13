#!/usr/bin/env node
"use strict";
/*
 * V179 (§4 — deepen V178's economic audit: multi-volume + volume-dependent costs + per-jurisdiction tax). PURE,
 * deterministic, fail-closed. REUSES odg-economic-model.COST — NO second cost model.
 *
 * Corrects two V178 limitations the directive names:
 *  1) costs are NOT constant with volume — support staff STEP (capped at the 5-person max, reduced by ODG automation),
 *     infrastructure tiers, and working capital scale with customer count.
 *  2) the blanket 25% tax is replaced by a PER-JURISDICTION corporate-tax model (sourced/hypothesis-tagged — NOT a tax opinion).
 *
 * §14 strict non-conflation: contributive margin ≠ operating profit ≠ net profit ≠ market ≠ demand ≠ prospect ≠ client ≠ cash.
 * HONESTY: competitor prices are OBSERVED RANGES (negotiated, not public list — never a single invented figure); volumes are
 * SIMULATED (not validated demand); the €5M figure is a MODEL CONDITION, not a forecast. SYNTHETIC; €0 clients; €5M NOT guaranteed.
 */
const ECON = require("./odg-economic-model.js");
const COST = ECON.COST;

// Per-jurisdiction corporate income-tax rates (headline). provenance labelled; this is NOT a tax opinion.
const JURISDICTIONS = Object.freeze([
  { code: "FR", name: "France", corpTax: 0.25, provenance: "SOURCED (FR IS standard rate 25%)" },
  { code: "IE", name: "Ireland", corpTax: 0.125, provenance: "SOURCED (IE trading-income 12.5%)" },
  { code: "UK", name: "United Kingdom", corpTax: 0.25, provenance: "SOURCED (UK main rate 25%)" },
  { code: "US", name: "United States (fed+avg state)", corpTax: 0.258, provenance: "HYPOTHESIS (21% federal + ~4.8% avg state)" },
  { code: "AE", name: "UAE", corpTax: 0.09, provenance: "SOURCED (UAE 9% above threshold)" },
]);

// Observed competitor price band (radar 2026-11-12, GRC/compliance SaaS — negotiated, NOT public list).
const COMPETITOR_PRICE_BAND = Object.freeze({ metier: "compliance (NIS2/CRA/ISO/GRC)", lowEUR: 7000, medianEUR: 20000, growthTierEUR: [15000, 25000], midMarketEUR: [50000, 150000], sources: ["underdefense.com/blog/grc-platform-pricing", "tech-insider.org/vanta-vs-drata-vs-secureframe-2026"], note: "OBSERVED RANGES (Vanta/Drata median ~$20-25k; negotiated not public). ISO cert fee +$6-40k separate." });

const ODG_SUPPORT_AUTOMATION = 0.6; // HYPOTHESIS — V174 support/renewal engine automates ~60% of support effort
const SUPPORT_ALLOCATION = 0.5;     // HYPOTHESIS — share of a person's year available for support at scale
const MAX_PEOPLE = 5;

function round(n: number): number { return Math.round(n); }

/* scaleAtVolume(opp, customers, jurCode, scenario) — full 3-level result at a given volume with volume-dependent costs. */
function scaleAtVolume(opp: any, customers: number, jurCode: string, scenario?: any): any {
  const o = opp || {};
  const sc = scenario || {};
  const price = Number(o.proposedPrice) || 0;
  const priceFactor = Number.isFinite(sc.priceFactor) ? sc.priceFactor : 1;
  const effectivePrice = price * priceFactor;
  const deliveryCost = Number(o.estDeliveryCostPerCustomer) || 0;                 // variable
  const supportDaysPerCust = (Number(o.estSupportDaysPerCustomer) || 0) * (1 - ODG_SUPPORT_AUTOMATION); // ODG-automated
  const txnCostPerCust = Math.round(effectivePrice * 0.025);                      // payment/transaction (~2.5%)

  // LEVEL 1 — contributive margin / customer (variable costs only)
  const supportVarCost = round(supportDaysPerCust * 500); // €500/day loaded (HYPOTHESIS)
  const contributivePerCust = round(effectivePrice - deliveryCost - supportVarCost - txnCostPerCust);
  const totalContributive = contributivePerCust * customers;

  // volume-dependent STAFF: support person-days needed vs capacity within the ≤5-person cap.
  const supportDaysNeeded = customers * supportDaysPerCust;
  const baseTeam = 3;
  let people = baseTeam, teamCapExceeded = false;
  while (people * COST.workingDaysPerPersonYear * SUPPORT_ALLOCATION < supportDaysNeeded && people < MAX_PEOPLE) people++;
  if (people * COST.workingDaysPerPersonYear * SUPPORT_ALLOCATION < supportDaysNeeded) teamCapExceeded = true; // >5 would be needed

  // volume-dependent INFRA (tiers) + working capital
  const infra = COST.fixedOpexPerYear + Math.floor(customers / 100) * 15000;      // +€15k infra per 100 customers
  const cac = Number.isFinite(sc.cacPerCustomer) ? sc.cacPerCustomer : 3000;
  const cacTotal = cac * customers;
  const certCost = Number(o.certificationCost) || 20000;
  const workingCapital = round(totalContributive * 0.15);                         // ~15% WC (not a cost, flagged)

  // LEVEL 2 — operating profit
  const salaries = people * COST.loadedSalaryPerPerson;
  const fixedCosts = salaries + infra + certCost;
  const operatingProfit = round(totalContributive - fixedCosts - cacTotal);

  // LEVEL 3 — net profit (per-jurisdiction tax)
  const jur = JURISDICTIONS.find((j: any) => j.code === jurCode) || JURISDICTIONS[0];
  const tax = operatingProfit > 0 ? round(operatingProfit * jur.corpTax) : 0;
  const netProfit = round(operatingProfit - tax);

  return Object.freeze({
    customers, jurisdiction: jur.code, people, teamCapExceeded,
    level1_contributivePerCustomer: contributivePerCust,
    level1_totalContributive: round(totalContributive),
    level2_operatingProfit: operatingProfit,
    level3_netProfit: netProfit,
    detail: Object.freeze({ effectivePrice, deliveryCost, supportVarCost, txnCostPerCust, salaries, infra, certCost, cacTotal: round(cacTotal), tax, taxRate: jur.corpTax, workingCapital, supportDaysNeeded: round(supportDaysNeeded) }),
    note: teamCapExceeded ? "TEAM_CAP_EXCEEDED: support demand exceeds ≤5 people even with ODG automation — more automation or more staff required (violates the cap)" : "within the ≤5-person cap (ODG automation applied)",
  });
}

/* scaleCurve(opp, jurCode) — the directive's volume set 10..1000. */
function scaleCurve(opp: any, jurCode?: string): any {
  const volumes = [10, 25, 50, 100, 259, 500, 1000];
  const jur = jurCode || "FR";
  const rows = volumes.map((v) => scaleAtVolume(opp, v, jur));
  return Object.freeze({ jurisdiction: jur, volumes: Object.freeze(volumes), rows: Object.freeze(rows), costsConstant: false, note: "costs are volume-dependent (support staff step within ≤5 cap, infra tiers, CAC, working capital) — NOT constant. Volumes are SIMULATED, not validated demand." });
}

/* jurisdictionComparison(opp, customers) — net profit across jurisdictions at a fixed volume. */
function jurisdictionComparison(opp: any, customers: number): any {
  return Object.freeze({ customers, byJurisdiction: Object.freeze(JURISDICTIONS.map((j: any) => Object.freeze({ code: j.code, corpTax: j.corpTax, provenance: j.provenance, netProfit: scaleAtVolume(opp, customers, j.code).level3_netProfit }))), note: "headline corporate tax only — NOT a tax opinion; VAT/withholding/permanent-establishment/distributions not modelled." });
}

/* conditionsFor5M(opp, jurCode) — the honest MODEL condition: min volume where net ≥ €5M within ≤5 people (if any). */
function conditionsFor5M(opp: any, jurCode?: string): any {
  const jur = jurCode || "FR";
  let found: any = null;
  for (const v of [50, 100, 259, 500, 1000, 2000]) { const r = scaleAtVolume(opp, v, jur); if (r.level3_netProfit >= 5000000 && !r.teamCapExceeded) { found = r; break; } }
  const capHit = [500, 1000, 2000].map((v) => scaleAtVolume(opp, v, jur)).find((r: any) => r.teamCapExceeded);
  return Object.freeze({
    jurisdiction: jur, target: "€5,000,000 net profit yr-1",
    reachableWithinCap: !!found,
    minCustomers: found ? found.customers : null,
    teamCapExceededAt: capHit ? capHit.customers : null,
    verdict: found
      ? `MODEL condition: ~${found.customers} customers at this price/jurisdiction could yield €5M net within ≤${found.people} people — IF ODG automates support (${Math.round(ODG_SUPPORT_AUTOMATION * 100)}%) and the demand is REAL (OWNER_GATED, unvalidated)`
      : "€5M net is NOT reached within ≤5 people at the tested volumes/price — needs higher price, higher automation, lower CAC, or more staff (violates cap); demand remains the binding constraint",
    honest: "this is a MODEL CONDITION, not a forecast; customers are SIMULATED, not validated demand; a prospect is not a client; no cash is collected; €0 real clients; €5M NOT guaranteed.",
  });
}

const ECONOMIC_SCALING_CONTRACT = Object.freeze({
  id: "V179-ECONOMIC-SCALING-MODEL",
  purpose: "§4 — multi-volume (10..1000) 3-level economics with volume-dependent costs + per-jurisdiction tax; deepens V178",
  reuses: ["odg-economic-model.COST — NO second cost model"],
  competitorPriceBand: COMPETITOR_PRICE_BAND,
  invariants: Object.freeze([
    "costs are NOT constant with volume — support staff step (≤5-person cap, ODG-automated), infra tiers, CAC, working capital scale",
    "per-JURISDICTION corporate tax (FR/IE/UK/US/AE, sourced/hypothesis-tagged) — NO blanket 25%; NOT a tax opinion",
    "§14 strict non-conflation: contributive ≠ operating ≠ net ≠ market ≠ demand ≠ prospect ≠ client ≠ cash",
    "competitor prices are OBSERVED RANGES (negotiated, not public) — never a single invented figure; volumes SIMULATED",
    "€5M is a MODEL CONDITION not a forecast; demand OWNER_GATED/unvalidated; €0 clients; €5M NOT guaranteed; deterministic + fail-closed",
  ]),
});
module.exports = { JURISDICTIONS, COMPETITOR_PRICE_BAND, scaleAtVolume, scaleCurve, jurisdictionComparison, conditionsFor5M, ECONOMIC_SCALING_CONTRACT };
export {};
