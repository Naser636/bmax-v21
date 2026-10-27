#!/usr/bin/env node
/**
 * enterprise-mission-model — axis E (CTO V24): high-value enterprise missions up to €50k (no artificial ceiling
 * when genuinely justified). Two honest, deterministic computations — NO invented demand, NO price-to-target:
 *
 *   1. SOW COMPLETENESS (fail-closed): a mission is only PACKAGEABLE when every required section is present —
 *      scope, deliverables, milestones, acceptanceCriteria, exclusions, assumptions, paymentSchedule,
 *      supportBoundary, changeControl. A missing section ⇒ INCOMPLETE (never a silent "ready").
 *   2. SCOPE-JUSTIFIED ECONOMICS: the justified price is DERIVED from the work — Σ(milestone hours × rate) +
 *      subcontract + QA, then a risk margin. The proposed price is checked AGAINST that scope:
 *        proposed > justified × (1+maxUpliftPct) ⇒ PRICE_EXCEEDS_SCOPE (price set to a target, not the work)
 *        proposed < full delivery cost          ⇒ UNDERPRICED (loss-making)
 *      Capacity: required hours vs solo capacity ⇒ a subcontracting flag (staffing cost modelled, not assumed free).
 *
 * The €50k figure is a SCOPE-justified ceiling, not a revenue target: "never price a mission merely to reach a
 * revenue target — scope, value, competence, evidence, risk and delivery capacity must justify the price" (V24 §1-E).
 * This module prices and sizes a GIVEN scope; it does not claim the mission is sold. Pure/deterministic; HYPOTHESIS
 * inputs (hours, rates) are the caller's and must be validated against reality. Economics consolidation →
 * commercial-portfolio; cash recognition → net-cash-model (gross here).
 */
"use strict";

const REQUIRED_SOW_SECTIONS: readonly string[] = Object.freeze([
  "scope", "deliverables", "milestones", "acceptanceCriteria", "exclusions",
  "assumptions", "paymentSchedule", "supportBoundary", "changeControl",
]);
const SCOPE_JUSTIFIED_CEILING = 50000;   // V24 reference ceiling (soft — exceed only when genuinely justified)
const DEFAULT_MAX_UPLIFT_PCT = 0.20;     // proposed price may sit up to +20% over cost-derived justified price
const DEFAULT_RISK_MARGIN_PCT = 0.15;    // risk/contingency added to the cost base to form the justified price

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function nonEmptyString(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function nonEmptyArray(v: any): boolean { return Array.isArray(v) && v.length > 0; }
function num(v: any, d = 0): number { return typeof v === "number" && isFinite(v) && v >= 0 ? v : d; }
function r2(x: number): number { return Math.round(x * 100) / 100; }

/** sowCompleteness(input): which required SOW sections are present (non-empty). Fail-closed. */
function sowCompleteness(input: any): any {
  if (!isObj(input)) return { ok: false, code: "INVALID_INPUT", detail: "mission SOW object required" };
  const missing = REQUIRED_SOW_SECTIONS.filter((s) => {
    const v = (input as any)[s];
    return !(nonEmptyString(v) || nonEmptyArray(v) || (isObj(v) && Object.keys(v).length > 0));
  });
  return { ok: true, complete: missing.length === 0, missing, present: REQUIRED_SOW_SECTIONS.filter((s) => !missing.includes(s)) };
}

/** priceFromScope(milestones, opts): cost base + risk margin ⇒ the scope-JUSTIFIED price (derived from work, not a target). */
function priceFromScope(milestones: any, opts: any = {}): any {
  const list = Array.isArray(milestones) ? milestones : [];
  const rate = num(opts.hourlyRate, 95);           // HYPOTHESIS blended specialist rate
  const qaRate = num(opts.qaRate, rate);
  const riskMarginPct = typeof opts.riskMarginPct === "number" && opts.riskMarginPct >= 0 ? opts.riskMarginPct : DEFAULT_RISK_MARGIN_PCT;
  let hours = 0, subcontract = 0, qaHours = 0;
  for (const m of list) {
    hours += num(m && m.hours);
    subcontract += num(m && m.subcontractCost);
    qaHours += num(m && m.qaHours);
  }
  const laborCost = r2(hours * rate);
  const qaCost = r2(qaHours * qaRate);
  const costBase = r2(laborCost + qaCost + r2(subcontract));
  const justifiedPrice = r2(costBase * (1 + riskMarginPct));
  return { hours: r2(hours), qaHours: r2(qaHours), laborCost, qaCost, subcontractCost: r2(subcontract), costBase, riskMarginPct, justifiedPrice };
}

/**
 * assessMission(input): combine SOW completeness + scope-justified economics + capacity for one enterprise mission.
 * input: { ...sowSections, milestones:[{hours,qaHours?,subcontractCost?}], proposedPrice, hourlyRate?, qaRate?,
 *          riskMarginPct?, maxUpliftPct?, soloCapacityHours? }.
 */
function assessMission(input: any): any {
  if (!isObj(input)) return { ok: false, code: "INVALID_INPUT", detail: "mission object required" };
  const sow = sowCompleteness(input);
  const scope = priceFromScope(input.milestones, input);
  const proposedPrice = num(input.proposedPrice);
  const maxUpliftPct = typeof input.maxUpliftPct === "number" && input.maxUpliftPct >= 0 ? input.maxUpliftPct : DEFAULT_MAX_UPLIFT_PCT;
  const upperBand = r2(scope.justifiedPrice * (1 + maxUpliftPct));

  const flags: string[] = [];
  // Price set to a target rather than derived from scope.
  if (proposedPrice > upperBand) flags.push("PRICE_EXCEEDS_SCOPE");
  // Loss-making: below the delivery cost base.
  if (proposedPrice > 0 && proposedPrice < scope.costBase) flags.push("UNDERPRICED");
  if (proposedPrice === 0) flags.push("NO_PROPOSED_PRICE");
  if (!sow.complete) flags.push("SOW_INCOMPLETE");
  if (proposedPrice > SCOPE_JUSTIFIED_CEILING) flags.push("ABOVE_REFERENCE_CEILING");   // allowed only if genuinely justified

  // Payment schedule sanity (must total 100% when supplied as [{pct}]).
  let paymentPctTotal: number | null = null;
  if (nonEmptyArray(input.paymentSchedule) && input.paymentSchedule.every((p: any) => typeof (p && p.pct) === "number")) {
    paymentPctTotal = r2(input.paymentSchedule.reduce((s: number, p: any) => s + p.pct, 0));
    if (paymentPctTotal !== 100) flags.push("PAYMENT_SCHEDULE_NOT_100");
  }

  // Delivery capacity: required hours vs a solo capacity ⇒ subcontracting need (cost already modelled if supplied).
  const soloCapacityHours = num(input.soloCapacityHours, 0);
  const totalHours = r2(scope.hours + scope.qaHours);
  const capacityExceeded = soloCapacityHours > 0 && totalHours > soloCapacityHours;
  if (capacityExceeded) flags.push("CAPACITY_EXCEEDED");

  const grossMargin = proposedPrice > 0 ? r2(proposedPrice - scope.costBase) : 0;
  const marginPct = proposedPrice > 0 ? r2((grossMargin / proposedPrice) * 100) : 0;
  const priceJustified = sow.complete && proposedPrice >= scope.costBase && proposedPrice <= upperBand;

  return {
    ok: true,
    sow,
    scope,
    proposedPrice: r2(proposedPrice),
    justifiedPrice: scope.justifiedPrice,
    upperBand,
    priceJustified,
    grossMargin, marginPct,
    totalHours, soloCapacityHours, capacityExceeded,
    paymentPctTotal,
    flags,
    note: "Price is DERIVED from scope (cost base × risk margin), never set to a revenue target. €50k is a scope-justified reference ceiling, not a goal. This sizes/prices a GIVEN scope — it does NOT claim the mission is sold; demand, procurement access and capacity must be validated. Gross (not net): convert via net-cash-model.",
  };
}

export { REQUIRED_SOW_SECTIONS, SCOPE_JUSTIFIED_CEILING, sowCompleteness, priceFromScope, assessMission };
module.exports = { REQUIRED_SOW_SECTIONS, SCOPE_JUSTIFIED_CEILING, sowCompleteness, priceFromScope, assessMission };

// Read-only CLI: print the required SOW sections + the ceiling policy; mutates nothing.
if (require.main === module) {
  process.stdout.write(JSON.stringify({ model: "enterprise-mission-model/1", requiredSowSections: REQUIRED_SOW_SECTIONS, scopeJustifiedCeiling: SCOPE_JUSTIFIED_CEILING, rule: "price justified by scope, never by target" }, null, 2) + "\n");
}
