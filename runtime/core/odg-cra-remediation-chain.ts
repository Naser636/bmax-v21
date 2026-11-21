#!/usr/bin/env node
"use strict";
/*
 * V360 Chantier A — CRA AUTO-HEALING CHAIN. PURE, deterministic, PLAN-ONLY. The self-healing audit found
 * cra-remediation-engine DORMANT (no consumer). This composes the EXISTING CRA modules into the real operating chain so the
 * engine has a genuine producer AND a genuine consumer, and the Verify stage has a real execution path:
 *   DETECTION (sbom-audit-service.auditManifests over real/injected manifests) →
 *   REMEDIATION PLAN (cra-remediation-engine.buildRemediationPlan) →
 *   VERIFY (cra-remediation-engine.verifyRemediation: closure derived from a fresh BEFORE/AFTER SBOM, never a claim).
 * It creates NO second detection/remediation engine and reuses each module's own fail-closed discipline.
 *
 * SECURITY (§1): PLAN-ONLY — it applies NO fix, writes NO repo, invents NO CVE/score/fixed-version. License-policy findings
 * (no component/fix) route honestly to investigation; a finding with no component is UNVERIFIABLE at Verify (never a false
 * RESOLVED). Finding-source-agnostic: works for license findings (sbom-audit) and CVE-style findings alike.
 */

const SBOM = require("./sbom-audit-service.js");
const CRA = require("./cra-remediation-engine.js");

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

/**
 * remediationChain(input, opts?) -> { ok, stage, detection, plan, verify, note } | fail-closed error.
 *   input: { sources?:[{content,ecosystem,file}], findings?:[...], before?, after? }. opts: { name?, licenseByName? }.
 * Detection source: if `sources` given, run sbom-audit; else use caller-supplied `findings` (CVE-style). PLAN always; VERIFY
 * only when BOTH before+after SBOM states are supplied (else null — closure is never asserted without the new SBOM).
 */
function remediationChain(input: any, opts: any = {}): any {
  const i = isObj(input) ? input : {};
  const o = isObj(opts) ? opts : {};
  // DETECTION
  let findings: any[];
  let detectionSource: string;
  if (Array.isArray(i.sources) && i.sources.length > 0) {
    const audit = SBOM.auditManifests(i.sources, { name: o.name || "target", licenseByName: o.licenseByName });
    if (!audit.ok) return freeze({ ok: false, stage: "DETECTION", code: audit.code, reason: audit.reason });
    findings = arr(audit.findings); detectionSource = "sbom-audit-service";
  } else {
    findings = arr(i.findings).filter(isObj); detectionSource = "supplied-findings";
  }
  // REMEDIATION PLAN (plan-only)
  const plan = CRA.buildRemediationPlan(findings);
  if (plan.ok !== true) return freeze({ ok: false, stage: "PLAN", code: plan.code, reason: plan.detail });
  // VERIFY (only with a real before+after SBOM state)
  const verify = (isObj(i.before) && isObj(i.after)) ? CRA.verifyRemediation({ before: i.before, after: i.after, findings }) : null;
  const summary = plan.summary || {};
  return freeze({
    ok: true, stage: verify ? "DETECT_PLAN_VERIFY" : "DETECT_PLAN",
    detection: freeze({ source: detectionSource, findingCount: findings.length }),
    plan: freeze({ total: summary.total || 0, actionableVerifiedFix: summary.actionableVerifiedFix || 0, needInvestigation: summary.needInvestigation || 0, executionOrder: summary.executionOrder || freeze([]) }),
    verify: verify ? freeze({ ok: verify.ok === true, resolutions: verify.resolutions || null }) : null,
    note: "CRA auto-healing chain DETECTION→PLAN→VERIFY; PLAN-ONLY (no auto-fix, no repo write, nothing invented); Verify closure is derived from a fresh AFTER SBOM, never a claim",
  });
}

const CRA_REMEDIATION_CHAIN_CONTRACT = Object.freeze({
  id: "V360-CRA-REMEDIATION-CHAIN",
  purpose: "Chantier A — compose the EXISTING CRA modules into the real DETECTION→PLAN→VERIFY chain so cra-remediation-engine has a genuine producer+consumer and Verify a real path; closes the DORMANT gap without a second engine",
  reuses: Object.freeze(["sbom-audit-service.auditManifests (detection)", "cra-remediation-engine.buildRemediationPlan (plan) + verifyRemediation (before/after closure)"]),
  invariants: Object.freeze([
    "PLAN-ONLY: applies no fix, writes no repo, invents no CVE/score/fixed-version (each module stays fail-closed)",
    "VERIFY runs ONLY with a real before+after SBOM; closure derived from the new SBOM, never a claim; no component ⇒ UNVERIFIABLE (never false RESOLVED)",
    "finding-source-agnostic (license findings route to investigation; CVE-style findings can be actionable) — no second detection/remediation engine",
    "PURE/deterministic/frozen; detection over injected or real manifests; no network/clock",
  ]),
});

module.exports = { remediationChain, CRA_REMEDIATION_CHAIN_CONTRACT };
export {};
