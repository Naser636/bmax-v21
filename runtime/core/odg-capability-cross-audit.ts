#!/usr/bin/env node
"use strict";
/*
 * V180 (§2 — cross-audit of the business-operation capabilities ODG needs to run a company mostly itself). PURE, READ-ONLY,
 * deterministic, fail-closed. The canonical source is the CTO V174-A §7 enumeration (not a code artifact). That list
 * enumerates 28 distinct capability categories — reported as-is. The directive's "30" is a round-number framing; per the
 * explicit rule "ne jamais fabriquer une liste de 30 pour satisfaire le nombre", NO filler capability is invented to reach 30.
 *
 * Each capability maps to ODG's REAL existing module (where one exists) with an honest status:
 * EXISTING_AND_VALIDATED (module + test, verified) / EXISTING_BUT_PARTIAL / MISSING / OWNER_GATED / NOT_REQUIRED / NOT_MEASURED.
 * MISSING where no module exists — NOT fabricated. HONEST: a status change to AUTONOMOUS/validated needs end-to-end proof.
 */

const STATUS = Object.freeze(["EXISTING_AND_VALIDATED", "EXISTING_BUT_PARTIAL", "MISSING", "OWNER_GATED", "NOT_REQUIRED", "NOT_MEASURED"]);

// 28 capabilities recovered VERBATIM from CTO V174-A §7 (order preserved). module = the REAL existing ODG module or "MISSING".
const CAPABILITIES = Object.freeze([
  { id: "commercial_intelligence", module: "market-intelligence + odg-global-opportunity-radar (V174-A)", status: "EXISTING_BUT_PARTIAL", primitive: "ALLOCATOR/RESOLVER" },
  { id: "international_segmentation", module: "niche-scoring", status: "EXISTING_BUT_PARTIAL", primitive: "RESOLVER" },
  { id: "prospect_research_qualification", module: "prospection-registry + odg-prospect-qualification (V176)", status: "EXISTING_AND_VALIDATED", primitive: "RESOLVER" },
  { id: "competitive_intelligence", module: "odg-global-opportunity-radar (V174-A) + radar", status: "EXISTING_BUT_PARTIAL", primitive: "RESOLVER" },
  { id: "multi_currency_pricing", module: "pricing-grid (EUR); multi-currency NOT built", status: "EXISTING_BUT_PARTIAL", primitive: "EXECUTOR" },
  { id: "language_management", module: "MISSING", status: "MISSING", primitive: "EXECUTOR" },
  { id: "proposal_generation", module: "proposal-generator + proposal-pipeline + odg-product-design-engine (V177)", status: "EXISTING_AND_VALIDATED", primitive: "EXECUTOR" },
  { id: "sales_pipeline", module: "commercial-pipeline", status: "EXISTING_AND_VALIDATED", primitive: "STATE" },
  { id: "crm", module: "client-intake + prospection-registry (no unified CRM)", status: "EXISTING_BUT_PARTIAL", primitive: "STATE" },
  { id: "onboarding", module: "first-cash-activation + client-intake (V173 PARTIAL)", status: "EXISTING_BUT_PARTIAL", primitive: "EXECUTOR" },
  { id: "subscription_management", module: "partial (no dedicated subscription engine)", status: "EXISTING_BUT_PARTIAL", primitive: "STATE" },
  { id: "billing_invoicing", module: "invoicing", status: "EXISTING_BUT_PARTIAL", primitive: "EXECUTOR" },
  { id: "payment_tracking", module: "payments (execution OWNER_GATED)", status: "OWNER_GATED", primitive: "EXECUTOR" },
  { id: "support", module: "odg-support-renewal-engine (V174)", status: "EXISTING_AND_VALIDATED", primitive: "EXECUTOR" },
  { id: "renewal", module: "odg-support-renewal-engine (V174)", status: "EXISTING_AND_VALIDATED", primitive: "EXECUTOR" },
  { id: "cancellation", module: "odg-support-renewal-engine (V174, cancellation OWNER_GATED)", status: "OWNER_GATED", primitive: "EXECUTOR" },
  { id: "quality_control", module: "evaluator-independence + mission-independent-validation", status: "EXISTING_AND_VALIDATED", primitive: "EVIDENCE" },
  { id: "customer_outcome_analysis", module: "customer-outcome-intelligence", status: "EXISTING_BUT_PARTIAL", primitive: "EVIDENCE" },
  { id: "analytical_accounting", module: "chantier-profitability + odg-economic-scaling-model (V179)", status: "EXISTING_BUT_PARTIAL", primitive: "EVIDENCE" },
  { id: "cash_flow_tracking", module: "net-cash-model + revenue-dashboard", status: "EXISTING_BUT_PARTIAL", primitive: "EVIDENCE" },
  { id: "international_taxation", module: "odg-economic-scaling-model (V179 per-jurisdiction — HYPOTHESIS, NOT a tax opinion)", status: "EXISTING_BUT_PARTIAL", primitive: "EVIDENCE" },
  { id: "data_protection", module: "GDPR conformity DOCUMENTED (V174-B/V175) — not a running DPO process", status: "EXISTING_BUT_PARTIAL", primitive: "POLICY" },
  { id: "security", module: "odg-owasp-agentic-matrix (V168) + agent-identity/audit-log/… (8 PARTIAL controls remain)", status: "EXISTING_BUT_PARTIAL", primitive: "POLICY" },
  { id: "supplier_management", module: "provider-capability-contract + supply-chain-attest", status: "EXISTING_AND_VALIDATED", primitive: "CONTRACT" },
  { id: "digital_distribution", module: "MISSING (no distribution/download/licence-delivery engine)", status: "MISSING", primitive: "EXECUTOR" },
  { id: "marketing", module: "MISSING (no marketing/content engine)", status: "MISSING", primitive: "EXECUTOR" },
  { id: "cac_measurement", module: "odg-economic-scaling-model / odg-product-economics-audit (HYPOTHESIS inputs)", status: "EXISTING_BUT_PARTIAL", primitive: "EVIDENCE" },
  { id: "satisfaction_churn_monitoring", module: "customer-outcome-intelligence + odg-support-renewal-engine (churn-risk, V174)", status: "EXISTING_BUT_PARTIAL", primitive: "EVIDENCE" },
].map((c: any) => Object.freeze({
  ...c,
  gap: c.status === "MISSING" ? "no module exists — must be built" : c.status === "OWNER_GATED" ? "computation exists; the committing action requires owner authorization" : c.status === "EXISTING_AND_VALIDATED" ? "module + test present and verified this campaign" : "module exists but partial — needs hardening / breadth / real-traffic proof",
  acceptanceTest: c.status === "MISSING" ? `a deterministic ${c.id} engine with contract + tests + independent verification` : c.status === "EXISTING_AND_VALIDATED" ? "existing suite + end-to-end exercise" : `${c.id} hardening test showing the gap closed with independent evidence`,
})));

function crossAudit(): any {
  const byStatus: any = {}; for (const st of STATUS) byStatus[st] = 0; for (const c of CAPABILITIES) byStatus[c.status] += 1;
  return Object.freeze({
    canonicalSource: "CTO V174-A §7 enumeration",
    enumeratedCount: CAPABILITIES.length,
    directiveRoundNumber: 30,
    countNote: `the canonical §7 enumeration contains ${CAPABILITIES.length} distinct capability categories; the directive's '30' is a round-number framing. NO filler capability invented to reach 30 (per the explicit rule).`,
    capabilities: CAPABILITIES,
    byStatus: Object.freeze(byStatus),
    mutualized: Object.freeze(["odg-support-renewal-engine serves support + renewal + cancellation + churn-monitoring", "odg-economic-scaling-model serves analytical-accounting + taxation + CAC", "customer-outcome-intelligence serves outcome-analysis + satisfaction/churn"]),
    note: "READ-ONLY cross-audit; maps to REAL modules only; MISSING where none exists (not fabricated); no status declared AUTONOMOUS/validated without end-to-end proof.",
  });
}

/* prioritizedGaps() — MISSING + OWNER_GATED + PARTIAL ranked by commercial leverage (MISSING blocks a function outright). */
function prioritizedGaps(): any {
  const weight: any = { MISSING: 3, EXISTING_BUT_PARTIAL: 2, OWNER_GATED: 1, NOT_MEASURED: 2, EXISTING_AND_VALIDATED: 0, NOT_REQUIRED: 0 };
  const rows = CAPABILITIES.filter((c: any) => weight[c.status] > 0).map((c: any) => Object.freeze({ id: c.id, status: c.status, module: c.module, gap: c.gap, acceptanceTest: c.acceptanceTest, priority: weight[c.status] }));
  rows.sort((a: any, b: any) => b.priority - a.priority || (a.id < b.id ? -1 : 1));
  return Object.freeze({ total: rows.length, missing: rows.filter((r: any) => r.status === "MISSING").length, rows: Object.freeze(rows), topMissing: Object.freeze(rows.filter((r: any) => r.status === "MISSING").map((r: any) => r.id)) });
}

const CAPABILITY_CROSS_AUDIT_CONTRACT = Object.freeze({
  id: "V180-CAPABILITY-CROSS-AUDIT",
  purpose: "§2 — cross-audit the V174-A §7 business-operation capabilities against ODG's REAL modules; honest status; prioritized gaps",
  canonicalSource: "CTO V174-A §7 (28 enumerated capabilities; '30' is a round number — no filler invented)",
  invariants: Object.freeze([
    "recovered from the canonical V174-A §7 enumeration (28 items) — NO list fabricated to hit 30",
    "maps each capability to a REAL existing module or MISSING (not fabricated); honest status (6-level)",
    "mutualization identified (support-renewal serves 4 capabilities; scaling-model serves 3)",
    "no status declared AUTONOMOUS/validated without end-to-end proof; payment + cancellation stay OWNER_GATED",
    "READ-ONLY; deterministic; fail-closed; no competing register/model",
  ]),
});
module.exports = { CAPABILITIES, STATUS, crossAudit, prioritizedGaps, CAPABILITY_CROSS_AUDIT_CONTRACT };
export {};
