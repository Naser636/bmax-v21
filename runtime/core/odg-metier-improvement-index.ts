#!/usr/bin/env node
"use strict";
/*
 * V208 (post-V207 audit) — MÉTIER IMPROVEMENT-CAPABILITY INTEGRATION INDEX. PURE, deterministic, READ-ONLY.
 *
 * The V207 audit found the 16 improvement modules BUILT + TESTED but with ZERO consumers (orphaned — present/mature but
 * not INTEGRATED, the §2 distinction). This index resolves that: it INTEGRATES all 16 by importing each, verifying it
 * loads and exposes its frozen IMP-* contract, grouping them per-métier, and composing the self-reconciling
 * blocked-contracts-register. It is NOT a new governance matrix / registry — it is the missing consumer that makes the
 * 16 improvement capabilities discoverable to the governance layer. It executes none of them against real data (each
 * stays an on-demand capability); it only confirms they are loadable + contract-bearing + mapped to their métier.
 */

const REG = require("./odg-blocked-contracts-register.js");

// the 16 V207 improvement modules (write-set .ts without the .test). require(.js) under tsx resolves the sibling.
const MODULES = Object.freeze([
  "odg-dora-metrics-view", "odg-slo-error-budget-view", "odg-finops-kpis", "odg-ssdf-slsa-crosswalk",
  "odg-cncf-platform-maturity", "odg-cra-deadline-tracker", "odg-api-security-posture", "odg-doc-confidence-calibration",
  "odg-eval-heldout-calibration", "odg-ai-serving-reference", "odg-streaming-reference", "odg-saga-idempotency-reference",
  "odg-devex-goldenpath", "odg-finops-unit-economics", "odg-data-contract-quality", "odg-wcag-accessibility-evidence",
]);

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

function findContract(mod: any): any {
  for (const v of Object.values(mod || {})) if (isObj(v) && typeof (v as any).id === "string" && (v as any).id.startsWith("IMP-") && Array.isArray((v as any).invariants)) return v;
  return null;
}

/* integrate() -> per-module integration record + per-métier grouping + register reconciliation. Deterministic. */
function integrate(): any {
  const records = MODULES.map((name: string) => {
    let mod: any = null, contract: any = null, loadError: string | null = null;
    try { mod = require("./" + name + ".js"); contract = findContract(mod); } catch (e: any) { loadError = (e && e.message) || "load error"; }
    const id = contract ? contract.id : null;
    const metier = id ? (id.split("-")[1] || null) : null;
    const exportedFns = mod ? Object.keys(mod).filter((k) => typeof mod[k] === "function") : [];
    return Object.freeze({
      module: name, contractId: id, metier,
      loadable: mod !== null && loadError === null,
      contractBearing: contract !== null && Object.isFrozen(contract),
      callableExports: exportedFns.length,          // at least one callable capability function
      guard: contract && contract.invariants.length ? contract.invariants[0] : null,
      loadError,
    });
  });

  const byMetier: any = {};
  for (const r of records) if (r.metier) (byMetier[r.metier] = byMetier[r.metier] || []).push(r.contractId);

  const reg = REG.consolidate({});
  const integrated = records.filter((r: any) => r.loadable && r.contractBearing && r.callableExports >= 1).length;

  return Object.freeze({
    total: MODULES.length, integrated,
    records: Object.freeze(records),
    byMetier: Object.freeze(byMetier),
    registerReconciliation: Object.freeze({ built: reg.summary.built, remaining: reg.summary.remaining }),
    allIntegrated: integrated === MODULES.length,
    note: "integration index: the 16 V207 improvement modules now have a consumer (this index) — each is loadable, exposes its frozen IMP-* contract, and is mapped to its métier. On-demand capabilities are NOT executed against real data here.",
  });
}

const METIER_IMPROVEMENT_INDEX_CONTRACT = Object.freeze({
  id: "V208-METIER-IMPROVEMENT-INDEX",
  purpose: "integrate the 16 V207 improvement capabilities into a governance-discoverable per-métier index (resolves orphan/0-consumer gap)",
  invariants: Object.freeze([
    "imports all 16 V207 modules; each must be loadable + expose a frozen IMP-* contract + ≥1 callable export",
    "NOT a new governance matrix/registry — the missing CONSUMER that makes the 16 capabilities discoverable",
    "composes the self-reconciling blocked-contracts-register (built/remaining); executes no capability against real data",
    "deterministic; read-only; no new engine/primitive",
  ]),
});

module.exports = { MODULES, integrate, METIER_IMPROVEMENT_INDEX_CONTRACT };
export {};
