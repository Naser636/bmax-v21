#!/usr/bin/env node
"use strict";

/*
 * ODG5 REALITY GATE — production .js port (behavioural reference) paired with reality-gate.ts (dual-port discipline;
 * the pipeline spawns .js, the compiled-TS path spawns dist/core/reality-gate.js). Byte-equivalent semantics to the
 * .ts. Executable enforcement of the PERMANENT REALITY PROOF RULE (canonical record: ODG_AUTONOMOUS_WORK_PROTOCOL.json
 * -> reality_proof_rule). Pure, deterministic, DENY-BY-DEFAULT. No new primitive — a pure verification-state arbiter.
 */

const STATES = ["NOT_VERIFIED", "SOURCE_VERIFIED", "TEST_VERIFIED", "INTEGRATION_VERIFIED", "DEPLOYMENT_VERIFIED", "RUNTIME_VERIFIED", "ACCEPTANCE_VERIFIED"];
const RANK = Object.fromEntries(STATES.map((s, i) => [s, i]));

const CHECKS = {
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

const DEPLOY_STATES = new Set(["DEPLOYMENT_VERIFIED", "RUNTIME_VERIFIED"]);
function applicableRungs(requestedState, requiresDeployment) {
  const needDeploy = requiresDeployment || DEPLOY_STATES.has(requestedState);
  const rungs = [];
  for (let i = 1; i <= RANK[requestedState]; i++) {
    const st = STATES[i];
    if (DEPLOY_STATES.has(st) && !needDeploy) continue;
    rungs.push(st);
  }
  return rungs;
}

function gate(requestedState, evidence) {
  const e = evidence || {};
  if (RANK[requestedState] === undefined) return { granted: false, awarded: "NOT_VERIFIED", requested: requestedState, reasons: [`unknown state "${requestedState}"`], blocked: true };
  if (e.contradiction === true || e.evidenceInaccessible === true) {
    return { granted: false, awarded: "BLOCKED", requested: requestedState, reasons: ["evidence missing/inaccessible/contradictory → BLOCKED"], blocked: true };
  }
  const reasons = []; let lastOk = "NOT_VERIFIED";
  for (const st of applicableRungs(requestedState, e.requiresDeployment === true)) {
    const r = CHECKS[st](e);
    if (!r.ok) { reasons.push(`${st}: ${r.reason}`); return { granted: false, awarded: lastOk, requested: requestedState, reasons, blocked: false }; }
    lastOk = st;
  }
  return { granted: true, awarded: requestedState, requested: requestedState, reasons: ["all required rungs evidenced"], blocked: false };
}

function assertComplete(evidence) {
  const g = gate("ACCEPTANCE_VERIFIED", evidence || {});
  return { complete: g.granted, awarded: g.awarded, reasons: g.reasons, blocked: g.blocked };
}

function classify(evidence) {
  const e = evidence || {};
  if (e.contradiction === true || e.evidenceInaccessible === true) return { state: "BLOCKED", reasons: ["evidence missing/inaccessible/contradictory"] };
  for (let i = STATES.length - 1; i >= 1; i--) {
    const g = gate(STATES[i], e);
    if (g.granted) return { state: STATES[i], reasons: g.reasons };
  }
  return { state: "NOT_VERIFIED", reasons: ["no verification state evidenced"] };
}

module.exports = { STATES, gate, assertComplete, classify };
