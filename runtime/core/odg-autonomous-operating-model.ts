#!/usr/bin/env node
"use strict";
/*
 * V173 (§4/§5/§6/§12.6 — ODG as the operational engine: autonomous-vs-human work model + capability-gap register).
 * PURE, deterministic, fail-closed. REUSES odg-economic-model.COST + the V172 hybrid customer target — NO duplicate models.
 *
 * §4 rebuild: the 4,945 pure-human delivery-day model (V170) is NOT the target operating model. This re-bases delivery around
 * MAXIMUM feasible autonomous production — mapping each commercial/operating function to ODG's REAL existing modules (where
 * they exist) and quantifying the RESIDUAL human effort, so the humans are ODG's operators, not its production workforce.
 *
 * HONESTY: autonomy mappings are grounded in modules that ACTUALLY EXIST in the repo; genuine gaps are marked MISSING, not
 * faked. Residual human-days are HYPOTHESIS (labelled). No fabricated demand/customers/revenue; the DEMAND bottleneck stays
 * OWNER_GATED. This models WORK ALLOCATION + capability gaps, not revenue — €5M is still not guaranteed; €0 real clients.
 */
const ECON = require("./odg-economic-model.js");
const COST = ECON.COST;
const HYBRID_CUSTOMERS_FOR_5M = 259; // from V172 (odg-business-model-families hybrid primary)

// AUTONOMY: ODG_AUTONOMOUS (ODG does it) | ODG_ASSISTED (ODG does it, human reviews) | HUMAN_REQUIRED (judgement/negotiation)
// | OWNER_GATED (signature/payment/real-contact/legal). module = the REAL existing ODG capability (or "MISSING").
// residualHumanDaysPerCustomer = human effort per customer per YEAR that ODG cannot remove.
const FUNCTIONS = Object.freeze([
  { id: "discover_qualify", name: "discover + qualify customers", module: "prospection-registry + niche-scoring", autonomy: "ODG_ASSISTED", residualHumanDays: 0.15, status: "COVERED" },
  { id: "needs_budget", name: "identify needs + budgets", module: "demand-experiment + customer-outcome-intelligence", autonomy: "ODG_ASSISTED", residualHumanDays: 0.20, status: "PARTIAL" },
  { id: "research_pricing", name: "research competitors + pricing", module: "radar (V171) + pricing-grid", autonomy: "ODG_AUTONOMOUS", residualHumanDays: 0.02, status: "COVERED" },
  { id: "product_design", name: "design + improve products", module: "odg-native-engineering + odg-ast-operations", autonomy: "ODG_AUTONOMOUS", residualHumanDays: 0.10, status: "PARTIAL" },
  { id: "demos_proposals", name: "demos + commercial proposals", module: "proposal-generator + proposal-pipeline + quote", autonomy: "ODG_AUTONOMOUS", residualHumanDays: 0.10, status: "COVERED" },
  { id: "prospecting", name: "authorized prospecting + acquisition", module: "prospection-compliance + prospection-send-gate + email-gateway", autonomy: "OWNER_GATED", residualHumanDays: 0.05, status: "PARTIAL", note: "generation automated; actual SEND/contact is OWNER_GATED" },
  { id: "pipeline", name: "sales pipeline management", module: "commercial-pipeline", autonomy: "ODG_AUTONOMOUS", residualHumanDays: 0.05, status: "COVERED" },
  { id: "onboarding_delivery", name: "onboarding + product delivery", module: "first-cash-activation + client-intake", autonomy: "ODG_ASSISTED", residualHumanDays: 0.40, status: "PARTIAL" },
  { id: "retention", name: "satisfaction + retention", module: "customer-outcome-intelligence", autonomy: "ODG_ASSISTED", residualHumanDays: 0.15, status: "PARTIAL" },
  { id: "support_renewals", name: "support + renewals", module: "MISSING", autonomy: "ODG_ASSISTED", residualHumanDays: 0.30, status: "MISSING", note: "no dedicated autonomous support/renewal engine yet — GAP" },
  { id: "reporting", name: "commercial reporting", module: "revenue-dashboard + commercial-portfolio", autonomy: "ODG_AUTONOMOUS", residualHumanDays: 0.02, status: "COVERED" },
  { id: "finance", name: "revenue/costs/cash/profit measurement", module: "invoicing + payments + revenue-dashboard", autonomy: "OWNER_GATED", residualHumanDays: 0.08, status: "PARTIAL", note: "computation automated; payment execution is OWNER_GATED" },
  { id: "negotiation_signature", name: "negotiation + binding signature", module: "HUMAN", autonomy: "HUMAN_REQUIRED", residualHumanDays: 0.25, status: "HUMAN_REQUIRED" },
]);

function round1(n: number): number { return Math.round(n * 10) / 10; }

/* operatingModel(opts?) — rebuild the delivery/capacity model around autonomous production (NOT the 4,945 pure-human model).
 * Computes residual human-days for the hybrid target, the autonomous share, and 3/4/5-person feasibility. */
function operatingModel(opts?: any): any {
  const customers = opts && opts.customers ? opts.customers : HYBRID_CUSTOMERS_FOR_5M;
  const residualPerCustomer = FUNCTIONS.reduce((a, f) => a + f.residualHumanDays, 0);
  const residualHumanDays = round1(residualPerCustomer * customers);

  // the pure-human baseline (V172 hybrid: 4.0 delivery-days/customer) ⇒ what it WOULD cost without ODG automation.
  const pureHumanDaysPerCustomer = 4.0;
  const pureHumanDays = round1(pureHumanDaysPerCustomer * customers);
  const autonomousSharePercent = round1((1 - residualPerCustomer / pureHumanDaysPerCustomer) * 100);

  const feasibility = [3, 4, 5].map((people) => {
    const capacity = people * COST.workingDaysPerPersonYear; // human capacity (NO ODG leverage — these are residual HUMAN days)
    return { people, humanCapacityDays: capacity, residualHumanDays, feasible: residualHumanDays <= capacity, utilisationPercent: round1((residualHumanDays / capacity) * 100) };
  });

  return Object.freeze({
    customers, residualHumanDaysPerCustomer: round1(residualPerCustomer), residualHumanDays,
    pureHumanBaselineDays: pureHumanDays, autonomousSharePercent,
    feasibilityByTeam: Object.freeze(feasibility),
    minTeamFeasible: (feasibility.find((f) => f.feasible) || { people: null }).people,
    rebuiltConclusion: `with ODG automating production (~${autonomousSharePercent}% of delivery), the hybrid €5M target (${customers} customers) needs ~${residualHumanDays} residual HUMAN-days — within a ${(feasibility.find((f) => f.feasible) || { people: "5+" }).people}-person team. The bottleneck is DEMAND (OWNER_GATED), NOT human delivery capacity. The 4,945 pure-human day model is NOT the target.`,
    note: "residual human-days are HYPOTHESIS; demand is unvalidated (OWNER_GATED); no revenue claimed; €0 real clients.",
  });
}

/* autonomousVsHumanBreakdown — §12.6: per-function autonomy + the aggregate ODG-autonomous vs human-required split. */
function autonomousVsHumanBreakdown(): any {
  const byAutonomy: any = {}; for (const f of FUNCTIONS) byAutonomy[f.autonomy] = (byAutonomy[f.autonomy] || 0) + 1;
  const odgDrivenDays = FUNCTIONS.filter((f) => f.autonomy === "ODG_AUTONOMOUS").reduce((a, f) => a + f.residualHumanDays, 0);
  const humanOwnerDays = FUNCTIONS.filter((f) => f.autonomy === "HUMAN_REQUIRED" || f.autonomy === "OWNER_GATED").reduce((a, f) => a + f.residualHumanDays, 0);
  return Object.freeze({
    functions: Object.freeze(FUNCTIONS.map((f) => Object.freeze({ id: f.id, autonomy: f.autonomy, module: f.module, status: f.status }))),
    byAutonomy: Object.freeze(byAutonomy),
    residualDays_odgAutonomousFunctions_perCustomer: round1(odgDrivenDays),
    residualDays_humanOrOwnerFunctions_perCustomer: round1(humanOwnerDays),
    note: "ODG performs the maximum feasible work; humans are reserved for negotiation/signature/owner-gated (payments, real contact) — ODG is the operational engine, humans are not the production workforce.",
  });
}

/* capabilityGapRegister — §6: the genuine gaps (MISSING/PARTIAL functions) with impact/feasibility/dependency/acceptance,
 * prioritized by (economic impact × feasibility). No faked coverage. */
function capabilityGapRegister(): any {
  const gaps = FUNCTIONS.filter((f) => f.status === "MISSING" || f.status === "PARTIAL").map((f) => {
    const missing = f.status === "MISSING";
    const impact = missing ? 3 : 2;        // MISSING blocks a function outright; PARTIAL caps it
    const feasibility = f.module === "MISSING" ? 2 : 3; // buildable from scratch vs extend an existing module
    return Object.freeze({
      capability: f.name, function: f.id, status: f.status, existingModule: f.module,
      gap: missing ? `no autonomous ${f.name} engine exists` : `${f.name} is partially automated (${f.module}) — needs hardening for real throughput`,
      whyBlocksEconomics: missing ? "manual handling caps customer volume / raises residual human-days" : "residual human effort limits scalable throughput toward the €5M customer target",
      ownerGatedDependency: /OWNER_GATED/.test(f.autonomy) ? (f.note || "owner authorization required for execution") : null,
      acceptanceTest: missing ? `a deterministic ${f.id} engine processes a batch with evidence + independent verification` : `${f.id} throughput test shows residual human-days reduced with independent evidence`,
      priorityScore: impact * feasibility,
      contributionTo5M: "reduces residual human-days / unblocks a commercial function ⇒ supports the hybrid customer target within ≤5 people",
    });
  });
  gaps.sort((a: any, b: any) => b.priorityScore - a.priorityScore);
  return Object.freeze({ totalGaps: gaps.length, missingCount: gaps.filter((g: any) => g.status === "MISSING").length, partialCount: gaps.filter((g: any) => g.status === "PARTIAL").length, gaps: Object.freeze(gaps) });
}

const AUTONOMOUS_OPERATING_MODEL_CONTRACT = Object.freeze({
  id: "V173-AUTONOMOUS-OPERATING-MODEL",
  purpose: "§4/§5/§6/§12.6 — rebuild the operating model around MAXIMUM autonomous production (not the 4,945 pure-human day model); autonomous-vs-human breakdown + capability-gap register, grounded in ODG's REAL existing modules",
  reuses: ["odg-economic-model.COST", "V172 hybrid customer target (259)", "+ maps to REAL existing commercial modules (prospection-registry/proposal-generator/pricing-grid/quote/invoicing/commercial-pipeline/revenue-dashboard/…)"],
  invariants: Object.freeze([
    "rebuilds delivery around autonomous production — the 4,945 pure-human-day model is NOT the target operating model",
    "autonomy mappings grounded in modules that ACTUALLY EXIST; genuine gaps marked MISSING, not faked",
    "shows the bottleneck is DEMAND (OWNER_GATED, unvalidated), NOT human delivery capacity once ODG automates production",
    "humans reserved for negotiation/signature/owner-gated (payments, real contact); ODG is the operational engine",
    "models work-allocation + gaps, NOT revenue; €5M NOT guaranteed; no fabricated demand/customers; €0 real clients; deterministic",
  ]),
});
module.exports = { FUNCTIONS, operatingModel, autonomousVsHumanBreakdown, capabilityGapRegister, AUTONOMOUS_OPERATING_MODEL_CONTRACT };
export {};
