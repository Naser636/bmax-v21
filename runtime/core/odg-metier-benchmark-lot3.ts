#!/usr/bin/env node
"use strict";
/*
 * V187 LOT 3 — P2/P4/P10 benchmark + a real radar campaign run THROUGH the radar-owned collection adapter. PURE,
 * deterministic, READ-ONLY. The external sources below were collected under grant V141 (WebSearch, 2026-11-13) and are
 * fed into the adapter as the INJECTED authorized provider — the radar owns collection/provenance/qualification/proposal.
 * Also records the honest status of §13 prepared improvements (P1/P3/P5/P9/P11) and §9/§11 orchestration + independent-
 * expert (NOT_MEASURED / NOT_AVAILABLE where not demonstrated — never simulated as real).
 */

const ADAPTER = require("./odg-radar-collection-adapter.js");

// REAL sources collected under grant V141 (2026-11-13), métier-specific. Injected into the adapter as the provider.
const SOURCES = Object.freeze({
  P2: [
    { org: "ISO/IEC", title: "ISO/IEC 42001 — certifiable AI management system", url: "https://www.iso.org/standard/81230.html", consultedDate: "2026-11-13" },
    { org: "NIST", title: "AI RMF — GOVERN/MAP/MEASURE/MANAGE", url: "https://www.nist.gov/itl/ai-risk-management-framework", consultedDate: "2026-11-13" },
  ],
  P4: [
    { org: "DAMA", title: "DMBOK — 11 knowledge areas, 6 data-quality dimensions", url: "https://www.dama.org/cpages/body-of-knowledge", consultedDate: "2026-11-13" },
    { org: "industry (soda.io/atlan)", title: "data contracts (schema+freshness SLA), shift-left governance; maturity L1→L5", url: "https://soda.io/blog/guide-data-quality-frameworks-tools-best-practices", consultedDate: "2026-11-13" },
  ],
  P10: [
    { org: "EU (official timeline)", title: "AI Act: 2 Aug 2026 general + Art.50; 2 Dec 2026 prohibitions; 2 Dec 2027 high-risk Annex III; penalties €35M/7% & €15M/3%", url: "https://artificialintelligenceact.eu/", consultedDate: "2026-11-13" },
    { org: "EU", title: "NIS2 + DORA in force; converging GDPR/NIS2/DORA/AI-Act/CRA governance by 2027", url: "https://eur-lex.europa.eu/eli/dir/2022/2555/oj", consultedDate: "2026-11-13" },
  ],
});

// the injected authorized provider: returns the real sources for a query tagged with the métier.
function fetcher(query: string): any[] { const m = String(query).match(/\b(P2|P4|P10)\b/); return m ? (SOURCES as any)[m[1]] : []; }

const GRANT = Object.freeze({ authorized: true, expiresMs: 1795046400000, budget: Object.freeze({ maxCalls: 200 }) });

/* campaign — run P2/P4/P10 THROUGH the adapter (radar owns the path). nowEpochMs injected (deterministic). */
function campaign(nowEpochMs: number): any {
  return ADAPTER.runCampaign({
    id: "V187-lot3", nowEpochMs, grant: GRANT, fetcher,
    items: [
      { metier: "P2", query: "P2 AI/ML governance ISO 42001 NIST AI RMF", buySignal: "NONE", segmentFit: 4, budgetEvidence: "HYPOTHESIS", regulatoryUrgency: 3 },
      { metier: "P4", query: "P4 data engineering DAMA DMBOK data contracts", buySignal: "NONE", segmentFit: 4, budgetEvidence: "HYPOTHESIS", regulatoryUrgency: 2 },
      { metier: "P10", query: "P10 regulatory assurance EU AI Act NIS2 deadlines", buySignal: "REGULATORY_DEADLINE", segmentFit: 4, budgetEvidence: "OBSERVED", regulatoryUrgency: 5 },
    ],
  });
}

const LOT3_BENCHMARK = Object.freeze([
  { metier: "P2", name: "AI / ML", worldRef: "ISO/IEC 42001 (certifiable AIMS) + NIST AI RMF (GOVERN/MAP/MEASURE/MANAGE); MLOps governance embedded in pipelines (model cards, risk tiers)", odgCurrent: "agent-governance-harness + evaluator-independence + odg-broad-it-eval-set (eval BLOCKED on external corpus)", gap: "no ISO-42001 AIMS mapping / NIST-RMF function self-rating; model cards + risk tiers absent", recommendation: "IMPROVE: map existing governance to NIST-RMF functions + ISO-42001 clauses; add model-card + risk-tier metadata (reuse; no new engine)" },
  { metier: "P4", name: "Data engineering", worldRef: "DAMA-DMBOK (11 KAs, 6 quality dims); data contracts (YAML schema+freshness SLA); shift-left governance; maturity L1→L5 (aim L3)", odgCurrent: "data-connector (CSV/JSON + assessDataQuality) + document-intelligence", gap: "no DAMA 6-dimension quality scoring; no data-contract YAML; no maturity self-rating; data-layer tenancy BUILD_CONDITIONAL (ext P4)", recommendation: "IMPROVE: add DAMA 6-dimension quality scoring + data-contract schema to data-connector (reuse; no new engine)" },
  { metier: "P10", name: "Regulatory assurance", worldRef: "EU AI Act deadlines (2 Aug 2026 / 2 Dec 2026 / 2 Dec 2027; penalties €35M/7%, €15M/3%); NIS2+DORA in force; convergence by 2027", odgCurrent: "iso27001-crosswalk + cra-remediation-engine + regulatory-assurance (source-cite-or-refuse) + p10-serious-incident-deadline", gap: "no AI-Act obligation tracker / deadline calendar; convergence matrix (GDPR/NIS2/DORA/AI-Act/CRA) absent", recommendation: "IMPROVE: add an AI-Act deadline+obligation tracker to the regulatory-assurance engine (source-cited; reuse; no cert claimed)" },
]);

// §13 — status of the 5 prepared improvements from lots 1-2. HONEST: prepared, NOT built in this lot.
const PREPARED_IMPROVEMENTS = Object.freeze({
  P1: "PREPARED (DORA-metrics view from real events) — NOT built this lot",
  P3: "PREPARED (SSDF mapping + SLSA-tier claim) — NOT built this lot",
  P5: "PREPARED (CNCF self-rating + golden-path catalog) — NOT built this lot",
  P9: "PREPARED (FinOps KPI set + maturity self-rating) — NOT built this lot",
  P11: "PREPARED (confidence calibration + 0.90 STP + labelled-corpus harness) — NOT built this lot",
  note: "each remains a distinct candidate mission; none declared built. Building them is the next construction lot once ODG authorizes.",
});

// §9/§11 — orchestration + independent-expert honest status.
const ORCHESTRATION_STATUS = Object.freeze({
  componentsAudited: ["odg-mission-orchestrator (V167)", "odg-mission-scheduler", "odg-campaign-lifecycle", "delegate-isolation", "provider-sandbox", "evaluator-independence"],
  nativeParallelExecution: "NOT_MEASURED — orchestration COMPONENTS exist (dispatcher + isolation + independence), but a real 5-way simultaneous ODG/Claude-Code execution with distinct task-ids/timestamps was NOT demonstrated in this synchronous lot; not simulated.",
  independentExpert: "evaluator-independence module EXISTS (deterministic independence checks); a separate qualified MODEL reviewer distinct from the builder is NOT_AVAILABLE in this synchronous single-context run (§11) — declared NOT_AVAILABLE rather than passing off a self-check as independent.",
  recommendation: "improve native orchestration (bounded worker queues + worktree isolation) in the existing components before claiming real parallelism; wire a genuinely separate reviewer when one is available (no paid provider).",
});

function report(nowEpochMs: number): any {
  const camp = campaign(nowEpochMs);
  return Object.freeze({
    lot: 3, metiers: Object.freeze(["P2", "P4", "P10"]),
    radarCampaign: camp, benchmark: LOT3_BENCHMARK, preparedImprovements: PREPARED_IMPROVEMENTS, orchestration: ORCHESTRATION_STATUS,
    remainingMetiers: Object.freeze(["P6", "P7", "P8", "P12", "P13", "P14", "P15", "M1", "M3", "M4", "M5"]),
    note: "LOT 3: P2/P4/P10 collected THROUGH the radar adapter (injected grant-V141 provider; radar owns the path); 11 métiers remain. Real research ≠ autonomous radar egress (NOT_MEASURED). Prepared improvements NOT built. Parallelism NOT_MEASURED. Independent model-review NOT_AVAILABLE.",
  });
}

const BENCHMARK_LOT3_CONTRACT = Object.freeze({
  id: "V187-METIER-BENCHMARK-LOT3",
  purpose: "§6/§12/§13 — P2/P4/P10 benchmark via a real radar-adapter campaign + honest status of prepared improvements and orchestration",
  invariants: Object.freeze([
    "P2/P4/P10 sources collected THROUGH the radar adapter (injected authorized provider) — not presented as radar autonomous egress",
    "real references métier-specific (ISO42001/NIST-RMF, DAMA-DMBOK/data-contracts, EU-AI-Act); REUSE/IMPROVE-first; no cert claimed",
    "the 5 prepared improvements (P1/P3/P5/P9/P11) are PREPARED not built; none declared built",
    "native 5-way parallel execution NOT_MEASURED; independent model-review NOT_AVAILABLE — not simulated",
    "deterministic (injected nowEpochMs); read-only; no second radar/engine; 11 métiers remain",
  ]),
});

module.exports = { SOURCES, GRANT, fetcher, campaign, LOT3_BENCHMARK, PREPARED_IMPROVEMENTS, ORCHESTRATION_STATUS, report, BENCHMARK_LOT3_CONTRACT };
export {};
