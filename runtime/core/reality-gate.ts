#!/usr/bin/env node
"use strict";

/*
 * ODG5 REALITY GATE — executable enforcement of the PERMANENT REALITY PROOF RULE (CTO amendment 2026-10-25;
 * canonical record: ODG_AUTONOMOUS_WORK_PROTOCOL.json -> reality_proof_rule). TypeScript port (strict) of
 * docs/odg-operational/shared-core/reality-gate.mjs. Pure, deterministic, DENY-BY-DEFAULT.
 *
 * No claim of implementation / verification / deployment / readiness / completion may be granted on a plan,
 * report, generated file, mocked test, exit code or prior claim alone. Each verification STATE needs evidence
 * from the actual system in which the claim applies. States are a strict ladder; a lower rung NEVER implies a
 * higher one. Deployment/runtime rungs apply only to tasks whose acceptance requires deployment.
 */

export const STATES = ["NOT_VERIFIED", "SOURCE_VERIFIED", "TEST_VERIFIED", "INTEGRATION_VERIFIED", "DEPLOYMENT_VERIFIED", "RUNTIME_VERIFIED", "ACCEPTANCE_VERIFIED"] as const;
export type VState = typeof STATES[number];
const RANK: Record<string, number> = Object.fromEntries(STATES.map((s, i) => [s, i]));

export interface Evidence {
  sourceInspected?: boolean; files?: unknown[];
  reportOnly?: boolean; testRun?: boolean; skipped?: boolean; dependencyFailed?: boolean; mockBypass?: boolean; exitCode?: number;
  integrationRun?: boolean; integrationExitCode?: number;
  requiresDeployment?: boolean; deployRecord?: unknown; deployedVersion?: string | null; intendedVersion?: string | null;
  serviceHealthy?: boolean; smokeTestPassed?: boolean;
  acceptanceCriteria?: Array<{ id?: string; name?: string; met?: boolean }>; independentChecksPassed?: boolean; negativeTestsPassed?: boolean;
  contradiction?: boolean; evidenceInaccessible?: boolean;
}
interface Check { ok: boolean; reason?: string; }

const CHECKS: Record<string, (e: Evidence) => Check> = {
  SOURCE_VERIFIED: (e) => e.sourceInspected === true && !!(e.files && e.files.length)
    ? { ok: true } : { ok: false, reason: "need sourceInspected=true + non-empty files[] (actual repo contents inspected)" },
  TEST_VERIFIED: (e) => {
    if (e.reportOnly === true || e.testRun !== true) return { ok: false, reason: "a report/claim is not a test — need testRun=true with recorded results" };
    if (e.skipped === true) return { ok: false, reason: "tests were SKIPPED — cannot be PASS" };
    if (e.dependencyFailed === true) return { ok: false, reason: "a dependency failed — test result not trustworthy" };
    if (e.mockBypass === true) return { ok: false, reason: "mocked in a way that bypasses the claimed behavior" };
    if (e.exitCode !== 0) return { ok: false, reason: `test exitCode=${e.exitCode} (non-zero)` };
    return { ok: true };
  },
  INTEGRATION_VERIFIED: (e) => e.integrationRun === true && e.integrationExitCode === 0
    ? { ok: true } : { ok: false, reason: "need integrationRun=true + integrationExitCode=0 against real components" },
  DEPLOYMENT_VERIFIED: (e) => {
    if (!e.deployRecord) return { ok: false, reason: "no deployment record — local success is NOT deployment" };
    if (e.deployedVersion == null || e.intendedVersion == null) return { ok: false, reason: "missing deployedVersion/intendedVersion" };
    if (e.deployedVersion !== e.intendedVersion) return { ok: false, reason: `version mismatch: deployed ${e.deployedVersion} != intended ${e.intendedVersion}` };
    return { ok: true };
  },
  RUNTIME_VERIFIED: (e) => {
    if (e.serviceHealthy !== true) return { ok: false, reason: "service health not confirmed on the target" };
    if (e.smokeTestPassed !== true) return { ok: false, reason: "deployment is not runtime behavior — need a passing smoke test against the deployed version" };
    return { ok: true };
  },
  ACCEPTANCE_VERIFIED: (e) => {
    if (!Array.isArray(e.acceptanceCriteria) || e.acceptanceCriteria.length === 0) return { ok: false, reason: "no acceptance criteria defined" };
    const unmet = e.acceptanceCriteria.filter((c) => c.met !== true).map((c) => c.id || c.name);
    if (unmet.length) return { ok: false, reason: `acceptance criteria unmet: ${unmet.join(", ")}` };
    if (e.independentChecksPassed !== true) return { ok: false, reason: "independent checks not passed" };
    if (e.negativeTestsPassed !== true) return { ok: false, reason: "negative tests not passed" };
    return { ok: true };
  },
};

const DEPLOY_STATES = new Set<string>(["DEPLOYMENT_VERIFIED", "RUNTIME_VERIFIED"]);
function applicableRungs(requestedState: string, requiresDeployment: boolean): string[] {
  const needDeploy = requiresDeployment || DEPLOY_STATES.has(requestedState);
  const rungs: string[] = [];
  for (let i = 1; i <= RANK[requestedState]; i++) {
    const st = STATES[i];
    if (DEPLOY_STATES.has(st) && !needDeploy) continue;
    rungs.push(st);
  }
  return rungs;
}

export interface GateResult { granted: boolean; awarded: string; requested: string; reasons: string[]; blocked: boolean; }

export function gate(requestedState: string, evidence: Evidence = {}): GateResult {
  if (RANK[requestedState] === undefined) return { granted: false, awarded: "NOT_VERIFIED", requested: requestedState, reasons: [`unknown state "${requestedState}"`], blocked: true };
  if (evidence.contradiction === true || evidence.evidenceInaccessible === true) {
    return { granted: false, awarded: "BLOCKED", requested: requestedState, reasons: ["evidence missing/inaccessible/contradictory → BLOCKED"], blocked: true };
  }
  const reasons: string[] = []; let lastOk = "NOT_VERIFIED";
  for (const st of applicableRungs(requestedState, evidence.requiresDeployment === true)) {
    const r = CHECKS[st](evidence);
    if (!r.ok) { reasons.push(`${st}: ${r.reason}`); return { granted: false, awarded: lastOk, requested: requestedState, reasons, blocked: false }; }
    lastOk = st;
  }
  return { granted: true, awarded: requestedState, requested: requestedState, reasons: ["all required rungs evidenced"], blocked: false };
}

export function assertComplete(evidence: Evidence = {}): { complete: boolean; awarded: string; reasons: string[]; blocked: boolean } {
  const g = gate("ACCEPTANCE_VERIFIED", evidence);
  return { complete: g.granted, awarded: g.awarded, reasons: g.reasons, blocked: g.blocked };
}

export function classify(evidence: Evidence = {}): { state: string; reasons: string[] } {
  if (evidence.contradiction === true || evidence.evidenceInaccessible === true) return { state: "BLOCKED", reasons: ["evidence missing/inaccessible/contradictory"] };
  for (let i = STATES.length - 1; i >= 1; i--) {
    const g = gate(STATES[i], evidence);
    if (g.granted) return { state: STATES[i], reasons: g.reasons };
  }
  return { state: "NOT_VERIFIED", reasons: ["no verification state evidenced"] };
}
