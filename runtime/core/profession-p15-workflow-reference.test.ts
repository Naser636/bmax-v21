#!/usr/bin/env node
"use strict";
const assert = require("assert");
const P15 = require("./profession-p15-workflow-reference");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V12.4 §43 P15 — AUTOMATION/WORKFLOW REFERENCE (E2/E3)");

// E2: approved process COMPLETES; unapproved HALTS at the gate.
{
  const r = P15.runReferenceProject({});
  check(r.synthetic === true && r.profession === "P15" && r.approvedStatus === "COMPLETED" && r.haltedAtGate === true && r.degraded === false, "E2: approved ⇒ COMPLETED, unapproved ⇒ halted at approval gate, not degraded");
}

// E3: an unapproved consequential step is HALTED, never executed (fail-closed).
{
  const r = P15.orchestrate({ approvals: {} });
  check(r.status === "PENDING_APPROVAL" && r.pending === "approve-release" && (r.completed["release"] !== true), "E3: unapproved consequential step HALTED (release NOT executed)");
}

// E3: a flaky step recovers within the retry budget.
{
  const r = P15.orchestrate({ approvals: { "approve-release": true }, inject: { test: "flaky" }, maxRetries: 1 });
  check(r.status === "COMPLETED", "E3: flaky step recovers within retry budget ⇒ COMPLETED");
}

// E3: an erroring step with no budget ⇒ FAILED.
{
  const r = P15.orchestrate({ approvals: { "approve-release": true }, inject: { build: "error" } });
  check(r.status === "FAILED" && r.pending === "build", "E3: erroring step (no budget) ⇒ FAILED");
}

check(P15.P15_WORKFLOW_REFERENCE_CONTRACT.invariants.some((i: any) => /E5.*owner-gated NOT_RUN/.test(i)), "honesty: SYNTHETIC only, E5 owner-gated NOT_RUN");

console.log(failures === 0 ? "ALL PASS — V12.4 §43 P15 WORKFLOW REFERENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
