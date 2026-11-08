#!/usr/bin/env node
"use strict";
const assert = require("assert");
const W = require("./workflow-engine");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("WI-P15-28 — WORKFLOW ENGINE");

const proc = { id: "onboard", steps: [{ id: "a" }, { id: "b", deps: ["a"] }, { id: "c", deps: ["b"], approval: true }, { id: "d", deps: ["c"] }], retries: 1 };

// define validation
check(W.defineProcess(proc).ok === true, "valid process defined");
check(W.defineProcess({ id: "x", steps: [{ id: "a", deps: ["b"] }, { id: "b", deps: ["a"] }] }).ok === false, "dependency cycle ⇒ invalid (fail-closed)");

// approval gate halts
{
  const r = W.runProcess(proc, {});
  check(r.status === "PENDING_APPROVAL" && r.pending === "c" && r.completed.a && r.completed.b, "required approval not granted ⇒ PENDING_APPROVAL at c (a,b done)");
}
// approval granted ⇒ COMPLETED
{
  const r = W.runProcess(proc, { approvals: { c: true } });
  check(r.status === "COMPLETED" && r.evidence.length === 4, "approval granted ⇒ COMPLETED, 4 evidence");
}
// error ⇒ FAILED, halts
check(W.runProcess(proc, { approvals: { c: true }, inject: { b: "error" } }).status === "FAILED", "error at b ⇒ FAILED");
// timeout ⇒ ABSTAINED
check(W.runProcess(proc, { approvals: { c: true }, inject: { b: "timeout" } }).status === "ABSTAINED", "timeout at b ⇒ ABSTAINED");
// flaky with retry ⇒ DONE; flaky without retry budget ⇒ FAILED
check(W.runProcess(proc, { approvals: { c: true }, inject: { b: "flaky" } }).status === "COMPLETED", "flaky with retry budget ⇒ succeeds");
check(W.runProcess({ ...proc, retries: 0 }, { approvals: { c: true }, inject: { b: "flaky" } }).status === "FAILED", "flaky with NO retry budget ⇒ FAILED");
// resume (idempotent): completed steps skipped
{
  const r = W.runProcess(proc, { approvals: { c: true }, completed: { a: true, b: true } });
  check(r.status === "COMPLETED" && r.history.filter((h: any) => h.status === "SKIPPED_IDEMPOTENT").length === 2, "resume: a,b skipped idempotent, process completes");
}
// determinism
check(JSON.stringify(W.runProcess(proc, { approvals: { c: true } })) === JSON.stringify(W.runProcess(proc, { approvals: { c: true } })), "deterministic process run");
console.log(failures === 0 ? "ALL PASS — WI-P15-28 WORKFLOW ENGINE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
