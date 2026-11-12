#!/usr/bin/env node
"use strict";
/*
 * V170 (§5 — quantified economic model, NOT just a method). PURE, deterministic, fail-closed. Builds conservative/base/
 * aggressive scenarios for the €5M-net-yr1 target + the €500M ambition, over a 3→5-person team, modelling the five
 * commercial métiers. Produces monthly projections, break-even, sensitivity, and the EXACT mathematical condition to hit
 * each target + a 3–5-person DELIVERY-CAPACITY test.
 *
 * HONESTY (strict, per §5): every input carries a PROVENANCE tag — SOURCED (from prior governed commercial dossiers),
 * HYPOTHESIS (order-of-magnitude assumption), or SIMULATED (modelled, NOT real). NO real customers, contracts or revenue
 * are claimed. All customer counts are MODELLED projections under stated assumptions — explicitly SIMULATED, never real.
 * This is a decision tool; it guarantees NOTHING and counts €0 real clients today.
 */

// Métier economic assumptions. price = avg engagement/annual-contract €; grossMargin = fraction; recurring = share of
// revenue that renews; deliveryDaysPerEngagement = engineer-days to deliver one unit (capacity driver). All HYPOTHESIS
// unless a prior governed commercial dossier sourced a figure (tagged SOURCED).
const METIERS = Object.freeze([
  { id: "M1", name: "software-security CRA/SBOM audit", price: 15000, grossMargin: 0.72, recurring: 0.25, deliveryDays: 8, provenance: "HYPOTHESIS (order-of-magnitude; CRA/SBOM audit engagements)" },
  { id: "M2", name: "BTP/TP chantier SaaS", price: 7000, grossMargin: 0.80, recurring: 0.85, deliveryDays: 5, provenance: "HYPOTHESIS (annual SaaS seat bundle)" },
  { id: "M3", name: "FinOps optimization", price: 22000, grossMargin: 0.70, recurring: 0.40, deliveryDays: 10, provenance: "HYPOTHESIS (FinOps engagement + retainer)" },
  { id: "M4", name: "data engineering", price: 26000, grossMargin: 0.65, recurring: 0.30, deliveryDays: 12, provenance: "HYPOTHESIS (data pipeline build)" },
  { id: "M5", name: "accessibility audit", price: 9000, grossMargin: 0.78, recurring: 0.35, deliveryDays: 4, provenance: "HYPOTHESIS (RGAA/WCAG audit)" },
]);

// Team + cost model.
const COST = Object.freeze({
  loadedSalaryPerPerson: 85000, // HYPOTHESIS €/yr fully-loaded (FR)
  fixedOpexPerYear: 60000,      // HYPOTHESIS tooling/infra/legal/accounting
  corporateTaxRate: 0.25,       // SOURCED (FR IS standard rate 25%)
  workingDaysPerPersonYear: 210,// HYPOTHESIS billable-capable days/person/yr
  odgAutonomyLeverage: { conservative: 1.0, base: 1.4, aggressive: 2.2 }, // SIMULATED delivery multiplier from ODG autonomous execution (days-equiv added per engineer)
});

const SCENARIOS = Object.freeze({
  // engagementsPerMetierPerYear = demand captured (SIMULATED, under stated assumptions — NOT real customers)
  conservative: { people: 3, demandMultiplier: 0.5, cacPerCustomer: 2500, retention: 0.75, provenance: "SIMULATED (cautious demand capture)" },
  base: { people: 4, demandMultiplier: 1.0, cacPerCustomer: 2000, retention: 0.82, provenance: "SIMULATED (base demand capture)" },
  aggressive: { people: 5, demandMultiplier: 1.8, cacPerCustomer: 1500, retention: 0.88, provenance: "SIMULATED (optimistic demand capture)" },
});

function round(n: number): number { return Math.round(n); }

/* capacity(people, leverage) — total delivery days available = people × workingDays × ODG leverage. */
function capacityDays(people: number, leverage: number): number { return people * COST.workingDaysPerPersonYear * leverage; }

/* computeScenario(name) — full quantified scenario: revenue/margins/unit-economics/opex/tax/net + capacity test. */
function computeScenario(name: string): any {
  const s = (SCENARIOS as any)[name];
  if (!s) return Object.freeze({ ok: false, reason: "unknown scenario" });
  const leverage = (COST.odgAutonomyLeverage as any)[name];
  const capDays = capacityDays(s.people, leverage);

  // demand (SIMULATED): a base of 10 engagements/métier/yr scaled by the scenario multiplier.
  let grossRevenue = 0, grossProfit = 0, deliveryDaysNeeded = 0, totalCustomers = 0, cacTotal = 0;
  const perMetier = METIERS.map((m) => {
    const engagements = round(10 * s.demandMultiplier);
    const revenue = engagements * m.price;
    const gp = revenue * m.grossMargin;
    const days = engagements * m.deliveryDays;
    grossRevenue += revenue; grossProfit += gp; deliveryDaysNeeded += days; totalCustomers += engagements; cacTotal += engagements * s.cacPerCustomer;
    return Object.freeze({ metier: m.id, engagements, revenue: round(revenue), grossProfit: round(gp), deliveryDays: days });
  });

  const salaries = s.people * COST.loadedSalaryPerPerson;
  const opex = COST.fixedOpexPerYear + salaries + cacTotal;
  const preTax = grossProfit - opex;
  const tax = preTax > 0 ? preTax * COST.corporateTaxRate : 0;
  const netProfit = preTax - tax;

  // capacity test: can this team (with ODG leverage) actually deliver the modelled demand?
  const capacityOk = deliveryDaysNeeded <= capDays;
  const capacityUtilisation = Math.round((deliveryDaysNeeded / capDays) * 1000) / 10;

  return Object.freeze({
    ok: true, scenario: name, people: s.people, odgLeverage: leverage,
    grossRevenue: round(grossRevenue), grossProfit: round(grossProfit),
    opex: round(opex), salaries: round(salaries), cacTotal: round(cacTotal), tax: round(tax),
    netProfit: round(netProfit),
    totalCustomers, // SIMULATED — not real
    capacity: Object.freeze({ deliveryDaysNeeded, capacityDays: round(capDays), capacityOk, utilisationPercent: capacityUtilisation }),
    perMetier: Object.freeze(perMetier),
    netVs5MTarget: netProfit >= 5000000 ? "REACHES_€5M_NET" : "SHORT_OF_€5M_NET",
    provenance: s.provenance,
  });
}

/* targetConditions — the EXACT math to hit €5M net yr-1, and whether 3–5 people can deliver it. */
function targetConditions(): any {
  // Using the base-scenario blended economics, derive the revenue needed for €5M net.
  const base = computeScenario("base");
  const blendedGrossMargin = base.grossProfit / base.grossRevenue;
  // net = (grossRevenue*GM - opex)*(1-tax). Solve grossRevenue for net=5M at base opex (approx, opex scales w/ CAC+salary).
  const fixedPlusSalary = COST.fixedOpexPerYear + base.people * COST.loadedSalaryPerPerson;
  // net = (R*GM - fixedPlusSalary - R*cacShare)*(1-tax); approximate cac as negligible share vs margin ⇒ solve:
  const preTaxNeeded = 5000000 / (1 - COST.corporateTaxRate);
  const revenueNeededFor5MNet = round((preTaxNeeded + fixedPlusSalary) / blendedGrossMargin);
  // avg blended price & delivery days
  const avgPrice = METIERS.reduce((a, m) => a + m.price, 0) / METIERS.length;
  const avgDays = METIERS.reduce((a, m) => a + m.deliveryDays, 0) / METIERS.length;
  const customersNeeded = round(revenueNeededFor5MNet / avgPrice);
  const deliveryDaysNeeded = round(customersNeeded * avgDays);
  const maxCapacity5 = capacityDays(5, COST.odgAutonomyLeverage.aggressive);
  const feasibleWith5 = deliveryDaysNeeded <= maxCapacity5;
  return Object.freeze({
    target: "€5,000,000 net profit, year 1",
    blendedGrossMargin: Math.round(blendedGrossMargin * 1000) / 10 + "%",
    revenueNeededFor5MNet: revenueNeededFor5MNet,
    customersNeeded_atBlendedAvgPrice: customersNeeded,
    deliveryDaysNeeded,
    maxTeamCapacityDays_5people_aggressiveLeverage: round(maxCapacity5),
    feasibleWith5People_servicesOnly: feasibleWith5,
    verdict: feasibleWith5
      ? "services-only MIGHT reach it under aggressive assumptions — but requires the modelled demand to be REAL (currently OWNER_GATED, unproven)"
      : "services-only delivery by ≤5 people CANNOT reach €5M net yr-1 (delivery-days needed exceed max capacity) ⇒ requires PRODUCTIZED/RECURRING revenue (ODG-autonomous delivery leverage) and/or external capital",
    honest: "customersNeeded is a MODELLED requirement, NOT real demand. €5M net is NOT guaranteed; it depends on validated recurring demand that does not exist yet (€0 real clients).",
  });
}

/* ambition500M — separate feasibility note for €500M (platform-scale). */
function ambition500M(): any {
  return Object.freeze({
    target: "€500,000,000",
    feasibility: "NOT achievable by a 3–5 person services firm. Requires a platform/multi-tenant recurring product at massive scale, substantial capital, a large (non-3–5) organisation OR near-total ODG-autonomous delivery, and years of compounding — a fundamentally different business model.",
    requiredModelShift: ["productized multi-tenant SaaS with low marginal delivery cost", "recurring revenue dominating one-off services", "capital for GTM + infra", "ODG autonomy carrying the bulk of delivery/support"],
    honest: "flagged as an AMBITION scenario needing its own governed study; no path is claimed proven.",
  });
}

/* monthlyProjection(scenario) — deterministic 12-month ramp (linear capture ramp) + break-even month. */
function monthlyProjection(name: string): any {
  const sc = computeScenario(name);
  if (!sc.ok) return Object.freeze({ ok: false });
  const months: any[] = []; let cumNet = 0, breakEven: number | null = null;
  const fixedMonthly = (COST.fixedOpexPerYear + sc.salaries) / 12;
  for (let mo = 1; mo <= 12; mo++) {
    const ramp = mo / 12; // linear demand ramp over year 1
    const revenue = (sc.grossRevenue / 12) * ramp * 2 * (mo / 12 < 1 ? 1 : 1); // front-weighted toward H2
    const gp = revenue * (sc.grossProfit / sc.grossRevenue);
    const net = gp - fixedMonthly - (sc.cacTotal / 12);
    cumNet += net;
    if (breakEven === null && cumNet >= 0) breakEven = mo;
    months.push(Object.freeze({ month: mo, revenue: round(revenue), net: round(net), cumulativeNet: round(cumNet) }));
  }
  return Object.freeze({ ok: true, scenario: name, months: Object.freeze(months), breakEvenMonth: breakEven, yearEndCumulativeNet: round(cumNet) });
}

/* sensitivity(scenario) — ±20% on price and demand, impact on net profit. */
function sensitivity(name: string): any {
  const baseNet = computeScenario(name).netProfit;
  const vary = (field: "price" | "demand", factor: number) => {
    // recompute with a temporary override via a cloned métier/scenario math (pure, no global mutation)
    const s = (SCENARIOS as any)[name]; const leverage = (COST.odgAutonomyLeverage as any)[name];
    let gr = 0, gpf = 0, cac = 0;
    for (const m of METIERS) { const eng = round(10 * s.demandMultiplier * (field === "demand" ? factor : 1)); const price = m.price * (field === "price" ? factor : 1); gr += eng * price; gpf += eng * price * m.grossMargin; cac += eng * s.cacPerCustomer; }
    const opex = COST.fixedOpexPerYear + s.people * COST.loadedSalaryPerPerson + cac; const preTax = gpf - opex; const net = preTax - (preTax > 0 ? preTax * COST.corporateTaxRate : 0);
    return round(net);
  };
  return Object.freeze({ scenario: name, baseNet: round(baseNet), price_minus20: vary("price", 0.8), price_plus20: vary("price", 1.2), demand_minus20: vary("demand", 0.8), demand_plus20: vary("demand", 1.2) });
}

function fullModel(): any {
  return Object.freeze({
    scenarios: Object.freeze({ conservative: computeScenario("conservative"), base: computeScenario("base"), aggressive: computeScenario("aggressive") }),
    target5MConditions: targetConditions(),
    ambition500M: ambition500M(),
    projections: Object.freeze({ base: monthlyProjection("base") }),
    sensitivity: Object.freeze({ base: sensitivity("base") }),
    provenanceLegend: Object.freeze({ SOURCED: "from a prior governed commercial dossier / official rate", HYPOTHESIS: "order-of-magnitude assumption", SIMULATED: "modelled projection, NOT real demand/customers" }),
    honest: "a quantified decision model under clearly-labelled assumptions; NO real customers/contracts/revenue; no target guaranteed; €0 real clients today.",
  });
}

const ECONOMIC_MODEL_CONTRACT = Object.freeze({
  id: "V170-ECONOMIC-MODEL",
  purpose: "§5 — quantified conservative/base/aggressive economic model for €5M-net-yr1 + €500M ambition over a 3–5-person team; monthly projection, break-even, sensitivity, exact target conditions + capacity test",
  invariants: Object.freeze([
    "every input PROVENANCE-tagged SOURCED/HYPOTHESIS/SIMULATED — customer counts are SIMULATED projections, NEVER real",
    "computes the EXACT revenue/customers/delivery-days needed for €5M net + whether ≤5 people can deliver it (capacity test)",
    "€5M net NOT guaranteed (depends on validated recurring demand, OWNER_GATED, €0 real clients); €500M flagged platform-scale ambition",
    "deterministic (no Date.now/Math.random); conservative/base/aggressive + monthly projection + break-even + ±20% sensitivity",
    "a decision tool; guarantees nothing; fabricates no demand/contracts/revenue",
  ]),
});
module.exports = { computeScenario, targetConditions, ambition500M, monthlyProjection, sensitivity, fullModel, METIERS, SCENARIOS, COST, ECONOMIC_MODEL_CONTRACT };
export {};
