#!/usr/bin/env node
"use strict";
const assert = require("assert");
const B = require("./parcours-platform-workflow-agents");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("WI-INT-26 — PARCOURS B (P14→P15→P2)");

{
  const r = B.runPlatformWorkflowAgents({ template: "library-ts", params: { name: "lib" } });
  check(r.verdict === "READY" && r.p15.status === "COMPLETED", "generate→workflow→agents ⇒ READY/COMPLETED");
  check(r.p2.agents.length === 5 && r.p2.builderVerifierIndependent === true && r.p2.providerKind === "SIMULATED", "5 agents, builder≠verifier (independent), provider SIMULATED");
  check(r.p15.evidence.length === 4, "4 steps with append-only evidence");
}
// approval gate
check(B.runPlatformWorkflowAgents({ template: "library-ts", params: { name: "lib" }, requireApproval: true }).verdict === "PENDING_APPROVAL", "qa approval required, not granted ⇒ PENDING_APPROVAL");
check(B.runPlatformWorkflowAgents({ template: "library-ts", params: { name: "lib" }, requireApproval: true, approvals: { qa: true } }).verdict === "READY", "approval granted ⇒ READY");
// workflow failure
check(B.runPlatformWorkflowAgents({ template: "library-ts", params: { name: "lib" }, inject: { build: "error" } }).verdict === "FAILED", "error at build ⇒ FAILED");
// bad template
check(B.runPlatformWorkflowAgents({ template: "nope", params: { name: "x" } }).verdict === "REJECTED", "unknown template ⇒ REJECTED at P14");
// determinism
check(JSON.stringify(B.runPlatformWorkflowAgents({ template: "cli-ts", params: { name: "t" } })) === JSON.stringify(B.runPlatformWorkflowAgents({ template: "cli-ts", params: { name: "t" } })), "deterministic parcours B");
console.log(failures === 0 ? "ALL PASS — WI-INT-26 PARCOURS B" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
