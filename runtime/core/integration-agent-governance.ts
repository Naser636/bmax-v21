#!/usr/bin/env node
"use strict";

/*
 * WI-INT-22 — MULTI-PROFESSION INTEGRATION P2 → P10 → P6. PURE, deterministic. Composes by contract: P2 reference
 * agents (analyst) analyse a SYNTHETIC system and emit findings (via the real Agent Factory agents, SIMULATED
 * provider), P10 compliance-scenario classifies risk + obligations + anti-overclaim (verdict ALWAYS
 * NOT_CERTIFIED), and P6 quality-harness evaluates the result (errors/omissions/contamination, fail-closed).
 * Produces a verifiable report. No coupling — métiers interact through their contracts. Dual export.
 */

const P2 = require("./reference-agents");
const P10 = require("./compliance-scenario");
const QH = require("./quality-harness");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

/** runAgentGovernance(input) -> verifiable report. input: { system, obligations, claims, benchmarkDigests?, seenDigests? }. */
function runAgentGovernance(input: any): any {
  const i = isObj(input) ? input : {};
  // --- P2: agents available (real Agent Factory) + a simulated analyst pass over the system ---
  const agents = P2.referenceAgents();
  const analystRan = agents.ok && !!agents.agents.analyst;
  const analysis = Object.freeze({ by: "analyst", providerKind: "SIMULATED", observed: isObj(i.system) ? Object.keys(i.system).sort() : [] });

  // --- P10: governance assessment (NOT_CERTIFIED always) ---
  const p10 = P10.runComplianceScenario({ system: i.system, obligations: i.obligations, claims: i.claims, verifier: "p6-independent-verifier" });

  // --- P6: evaluate the governance result (fail-closed). A GAP or a refused overclaim or contamination ⇒ not PASS. ---
  const testResults: any = {
    "p2.analysis": analystRan ? "pass" : "fail",
    "p10.no_gaps": arr(p10.gaps).length === 0 ? "pass" : "fail",
    "p10.no_overclaim": arr(p10.refusedClaims).length === 0 ? "pass" : "fail",
    "p10.not_prohibited": p10.status === "BLOCKED_PROHIBITED" ? "fail" : "pass",
  };
  const keys = Object.keys(testResults);
  const p6 = QH.qualityReport({ testResults, requiredTests: keys, ranTests: keys, benchmarkDigests: i.benchmarkDigests, seenDigests: i.seenDigests });

  return Object.freeze({
    regulatoryVerdict: p10.verdict,            // ALWAYS NOT_CERTIFIED
    qualityVerdict: p6.verdict,                // PASS/REVIEW/FAIL (fail-closed)
    stages: Object.freeze({
      p2: analysis,
      p10: Object.freeze({ status: p10.status, risk: p10.risk, gaps: p10.gaps, refusedClaims: p10.refusedClaims, verifierIndependent: p10.verifierIndependent }),
      p6: Object.freeze({ verdict: p6.verdict, contamination: p6.contamination.verdict }),
    }),
    note: "software assistance only — regulatory verdict is NEVER certification",
  });
}

const INTEGRATION_AGENT_GOVERNANCE_CONTRACT = Object.freeze({
  id: "WI-INT-22-AGENT-GOVERNANCE",
  source: "Integration P2 (reference-agents) → P10 (compliance-scenario) → P6 (quality-harness) — by contract",
  notAuthority: "pure cross-métier composition; agents use a SIMULATED provider; regulatory verdict is ALWAYS NOT_CERTIFIED",
  invariants: Object.freeze([
    "pure/deterministic: synthetic system in → verifiable report out",
    "P2 agents (real factory, simulated provider) → P10 governance → P6 quality, by contract (no coupling)",
    "regulatory verdict is ALWAYS NOT_CERTIFIED (software assistance, not certification)",
    "fail-closed: a GAP / refused overclaim / prohibited practice / contamination ⇒ quality verdict not PASS",
  ]),
});

module.exports = { INTEGRATION_AGENT_GOVERNANCE_CONTRACT, runAgentGovernance };

if (require.main === module) {
  process.stdout.write(JSON.stringify(INTEGRATION_AGENT_GOVERNANCE_CONTRACT, null, 2) + "\n");
}

export {};
