#!/usr/bin/env node
"use strict";
const assert = require("assert");
const A = require("./rce-assurance-chain");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V5 PHASE 4 / M-CH3-03 — RCE ASSURANCE CHAIN");
const indep = { builder: { id: "b" }, verifier: { id: "v" } };
// full pass ⇒ RETAIN.
{
  const r = A.assessRepair({ reproduction: { beforeFix: false, afterFix: true }, passToPass: [{ id: "t", beforeFix: true, afterFix: true }], adversarial: { ran: true, passed: true }, actors: indep });
  check(r.decision === "RETAIN" && r.gates.failToPass === "PASS" && r.gates.passToPass === "PASS", "fail-to-pass + pass-to-pass + independent + adversarial ⇒ RETAIN");
}
// pass-to-pass regression ⇒ ROLLBACK.
{
  const r = A.assessRepair({ reproduction: { beforeFix: false, afterFix: true }, passToPass: [{ id: "t", beforeFix: true, afterFix: false }], actors: indep });
  check(r.decision === "ROLLBACK" && r.gates.passToPass === "REGRESSION", "previously-passing test now fails ⇒ ROLLBACK");
}
// adversarial failure ⇒ ROLLBACK.
{
  const r = A.assessRepair({ reproduction: { beforeFix: false, afterFix: true }, passToPass: [{ id: "t", beforeFix: true, afterFix: true }], adversarial: { ran: true, passed: false }, actors: indep });
  check(r.decision === "ROLLBACK", "adversarial failure ⇒ ROLLBACK");
}
// the fix is its own proof (builder==verifier) ⇒ COMPROMISED ⇒ NEEDS_REVIEW.
{
  const r = A.assessRepair({ reproduction: { beforeFix: false, afterFix: true }, passToPass: [{ id: "t", beforeFix: true, afterFix: true }], adversarial: { ran: true, passed: true }, actors: { builder: { id: "x" }, verifier: { id: "x" } } });
  check(r.decision === "NEEDS_REVIEW" && r.gates.independence === "COMPROMISED", "builder==verifier ⇒ COMPROMISED ⇒ NEEDS_REVIEW (fix never its own proof)");
}
// reproduction passed before fix (doesn't demonstrate defect) ⇒ NEEDS_REVIEW.
{
  const r = A.assessRepair({ reproduction: { beforeFix: true, afterFix: true }, passToPass: [{ id: "t", beforeFix: true, afterFix: true }], actors: indep });
  check(r.decision === "NEEDS_REVIEW" && r.gates.failToPass === "INVALID", "reproduction passed before fix ⇒ NEEDS_REVIEW (not proven)");
}
// reproduction still fails after fix ⇒ NEEDS_REVIEW (defect unresolved).
{
  const r = A.assessRepair({ reproduction: { beforeFix: false, afterFix: false }, passToPass: [{ id: "t", beforeFix: true, afterFix: true }], actors: indep });
  check(r.gates.failToPass === "FAIL" && r.decision === "NEEDS_REVIEW", "reproduction still fails after fix ⇒ NEEDS_REVIEW");
}
// fail-closed: missing evidence ⇒ NEEDS_REVIEW (never RETAIN).
check(A.assessRepair({}).decision === "NEEDS_REVIEW", "empty ⇒ NEEDS_REVIEW (fail-closed)");
check(A.assessRepair({ reproduction: { beforeFix: false, afterFix: true }, actors: indep }).decision === "NEEDS_REVIEW", "no pass-to-pass ⇒ NEEDS_REVIEW (regression unproven)");
check(A.RCE_ASSURANCE_CHAIN_CONTRACT.invariants.some((i: any) => /never its own proof/i.test(i)), "contract: fix never its own proof");
console.log(failures === 0 ? "ALL PASS — V5 M-CH3-03 RCE ASSURANCE CHAIN" : "FAILURES: " + failures);
process.exit(failures === 0 ? 0 : 1);
export {};
