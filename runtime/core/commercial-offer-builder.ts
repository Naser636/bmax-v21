#!/usr/bin/env node
"use strict";
/*
 * V143 — COMMERCIAL OFFER BUILDER. PURE, deterministic, fail-closed. Transforms a DOCUMENTED opportunity + ODG's REAL
 * capability maturity into a structured, honest OFFER spec — reusing pricing-grid (price scenarios, rate floor, margin) and
 * p9-unit-economics; no new primitive, no parallel system. The load-bearing rule: an offer may be announced COMMERCIALISABLE
 * (service actually available) ONLY if the underlying capability is BUILT + VALIDATED, has NO missing work, carries PROOF,
 * and its pricing is valid — otherwise it is honestly NOT_YET_DELIVERABLE with the exact missing work surfaced. It invents no
 * client, contract, sale, revenue or realized margin: all prices/margins are HYPOTHESES carrying their assumptions.
 */
const PRICING = require("./pricing-grid.js");
const UE = require("./p9-unit-economics.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function num(v: any): number | null { return typeof v === "number" && isFinite(v) ? v : null; }
// a capability is "built+validated" only for the explicit validated-local / R3+ maturities (honest; never from a bare claim).
const DELIVERABLE_MATURITY = new Set(["VALIDATED_LOCAL", "R3", "R4", "R5", "ACTIVE_IN_PRODUCTION"]);

/** buildOffer(input) -> frozen offer. input = { opportunity:{id,segment,problem,demandEvidence}, capability:{maturity,
 * missingWork:[],proof:[]}, pricing:{id,scope,days,priceBandEur:[min,max],recurringMonthly,minMarginPct}, costs:{dailyCostEur} }.
 * Fail-closed: a missing/invalid section ⇒ NOT_YET_DELIVERABLE (never a fabricated "available" offer). */
function buildOffer(input: any): any {
  const i = isObj(input) ? input : {};
  const opp = isObj(i.opportunity) ? i.opportunity : {};
  const cap = isObj(i.capability) ? i.capability : {};
  const pr = isObj(i.pricing) ? i.pricing : {};
  const costs = isObj(i.costs) ? i.costs : {};
  const problems: string[] = [];

  const missingWork = Array.isArray(cap.missingWork) ? cap.missingWork.filter(isStr) : [];
  const proof = Array.isArray(cap.proof) ? cap.proof.filter(isStr) : [];
  const built = DELIVERABLE_MATURITY.has(String(cap.maturity));
  if (!isStr(opp.id)) problems.push("opportunity.id missing");
  if (!isStr(opp.segment)) problems.push("opportunity.segment (buyer profile) missing");
  if (!isStr(opp.problem)) problems.push("opportunity.problem (need solved) missing");
  if (!opp.demandEvidence) problems.push("opportunity.demandEvidence (verifiable source) missing");
  if (!built) problems.push(`capability not built+validated (maturity=${cap.maturity || "unknown"})`);
  if (missingWork.length > 0) problems.push(`missing work before deliverable: ${missingWork.join("; ")}`);
  if (proof.length === 0) problems.push("no proof supplied — a service cannot be announced available without evidence");

  // price scenarios via the canonical pricing-grid (fail-closed: rate floor, margin). All HYPOTHESES.
  const dailyCost = num(costs.dailyCostEur) || 0;
  // pricing-grid expects days + priceBand as [min,max] RANGES; normalise a scalar day count into a range.
  const daysRange = Array.isArray(pr.days) ? pr.days : (num(pr.days) !== null ? [pr.days, pr.days] : undefined);
  const minMarginPct = num(pr.minMarginPct) !== null ? pr.minMarginPct : pr.minMargin;   // accept either input field name
  const priceEntry = { id: isStr(pr.id) ? pr.id : "offer", scope: pr.scope, days: daysRange, priceBand: Array.isArray(pr.priceBandEur) ? pr.priceBandEur : undefined, minMarginPct, recurringMonthly: pr.recurringMonthly === true };
  const priceCheck = PRICING.validateEntry(priceEntry, dailyCost);
  if (!priceCheck.ok) problems.push(`pricing invalid: ${(priceCheck.problems || []).join("; ")}`);
  const band = Array.isArray(pr.priceBandEur) ? pr.priceBandEur : [null, null];
  const priceScenarios = {
    low: num(band[0]), high: num(band[1]),
    impliedDayRate: priceCheck.impliedDayRate || null,
    marginHypothesisPct: priceCheck.worstCaseMarginPct,   // null unless a daily cost was supplied
    basis: "HYPOTHESIS — price band + cost are assumptions; no realized sale/revenue/margin",
  };

  const deliverable = problems.length === 0;
  return Object.freeze({
    offerId: "OFFER-" + (isStr(opp.id) ? opp.id : "?"),
    segment: isStr(opp.segment) ? opp.segment : null,
    problem: isStr(opp.problem) ? opp.problem : null,
    service: isStr(pr.scope) ? pr.scope : "(scope TBD)",
    deliverables: Array.isArray(i.deliverables) ? i.deliverables.filter(isStr) : [],
    limits: Array.isArray(i.limits) ? i.limits.filter(isStr) : [],
    requiredCapabilities: Array.isArray(cap.required) ? cap.required.filter(isStr) : [],
    missingWork, proof,
    capabilityMaturity: cap.maturity || "unknown",
    priceScenarios,
    risks: Array.isArray(i.risks) ? i.risks.filter(isStr) : [],
    proofRequiredToAnnounce: deliverable ? [] : ["built+validated capability", "no missing work", "evidence/proof", "valid pricing"],
    status: deliverable ? "COMMERCIALISABLE" : "NOT_YET_DELIVERABLE",
    blockers: Object.freeze(problems),
    honesty: "An offer is COMMERCIALISABLE only when the capability is genuinely built+validated with proof and valid pricing; otherwise NOT_YET_DELIVERABLE with the exact missing work. No client/contract/sale/revenue/realized-margin invented; all prices/margins are HYPOTHESES.",
  });
}

/** shortlist(offers) -> ranked by (deliverable first, then price-band midpoint) — a documented, honest shortlist. */
function shortlist(offers: any[]): any {
  const v = (Array.isArray(offers) ? offers : []).filter(isObj);
  const ranked = v.slice().sort((a: any, b: any) => {
    const da = a.status === "COMMERCIALISABLE" ? 1 : 0, db = b.status === "COMMERCIALISABLE" ? 1 : 0;
    if (da !== db) return db - da;
    const ma = ((num(a.priceScenarios && a.priceScenarios.low) || 0) + (num(a.priceScenarios && a.priceScenarios.high) || 0)) / 2;
    const mb = ((num(b.priceScenarios && b.priceScenarios.low) || 0) + (num(b.priceScenarios && b.priceScenarios.high) || 0)) / 2;
    return mb - ma;
  }).map((o: any, idx: number) => ({ rank: idx + 1, offerId: o.offerId, status: o.status, segment: o.segment }));
  return Object.freeze({ ranked: Object.freeze(ranked), commercialisable: v.filter((o: any) => o.status === "COMMERCIALISABLE").length, notYetDeliverable: v.filter((o: any) => o.status === "NOT_YET_DELIVERABLE").length, note: "ranked deliverable-first then price midpoint; NOT_YET_DELIVERABLE offers are honest, not hidden; no revenue implied." });
}

const COMMERCIAL_OFFER_BUILDER_CONTRACT = Object.freeze({
  id: "V143-COMMERCIAL-OFFER-BUILDER",
  reuses: ["pricing-grid.validateEntry (rate floor + margin)", "p9-unit-economics", "commercial-intelligence-chain (upstream opportunities)"],
  invariants: Object.freeze([
    "COMMERCIALISABLE ⟺ built+validated capability + no missing work + proof + valid pricing (fail-closed)",
    "else NOT_YET_DELIVERABLE with the exact missing work surfaced (never a fabricated 'available' offer)",
    "no client/contract/sale/revenue/realized-margin invented; all prices/margins are HYPOTHESES with assumptions",
    "reuses canonical pricing/economics; no new primitive/registry/parallel system",
  ]),
});
module.exports = { buildOffer, shortlist, DELIVERABLE_MATURITY, COMMERCIAL_OFFER_BUILDER_CONTRACT };
export {};
