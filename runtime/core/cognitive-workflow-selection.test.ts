#!/usr/bin/env node
"use strict";
const assert = require("assert");
const W = require("./cognitive-workflow-selection");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
const gap = (id: string) => [{ id, need: true, declared: true, implemented: false }];
console.log("WI-A2-33 — COGNITIVE WORKFLOW SELECTION (P15)");

// authorised ⇒ P15 runs the selected workflow to COMPLETED
{
  const r = W.runCognitiveWorkflow({ situation: { inventory: gap("capX") } });
  check(r.selected === true && r.workflow === "wf-capX" && r.workflowStatus === "COMPLETED" && r.executed === true, "authorised ⇒ default workflow runs to COMPLETED");
}
// POLICY refusal ⇒ no workflow
check(W.runCognitiveWorkflow({ situation: { inventory: gap("capX") }, policy: { denyList: ["capX"] } }).selected === false, "POLICY deny ⇒ no workflow");
// contamination ⇒ no workflow
check(W.runCognitiveWorkflow({ situation: { inventory: gap("capX"), evaluation: { contamination: { benchmarkDigests: ["h"], seenDigests: ["h"] } } } }).status === "REFUSED_INTEGRITY", "contamination ⇒ REFUSED_INTEGRITY, no workflow");
// unmet dependency ⇒ no workflow
check(W.runCognitiveWorkflow({ situation: { inventory: [{ id: "capE", deps: ["ghost"] }] } }).selected === false, "unmet dependency ⇒ no workflow");
// suspect ⇒ approval-gated workflow (pending without approval, completes with it)
{
  const sit = { inventory: gap("capX"), evaluation: { gaming: { metric: { before: 0.6, after: 0.9 }, independentCheck: { before: 0.6, after: 0.6 } } } };
  check(W.runCognitiveWorkflow({ situation: sit }).workflowStatus === "PENDING_APPROVAL", "suspect ⇒ approval-gated workflow pending");
  check(W.runCognitiveWorkflow({ situation: sit, ctx: { approvals: { verify: true } } }).workflowStatus === "COMPLETED", "suspect + approval granted ⇒ COMPLETED");
}
// custom workflow registry for the objective kind is used
{
  const custom = { id: "custom-gap", steps: [{ id: "s1" }] };
  check(W.runCognitiveWorkflow({ situation: { inventory: gap("capX") }, workflows: { gap: custom } }).workflow === "custom-gap", "registry workflow for kind 'gap' is used");
}
// determinism of the governed outcome
{
  const a = W.runCognitiveWorkflow({ situation: { inventory: gap("capX") } });
  const b = W.runCognitiveWorkflow({ situation: { inventory: gap("capX") } });
  check(JSON.stringify({ w: a.workflow, s: a.workflowStatus, e: a.executed }) === JSON.stringify({ w: b.workflow, s: b.workflowStatus, e: b.executed }), "deterministic governed outcome");
}
console.log(failures === 0 ? "ALL PASS — WI-A2-33 COGNITIVE WORKFLOW SELECTION" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
