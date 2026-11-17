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

// V254 §2 — static pre-flight DAG validation (duplicate ids / dangling deps / cycles).
{
  const valid = P15.validateProcess(P15.PROCESS);
  check(valid.valid === true && valid.runnable === true && valid.stepCount === 4 && valid.roots.indexOf("build") >= 0 && valid.violations.length === 0, "validate: the canonical PROCESS is a valid DAG (4 steps, root 'build', runnable)");
  const cyclic = P15.validateProcess({ steps: [{ id: "a", deps: ["b"] }, { id: "b", deps: ["a"] }] });
  check(cyclic.valid === false && cyclic.runnable === false && cyclic.violations.some((v: any) => v.code === "CYCLE"), "validate: a->b->a cycle ⇒ CYCLE, NOT runnable (fail-closed before execution)");
  const dangling = P15.validateProcess({ steps: [{ id: "x", deps: ["ghost"] }] });
  check(dangling.valid === false && dangling.violations.some((v: any) => v.code === "DANGLING_DEP"), "validate: dep on non-existent step ⇒ DANGLING_DEP");
  const dup = P15.validateProcess({ steps: [{ id: "a", deps: [] }, { id: "a", deps: [] }] });
  check(dup.violations.some((v: any) => v.code === "DUPLICATE_STEP"), "validate: duplicate step id ⇒ DUPLICATE_STEP");
  const diamond = P15.validateProcess({ steps: [{ id: "r", deps: [] }, { id: "a", deps: ["r"] }, { id: "b", deps: ["r"] }, { id: "c", deps: ["a", "b"] }] });
  check(diamond.valid === true, "validate: a diamond DAG (r→a, r→b, a+b→c) is valid (NOT a false cycle)");
  const empty = P15.validateProcess({ steps: [] });
  check(empty.valid === false && empty.violations.some((v: any) => v.code === "EMPTY_PROCESS"), "validate fail-closed: empty process ⇒ EMPTY_PROCESS, not runnable");
  check(JSON.stringify(P15.validateProcess(P15.PROCESS)) === JSON.stringify(valid) && Object.isFrozen(valid), "validate deterministic + frozen");
  const integ = P15.runReferenceProject({ validateProcess: { steps: [{ id: "a", deps: ["b"] }, { id: "b", deps: ["a"] }] } });
  check(integ.validation && integ.validation.valid === false && integ.degraded === true, "integration: a cyclic provided process ⇒ degraded");
}

console.log(failures === 0 ? "ALL PASS — V12.4 §43 P15 WORKFLOW REFERENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
