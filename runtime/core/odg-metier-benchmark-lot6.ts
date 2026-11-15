#!/usr/bin/env node
"use strict";
/*
 * V199 §3/§12 — radar LOT 6 (final 5 métiers: P14 DevEx, P15 Workflow/orchestration, M3 FinOps, M4 Data Engineering,
 * M5 Accessibility). PURE, deterministic, READ-ONLY. Completes the 20-métier study (20/20). Real sources collected under
 * grant V141 (WebSearch, 2026-11-15) fed THROUGH the radar collection adapter (V187) — the radar owns the path.
 * Benchmark + gaps + construction contracts prepared, BLOCKED_AWAITING_ISOLATION (CTO build auth granted V192 §3; only
 * validated real isolation remains, OWNER_GATED). No new primitive/métier/campaign/radar — this composes the existing one.
 */

const ADAPTER = require("./odg-radar-collection-adapter.js");

const SOURCES = Object.freeze({
  P14: [{ org: "DORA + platform-engineering 2026 (Backstage)", title: "DevEx = self-service golden paths (scaffold+sensible defaults, local env, pre-configured CI, CD with progressive delivery, observability out-of-box, on-call, incident templates), 'opinionated but escapable'; Backstage=framework NOT product (2-4 eng-months); measure DORA+SPACE+DevEx, onboarding time, % teams on golden paths, internal NPS; treat the portal as a product", url: "https://dora.dev/", consultedDate: "2026-11-15" }],
  P15: [{ org: "Temporal/Airflow 2026", title: "Durable execution = append-only event history + replay; exactly-once applies to WORKFLOW LOGIC, activity side-effects are at-least-once ⇒ idempotency required; saga compensation written explicitly in code; 2026 production pattern 'Airflow on top (schedule/deps), Temporal underneath (durability/retries)'", url: "https://temporal.io/", consultedDate: "2026-11-15" }],
  M3: [{ org: "FinOps Foundation 2026 (FOCUS)", title: "FinOps Framework 4 domains (Understand, Optimize, Quantify business value, Manage practice); FOCUS = vendor-neutral open cost+usage schema normalizing AWS/Azure/GCP; powers showback/chargeback, commitment optimization, invoice reconciliation, unit economics; 2026 shift toward governance/forecasting/exec-alignment", url: "https://www.finops.org/framework/", consultedDate: "2026-11-15" }],
  M4: [{ org: "Data-engineering 2026 (lakehouse/dbt)", title: "Lakehouse (Iceberg/Delta/Hudi, ACID on object storage); data contracts enforced pre-merge (schema/freshness) via dbt contracts or schema registry; medallion Bronze/Silver/Gold with per-layer quality checks (ingestion SLAs / schema+null+referential / metric consistency); observability+lineage (OpenLineage, Great Expectations, Monte Carlo)", url: "https://docs.getdbt.com/", consultedDate: "2026-11-15" }],
  M5: [{ org: "EAA / WCAG 2.2 / EN 301 549 (2026)", title: "WCAG 2.2 (POUR; keyboard, target size, accessible auth); EN 301 549 v4.1.1 (Sep 2026, incl. WCAG 2.2) — OJEU citation expected Nov 2026 ⇒ presumed EAA standard, but as of Oct 2026 NONE yet harmonised; automated tools catch ~30% ⇒ hybrid (axe-core/pa11y-ci/Lighthouse + manual + screen reader); use ARIA only where native is insufficient (ARIA pages avg 59 errors vs 42)", url: "https://www.w3.org/TR/WCAG22/", consultedDate: "2026-11-15" }],
});
function fetcher(query: string): any[] { const m = String(query).match(/\b(P14|P15|M3|M4|M5)\b/); return m ? (SOURCES as any)[m[1]] : []; }
const GRANT = Object.freeze({ authorized: true, expiresMs: 1795046400000, budget: Object.freeze({ maxCalls: 200 }) });

function campaign(nowEpochMs: number): any {
  return ADAPTER.runCampaign({
    id: "V199-lot6", nowEpochMs, grant: GRANT, fetcher,
    items: [
      { metier: "P14", query: "P14 DevEx golden path internal developer platform Backstage DORA", buySignal: "NONE", segmentFit: 4, budgetEvidence: "HYPOTHESIS", regulatoryUrgency: 1 },
      { metier: "P15", query: "P15 workflow orchestration Temporal durable execution saga idempotency", buySignal: "NONE", segmentFit: 4, budgetEvidence: "HYPOTHESIS", regulatoryUrgency: 1 },
      { metier: "M3", query: "M3 FinOps framework FOCUS cost usage unit economics", buySignal: "NONE", segmentFit: 4, budgetEvidence: "OBSERVED", regulatoryUrgency: 2 },
      { metier: "M4", query: "M4 Data Engineering lakehouse dbt data contracts medallion quality", buySignal: "NONE", segmentFit: 4, budgetEvidence: "HYPOTHESIS", regulatoryUrgency: 1 },
      { metier: "M5", query: "M5 Accessibility WCAG 2.2 EAA EN 301 549 axe-core", buySignal: "REGULATORY_DEADLINE", segmentFit: 4, budgetEvidence: "OBSERVED", regulatoryUrgency: 4 },
    ],
  });
}

const BENCHMARK = Object.freeze([
  { metier: "P14", name: "Developer experience & tooling", worldRef: "Golden paths (scaffold+CI+progressive-delivery+observability+on-call), 'opinionated but escapable'; Backstage=framework not product; measure DORA+SPACE+DevEx, onboarding, % on golden paths, NPS", odgCurrent: "odg-ast-operations + odg-transform-catalog + metier P14 scaffoldEvidence (golden-path scaffold attestation: build/sbom/confinement/health)", gap: "no golden-path scaffold CATALOG; no DevEx metric view (DORA/SPACE over real events)", recommendation: "IMPROVE: golden-path scaffold catalog + DevEx metric view (DORA/SPACE) over real events; reuse scaffoldEvidence; deterministic-only" },
  { metier: "P15", name: "Workflow / orchestration", worldRef: "Durable execution = event-history+replay; exactly-once = workflow logic only (activities at-least-once + idempotency); saga compensation in code; Airflow-on-top/Temporal-underneath", odgCurrent: "odg-mission-orchestrator + odg-mission-scheduler + metier P15 runSaga (COMPENSATED on failure) + support-renewal idempotency", gap: "no idempotency/saga-compensation REFERENCE catalog beyond runSaga; no durable event-history replay (ODG is not a workflow runtime)", recommendation: "IMPROVE (method-only): saga-compensation + idempotency reference over the existing orchestrator; a durable-execution runtime is REJECTED/OWNER_GATED (not an ODG runtime)" },
  { metier: "M3", name: "FinOps", worldRef: "FinOps 4 domains; FOCUS vendor-neutral cost+usage schema; showback/chargeback, commitment optimization, unit economics; 2026 governance/forecasting/exec-alignment", odgCurrent: "odg-economic-model (COST SSOT) + odg-product-economics-audit (3-level margin) + chantier-profitability (SELLING≠COST≠NET)", gap: "no FOCUS-aligned cost schema; no showback/unit-economics view keyed to the economic model", recommendation: "IMPROVE: FOCUS-aligned unit-economics/showback view over the economic model; NO cloud-billing integration (owner-gated); margins never conflated" },
  { metier: "M4", name: "Data Engineering", worldRef: "Lakehouse (Iceberg/Delta/Hudi ACID); data contracts enforced pre-merge (dbt/schema registry); medallion Bronze/Silver/Gold per-layer quality; observability+lineage (OpenLineage/Great Expectations)", odgCurrent: "document-intelligence + evidence provenance (sourceCommit/sha256) + closure-register-ops (lossless roundtrip)", gap: "no data-contract enforcement harness; no medallion quality-gate / lineage reference", recommendation: "IMPROVE: data-contract validation + medallion quality-gate reference (schema/freshness/null/referential checks); NO external data platform (harness/reference only)" },
  { metier: "M5", name: "Accessibility", worldRef: "WCAG 2.2 (POUR); EN 301 549 v4.1.1 (Sep 2026) OJEU citation expected Nov 2026 ⇒ presumed EAA standard (as of Oct 2026 NONE yet harmonised); automated catches ~30% ⇒ hybrid; ARIA only where native insufficient", odgCurrent: "odg-marketing-engine (unproven-claim detector) + document-intelligence + regulatory source-cite-or-refuse", gap: "no WCAG 2.2 evidence checklist; no automated-scan-coverage view with the honest ~30% caveat; no EAA role/deadline tracker", recommendation: "IMPROVE: WCAG 2.2 evidence checklist + automated-scan ~30%-coverage honesty view + EAA deadline/role note (source-cited; nothing declared conformant; NO live site scanning)" },
]);

const CONSTRUCTION_CONTRACTS = Object.freeze([
  { id: "IMP-P14-DEVEX-GOLDENPATH", metier: "P14", objective: "golden-path scaffold catalog + DevEx metric view (DORA/SPACE over real events; reuse scaffoldEvidence)", writeSet: ["runtime/core/odg-devex-goldenpath.ts", "runtime/core/odg-devex-goldenpath.test.ts"], acceptance: ["deterministic only; metrics computed over REAL events not invented", "scaffold attestation reused not duplicated", "gate green"] },
  { id: "IMP-P15-SAGA-REF", metier: "P15", objective: "saga-compensation + idempotency reference over the existing orchestrator (method-only, NO runtime)", writeSet: ["runtime/core/odg-saga-idempotency-reference.ts", "runtime/core/odg-saga-idempotency-reference.test.ts"], acceptance: ["reference only; durable-execution runtime REJECTED/OWNER_GATED", "composes existing orchestrator/scheduler, no 2nd engine", "gate green"] },
  { id: "IMP-M3-FOCUS-UNIT-ECON", metier: "M3", objective: "FOCUS-aligned unit-economics/showback view over the economic model (no cloud-billing integration)", writeSet: ["runtime/core/odg-finops-unit-economics.ts", "runtime/core/odg-finops-unit-economics.test.ts"], acceptance: ["REUSES economic-model COST SSOT; margins never conflated", "no external billing; owner-gated integrations noted", "gate green"] },
  { id: "IMP-M4-DATA-CONTRACTS", metier: "M4", objective: "data-contract validation + medallion quality-gate reference (schema/freshness/null/referential)", writeSet: ["runtime/core/odg-data-contract-quality.ts", "runtime/core/odg-data-contract-quality.test.ts"], acceptance: ["harness/reference only; NO external data platform", "quality failures fail the layer not the dashboard", "gate green"] },
  { id: "IMP-M5-WCAG-EVIDENCE", metier: "M5", objective: "WCAG 2.2 evidence checklist + automated-scan ~30%-coverage honesty view + EAA deadline/role note (source-cited)", writeSet: ["runtime/core/odg-wcag-accessibility-evidence.ts", "runtime/core/odg-wcag-accessibility-evidence.test.ts"], acceptance: ["nothing declared conformant/certified; ~30% automated-coverage stated honestly", "NO live site scanning; EAA status sourced not invented", "gate green"] },
].map((c: any) => Object.freeze({ ...c, writeSet: Object.freeze(c.writeSet), acceptance: Object.freeze(c.acceptance), status: "BLOCKED_AWAITING_ISOLATION", note: "CTO build auth granted (V192 §3); construction waits only on validated real isolation (OWNER_GATED)." })));

function report(nowEpochMs: number): any {
  return Object.freeze({
    lot: 6, metiers: Object.freeze(["P14", "P15", "M3", "M4", "M5"]), radarCampaign: campaign(nowEpochMs),
    benchmark: BENCHMARK, constructionContracts: CONSTRUCTION_CONTRACTS,
    remainingMetiers: Object.freeze([]),
    note: "LOT 6 collected THROUGH the radar adapter; after lots 1-6, ALL 20 métiers studied (15 P + 5 M), 0 remain. Construction contracts prepared, BLOCKED_AWAITING_ISOLATION. M5 has an EAA regulatory signal; nothing declared conformant.",
  });
}

const BENCHMARK_LOT6_CONTRACT = Object.freeze({
  id: "V199-METIER-BENCHMARK-LOT6",
  purpose: "§3/§12 — final 5 métiers (P14/P15/M3/M4/M5) benchmark via a real radar-adapter campaign + prepared construction contracts; completes 20/20",
  invariants: Object.freeze([
    "sources collected THROUGH the radar adapter (injected provider) — not radar autonomous egress",
    "real métier-specific refs (DORA/Backstage, Temporal, FOCUS, lakehouse/dbt, WCAG 2.2/EAA); REUSE/IMPROVE-first",
    "P15 durable-execution runtime + M4 external data platform REJECTED/OWNER_GATED; M5 nothing declared conformant (EAA sourced not invented)",
    "construction contracts prepared + BLOCKED_AWAITING_ISOLATION; no construction performed; deterministic; read-only; 0 métiers remain (20/20 studied)",
  ]),
});

module.exports = { SOURCES, GRANT, fetcher, campaign, BENCHMARK, CONSTRUCTION_CONTRACTS, report, BENCHMARK_LOT6_CONTRACT };
export {};
