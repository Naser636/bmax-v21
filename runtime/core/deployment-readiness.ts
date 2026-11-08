#!/usr/bin/env node
"use strict";

/*
 * P5 — DEPLOYMENT READINESS evaluator. PURE, deny-by-default. Given SUPPLIED evidence about a build/release, it
 * evaluates the local controls required BEFORE any deployment and returns READY / NOT_READY with a per-control result
 * and the exact blockers. It performs NO deployment, spawns nothing, and contacts no network — it only grades evidence
 * (reusing evidence-provenance for the integrity check). Fail-closed: a missing or unproven control is NOT_READY, never
 * silently ready. Eleven controls (mandate §7): config, reproducibility, dependencies, artifacts, tests, security,
 * observability, rollback, integrity, traceability, environment prerequisites. Dual export.
 */

const EP = require("./evidence-provenance");

const CONTROLS = Object.freeze([
  "config", "reproducibility", "dependencies", "artifacts", "tests",
  "security", "observability", "rollback", "integrity", "traceability", "envPrereqs",
]);
const STATE = Object.freeze({ READY: "READY", NOT_READY: "NOT_READY" });

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function hasAll(obj: any, required: any): boolean {
  const o = isObj(obj) ? obj : {};
  return arr(required).filter(isStr).every((k: string) => o[k] !== undefined && o[k] !== null && o[k] !== "");
}

function integrityOk(e: any): boolean {
  if (isObj(e.provenanceStamp)) { try { const v = EP.verifyProvenance(e.provenanceStamp); return !!(v && v.ok === true); } catch { return false; } }
  return e.integrity === true; // else require an explicit attested integrity flag (deny-by-default)
}

/** evaluateReadiness(evidence) -> { state, ready, checks, blockers }. PURE; performs no deployment. */
function evaluateReadiness(evidence: any): any {
  const e = isObj(evidence) ? evidence : {};
  const checks: any = {};
  checks.config = { ok: hasAll(e.config, e.requiredConfig) && arr(e.requiredConfig).length > 0, detail: "all required config keys present" };
  checks.reproducibility = { ok: isObj(e.build) && e.build.reproducible === true && e.build.lockfilePinned === true, detail: "reproducible build + pinned lockfile" };
  checks.dependencies = { ok: isObj(e.dependencies) && e.dependencies.resolved === true && arr(e.dependencies.unresolved).length === 0, detail: "all dependencies resolved" };
  checks.artifacts = { ok: arr(e.artifacts).length > 0 && arr(e.artifacts).every((a: any) => a && a.present === true && isStr(a.sha256)), detail: "artifacts present + digested" };
  checks.tests = { ok: isObj(e.tests) && e.tests.passed === true && e.tests.exitCode === 0, detail: "tests passed (exit 0)" };
  checks.security = { ok: isObj(e.security) && e.security.sbom === true && e.security.secretsScanned === true && e.security.licensesOk === true, detail: "SBOM + secrets scan + license policy" };
  checks.observability = { ok: isObj(e.observability) && e.observability.traces === true && e.observability.metrics === true && e.observability.logs === true, detail: "traces + metrics + logs wired" };
  checks.rollback = { ok: isObj(e.rollback) && e.rollback.planPresent === true && e.rollback.tested === true, detail: "rollback plan present + tested" };
  checks.integrity = { ok: integrityOk(e), detail: "provenance verified / integrity attested" };
  checks.traceability = { ok: isStr(e.sourceCommit) && arr(e.evidenceRefs).length > 0, detail: "source commit + evidence refs" };
  checks.envPrereqs = { ok: hasAll(e.env, e.requiredEnv) && arr(e.requiredEnv).length > 0, detail: "environment prerequisites present" };

  const blockers = CONTROLS.filter((c: string) => !checks[c].ok);
  const ready = blockers.length === 0;
  return Object.freeze({
    state: ready ? STATE.READY : STATE.NOT_READY,
    ready,
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
    deployed: false,
    note: "PURE readiness evaluation over supplied evidence; NO deployment performed; deny-by-default (missing/unproven control ⇒ NOT_READY)",
  });
}

const DEPLOYMENT_READINESS_CONTRACT = Object.freeze({
  id: "P5-DEPLOYMENT-READINESS",
  source: "P5 Cloud/DevOps — local deployment-readiness controls (mandate §7); no real deployment",
  controls: CONTROLS, states: Object.freeze(Object.values(STATE)),
  reuses: Object.freeze(["evidence-provenance (integrity verification)"]),
  notAuthority: "grades supplied evidence into READY/NOT_READY; deploys nothing, spawns nothing, contacts no network",
  invariants: Object.freeze([
    "pure/deterministic: evidence in → readiness verdict out; NO deployment, NO side effect",
    "deny-by-default: every one of the 11 controls must be proven; a missing/unproven control ⇒ NOT_READY",
    "integrity reuses evidence-provenance.verifyProvenance when a stamp is supplied, else requires an attested flag",
    "a readiness verdict is NOT an authorization to deploy (deployment stays owner-gated)",
  ]),
});

module.exports = { CONTROLS, STATE, DEPLOYMENT_READINESS_CONTRACT, evaluateReadiness };

if (require.main === module) { process.stdout.write(JSON.stringify(DEPLOYMENT_READINESS_CONTRACT, null, 2) + "\n"); }

export {};
