#!/usr/bin/env node
"use strict";
/*
 * V174 Addendum-A (§6/§7/§11 — global opportunity-ranking engine, radar-driven). PURE, deterministic, fail-closed.
 * Ranks worldwide commercial opportunities with an EXPLICIT weighted grid and — critically — flags any opportunity WITHOUT
 * buy-signal/budget evidence as INSUFFICIENTLY_VALIDATED (§6: no score inflation). Preserves the §5 distinction: a validated
 * MARKET signal (regulatory deadline / tender / observed budget) is NOT a validated SALE; a prospect is NOT a client.
 *
 * Provenance (strict §3): each opportunity carries OBSERVED_EVIDENCE (real source+url+date+confidence from the radar sweep,
 * grant V141 valid→2026-11-19, read-only public) or HYPOTHESIS (unsourced assumption). This lot's OBSERVED records come from
 * WebSearch on 2026-11-12. No fabricated demand/customers/revenue; €5M NOT guaranteed.
 */

// Explicit scoring grid (0..5 each). Weights sum to 1.0; documented below. buySignal/budget/demand carry the most weight.
const WEIGHTS = Object.freeze({
  urgency: 0.14, budgetEvidence: 0.16, demandProof: 0.16, segmentSize: 0.07, price: 0.06, netMargin: 0.10,
  recurrence: 0.08, competitionInverse: 0.04, cacInverse: 0.04, buildTimeInverse: 0.05, opsComplexityInverse: 0.03,
  odgAutomation: 0.05, regRiskInverse: 0.02,
});

// OPPORTUNITIES — OBSERVED (real radar sources) + HYPOTHESIS (clearly labelled). buySignal ∈ REGULATORY_DEADLINE|TENDER|
// BUDGET_OBSERVED|NONE. Scores 0..5 per grid dimension (…Inverse dims are pre-inverted so higher=better).
const OPPORTUNITIES = Object.freeze([
  {
    id: "eaa-accessibility-eu", metier: "M5", market: "EU + sellers into EU", problem: "European Accessibility Act (in force 28 Jun 2025) — ecommerce/digital services must be WCAG-accessible; ~30–40% of EU ecommerce pages pass WCAG 2.1 AA",
    buySignal: "REGULATORY_DEADLINE", provenance: "OBSERVED_EVIDENCE",
    sources: ["https://alokai.com/blog/european-accessibility-act-2025", "https://www.disabilityworld.org/articles/eaa-first-year-enforcement-report/"], consultedDate: "2026-11-12", confidence: "HIGH",
    evidenceNote: "EAA enforced; real actions (Carrefour daily fines FR; Norway/Germany/Sweden/NL/Ireland); penalties €5k–€1.26M by country",
    scores: { urgency: 5, budgetEvidence: 4, demandProof: 4, segmentSize: 5, price: 3, netMargin: 4, recurrence: 4, competitionInverse: 2, cacInverse: 3, buildTimeInverse: 4, opsComplexityInverse: 4, odgAutomation: 5, regRiskInverse: 4 },
  },
  {
    id: "cra-sbom-eu", metier: "M1", market: "EU + manufacturers placing software on EU market", problem: "EU Cyber Resilience Act — vuln reporting to ENISA within 24h (11 Sep 2026) + SBOM/Annex-I technical docs for market placement (11 Dec 2027)",
    buySignal: "REGULATORY_DEADLINE", provenance: "OBSERVED_EVIDENCE",
    sources: ["https://finitestate.io/blog/eu-cyber-resilience-act", "https://www.ogtechnologies.co/insights/cyber-resilience-act-cra-guide/"], consultedDate: "2026-11-12", confidence: "HIGH",
    evidenceNote: "fines up to €15M or 2.5% of worldwide turnover; SBOM private-to-authorities; ODG already has supply-chain-attest + p8-slsa + multi-ecosystem SBOM",
    scores: { urgency: 5, budgetEvidence: 4, demandProof: 4, segmentSize: 4, price: 4, netMargin: 4, recurrence: 4, competitionInverse: 2, cacInverse: 2, buildTimeInverse: 4, opsComplexityInverse: 3, odgAutomation: 5, regRiskInverse: 3 },
  },
  {
    id: "finops-cloud-global", metier: "M3", market: "global cloud/AI spenders", problem: "cloud/AI cost waste + governance", buySignal: "BUDGET_OBSERVED", provenance: "HYPOTHESIS",
    sources: [], consultedDate: "2026-11-12", confidence: "LOW", evidenceNote: "widely-reported cloud waste, but NOT freshly sourced this lot — treat as hypothesis",
    scores: { urgency: 3, budgetEvidence: 3, demandProof: 2, segmentSize: 4, price: 4, netMargin: 4, recurrence: 5, competitionInverse: 1, cacInverse: 2, buildTimeInverse: 3, opsComplexityInverse: 3, odgAutomation: 4, regRiskInverse: 5 },
  },
  {
    id: "btp-saas-eu", metier: "M2", market: "FR/EU construction SMEs", problem: "devis/métrés/chantier cost tracking", buySignal: "NONE", provenance: "HYPOTHESIS",
    sources: [], consultedDate: "2026-11-12", confidence: "LOW", evidenceNote: "no fresh buy-signal sourced this lot",
    scores: { urgency: 2, budgetEvidence: 2, demandProof: 2, segmentSize: 3, price: 2, netMargin: 3, recurrence: 4, competitionInverse: 2, cacInverse: 3, buildTimeInverse: 3, opsComplexityInverse: 3, odgAutomation: 3, regRiskInverse: 5 },
  },
  {
    id: "data-eng-global", metier: "M4", market: "global mid-market", problem: "data integration/quality/governance", buySignal: "NONE", provenance: "HYPOTHESIS",
    sources: [], consultedDate: "2026-11-12", confidence: "LOW", evidenceNote: "no fresh buy-signal sourced this lot",
    scores: { urgency: 2, budgetEvidence: 2, demandProof: 2, segmentSize: 4, price: 4, netMargin: 3, recurrence: 3, competitionInverse: 1, cacInverse: 2, buildTimeInverse: 2, opsComplexityInverse: 2, odgAutomation: 3, regRiskInverse: 5 },
  },
  {
    id: "reg-compliance-automation-cross", metier: "CROSS", market: "EU + global regulated sellers", problem: "TRANSVERSAL: one reusable regulatory-compliance-automation product spanning EAA + CRA + others (§4 cross-sector)",
    buySignal: "REGULATORY_DEADLINE", provenance: "OBSERVED_EVIDENCE", sources: ["https://alokai.com/blog/european-accessibility-act-2025", "https://finitestate.io/blog/eu-cyber-resilience-act"], consultedDate: "2026-11-12", confidence: "MEDIUM",
    evidenceNote: "derived from the EAA + CRA deadlines; a single compliance-automation engine reused across regimes (high ODG automation)",
    scores: { urgency: 4, budgetEvidence: 4, demandProof: 3, segmentSize: 5, price: 4, netMargin: 4, recurrence: 5, competitionInverse: 2, cacInverse: 2, buildTimeInverse: 3, opsComplexityInverse: 3, odgAutomation: 5, regRiskInverse: 3 },
  },
]);

function isObserved(o: any): boolean { return o.provenance === "OBSERVED_EVIDENCE"; }
// §5/§6: a market signal is "validated" ONLY with an observed buy-signal (regulatory deadline / tender / observed budget)
// AND observed-evidence provenance. Otherwise INSUFFICIENTLY_VALIDATED (no score inflation). NB: a validated market signal is
// NOT a validated sale/customer.
function validationTier(o: any): string {
  const hardSignal = o.buySignal === "REGULATORY_DEADLINE" || o.buySignal === "TENDER" || o.buySignal === "BUDGET_OBSERVED";
  return (isObserved(o) && hardSignal) ? "VALIDATED_MARKET_SIGNAL" : "INSUFFICIENTLY_VALIDATED";
}

function scoreOpportunity(o: any): any {
  let score = 0; for (const k of Object.keys(WEIGHTS)) score += ((o.scores && o.scores[k]) || 0) * (WEIGHTS as any)[k];
  const normalized = Math.round((score / 5) * 1000) / 10; // 0..100
  return Object.freeze({
    id: o.id, metier: o.metier, market: o.market, buySignal: o.buySignal, provenance: o.provenance,
    score: normalized, validationTier: validationTier(o),
    recurrence: o.scores.recurrence, netMargin: o.scores.netMargin, odgAutomation: o.scores.odgAutomation,
    sources: o.sources, consultedDate: o.consultedDate, confidence: o.confidence,
    caveat: validationTier(o) === "VALIDATED_MARKET_SIGNAL" ? "validated MARKET signal (regulatory/budget) — NOT a validated sale/customer; a prospect is not a client" : "INSUFFICIENTLY_VALIDATED — no observed buy-signal/budget evidence; do not treat as solvent demand",
  });
}

function rankings(): any {
  const scored = OPPORTUNITIES.map(scoreOpportunity);
  const byScore = [...scored].sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
  const top = (arr: any[], n: number) => Object.freeze(arr.slice(0, n).map((x) => x.id));
  return Object.freeze({
    scored: Object.freeze(byScore),
    top10Global: top(byScore, 10),
    top5FastAccessible: top([...scored].sort((a, b) => b.odgAutomation - a.odgAutomation || b.score - a.score), 5),
    top5Recurring: top([...scored].sort((a, b) => b.recurrence - a.recurrence || b.score - a.score), 5),
    top5HighMargin: top([...scored].sort((a, b) => b.netMargin - a.netMargin || b.score - a.score), 5),
    top5OdgDeliverable: top([...scored].sort((a, b) => b.odgAutomation - a.odgAutomation || b.recurrence - a.recurrence), 5),
    validatedCount: scored.filter((s) => s.validationTier === "VALIDATED_MARKET_SIGNAL").length,
    insufficientCount: scored.filter((s) => s.validationTier === "INSUFFICIENTLY_VALIDATED").length,
    weights: WEIGHTS,
    note: "ranked by an EXPLICIT weighted grid; INSUFFICIENTLY_VALIDATED opportunities are NOT inflated and must not be treated as solvent demand. A validated MARKET signal ≠ a validated sale. No fabricated demand/customers; €5M NOT guaranteed.",
  });
}

const GLOBAL_OPPORTUNITY_RADAR_CONTRACT = Object.freeze({
  id: "V174A-GLOBAL-OPPORTUNITY-RADAR",
  purpose: "Addendum-A §6/§7/§11 — rank worldwide opportunities via an explicit weighted grid; flag no-buy-signal opportunities INSUFFICIENTLY_VALIDATED; preserve market-signal≠sale",
  radarProvenance: "OBSERVED records from WebSearch (grant V141, read-only public, 2026-11-12): EAA accessibility (M5) + CRA/SBOM (M1) regulatory deadlines; others HYPOTHESIS",
  invariants: Object.freeze([
    "explicit weighted scoring grid (weights documented + exported); no hidden inflation",
    "opportunities WITHOUT an observed buy-signal/budget are INSUFFICIENTLY_VALIDATED — never treated as solvent demand",
    "a VALIDATED_MARKET_SIGNAL (regulatory deadline/tender/observed budget) is NOT a validated sale/customer; a prospect is not a client",
    "each opportunity carries provenance (OBSERVED_EVIDENCE source+url+date+confidence | HYPOTHESIS) — radar vs assumption clearly separated",
    "deterministic + fail-closed; no fabricated demand/customers/revenue; €5M NOT guaranteed; no real contact/send/spend",
  ]),
});
module.exports = { OPPORTUNITIES, WEIGHTS, scoreOpportunity, validationTier, rankings, GLOBAL_OPPORTUNITY_RADAR_CONTRACT };
export {};
