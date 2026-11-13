#!/usr/bin/env node
"use strict";
/*
 * V180-A (§1 + §4) — THREE-PERSON autonomous-business economic model. PURE, READ-ONLY, deterministic, fail-closed.
 *
 * The addendum tightens the human cap from 5 to **3 (ABSOLUTE)** and demands: (a) test lever COMBINATIONS (not each
 * lever in isolation); (b) pessimistic / central / optimistic scenarios with sensitivity + break thresholds; (c) the
 * model must AUTO-REJECT any trajectory that needs more than 3 people; (d) €500M treated as a SEPARATE ambition with
 * DISTINCT metrics (CA ≠ net ≠ valuation ≠ volume ≠ cumulative), never conflated with the €5M-net year-one target.
 *
 * NO SECOND ECONOMIC MODEL: this is a thin lever+constraint layer over odg-economic-scaling-model.scaleAtVolume
 * (which itself reuses odg-economic-model.COST). Levers are applied by transforming the opportunity + scenario inputs
 * BEFORE calling scaleAtVolume; the €-formula and per-jurisdiction tax stay in that one model. The 3-person cap is then
 * ENFORCED on top of its endogenous people count. €5M = a MODEL CONDITION, never a forecast; demand stays OWNER_GATED.
 */

const SCALE = require("./odg-economic-scaling-model.js");
const { COST } = require("./odg-economic-model.js");

const TEAM_CAP = 3;            // ABSOLUTE human cap (V180-A §1) — was 5
// Must match odg-economic-scaling-model.ODG_SUPPORT_AUTOMATION (not exported there). Coupling is guarded by a test
// that asserts automationLevel=0.6 reproduces scaleAtVolume's own people/net exactly.
const BASELINE_AUTOMATION = 0.6;

const VERDICT = Object.freeze(["FEASIBLE_WITHIN_CAP", "TEAM_CAP_EXCEEDED", "NET_BELOW_TARGET"]);

/* The levers the addendum §4 asks ODG to search — each maps to a REAL input of scaleAtVolume (no invented economics). */
function defaultLevers(): any {
  return {
    priceFactor: 1,          // >1 = higher price / mid-market positioning / cross-sell ARPU uplift
    automationLevel: BASELINE_AUTOMATION, // share of support effort ODG automates (0..0.95); higher ⇒ more customers per person
    cacPerCustomer: 3000,    // acquisition cost / customer
    jurisdiction: "FR",      // FR/IE/UK/US/AE (per-jurisdiction corporate tax)
  };
}

// Convert a desired automationLevel into the estSupportDaysPerCustomer that, after scaleAtVolume's built-in (1-0.6)
// multiplication, yields raw*(1-automationLevel). Keeps all €-math inside scaleAtVolume.
function supportDaysForAutomation(rawDays: number, automationLevel: number): number {
  const a = Math.max(0, Math.min(0.95, Number(automationLevel)));
  return rawDays * (1 - a) / (1 - BASELINE_AUTOMATION);
}

/* evaluateCombination — one point in the lever space at a given customer count. Returns the full §4 field list + verdict. */
function evaluateCombination(opp: any, customers: number, levers: any, targetNet?: number): any {
  const L = Object.assign(defaultLevers(), levers || {});
  const target = Number.isFinite(targetNet) ? (targetNet as number) : 5000000;
  const rawSupport = Number(opp.estSupportDaysPerCustomer) || 0;
  const oppT = Object.assign({}, opp, { estSupportDaysPerCustomer: supportDaysForAutomation(rawSupport, L.automationLevel) });
  const scenario = { priceFactor: L.priceFactor, cacPerCustomer: L.cacPerCustomer };
  const r = SCALE.scaleAtVolume(oppT, customers, L.jurisdiction, scenario);

  // ENFORCE the 3-person cap on top of scaleAtVolume's endogenous people count.
  const overCap = r.people > TEAM_CAP || r.teamCapExceeded;
  const net = r.level3_netProfit;
  const verdict = overCap ? "TEAM_CAP_EXCEEDED" : (net >= target ? "FEASIBLE_WITHIN_CAP" : "NET_BELOW_TARGET");

  return Object.freeze({
    customers, levers: Object.freeze(L), verdict,
    people: r.people, teamCap: TEAM_CAP, withinCap: !overCap,
    // ---- the §4 required fields, every scenario ----
    averageRevenuePerCustomer: r.detail.effectivePrice,
    recurringRevenue: r.detail.effectivePrice * customers,   // annual subscription = recurring (year 1)
    oneOffRevenue: 0,                                         // this product is subscription-first; one-off = 0 (honest)
    variableCostsTotal: (r.detail.deliveryCost + r.detail.supportVarCost + r.detail.txnCostPerCust) * customers,
    fixedCostsTotal: r.detail.salaries + r.detail.infra + r.detail.certCost,
    supportDeliveryCapacity: Object.freeze({ peopleUsed: r.people, supportDaysNeeded: r.detail.supportDaysNeeded, automationLevel: L.automationLevel }),
    cacTotal: r.detail.cacTotal,
    cashNeeded: r.detail.workingCapital,                     // working-capital proxy (flagged, NOT a cost)
    salaries: r.detail.salaries,
    taxRate: r.detail.taxRate, tax: r.detail.tax,
    level1_contributive: r.level1_totalContributive,
    level2_operatingProfit: r.level2_operatingProfit,
    level3_netProfit: net,
    humanWorkload: Object.freeze({ people: r.people, note: "support person-days drive the people count; cap = 3" }),
    automationDemonstrated: `${Math.round(L.automationLevel * 100)}% (support) — DEMONSTRATED baseline is ${Math.round(BASELINE_AUTOMATION * 100)}% (V174 engine); anything above is a HYPOTHESIS lever, not yet proven`,
    demandEvidence: "OWNER_GATED — this customer volume is SIMULATED, not validated demand",
    note: overCap ? `REJECTED: needs ${r.people} people > cap ${TEAM_CAP}` : (net >= target ? `€${target} net reachable at this point WITHIN ${TEAM_CAP} people (MODEL condition; demand unvalidated)` : `net €${net} < target €${target} within ${TEAM_CAP} people`),
  });
}

/* scenarioSet — pessimistic / central / optimistic, explicit lever values (combinations, not isolated levers). */
function scenarioSet(opp: any, customers: number, targetNet?: number): any {
  const defs = [
    { name: "pessimistic", levers: { priceFactor: 0.8, automationLevel: 0.6, cacPerCustomer: 5000, jurisdiction: "FR" } },
    { name: "central",     levers: { priceFactor: 1.0, automationLevel: 0.7, cacPerCustomer: 3000, jurisdiction: "FR" } },
    { name: "optimistic",  levers: { priceFactor: 1.4, automationLevel: 0.85, cacPerCustomer: 2000, jurisdiction: "IE" } },
  ];
  return Object.freeze({
    customers,
    scenarios: Object.freeze(defs.map((d) => Object.freeze({ name: d.name, ...evaluateCombination(opp, customers, d.levers, targetNet) }))),
    note: "pessimistic/central/optimistic each combine MULTIPLE levers simultaneously; all enforce the 3-person cap.",
  });
}

/* sensitivity — vary ONE lever at a time around the central scenario; report Δnet. Shows which lever moves net most. */
function sensitivity(opp: any, customers: number): any {
  const base = { priceFactor: 1.0, automationLevel: 0.7, cacPerCustomer: 3000, jurisdiction: "FR" };
  const baseNet = evaluateCombination(opp, customers, base).level3_netProfit;
  const probes = [
    { lever: "priceFactor", up: { priceFactor: 1.2 }, down: { priceFactor: 0.8 } },
    { lever: "automationLevel", up: { automationLevel: 0.85 }, down: { automationLevel: 0.55 } },
    { lever: "cacPerCustomer", up: { cacPerCustomer: 1500 }, down: { cacPerCustomer: 6000 } },
    { lever: "jurisdiction", up: { jurisdiction: "AE" }, down: { jurisdiction: "US" } },
  ];
  const rows = probes.map((p) => {
    const hi = evaluateCombination(opp, customers, Object.assign({}, base, p.up));
    const lo = evaluateCombination(opp, customers, Object.assign({}, base, p.down));
    return Object.freeze({ lever: p.lever, baseNet, upNet: hi.level3_netProfit, upWithinCap: hi.withinCap, downNet: lo.level3_netProfit, downWithinCap: lo.withinCap, swing: hi.level3_netProfit - lo.level3_netProfit });
  });
  rows.sort((a: any, b: any) => Math.abs(b.swing) - Math.abs(a.swing));
  return Object.freeze({ customers, baseNet, rows: Object.freeze(rows), note: "one-lever-at-a-time around central; sorted by |Δnet|." });
}

/* searchFor5M — grid search over lever COMBINATIONS × customer volumes; return feasible €5M-within-3-people paths (if any)
 * and the breakdown of why the rest fail. This is the addendum's core question. */
function searchFor5M(opp: any, targetNet?: number): any {
  const target = Number.isFinite(targetNet) ? (targetNet as number) : 5000000;
  const priceFactors = [1.0, 1.25, 1.5, 2.0];
  const automationLevels = [0.6, 0.7, 0.8, 0.9];
  const cacs = [1500, 3000];
  const jurs = ["FR", "IE", "AE"];
  const volumes = [100, 200, 259, 350, 500, 750, 1000];
  const feasible: any[] = []; let evaluated = 0; const rejectCounts: any = { TEAM_CAP_EXCEEDED: 0, NET_BELOW_TARGET: 0 };
  for (const pf of priceFactors) for (const au of automationLevels) for (const cac of cacs) for (const j of jurs) for (const v of volumes) {
    evaluated++;
    const e = evaluateCombination(opp, v, { priceFactor: pf, automationLevel: au, cacPerCustomer: cac, jurisdiction: j }, target);
    if (e.verdict === "FEASIBLE_WITHIN_CAP") feasible.push(e); else rejectCounts[e.verdict]++;
  }
  // rank feasible by lowest "stretch": prefer lower price factor, lower automation, higher-evidence jurisdiction, fewer customers
  feasible.sort((a: any, b: any) => (a.levers.priceFactor - b.levers.priceFactor) || (a.levers.automationLevel - b.levers.automationLevel) || (a.customers - b.customers));
  const minimal = feasible.length ? feasible[0] : null;
  return Object.freeze({
    target, evaluated, feasibleCount: feasible.length, rejectCounts: Object.freeze(rejectCounts),
    reachable: feasible.length > 0,
    leastStretchPath: minimal,
    conclusion: feasible.length === 0
      ? `€${target} net within ${TEAM_CAP} people is NOT reachable anywhere in the searched lever space — more aggressive levers or a different product are required.`
      : `€${target} net within ${TEAM_CAP} people IS reachable in the MODEL, but every feasible path requires lever COMBINATIONS beyond the demonstrated baseline (least-stretch: price×${minimal.levers.priceFactor}, automation ${Math.round(minimal.levers.automationLevel * 100)}%, ${minimal.customers} customers, ${minimal.levers.jurisdiction}) — AND that customer volume is UNVALIDATED demand (OWNER_GATED). Not a forecast.`,
    honesty: "feasible = MODEL feasibility only. Demonstrated support automation is 60% (V174); higher levels and mid-market price factors are HYPOTHESES. €0 clients; demand unvalidated.",
  });
}

/* fiveHundredMTrajectories — €500M as a SEPARATE ambition. Five DISTINCT metrics, never conflated; each with its own
 * definition and an illustrative (NOT forecast) structural path. No single number is presented as "the €500M". */
function fiveHundredMTrajectories(): any {
  const metrics = [
    { metric: "annual_revenue_CA", definition: "€500M annual recurring revenue (turnover) in a single year", illustrativePath: "~20,000 customers @ €25k ARPU, or ~10,000 @ €50k — multi-métier SaaS + partner distribution; far beyond a 3-person support cap ⇒ requires a scaled org or near-total support automation", conflationWarning: "CA is NOT profit" },
    { metric: "annual_net_profit", definition: "€500M net profit in a single year", illustrativePath: "requires ~€2B+ CA at 25% net margin — platform/licence/API economics; a different company stage entirely", conflationWarning: "net ≠ CA; this is ~100× the year-one €5M-net target" },
    { metric: "enterprise_valuation", definition: "€500M company valuation (equity value)", illustrativePath: "~€50-100M ARR at a 5-10× SaaS multiple — an exit/raise metric, not an operating result", conflationWarning: "valuation ≠ revenue ≠ profit ≠ cash" },
    { metric: "cumulative_revenue", definition: "€500M revenue accumulated over multiple years", illustrativePath: "e.g. ~5-7 years compounding from the year-one base — a cumulative, not annual, figure", conflationWarning: "cumulative ≠ single-year" },
    { metric: "transaction_volume", definition: "€500M of business VOLUME processed (e.g. marketplace GMV)", illustrativePath: "platform/marketplace take-rate model — €500M GMV at ~10% take = €50M revenue", conflationWarning: "volume processed ≠ own revenue (only the take-rate is ODG's)" },
  ];
  return Object.freeze({
    ambition: "€500M is a strategic DEVELOPMENT ambition, separate from the year-one €5M-net target; it must NOT divert resources from year one.",
    metrics: Object.freeze(metrics.map((m) => Object.freeze(m))),
    note: "DISTINCT metrics, never conflated. Paths are STRUCTURAL illustrations (orders of magnitude), NOT forecasts and NOT validated demand. Which metric a scenario targets must always be stated explicitly.",
  });
}

const THREE_PERSON_MODEL_CONTRACT = Object.freeze({
  id: "V180-A-THREE-PERSON-ECONOMIC-MODEL",
  purpose: "§1+§4 — enforce the ABSOLUTE 3-person cap over the existing scaling model; search lever COMBINATIONS for €5M net; separate €500M metrics",
  reuses: "odg-economic-scaling-model.scaleAtVolume (which reuses odg-economic-model.COST) — NO second economic formula",
  invariants: Object.freeze([
    "TEAM_CAP = 3 is ABSOLUTE; any trajectory needing >3 people is AUTO-REJECTED (verdict TEAM_CAP_EXCEEDED), never silently allowed",
    "levers map to REAL scaleAtVolume inputs; combinations tested together, not only in isolation; sensitivity reported",
    "€5M = a MODEL CONDITION; feasibility ≠ forecast; demand stays OWNER_GATED and SIMULATED",
    "€500M = separate ambition with DISTINCT metrics (CA ≠ net ≠ valuation ≠ cumulative ≠ volume), never conflated",
    "READ-ONLY; deterministic; fail-closed; no competing register/model; €0 clients",
  ]),
});

module.exports = { TEAM_CAP, BASELINE_AUTOMATION, VERDICT, defaultLevers, evaluateCombination, scenarioSet, sensitivity, searchFor5M, fiveHundredMTrajectories, THREE_PERSON_MODEL_CONTRACT };
export {};
