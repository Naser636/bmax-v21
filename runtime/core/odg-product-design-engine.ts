#!/usr/bin/env node
"use strict";
/*
 * V177 (§3 P0 — native product-design engine; hardens V173's product_design PARTIAL function). PURE, deterministic,
 * fail-closed, evidence-based. Turns a DOCUMENTED opportunity into an exploitable product dossier reusable across the 15
 * métiers — WITHOUT ever treating a hypothesis as a fact or a market size as demand.
 *
 * HONESTY (strict §3): verdict is derived from STRUCTURED evidence fields ONLY (not from free-text — adversarial-resistant).
 * EVIDENCE_INSUFFICIENT unless demand is OBSERVED AND there is a hard buy-signal. Broken economics ⇒ DO_NOT_BUILD. Mandatory
 * cert not obtainable in window ⇒ BUILD_PENDING_CERT. Compares ≥2 designs + names features NOT to build. product_design is
 * NEVER declared AUTONOMOUS (needs end-to-end proof). SYNTHETIC opportunities; no real customers; €5M NOT guaranteed.
 */

const DEMAND = Object.freeze(["OBSERVED", "HYPOTHESIS", "NONE"]);
const HARD_SIGNALS = Object.freeze(new Set(["REGULATORY_DEADLINE", "TENDER", "BUDGET_OBSERVED"]));
const VERDICT = Object.freeze({ BUILDABLE_NOW: "BUILDABLE_NOW", BUILD_PENDING_CERT: "BUILD_PENDING_CERT", EVIDENCE_INSUFFICIENT: "EVIDENCE_INSUFFICIENT", DO_NOT_BUILD: "DO_NOT_BUILD" });
const HUMAN_DAY_RATE = 500; // € loaded/day for support-cost estimate (HYPOTHESIS)

function num(v: any, d = 0): number { return Number.isFinite(Number(v)) ? Number(v) : d; }

/* selectFeatures(candidates) — MVP = essential OR high-value-low-cost; NOT-to-build = low-value or poor value/cost.
 * candidates: [{name, value 0..5, buildCost 0..5, essential bool}] */
function selectFeatures(candidates: any): any {
  const list = Array.isArray(candidates) ? candidates : [];
  const mvp: any[] = [], defer: any[] = [], drop: any[] = [];
  for (const f of list) {
    const value = num(f.value), cost = num(f.buildCost);
    if (f.essential === true) mvp.push(f.name);
    else if (value >= 4 && cost <= 3) mvp.push(f.name);
    else if (value <= 1 || (value <= 2 && cost >= 4)) drop.push(f.name); // NOT to build — no demonstrated value
    else defer.push(f.name);
  }
  return Object.freeze({ mvp: Object.freeze(mvp), defer: Object.freeze(defer), doNotBuild: Object.freeze(drop) });
}

/* designProduct(opp) — produce the product dossier + verdict. opp fields (STRUCTURED, free-text ignored for the verdict):
 * { id, metier, problem, targetClient, demandEvidence ∈ DEMAND, buySignal, competitors[], priceBenchmark, regulatory
 * (NONE/VOLUNTARY/MANDATORY), regCertObtainableInWindow bool, estBuildDays, estDeliveryCostPerCustomer,
 * estSupportDaysPerCustomer, proposedPrice, candidateFeatures[] }. */
function designProduct(opp: any): any {
  const o = opp || {};
  const demand = DEMAND.includes(o.demandEvidence) ? o.demandEvidence : "NONE";
  const hardSignal = HARD_SIGNALS.has(o.buySignal);
  const evidenceSufficient = demand === "OBSERVED" && hardSignal; // market size is NOT demand

  const features = selectFeatures(o.candidateFeatures);
  const price = num(o.proposedPrice);
  const deliveryCost = num(o.estDeliveryCostPerCustomer);
  const supportCost = num(o.estSupportDaysPerCustomer) * HUMAN_DAY_RATE;
  const netMarginPerCustomer = Math.round(price - deliveryCost - supportCost);
  const economicsBroken = !(price > 0) || netMarginPerCustomer <= 0 || num(o.estBuildDays) > 600; // 600d build > 300-day plan ⇒ unrealistic

  const certBlocks = o.regulatory === "MANDATORY" && o.regCertObtainableInWindow !== true;

  // verdict precedence: broken economics > insufficient demand evidence > mandatory-cert-not-in-window > buildable.
  let verdict: string, rationale: string;
  if (economicsBroken) { verdict = VERDICT.DO_NOT_BUILD; rationale = `economics not defensible (net margin/customer = €${netMarginPerCustomer}; build ${num(o.estBuildDays)}d)`; }
  else if (!evidenceSufficient) { verdict = VERDICT.EVIDENCE_INSUFFICIENT; rationale = `demand=${demand}, hardBuySignal=${hardSignal} — a hypothesis/market-size is NOT validated demand; needs OBSERVED budget + a hard buy-signal`; }
  else if (certBlocks) { verdict = VERDICT.BUILD_PENDING_CERT; rationale = "mandatory certification not obtainable in the planning window — build + prepare, commercialize after cert (owner-gated)"; }
  else { verdict = VERDICT.BUILDABLE_NOW; rationale = "observed demand + hard buy-signal + defensible economics + no blocking mandatory cert"; }

  return Object.freeze({
    id: o.id, metier: o.metier,
    problem: o.problem || null, targetClient: o.targetClient || null,
    evidenceSufficient, demandEvidence: demand, hardBuySignal: hardSignal,
    valueProposition: evidenceSufficient ? `measurable outcome for ${o.targetClient || "target"}: address "${o.problem || "problem"}"` : "NOT asserted — evidence insufficient",
    features, competitors: Object.freeze(Array.isArray(o.competitors) ? o.competitors.slice() : []),
    economics: Object.freeze({ price, deliveryCost, supportCost, netMarginPerCustomer, estBuildDays: num(o.estBuildDays) }),
    regulatory: o.regulatory || "NONE",
    verdict, rationale,
    productDesignStatus: "PARTIAL", // NEVER AUTONOMOUS without end-to-end proof
    caveat: "SYNTHETIC opportunity; verdict from STRUCTURED evidence only (free-text ignored); demand not validated as sales; no real customers; €5M NOT guaranteed.",
  });
}

/* compareDesigns(opp, variants) — score ≥2 design variants of the same opportunity and pick the preferred, with justification
 * + features dropped. variants: [{ name, candidateFeatures, estBuildDays, proposedPrice, estDeliveryCostPerCustomer, estSupportDaysPerCustomer }]. */
function compareDesigns(opp: any, variants: any): any {
  const list = Array.isArray(variants) ? variants : [];
  if (list.length < 2) return Object.freeze({ ok: false, reason: "need ≥2 design variants to compare" });
  const scored = list.map((v: any) => {
    const d = designProduct({ ...opp, ...v });
    const feats = selectFeatures(v.candidateFeatures);
    const valueSum = (Array.isArray(v.candidateFeatures) ? v.candidateFeatures : []).filter((f: any) => feats.mvp.includes(f.name)).reduce((a: number, f: any) => a + num(f.value), 0);
    const buildDays = num(v.estBuildDays, 1);
    const efficiency = Math.round((valueSum / Math.max(1, buildDays)) * 1000) / 1000; // value per build-day
    return { name: v.name, verdict: d.verdict, netMargin: d.economics.netMarginPerCustomer, mvpCount: feats.mvp.length, dropped: feats.doNotBuild, valueSum, efficiency };
  });
  const viable = scored.filter((s: any) => s.verdict === VERDICT.BUILDABLE_NOW || s.verdict === VERDICT.BUILD_PENDING_CERT);
  const pool = viable.length ? viable : scored;
  pool.sort((a: any, b: any) => b.efficiency - a.efficiency || b.netMargin - a.netMargin);
  const preferred = pool[0];
  return Object.freeze({
    ok: true, variants: Object.freeze(scored), preferred: preferred.name,
    justification: `"${preferred.name}" maximises value-per-build-day (${preferred.efficiency}) at net margin €${preferred.netMargin} with ${preferred.mvpCount} MVP features; drops ${preferred.dropped.length} low-value feature(s)`,
    featuresNotToBuild: preferred.dropped,
    note: "preferred by value/build-day then net margin; low-value features explicitly dropped (not everything requested is worth building).",
  });
}

const PRODUCT_DESIGN_CONTRACT = Object.freeze({
  id: "V177-PRODUCT-DESIGN-ENGINE",
  purpose: "§3 P0 — native evidence-based product-design engine (opportunity → product dossier + verdict); hardens product_design (stays PARTIAL)",
  invariants: Object.freeze([
    "verdict from STRUCTURED evidence ONLY (free-text ignored — adversarial-resistant); EVIDENCE_INSUFFICIENT unless OBSERVED demand + hard buy-signal (market size is NOT demand)",
    "broken economics ⇒ DO_NOT_BUILD; mandatory cert not in window ⇒ BUILD_PENDING_CERT; else BUILDABLE_NOW",
    "compares ≥2 designs + explicitly names features NOT to build (not everything requested is worth building)",
    "product_design is NEVER declared AUTONOMOUS (needs end-to-end real proof); reusable across the 15 métiers",
    "SYNTHETIC opportunities; demand never counted as sales; no real customers/contact/spend; deterministic + fail-closed; €5M NOT guaranteed",
  ]),
});
module.exports = { designProduct, compareDesigns, selectFeatures, DEMAND, VERDICT, PRODUCT_DESIGN_CONTRACT };
export {};
