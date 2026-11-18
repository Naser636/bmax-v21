#!/usr/bin/env node
"use strict";
/*
 * CTO PERMANENT ADDENDUM — PRE-DEPLOYMENT GLOBAL QUALIFICATION (GO / NO-GO). PURE, READ-ONLY, deny-by-default.
 *
 * Standing obligation: NO ODG VPS deployment may be authorized on green CI / passing unit tests alone. Before any
 * deployment, a full qualification campaign must run the 12 mandated controls, each with an EXPLICIT status
 * (PASS | FAIL | BLOCKED | NOT_MEASURED | NOT_APPLICABLE) + evidence + reference, and produce a GO/NO-GO report.
 *
 * This is a VIEW over existing canonical mechanisms — it COMPOSES odg-production-gate-matrix (V205) and consumes
 * caller-supplied evidence facts. It builds NOTHING, deploys NOTHING, certifies NOTHING, changes NO status, and is
 * NOT a new governance chain / primitive / service. Deny-by-default: a control with no evidence is NOT_MEASURED and a
 * CRITICAL NOT_MEASURED/FAIL/BLOCKED forces NO_GO. GO is never reachable by omission; the OWNER keeps the final call.
 *
 * Honesty: compilation ≠ global function; unit tests ≠ real integration; simulation ≠ real execution; present ≠
 * operational. None of those equivalences is ever made here.
 */

const PGM = require("./odg-production-gate-matrix.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

const STATUS = Object.freeze(["PASS", "FAIL", "BLOCKED", "NOT_MEASURED", "NOT_APPLICABLE"]);

// The 12 mandated controls (addendum §1–§12). `critical` ⇒ must be PASS/NOT_APPLICABLE for GO.
const CONTROLS = Object.freeze([
  Object.freeze({ id: "C1_BUILD_TYPES", critical: true, title: "full compile, types, imports/exports, dependencies, build" }),
  Object.freeze({ id: "C2_TEST_SUITES", critical: true, title: "unit + integration + contract + E2E + regression suites" }),
  Object.freeze({ id: "C3_PRIMITIVES_COHERENCE", critical: true, title: "9 primitives ↔ contracts ↔ components ↔ interfaces coherence" }),
  Object.freeze({ id: "C4_REAL_WIRING", critical: true, title: "real wiring: scheduler/resolver/executor/allocator/capability-map/router/registry/memory" }),
  Object.freeze({ id: "C5_DORMANT_INVENTORY", critical: false, title: "identify unwired/dormant/simulated/incomplete/not-measured modules" }),
  Object.freeze({ id: "C6_SECURITY_ISOLATION", critical: true, title: "security, permissions, Truth Lock, deny-by-default, isolation" }),
  Object.freeze({ id: "C7_DATA_RECOVERY", critical: true, title: "data, migrations, persistence, backups, recovery" }),
  Object.freeze({ id: "C8_PERF_FAULT", critical: true, title: "performance, resources, quotas, timeouts, behaviour under fault" }),
  Object.freeze({ id: "C9_ARTIFACT_VPS_COMPAT", critical: true, title: "artifact ↔ VPS runtime + dependencies compatibility" }),
  Object.freeze({ id: "C10_INDEPENDENT_INSPECTION", critical: true, title: "independent inspection + residual-defect analysis" }),
  Object.freeze({ id: "C11_ARTIFACT_IDENTITY", critical: true, title: "artifact reproducibility + exact identity by commit + digest" }),
  Object.freeze({ id: "C12_BACKUP_BLUEGREEN_ROLLBACK", critical: true, title: "restorable backup, Blue/Green, health-checks, rollback" }),
]);
const CONTROL_IDS = Object.freeze(CONTROLS.map((c) => c.id));

function normStatus(s: any): string { return STATUS.includes(s) ? s : "NOT_MEASURED"; }

/**
 * qualify(facts) -> the full GO/NO-GO qualification matrix. facts (all optional; absent ⇒ deny-by-default):
 *   { controls: { <CONTROL_ID>: { status, evidence?, reference?, remainingAction? } }, gates: <productionGateMatrix facts> }
 * Composes odg-production-gate-matrix as the deploy-gate evidence. Deterministic; never GO by omission.
 */
function qualify(facts: any): any {
  const f = isObj(facts) ? facts : {};
  const given = isObj(f.controls) ? f.controls : {};
  const matrix = PGM.productionGateMatrix(isObj(f.gates) ? f.gates : {});   // compose the existing gate matrix (read-only)

  const controls = CONTROLS.map((c) => {
    const g = isObj(given[c.id]) ? given[c.id] : {};
    const status = normStatus(g.status);
    return Object.freeze({
      id: c.id, title: c.title, critical: c.critical, status,
      evidence: typeof g.evidence === "string" ? g.evidence : null,
      reference: typeof g.reference === "string" ? g.reference : null,
      remainingAction: typeof g.remainingAction === "string" ? g.remainingAction : (status === "PASS" || status === "NOT_APPLICABLE" ? null : "provide reproducible evidence to resolve this control"),
    });
  });

  const byStatus: any = {}; for (const c of controls) byStatus[c.status] = (byStatus[c.status] || 0) + 1;
  const anyFail = controls.some((c: any) => c.status === "FAIL");
  const criticalUnmet = controls.filter((c: any) => c.critical && !(c.status === "PASS" || c.status === "NOT_APPLICABLE"));
  // GO only if NO control FAILs and EVERY critical control is PASS/NOT_APPLICABLE AND the production gate matrix is
  // production-ready. Deny-by-default ⇒ NO_GO. The owner still must explicitly authorize (GO is necessary, not sufficient).
  const verdict = (!anyFail && criticalUnmet.length === 0 && matrix.productionReady === true) ? "GO" : "NO_GO";
  const blockers = controls.filter((c: any) => c.status === "FAIL" || c.status === "BLOCKED" || (c.critical && c.status === "NOT_MEASURED"))
    .map((c: any) => Object.freeze({ id: c.id, status: c.status, remainingAction: c.remainingAction }));

  return Object.freeze({
    verdict,
    controlsSatisfied: !anyFail && criticalUnmet.length === 0,   // the 12-control side alone (every critical PASS/NA, no FAIL)
    gatesProductionReady: matrix.productionReady === true,       // the composed V205 production-gate-matrix side
    controls: Object.freeze(controls),
    byStatus: Object.freeze(byStatus),
    productionGateMatrix: Object.freeze({ productionReady: matrix.productionReady, headline: matrix.headline, ownerGatedActions: matrix.ownerGatedActions }),
    blockers: Object.freeze(blockers),
    ownerDecisionRequired: true,   // the owner ALWAYS retains the final GO decision + authorizes sensitive VPS ops
    headline: verdict === "GO"
      ? `GO (all 12 controls satisfied + production gates READY) — owner authorization still REQUIRED for any sensitive VPS operation`
      : `NO_GO — ${blockers.length} blocker(s): ${criticalUnmet.length} critical control(s) unmet${anyFail ? ", " + byStatus.FAIL + " FAIL" : ""}${matrix.productionReady ? "" : ", production gates NOT READY"}`,
    honesty: "read-only; composes odg-production-gate-matrix + supplied evidence; deploys/certifies nothing; green CI / unit tests ≠ GO; GO never by omission; owner keeps the final decision.",
  });
}

const DEPLOYMENT_QUALIFICATION_CONTRACT = Object.freeze({
  id: "ODG-PRE-DEPLOYMENT-QUALIFICATION",
  source: "CTO permanent addendum — global qualification before any ODG deployment (GO/NO-GO)",
  controlIds: CONTROL_IDS, statuses: STATUS,
  reuses: Object.freeze(["odg-production-gate-matrix (V205, composed)", "caller-supplied reproducible evidence per control"]),
  notAuthority: "a read-only pre-deployment qualification VIEW; builds/deploys/certifies nothing; changes no status; not a new primitive/service/governance chain",
  invariants: Object.freeze([
    "12 mandated controls, each an EXPLICIT status (PASS/FAIL/BLOCKED/NOT_MEASURED/NOT_APPLICABLE) + evidence + reference",
    "deny-by-default: a control with no evidence is NOT_MEASURED; a CRITICAL NOT_MEASURED/FAIL/BLOCKED forces NO_GO",
    "GO is NEVER reachable by omission and requires the production-gate-matrix to be production-ready",
    "green CI / passing unit tests ALONE never yield GO; compilation ≠ global function; unit tests ≠ integration; simulation ≠ execution; present ≠ operational",
    "the OWNER always retains the final GO decision and must explicitly authorize sensitive VPS operations; permanent obligation for EVERY future release",
    "composes EXISTING mechanisms — no 10th primitive, no parallel governance chain; deterministic + read-only",
  ]),
});

module.exports = { qualify, CONTROLS, CONTROL_IDS, STATUS, DEPLOYMENT_QUALIFICATION_CONTRACT };
export {};
