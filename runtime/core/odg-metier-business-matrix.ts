#!/usr/bin/env node
"use strict";
/*
 * V183 Livrable A — exhaustive P1..P15 business matrix. PURE, READ-ONLY, deterministic.
 *
 * A governance VIEW over the canonical métier roster (odg-metier-certification-planner.METIERS). For each métier it
 * records mission, users/needs, reusable ODG components, maturity, PARTIAL functions, DEMONSTRATED gaps, regulatory
 * constraints, owner-gates, and the technical + business validation criteria. It STRICTLY separates six honesty levels
 * (existence ≠ tested ≠ integrated ≠ métier-qualified ≠ commercially-authorized ≠ real commercial result) and invents
 * NO client, demand, revenue or certification. No new canonical system; reuses the planner roster.
 */

const { METIERS } = require("./odg-metier-certification-planner.js");

// the six honesty levels that must never be conflated (directive §2).
const LEVELS = Object.freeze(["TECHNICAL_EXISTENCE", "TESTED", "INTEGRATED", "METIER_QUALIFIED", "COMMERCIALLY_AUTHORIZED", "REAL_COMMERCIAL_RESULT"]);

// per-métier business descriptors (grounded in prior campaigns; reusable components reference real repo files).
const BIZ = Object.freeze({
  P1: { mission: "ship & maintain full-stack software products", users: "SMB/mid-market needing software delivery", reuse: ["odg-native-engineering.ts", "odg-product-design-engine.ts"], partial: ["autonomous delivery (V173, 53% automated)"], gaps: [] },
  P2: { mission: "AI/ML capabilities & evaluation", users: "teams needing governed AI features", reuse: ["agent-governance-harness", "odg-broad-it-eval-set.ts"], partial: ["eval set BLOCKED on external corpus"], gaps: ["independent eval corpus (external)"] },
  P3: { mission: "application security & supply-chain assurance", users: "orgs needing security posture + SBOM", reuse: ["odg-owasp-agentic-matrix.ts", "supply-chain-attest", "diag secret/egress"], partial: ["8 OWASP controls PARTIAL"], gaps: [] },
  P4: { mission: "data engineering & governed data flows", users: "orgs integrating multi-source data", reuse: ["data-connector", "document-intelligence.ts"], partial: ["data-layer multi-tenancy"], gaps: ["data-layer tenant isolation (demonstrated absent)"] },
  P5: { mission: "cloud/DevOps/platform (methodology, spec-only)", users: "teams needing IaC method", reuse: ["mission-contract scaffolding"], partial: ["ODG provisions no infra (spec-only)"], gaps: [] },
  P6: { mission: "evaluation & quality assurance", users: "teams needing independent QA", reuse: ["evaluator-independence", "mission-independent-validation"], partial: [], gaps: [] },
  P7: { mission: "SRE / reliability engineering", users: "orgs needing resilience + runbooks", reuse: ["incident-recurrence.ts", "p10-serious-incident-deadline.ts", "odg-campaign-lifecycle.ts"], partial: ["checkpoint/replay (ext P1)"], gaps: [] },
  P8: { mission: "API / integration engineering", users: "orgs integrating external systems", reuse: ["provider-capability-contract", "agent-identity"], partial: ["webhook signature/replay (ext P4)"], gaps: [] },
  P9: { mission: "FinOps & financial control", users: "orgs needing invoice/cost control", reuse: ["chantier-profitability.ts", "odg-product-economics-audit.ts", "invoicing.ts"], partial: ["exact-money invariants (ext P2)"], gaps: ["3-way match + bank-anomaly engine (ext P2, not built)"] },
  P10: { mission: "regulatory assurance (NIS2/CRA/EAA/GDPR/ISO)", users: "orgs facing EU compliance", reuse: ["odg-iso27001-evidence-crosswalk.ts", "cra-remediation-engine.ts", "regulatory-assurance engine"], partial: ["GDPR DOCUMENTED; ISO MAX=CONTROL_TESTED"], gaps: ["external certification (owner/body-gated)"] },
  P11: { mission: "document intelligence & contract analysis", users: "BTP/legal/procurement teams", reuse: ["document-intelligence.ts", "evidence-provenance.ts"], partial: ["page/section provenance (ext P3)"], gaps: ["BTP DCE/CCAP/CCTP analyzer (V181 BUILD candidate, not built)"] },
  P12: { mission: "streaming / realtime processing", users: "orgs needing realtime pipelines", reuse: ["odg-mission-scheduler.ts (bounded)"], partial: ["backpressure/bounded-queue (ext P1)"], gaps: [] },
  P13: { mission: "AI infrastructure & isolation", users: "orgs running untrusted AI workloads", reuse: ["provider-sandbox.ts", "frontier-sandbox.ts (bwrap)"], partial: ["OS isolation escape-tested (ext P5)"], gaps: [] },
  P14: { mission: "developer experience & tooling", users: "engineering teams", reuse: ["odg-ast-operations.ts", "odg-transform-catalog.ts"], partial: [], gaps: [] },
  P15: { mission: "workflow / orchestration", users: "orgs needing governed multi-step automation", reuse: ["odg-mission-orchestrator.ts", "odg-mission-scheduler.ts"], partial: [], gaps: [] },
});

function matrix(): any {
  const rows = METIERS.map((m: any) => {
    const b = (BIZ as any)[m.id] || { mission: m.name, users: "n/a", reuse: [], partial: [], gaps: [] };
    return Object.freeze({
      id: m.id, name: m.name, category: m.category, mission: b.mission, users: b.users,
      reusableComponents: Object.freeze(b.reuse), partialFunctions: Object.freeze(b.partial), demonstratedGaps: Object.freeze(b.gaps),
      regulatory: m.requirement, certificationKind: m.kind, ownerGated: m.kind !== "NONE" || b.gaps.some((g: string) => /owner|body-gated|payment/i.test(g)),
      technicalValidation: "module + test present and passing in the gate",
      metierValidation: "representative métier scenario exercised end-to-end (NOT yet done for most)",
      operationalProof: "requires real runtime + independent verification (NOT_MEASURED)",
      maturity: Object.freeze({ technicalExistence: b.reuse.length > 0, tested: b.reuse.length > 0, integrated: false, metierQualified: false, commerciallyAuthorized: false, realCommercialResult: false }),
    });
  });
  return Object.freeze({
    metiers: Object.freeze(rows), count: rows.length, levels: LEVELS,
    honesty: "existence ≠ tested ≠ integrated ≠ métier-qualified ≠ commercially-authorized ≠ real commercial result. NO client/demand/revenue/certification invented. €0 clients; most métiers are technical-existence+tested only.",
  });
}

const METIER_BUSINESS_MATRIX_CONTRACT = Object.freeze({
  id: "V183-METIER-BUSINESS-MATRIX",
  purpose: "Livrable A — exhaustive P1..P15 business matrix as a governance view over the canonical roster",
  invariants: Object.freeze([
    "covers all 15 canonical métiers (reuses planner.METIERS); no métier omitted or invented",
    "six honesty levels never conflated: existence ≠ tested ≠ integrated ≠ métier-qualified ≠ commercially-authorized ≠ real result",
    "no client / demand / revenue / certification invented; €0 clients",
    "owner-gates preserved; reuses real components; deterministic; read-only; no new canonical system",
  ]),
});

module.exports = { LEVELS, matrix, METIER_BUSINESS_MATRIX_CONTRACT };
export {};
