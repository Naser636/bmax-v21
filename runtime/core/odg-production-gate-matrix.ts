#!/usr/bin/env node
"use strict";
/*
 * V205 (post-V204) §8/§10 — CONSOLIDATED PRODUCTION-GATE MATRIX. PURE, READ-ONLY reconciliation that COMPOSES the
 * EXISTING fail-closed gates into ONE view so ODG (and the owner) can see, end-to-end, which production gates are
 * satisfied vs what precise action remains. It builds NOTHING operational, deploys NOTHING, certifies NOTHING, and
 * changes NO status — like the V200 blocked-contracts register, it is a view over existing mechanisms (no new
 * primitive/engine/registry).
 *
 * Gates reconciled (each from its real module, deny-by-default):
 *   1. improvement-contracts   — odg-blocked-contracts-register (16 contracts) ⇒ BLOCKED_AWAITING_ISOLATION
 *   2. sandbox-certification   — V198 patch PREPARED+VALIDATED (12/12), host launcher UNMODIFIED ⇒ OWNER_GATED
 *   3. deploy-package          — deploy-package-check.checkPackage ⇒ READY | NOT_READY (locally buildable)
 *   4. dashboard-exposure      — dashboard-exposure-readiness.assessExposureReadiness ⇒ NOT_READY until controls + OWNER TLS
 *   5. iso-certification       — certification-readiness.assessCertificationReadiness ⇒ NOT_READY until operational evidence
 *
 * Honesty ladder preserved: DOCUMENTED ≠ BUILT ≠ TESTED ≠ ACCEPTED ≠ OPERATIONAL ≠ DEPLOYED. Deterministic given facts.
 */

const REG = require("./odg-blocked-contracts-register.js");
const DPC = require("./deploy-package-check.js");
const DER = require("./dashboard-exposure-readiness.js");
const CR = require("./certification-readiness.js");
const C6_INGEST = require("./odg-c6-certification-ingest.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/* productionGateMatrix(facts) -> consolidated gate matrix. facts (all optional; absent ⇒ fail-closed):
 *   { fileExists, deployPackage:{root,readFile}, exposure:{...controls}, certification:{gatedSuites,evidence,dossier,now}, now } */
function productionGateMatrix(facts: any): any {
  const f = isObj(facts) ? facts : {};

  // 1. improvement contracts (16) — BLOCKED_AWAITING_ISOLATION
  const reg = REG.consolidate({ fileExists: f.fileExists });
  const contractsGate = Object.freeze({
    id: "improvement-contracts", status: "BLOCKED_AWAITING_ISOLATION", scope: "local",
    detail: `${reg.summary.total} contracts (disjoint, unbuilt)`,
    remainingAction: "owner-activate a validated isolated session ⇒ then build the 16 contracts under V188 delegation",
    ownerGated: true,
  });

  // 2. sandbox certification — EVIDENCE-DRIVEN, deny-by-default. Reads the committed in-session C6 evidence
  //    (docs/odg/c6-certification-evidence.json, captured by the real isolated bwrap child) and runs the
  //    canonical ingest (odg-c6-certification-ingest). READY only when the ingest certifies (all 8 canonical
  //    tests pass WITH evidence AND all 4 isolation markers hold); absent/unreadable/incomplete ⇒ OWNER_GATED.
  //    This reads the evidence via the injected f.readFile (like the other gates inject their inputs) so the
  //    module stays pure and testable; with no readFile the gate fails closed to OWNER_GATED.
  const c6 = (() => {
    try {
      const raw = typeof f.readFile === "function" ? f.readFile("docs/odg/c6-certification-evidence.json") : null;
      if (typeof raw !== "string" || !raw.trim()) return null;
      const parsed = JSON.parse(raw);
      const results = isObj(parsed) && isObj(parsed.results) ? parsed.results : parsed;
      return C6_INGEST.ingestCertification(results);
    } catch { return null; }
  })();
  const sandboxCertified = !!(c6 && c6.certified === true);
  const sandboxGate = Object.freeze({
    id: "sandbox-certification", status: sandboxCertified ? "READY" : "OWNER_GATED", scope: "owner",
    detail: sandboxCertified
      ? `C6 CERTIFIED from real in-session evidence: all ${c6.totalCanonical} canonical tests passed with evidence AND all isolation markers hold (ingested, not asserted)`
      : "no certified in-session C6 evidence ingested (deny-by-default); the 8 in-session certification tests must pass in the real isolated session",
    remainingAction: sandboxCertified
      ? "certified — sandbox isolation proven in a real isolated session (actual deploy remains separately OWNER_GATED)"
      : "owner: run the 8 in-session certification tests in the real isolated session, then ingest the captured evidence",
    ownerGated: !sandboxCertified,
  });

  // 3. deploy package — structural + safety check of the prepared deploy artifacts
  const pkg = DPC.checkPackage(isObj(f.deployPackage) ? f.deployPackage : {});
  const deployGate = Object.freeze({
    id: "deploy-package", status: pkg.ok ? "READY" : "NOT_READY", scope: "local",
    detail: pkg.ok ? "all required deploy artifacts present + safe (deploys nothing)" : `missing/unsafe: ${(pkg.missing || []).concat(pkg.unsafe || []).slice(0, 4).join("; ") || "incomplete"}`,
    remainingAction: pkg.ok ? "ready — actual deploy stays OWNER_GATED (root is the single documented human action)" : "complete the deploy package artifacts (local, buildable)",
    ownerGated: false, deployedAnything: pkg.deployedAnything === true,
  });

  // 4. dashboard exposure — fail-closed until all controls + owner TLS activation
  const exp = DER.assessExposureReadiness(isObj(f.exposure) ? f.exposure : {});
  const exposureGate = Object.freeze({
    id: "dashboard-exposure", status: exp.verdict === "READY" ? "OWNER_GATED" : "NOT_READY", scope: "owner",
    detail: exp.verdict === "READY" ? "all exposure controls observed — admissible, but exposure itself is owner-executed" : `controls missing: ${(exp.missing || []).slice(0, 4).join(", ") || "unknown"}`,
    remainingAction: exp.verdict === "READY" ? "owner: execute the gated TLS/exposure activation" : "satisfy the exposure controls (templates/rollback buildable locally; activation OWNER_GATED)",
    ownerGated: true,
  });

  // 5. ISO certification readiness — operational evidence + dossier
  const cert = CR.assessCertificationReadiness(isObj(f.certification) ? f.certification : { now: f.now });
  const certGate = Object.freeze({
    id: "iso-certification", status: cert.verdict === "READY_FOR_STAGE1" ? "READY" : "NOT_READY", scope: "mixed",
    detail: cert.verdict === "READY_FOR_STAGE1" ? "operational evidence + dossier satisfied (Stage-1 readiness)" : "operational evidence/dossier incomplete",
    remainingAction: cert.verdict === "READY_FOR_STAGE1" ? "engage an external certification body (OWNER_GATED)" : "complete operational evidence (local) then external audit (OWNER_GATED)",
    ownerGated: cert.verdict !== "READY_FOR_STAGE1" ? false : true,
  });

  const gates = Object.freeze([contractsGate, sandboxGate, deployGate, exposureGate, certGate]);
  const byStatus: any = {}; for (const g of gates) byStatus[g.status] = (byStatus[g.status] || 0) + 1;
  const ownerGatedActions = gates.filter((g: any) => g.ownerGated).map((g: any) => ({ gate: g.id, action: g.remainingAction }));
  const locallyBuildable = gates.filter((g: any) => !g.ownerGated && g.status !== "READY").map((g: any) => g.id);
  const productionReady = gates.every((g: any) => g.status === "READY");

  return Object.freeze({
    gates, byStatus: Object.freeze(byStatus),
    productionReady,
    ownerGatedActions: Object.freeze(ownerGatedActions),
    locallyBuildable: Object.freeze(locallyBuildable),
    headline: productionReady ? "all production gates READY" : `NOT production-ready — ${ownerGatedActions.length} gate(s) OWNER_GATED, ${locallyBuildable.length} locally buildable`,
    honesty: "read-only reconciliation; deploys/certifies nothing, changes no status; DOCUMENTED ≠ BUILT ≠ TESTED ≠ ACCEPTED ≠ OPERATIONAL ≠ DEPLOYED.",
  });
}

const PRODUCTION_GATE_MATRIX_CONTRACT = Object.freeze({
  id: "V205-PRODUCTION-GATE-MATRIX",
  purpose: "§8/§10 — consolidate the existing fail-closed gates into one production-readiness view with exact remaining actions; invent nothing, deploy nothing",
  invariants: Object.freeze([
    "composes EXISTING gates (blocked-contracts-register / deploy-package-check / dashboard-exposure-readiness / certification-readiness) — no new primitive/engine/registry",
    "deny-by-default: absent facts ⇒ NOT_READY / OWNER_GATED / BLOCKED (never READY by omission)",
    "sandbox certification is EVIDENCE-DRIVEN via the canonical C6 ingest: READY only when all 8 in-session tests pass + all isolation markers hold; absent/incomplete/unreadable evidence ⇒ OWNER_GATED (never certified by omission)",
    "identifies every production gate + its exact remaining action (local vs OWNER_GATED); deploys/certifies nothing",
    "preserves the honesty ladder DOCUMENTED ≠ BUILT ≠ TESTED ≠ ACCEPTED ≠ OPERATIONAL ≠ DEPLOYED; deterministic; read-only",
  ]),
});

module.exports = { productionGateMatrix, PRODUCTION_GATE_MATRIX_CONTRACT };
export {};
