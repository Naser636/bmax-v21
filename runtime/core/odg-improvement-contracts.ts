#!/usr/bin/env node
"use strict";
/*
 * V189-A §3/§4 — PREPARED mission-contracts for the 5 improvements (P1/P3/P5/P9/P11). PURE, READ-ONLY, deterministic.
 *
 * This is PREPARATION / analysis only (explicitly allowed by V189-A §4 during V189). It does NOT build the improvements:
 * V189-A §4 forbids any provider technical writing of the improvements until the sandbox is verified really isolated or
 * rebuilt+validated — and V189's decisive finding is that OS confinement of this session is BLOCKED/OWNER_GATED. So every
 * contract here carries status BLOCKED_AWAITING_ISOLATION. Each contract is shaped to feed odg-sovereign-delegation
 * (writeSet/protectedPaths/requiredTests/acceptanceCriteria/stopConditions) once ODG authorizes construction.
 */

// the §3 seven-part structure per improvement, grounded in the V185/V186/V187 benchmarks (no new research needed).
const CONTRACTS = Object.freeze([
  {
    id: "IMP-P1-DORA-VIEW", metier: "P1", gap: "no DORA delivery metrics tracked (deploy-freq/lead-time/CFR/MTTR)",
    benchmarkRef: "DORA / State of DevOps 2026 (V186 lot2): elite on-demand / <1d / 0-5% / <1h",
    measurableObjective: "emit the 4 DORA metrics from REAL patch-execution + campaign-lifecycle events; deploy-frequency stays NOT_MEASURED until a runtime binding exists",
    writeSet: ["runtime/core/odg-dora-metrics-view.ts", "runtime/core/odg-dora-metrics-view.test.ts"],
    deps: ["audit-log.ts", "odg-otel-execution-trace.ts", "odg-campaign-lifecycle.ts"],
    acceptanceCriteria: ["metrics computed only from real events (no fabricated numbers)", "deploy-freq NOT_MEASURED flagged", "gate green + tsc 0"],
    evidencePlan: "test over recorded real execution events; provenance per metric",
  },
  {
    id: "IMP-P3-SSDF-SLSA", metier: "P3", gap: "no SSDF group mapping / SLSA-tier self-assessment",
    benchmarkRef: "NIST SSDF (PO/PS/PW/RV) + SLSA L2 baseline/L3 (V185 lot1)",
    measurableObjective: "map existing security controls to SSDF groups + assert a concrete SLSA tier WITH evidence (no unproven tier claim)",
    writeSet: ["runtime/core/odg-ssdf-slsa-crosswalk.ts", "runtime/core/odg-ssdf-slsa-crosswalk.test.ts"],
    deps: ["odg-owasp-agentic-matrix.ts", "supply-chain-attest", "evidence-provenance.ts"],
    acceptanceCriteria: ["each SSDF practice maps to a REAL control or honest GAP", "SLSA tier claimed only with evidence; higher tiers NOT claimed", "gate green"],
    evidencePlan: "crosswalk table with per-control references; tamper-evidence still blocked on owner key (V162) noted",
  },
  {
    id: "IMP-P5-CNCF-RATING", metier: "P5", gap: "no CNCF platform-engineering maturity self-rating",
    benchmarkRef: "CNCF Platform Engineering Maturity v2 (V186 lot2): Investment/Adoption/Interfaces/Operations/Measurement",
    measurableObjective: "self-rate the 5 CNCF aspects over the existing contract-scaffolding; infra PROVISIONING stays REJECTED/OWNER_GATED (ODG spec-only)",
    writeSet: ["runtime/core/odg-cncf-platform-maturity.ts", "runtime/core/odg-cncf-platform-maturity.test.ts"],
    deps: ["provider-sandbox.ts", "mission-contract scaffolding"],
    acceptanceCriteria: ["5 aspects rated with method + evidence", "no infra provisioning introduced", "gate green"],
    evidencePlan: "aspect ratings referencing real repo capabilities; honest NOT_MEASURED where no runtime",
  },
  {
    id: "IMP-P9-FINOPS-KPIS", metier: "P9", gap: "finops-analyzer lacks the FinOps KPI set + maturity self-rating",
    benchmarkRef: "FinOps Foundation Inform/Optimize/Operate + Crawl/Walk/Run (V185 lot1)",
    measurableObjective: "add allocation-coverage / tagging-compliance / forecast-accuracy / unallocated% KPIs + Crawl/Walk/Run self-rating to finops-analyzer (reuse, no new engine)",
    writeSet: ["runtime/core/odg-finops-kpis.ts", "runtime/core/odg-finops-kpis.test.ts"],
    deps: ["finops-analyzer.ts", "chantier-profitability.ts"],
    acceptanceCriteria: ["KPIs computed from supplied data only; estimated≠realized preserved", "maturity self-rating with method", "gate green"],
    evidencePlan: "KPIs over 2 real periods (reusing finops-analyzer measureSavings discipline)",
  },
  {
    id: "IMP-P11-CONF-CALIB", metier: "P11", gap: "no confidence calibration / STP threshold / labelled-corpus benchmark",
    benchmarkRef: "IDP benchmarks (V186 lot2): calibrated confidence, 0.90 STP threshold, field-level provenance",
    measurableObjective: "add confidence-calibration + a 0.90 STP threshold (as a HYPOTHESIS to validate, not universal truth) + a reproducible labelled-corpus harness on document-intelligence; OCR stays a separate BUILD_CONDITIONAL",
    writeSet: ["runtime/core/odg-doc-confidence-calibration.ts", "runtime/core/odg-doc-confidence-calibration.test.ts"],
    deps: ["document-intelligence.ts", "evidence-provenance.ts"],
    acceptanceCriteria: ["calibration measured against a labelled set; STP threshold flagged HYPOTHESIS", "no OCR introduced here", "gate green"],
    evidencePlan: "calibration curve over a synthetic labelled corpus (clearly tagged synthetic)",
  },
]);

const ALWAYS_PROTECTED = Object.freeze(["runtime/governance/ROADMAP.json", "docs/odg/closure-register.json"]);

function contracts(): any {
  const rows = CONTRACTS.map((c: any) => Object.freeze({
    ...c, writeSet: Object.freeze(c.writeSet.slice()), deps: Object.freeze(c.deps.slice()), acceptanceCriteria: Object.freeze(c.acceptanceCriteria.slice()),
    protectedPaths: ALWAYS_PROTECTED, requiredTests: Object.freeze(c.writeSet.filter((f: string) => /\.test\.ts$/.test(f))),
    stopConditions: Object.freeze(["budget", "scope-expansion-attempt", "protected-path-touch"]),
    status: "BLOCKED_AWAITING_ISOLATION",
    note: "PREPARED only; construction BLOCKED per V189-A §4 until the sandbox is verified really isolated or rebuilt+validated (V189: OS session confinement OWNER_GATED).",
  }));
  return Object.freeze({
    count: rows.length, contracts: Object.freeze(rows),
    allWriteSetsDisjoint: (() => { const all = rows.flatMap((r: any) => r.writeSet); return new Set(all).size === all.length; })(),
    ctoBuildAuthorization: "GRANTED (CTO V192 §3 — authorization to build the 5 improvements inside isolated worktrees via the V188 chain; no per-improvement re-authorization needed within the existing contracts + security limits)",
    constructionGate: "CTO authorization is GRANTED (V192 §3); the ONLY remaining condition is VALIDATED REAL ISOLATION of the provider session (OWNER_GATED, V190/V192). Until a real isolated session is launched + proven, all 5 stay BLOCKED_AWAITING_ISOLATION — no provider writing in the canonical repo.",
  });
}

/* parallelLot — the 5 can form ONE parallel lot IF isolation is authorized (disjoint write-sets, no shared files). */
function parallelLot(): any {
  const c = contracts();
  return Object.freeze({
    eligible: c.allWriteSetsDisjoint, laneCount: c.count,
    note: c.allWriteSetsDisjoint ? "write-sets are disjoint ⇒ eligible for a 5-lane parallel lot ONCE isolation is authorized; real simultaneity remains NOT_MEASURED until demonstrated" : "write-set conflict — not parallel-eligible",
    simultaneity: "NOT_MEASURED (not simulated)",
  });
}

const IMPROVEMENT_CONTRACTS_CONTRACT = Object.freeze({
  id: "V189A-IMPROVEMENT-CONTRACTS",
  purpose: "§3/§4 — prepare the 5 improvement mission-contracts; do NOT build until isolation validated",
  invariants: Object.freeze([
    "preparation/analysis only; NO improvement built; all 5 status BLOCKED_AWAITING_ISOLATION",
    "each contract has gap + benchmark ref + measurable objective + bounded write-set + acceptance criteria + evidence plan",
    "write-sets disjoint (parallel-eligible once authorized); real simultaneity NOT_MEASURED",
    "protectedPaths include ROADMAP.json + closure-register.json; shaped to feed odg-sovereign-delegation",
    "construction gate: ODG authorization AND validated isolation required (V189-A §4); deterministic; read-only",
  ]),
});

module.exports = { CONTRACTS, ALWAYS_PROTECTED, contracts, parallelLot, IMPROVEMENT_CONTRACTS_CONTRACT };
export {};
