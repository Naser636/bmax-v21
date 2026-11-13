#!/usr/bin/env node
"use strict";
/*
 * V183 Livrable B — 9 primitives × 15 métiers use-matrix (135 intersections). PURE, READ-ONLY, deterministic.
 *
 * This is a GOVERNANCE / REUSE VIEW, not a new architecture and not a new canonical system. It reuses the canonical
 * métier roster (odg-metier-certification-planner.METIERS) and the nine canonical primitives, and classifies each of
 * the 135 intersections as REUSE / IMPROVE / BUILD_CONDITIONAL / NOT_APPLICABLE / OWNER_GATED, each with a code/contract
 * reference. The governing truth is that each primitive is implemented ONCE as a common capability and REUSED by every
 * métier (anti-duplication) — so REUSE is the honest default; the overrides capture the real, known exceptions.
 *
 * NO construction is engaged in this lot (directive §3): BUILD_CONDITIONAL is a classification label only.
 */

const { METIERS } = require("./odg-metier-certification-planner.js");

const PRIMITIVES = Object.freeze(["IDENTITY", "STATE", "CONTRACT", "POLICY", "RESOLVER", "EXECUTOR", "EVIDENCE", "RECOVERY", "ALLOCATOR"]);
const CLASS = Object.freeze(["REUSE", "IMPROVE", "BUILD_CONDITIONAL", "NOT_APPLICABLE", "OWNER_GATED"]);

// the canonical component implementing each primitive ONCE (reused by all métiers). References are real repo files.
const PRIMITIVE_REF = Object.freeze({
  IDENTITY: "agent-identity.ts + capability-attribution.ts",
  STATE: "odg-campaign-lifecycle.ts + odg-closure-register-ops.ts",
  CONTRACT: "provider-capability-contract.ts + mission WORK_ITEM_CONTRACT",
  POLICY: "truth-lock.ts + memory-trust-gate.ts + odg-owner-gated-prep.ts",
  RESOLVER: "odg-mission-scheduler.ts + niche-scoring.ts",
  EXECUTOR: "odg-closed-executor.ts + patch-executor",
  EVIDENCE: "audit-log.ts + evidence-provenance.ts",
  RECOVERY: "odg-campaign-lifecycle.ts (crash-atomic) + incident-recurrence.ts",
  ALLOCATOR: "odg-mission-scheduler.ts (window/budget) + odg-weekly-radar-scheduler.ts",
});

// Known, justified exceptions to the REUSE default. Key = `${PRIM}:${metierId}`. Everything else = REUSE.
// Grounded in prior campaigns + the PARKED V12.4 extension programs (which are NOT built here).
const OVERRIDES = Object.freeze({
  // FinOps — financial invariants + payment are the extension P2 / owner-gated cases.
  "EXECUTOR:P9": { cls: "OWNER_GATED", ref: "invoicing.ts + payments.ts (payment execution OWNER_GATED)", basis: "payment/decaissement execution requires owner authorization + a CONFIRMED transaction" },
  "EVIDENCE:P9": { cls: "IMPROVE", ref: "chantier-profitability.ts + odg-product-economics-audit.ts", basis: "exact-money arithmetic invariants (ext P2) improve the common EVIDENCE for finance" },
  // Document intelligence — page/section provenance improvement (ext P3).
  "EVIDENCE:P11": { cls: "IMPROVE", ref: "document-intelligence.ts + evidence-provenance.ts", basis: "page/section-level provenance + citations extend the common EVIDENCE (ext P3)" },
  "EXECUTOR:P11": { cls: "IMPROVE", ref: "document-intelligence.ts", basis: "contradiction/obligation extraction extends the common EXECUTOR for documents" },
  // Regulatory assurance — policy mapping improvement; certification is owner/external-gated.
  "POLICY:P10": { cls: "IMPROVE", ref: "odg-iso27001-evidence-crosswalk.ts + regulatory-assurance engine", basis: "regulatory control mapping improves the common POLICY; MAX=CONTROL_TESTED, nothing certified" },
  "CONTRACT:P10": { cls: "OWNER_GATED", ref: "certification dossiers (V174-B)", basis: "legally-required certification/qualification is owner + external-body gated" },
  // Security — adversarial hardening improvement (ext P5).
  "POLICY:P3": { cls: "IMPROVE", ref: "odg-owasp-agentic-matrix.ts + diag secret/egress", basis: "8 PARTIAL OWASP controls remain; improves common POLICY (ext P5)" },
  // Data engineering — multi-tenant data isolation + retention are the extension P4 conditional builds.
  "POLICY:P4": { cls: "BUILD_CONDITIONAL", ref: "delegate-isolation.ts (process) — data-layer tenancy NOT present", basis: "data-layer multi-tenancy absence demonstrated (ext P4); NOT built in this lot" },
  // SRE reliability — checkpoint/replay improvement (ext P1).
  "RECOVERY:P7": { cls: "IMPROVE", ref: "odg-campaign-lifecycle.ts + incident-recurrence.ts", basis: "per-record CRC + checkpoint/replay improve the common RECOVERY (ext P1)" },
  // Streaming/realtime — bounded queues/backpressure improvement (ext P1 ALLOCATOR).
  "ALLOCATOR:P12": { cls: "IMPROVE", ref: "odg-mission-scheduler.ts (bounded)", basis: "bounded work-queues + backpressure improve the common ALLOCATOR for streaming" },
  // AI infrastructure — real OS isolation proof (ext P5) is an improvement to POLICY/ALLOCATOR.
  "POLICY:P13": { cls: "IMPROVE", ref: "provider-sandbox.ts + frontier-sandbox.ts (bwrap)", basis: "OS isolation proven by escape tests improves common POLICY for AI-infra (ext P5)" },
});

function cellFor(prim: string, metier: any): any {
  const key = `${prim}:${metier.id}`;
  const o = (OVERRIDES as any)[key];
  if (o) return Object.freeze({ primitive: prim, metier: metier.id, metierName: metier.name, classification: o.cls, ref: o.ref, basis: o.basis });
  return Object.freeze({ primitive: prim, metier: metier.id, metierName: metier.name, classification: "REUSE", ref: (PRIMITIVE_REF as any)[prim], basis: "primitive implemented ONCE as a common capability and reused by this métier (anti-duplication)" });
}

function matrix(): any {
  const cells: any[] = [];
  for (const prim of PRIMITIVES) for (const m of METIERS) cells.push(cellFor(prim, m));
  const byClass: any = {}; for (const c of CLASS) byClass[c] = 0; for (const c of cells) byClass[c.classification] += 1;
  return Object.freeze({
    primitives: PRIMITIVES, metierCount: METIERS.length, intersections: cells.length,
    cells: Object.freeze(cells), byClass: Object.freeze(byClass),
    note: "135 intersections, each qualified with a code/contract reference. REUSE default (primitives implemented once, reused by all métiers); overrides are the real known exceptions. NO construction engaged in this lot (BUILD_CONDITIONAL is a label only).",
  });
}

/* conditionalBuilds — the BUILD_CONDITIONAL cells, surfaced for the PARKED extension's Phase-A audit (not built here). */
function conditionalBuilds(): any {
  const rows = matrix().cells.filter((c: any) => c.classification === "BUILD_CONDITIONAL");
  return Object.freeze({ count: rows.length, rows: Object.freeze(rows), note: "surfaced only; absence demonstrated; construction deferred to the PARKED V12.4 extension after Gate A — NOT engaged here." });
}

const PRIMITIVE_METIER_MATRIX_CONTRACT = Object.freeze({
  id: "V183-PRIMITIVE-METIER-MATRIX",
  purpose: "Livrable B — governance/reuse view of the 9×15 intersections; classify, do NOT construct",
  invariants: Object.freeze([
    "exactly 135 intersections (9 primitives × 15 métiers), each classified + referenced",
    "REUSE default: each primitive implemented once and reused — no second canonical system",
    "NO construction engaged in this lot; BUILD_CONDITIONAL is a classification label only",
    "payment execution + legally-required certification stay OWNER_GATED",
    "reuses the canonical métier roster (planner.METIERS); deterministic; read-only",
  ]),
});

module.exports = { PRIMITIVES, CLASS, PRIMITIVE_REF, matrix, conditionalBuilds, PRIMITIVE_METIER_MATRIX_CONTRACT };
export {};
