#!/usr/bin/env node
"use strict";
/*
 * V141 — COMMERCIAL INTELLIGENCE CHAIN. PURE, deterministic, fail-closed. Wires the EXISTING canonical commercial components
 * into ONE testable chain (no parallel system, no new primitive): opportunity-detector (detect/dedup/provenance/grade/contra-
 * diction) → strict commercial STATE → p9-unit-economics (cost/margin) → prioritisation → research-to-mission (governed
 * conversion). It ENFORCES the anti-conflation rule the directive demands: an OPPORTUNITY is not a LEAD; a LEAD is not a
 * QUALIFIED_LEAD; none of these is a PROPOSAL / CONTRACT / CASHED / PROFIT — those later stages live ONLY in commercial-
 * pipeline behind its evidence + human gates, and this chain NEVER sets them. It invents no client/contract/revenue/margin:
 * an incomplete estimate yields margin=null (not 0), a negative margin disqualifies, and every number shows its assumptions.
 */
const DETECTOR = require("./opportunity-detector.js");
const UE = require("./p9-unit-economics.js");
const BRIDGE = require("./research-to-mission.js");   // governed conversion (owner-gated, injection-quarantined, deduped)

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function num(v: any): number | null { return typeof v === "number" && Number.isFinite(v) ? v : null; }

// Honest commercial STATE from the detector's grade/provenance — NEVER past QUALIFIED_LEAD (no proposal/contract/cash here).
const GRADE_STATE: Record<string, string> = { A: "QUALIFIED_LEAD", B: "LEAD", C: "OPPORTUNITY", REJECTED: "DROPPED" };
function commercialState(opp: any): string { return GRADE_STATE[String(opp && opp.grade)] || "OPPORTUNITY"; }

// Unit-economics + margin for one opportunity. estimate = { priceEur, observedCostEur, attempts, successes }. margin is
// null (unknown) unless BOTH a price and a cost-per-success exist — an incomplete estimate is never silently treated as 0.
function economics(estimate: any): any {
  const e = isObj(estimate) ? estimate : {};
  const ue = UE.unitEconomics(e);
  const price = num(e.priceEur);
  const marginEur = (price !== null && num(ue.costPerSuccess) !== null) ? Math.round((price - ue.costPerSuccess) * 100) / 100 : null;
  return Object.freeze({ priceEur: price, costPerSuccess: num(ue.costPerSuccess), marginEur, viable: ue.viable === true && marginEur !== null && marginEur > 0, complete: price !== null && num(ue.costPerSuccess) !== null, assumptions: ue.note || "unit-economics from observed cost/attempts/successes", successRate: ue.successRate });
}

/** qualifyChain(signals, opts?) -> { opportunities, dropped, governedMissions, stateCounts, note }. opts.nowMs stamps the
 * detector; opts.estimateFor(opp)->estimate supplies per-opportunity economics; opts.riskFor(opp)->0..1 discounts priority.
 * An opportunity is QUALIFIED (⇒ eligible for a governed mission) only if: grade A/B, provenance verified, a COMPLETE estimate,
 * and a POSITIVE margin. Governed missions are OWNER_DECISIONs (commercial acts are human-gated — detection ≠ a contract). */
function qualifyChain(signals: any, opts?: any): any {
  const o = isObj(opts) ? opts : {};
  const det = DETECTOR.detect(Array.isArray(signals) ? signals : [], { nowMs: num(o.nowMs) !== null ? o.nowMs : NaN });
  const dropped = Array.isArray(det.dropped) ? det.dropped : [];
  const opportunities = (Array.isArray(det.shortlist) ? det.shortlist : []).map((opp: any) => {
    const state = commercialState(opp);
    const est = typeof o.estimateFor === "function" ? o.estimateFor(opp) : opp.estimate;
    const econ = economics(est);
    // provenance is the detector's OWN honest verdict: PROVEN (2xx + content-hash re-verified) or CANDIDATE (2xx seen) is
    // acceptable for a qualified lead; REJECTED / N/A is not (fail-closed — no fabricated source trust).
    const vs = opp.provenance && opp.provenance.verification_status;
    const provenanceOk = vs === "PROVEN" || vs === "CANDIDATE";
    const risk = num(o.riskFor && o.riskFor(opp)) !== null ? Math.max(0, Math.min(1, o.riskFor(opp))) : 0.5;
    // QUALIFIED (for governance) is strict + fail-closed: A/B grade + verified provenance + complete estimate + positive margin.
    const qualified = (state === "QUALIFIED_LEAD" || state === "LEAD") && provenanceOk && econ.complete && econ.viable;
    // priority = verified value (margin) × confidence(score) × feasibility, discounted by risk. 0 unless qualified (no fake value).
    const feasibility = opp.feasible === false ? 0 : 1;
    const priority = qualified ? Math.round((num(econ.marginEur) || 0) * (num(opp.score) || 0) / 100 * feasibility * (1 - risk)) : 0;
    return Object.freeze({ id: opp.id, subject: typeof opp.subject === "string" ? opp.subject : "", grade: opp.grade, state, provenanceOk, economics: econ, qualified, priority, risk, nextAction: opp.nextAction || null });
  }).sort((a: any, b: any) => b.priority - a.priority);

  // Governed conversion — ONLY qualified opportunities become missions, as OWNER_DECISIONs (commercial = owner-gated), via the
  // canonical research-to-mission bridge (injection-quarantined, deduped, provenance-carried, never self-authorised).
  // The finding content embeds the opportunity's EXTERNAL subject (untrusted text) so the bridge's injection screen actually
  // sees it — a poisoned subject is quarantined and never becomes a governed mission (defence-in-depth, not safe-by-omission).
  const findings = opportunities.filter((x: any) => x.qualified).map((x: any) => ({ content: `Commercial opportunity ${x.id}: ${x.subject} (state=${x.state}, margin≈€${x.economics.marginEur}) — qualify→propose (human-gated)`, source: "commercial-intelligence-chain", sourceClass: "INTERNAL_EVIDENCE", confidence: x.grade === "A" ? "HIGH" : "MEDIUM", metier: "commercial" }));
  const conversion = BRIDGE.researchToMissions(findings, { now: typeof o.now === "string" ? o.now : null, componentByFinding: () => "ODG commercial pipeline" });

  const stateCounts = opportunities.reduce((a: any, x: any) => { a[x.state] = (a[x.state] || 0) + 1; return a; }, {});
  return Object.freeze({
    opportunities: Object.freeze(opportunities),
    dropped: Object.freeze(dropped),
    governedMissions: conversion.ownerDecisions,
    quarantined: conversion.quarantined,
    stateCounts: Object.freeze(stateCounts),
    qualifiedCount: opportunities.filter((x: any) => x.qualified).length,
    note: "DETECTION→OPPORTUNITY→LEAD→QUALIFIED_LEAD only; PROPOSAL/CONTRACT/CASHED/PROFIT live ONLY in commercial-pipeline behind evidence+human gates and are NEVER set here. No client/contract/revenue/margin invented; incomplete estimate ⇒ margin null; governed missions are OWNER_DECISIONs (commercial acts human-gated).",
  });
}

const COMMERCIAL_INTELLIGENCE_CHAIN_CONTRACT = Object.freeze({
  id: "V141-COMMERCIAL-INTELLIGENCE-CHAIN",
  reuses: ["opportunity-detector (detect/dedup/provenance/grade/contradiction)", "p9-unit-economics (cost/margin)", "commercial-pipeline (the funnel with evidence+human gates — the authoritative later stages)", "research-to-mission (governed conversion)"],
  invariants: Object.freeze([
    "strict state separation: OPPORTUNITY≠LEAD≠QUALIFIED_LEAD≠PROPOSAL≠CONTRACT≠CASHED≠PROFIT; this chain never sets beyond QUALIFIED_LEAD",
    "QUALIFIED ⟺ grade A/B + verified provenance + COMPLETE estimate + POSITIVE margin (fail-closed)",
    "no invented client/contract/revenue/margin; incomplete estimate ⇒ margin null (not 0); negative margin disqualifies",
    "governed missions are OWNER_DECISIONs (commercial acts human-gated); injection-quarantined via the bridge; reuses canonical components (no new primitive/registry)",
  ]),
});
module.exports = { qualifyChain, commercialState, economics, COMMERCIAL_INTELLIGENCE_CHAIN_CONTRACT };
export {};
