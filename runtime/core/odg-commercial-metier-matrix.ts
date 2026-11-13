#!/usr/bin/env node
"use strict";
/*
 * V183 COMPLEMENT — the 5 additional COMMERCIAL métiers (M1..M5) + 20-métier reconciliation + 9×20 (180) use-matrix.
 * PURE, READ-ONLY, deterministic. ADDITIVE to V183 (does not re-run it).
 *
 * The canonical ODG business scope = 15 principal métiers (P1..P15) + 5 commercial métiers (M1..M5) = 20 total.
 * The 5 commercial métiers are RECONCILED from the canonical V151 consolidation dossier ("5 commercial métiers (M1–M5)")
 * and each maps to a REAL existing module — NOT invented, NOT turned into a new primitive, NOT a second métier architecture.
 * This module REUSES odg-primitive-metier-matrix (the 9×15 = 135) and ADDS the 9×5 = 45 commercial intersections = 180.
 */

const PMX = require("./odg-primitive-metier-matrix.js");

// RECONCILED from docs/odg/V151_CONSOLIDATION.json ("5 commercial métiers (M1–M5)"). Each → a REAL existing module.
const COMMERCIAL_METIERS = Object.freeze([
  { id: "M1", name: "CRA / SBOM remediation", module: "cra-remediation-engine.ts", mission: "cyber-resilience-act readiness + SBOM remediation planning", canonicalSource: "V151_CONSOLIDATION.json (M1-CRA-SBOM)" },
  { id: "M2", name: "BTP / TP document intelligence", module: "document-intelligence.ts", mission: "construction/public-works DCE/CCAP/CCTP document analysis", canonicalSource: "V151_CONSOLIDATION.json (M2-BTP-TP)" },
  { id: "M3", name: "FinOps", module: "finops-analyzer.ts", mission: "cost/savings analysis (estimated≠realized)", canonicalSource: "V151_CONSOLIDATION.json (M3-FINOPS)" },
  { id: "M4", name: "Data engineering", module: "data-connector.ts", mission: "governed CSV/JSON data ingestion + quality", canonicalSource: "V151_CONSOLIDATION.json (M4-DATA-ENGINEERING)" },
  { id: "M5", name: "Accessibility", module: "accessibility-applicability.ts", mission: "EAA accessibility applicability + checks", canonicalSource: "V151_CONSOLIDATION.json (M5-ACCESSIBILITY)" },
]);

// honesty ladder specific to this complement (directive §5): a métier being defined/studied is NOT operational/authorized.
const METIER_LEVELS = Object.freeze(["DEFINED", "STUDIED", "CAPABILITY_TESTED", "OPERATIONAL", "COMMERCIALLY_AUTHORIZED"]);

// 9×5 commercial overrides (default REUSE). Key `${PRIM}:${Mx}`. Grounded in the commercial modules' real scope.
const COMM_OVERRIDES = Object.freeze({
  "POLICY:M1": { cls: "IMPROVE", ref: "cra-remediation-engine.ts + odg-owasp-agentic-matrix.ts", basis: "CRA control mapping improves common POLICY" },
  "CONTRACT:M1": { cls: "OWNER_GATED", ref: "CRA conformity (external body)", basis: "regulatory CRA conformity is owner/external-gated" },
  "EVIDENCE:M2": { cls: "IMPROVE", ref: "document-intelligence.ts + evidence-provenance.ts", basis: "page/section provenance for BTP documents" },
  "EXECUTOR:M2": { cls: "IMPROVE", ref: "document-intelligence.ts", basis: "DCE/CCAP/CCTP extraction extends common EXECUTOR (BTP DCE analyzer = known BUILD candidate, not built)" },
  "EXECUTOR:M3": { cls: "OWNER_GATED", ref: "finops-analyzer.ts + payments.ts", basis: "payment/decaissement execution OWNER_GATED; needs CONFIRMED transaction" },
  "EVIDENCE:M3": { cls: "IMPROVE", ref: "finops-analyzer.ts + chantier-profitability.ts", basis: "exact-money invariants improve common EVIDENCE for FinOps" },
  "POLICY:M4": { cls: "BUILD_CONDITIONAL", ref: "data-connector.ts — data-layer tenancy NOT present", basis: "data-layer multi-tenancy absence demonstrated; NOT built here" },
});

function commercialCell(prim: string, m: any): any {
  const o = (COMM_OVERRIDES as any)[`${prim}:${m.id}`];
  if (o) return Object.freeze({ primitive: prim, metier: m.id, metierName: m.name, category: "COMMERCIAL", classification: o.cls, ref: o.ref, basis: o.basis });
  return Object.freeze({ primitive: prim, metier: m.id, metierName: m.name, category: "COMMERCIAL", classification: "REUSE", ref: (PMX.PRIMITIVE_REF as any)[prim], basis: "primitive implemented once and reused by this commercial métier (anti-duplication)" });
}

/* reconciliation — the explicit 15 + 5 = 20 reconciliation with canonical references; nothing invented or unreconciled. */
function reconciliation(): any {
  return Object.freeze({
    principalCount: 15, commercialCount: COMMERCIAL_METIERS.length, total: 15 + COMMERCIAL_METIERS.length,
    commercial: COMMERCIAL_METIERS,
    notReconciled: Object.freeze([]), // all 5 found in V151 + map to real modules
    note: "20 métiers = 15 principal (P1..P15, planner roster) + 5 commercial (M1..M5, V151 dossier). All reconciled to real modules; none invented; commercial métiers are NOT new primitives and NOT a second métier architecture.",
  });
}

/* useMatrix20 — the full 9×20 = 180 matrix: reuses the 135 (9×15) from odg-primitive-metier-matrix and ADDS 9×5 = 45. */
function useMatrix20(): any {
  const base = PMX.matrix(); // 135 principal cells (category omitted ⇒ PRINCIPAL)
  const principal = base.cells.map((c: any) => Object.freeze({ ...c, category: "PRINCIPAL" }));
  const commercial: any[] = [];
  for (const prim of PMX.PRIMITIVES) for (const m of COMMERCIAL_METIERS) commercial.push(commercialCell(prim, m));
  const cells = Object.freeze([...principal, ...commercial]);
  const byClass: any = {}; for (const c of PMX.CLASS) byClass[c] = 0; for (const c of cells) byClass[c.classification] += 1;
  return Object.freeze({
    primitives: PMX.PRIMITIVES, metierCount: 20, principalIntersections: 135, commercialIntersections: 45, intersections: cells.length,
    cells, byClass: Object.freeze(byClass),
    note: "9 × 20 = 180 intersections (135 principal reused from odg-primitive-metier-matrix + 45 commercial). REUSE default; NO construction engaged (BUILD_CONDITIONAL is a label only).",
  });
}

const COMMERCIAL_METIER_MATRIX_CONTRACT = Object.freeze({
  id: "V183C-COMMERCIAL-METIER-MATRIX",
  purpose: "V183 complement — reconcile the 5 commercial métiers (M1..M5) and extend to the full 20-métier 9×20 matrix",
  invariants: Object.freeze([
    "20 métiers = 15 principal + 5 commercial; the 5 are RECONCILED from V151 (not invented)",
    "each commercial métier maps to a REAL existing module; NOT a new primitive; NOT a second métier architecture",
    "9×20 = 180 intersections; the 135 principal are REUSED from odg-primitive-metier-matrix (no duplication)",
    "NO construction engaged; payment + regulatory certification stay OWNER_GATED",
    "deterministic; read-only; distinguishes DEFINED ≠ STUDIED ≠ TESTED ≠ OPERATIONAL ≠ COMMERCIALLY_AUTHORIZED",
  ]),
});

module.exports = { COMMERCIAL_METIERS, METIER_LEVELS, reconciliation, useMatrix20, COMMERCIAL_METIER_MATRIX_CONTRACT };
export {};
