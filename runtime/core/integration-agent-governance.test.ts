#!/usr/bin/env node
"use strict";

/*
 * WI-INT-22 — P2→P10→P6 integration. Locks: regulatory verdict ALWAYS NOT_CERTIFIED; a GAP or overclaim or
 * prohibited practice degrades the quality verdict; clean system ⇒ PASS; contamination detected; determinism. Pure.
 * Run: node_modules/.bin/tsx runtime/core/integration-agent-governance.test.ts
 */
const assert = require("assert");
const G = require("./integration-agent-governance");

let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }

console.log("WI-INT-22 — INTEGRATION P2 → P10 → P6");

// clean compliant system ⇒ NOT_CERTIFIED + quality PASS
{
  const r = G.runAgentGovernance({ system: { name: "SysA", aiRole: "limited chatbot" }, obligations: [{ id: "O1", required: true, evidenceRefs: ["e"] }], claims: ["We prepared a DPIA"] });
  check(r.regulatoryVerdict === "NOT_CERTIFIED", "regulatory verdict ALWAYS NOT_CERTIFIED");
  check(r.qualityVerdict === "PASS", "compliant system ⇒ quality PASS");
  check(r.stages.p10.verifierIndependent === true, "verifier independent");
}
// a GAP degrades quality verdict (still NOT_CERTIFIED)
{
  const r = G.runAgentGovernance({ system: { name: "SysB", aiRole: "high-risk" }, obligations: [{ id: "O1", required: true, evidenceRefs: [] }], claims: [] });
  check(r.regulatoryVerdict === "NOT_CERTIFIED" && r.qualityVerdict !== "PASS", "obligation GAP ⇒ NOT_CERTIFIED + quality not PASS");
  check(r.stages.p10.gaps.includes("O1"), "gap O1 surfaced");
}
// an overclaim degrades the verdict
{
  const r = G.runAgentGovernance({ system: { name: "SysC", aiRole: "limited" }, obligations: [{ id: "O1", required: true, evidenceRefs: ["e"] }], claims: ["SysC is ISO 27001 certified"] });
  check(r.stages.p10.refusedClaims.length === 1 && r.qualityVerdict !== "PASS", "certification overclaim refused ⇒ quality not PASS");
}
// prohibited practice ⇒ blocked + quality FAIL/REVIEW
check(G.runAgentGovernance({ system: { name: "S", aiRole: "social scoring" } }).stages.p10.status === "BLOCKED_PROHIBITED", "prohibited practice ⇒ BLOCKED_PROHIBITED");
// contamination detected via P6
{
  const r = G.runAgentGovernance({ system: { name: "S", aiRole: "limited" }, obligations: [{ id: "O1", required: true, evidenceRefs: ["e"] }], benchmarkDigests: ["h"], seenDigests: ["h"] });
  check(r.stages.p6.contamination === "DETECTED" && r.qualityVerdict === "FAIL", "benchmark contamination ⇒ quality FAIL");
}
// determinism
check(JSON.stringify(G.runAgentGovernance({ system: { name: "S", aiRole: "limited" } })) === JSON.stringify(G.runAgentGovernance({ system: { name: "S", aiRole: "limited" } })), "deterministic integration");

console.log(failures === 0 ? "ALL PASS — WI-INT-22 P2→P10→P6" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

// Module-scope marker (TS2451/TS2588 guard).
export {};
