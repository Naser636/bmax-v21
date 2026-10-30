#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves ODG AUTONOMOUS ENGINEERING EXECUTOR V1 (slice 1): a deny-by-default ladder
// (PROPOSED→AUTHORIZED→EXECUTING→VERIFIED→ACCEPTED) with write-set containment, SEPARATION of execution & verification,
// and a proof-required ACCEPTED. All effecting is INJECTED (hermetic — nothing real is modified). No fictitious transition.
"use strict";
const assert = require("assert");
const E = require("./engineering-executor.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const WS = ["runtime/core/x.ts"];
const authLot = (over = {}) => Object.assign({ id: "LOT_A", title: "t", authorization: { authorized: true, grantedBy: "CTO" }, write_set: WS, acceptance: "x" }, over);
const execOK = () => ({ changes: [{ path: "runtime/core/x.ts", sha256: "a".repeat(64) }], attempts: [{ command: "edit+node --check", exitCode: 0 }] });
const testsOK = () => ({ passed: true, exitCode: 0 });
const verifyFn = () => ({ ok: true, by: "independent-ci", method: "tsc+test" });   // DISTINCT from execute
const full = (over = {}) => Object.assign({ execute: execOK, runTests: testsOK, independentVerify: verifyFn }, over);

// (1) happy path: authorized + injected exec + in-scope + tests pass + independent verify + proof ⇒ ACCEPTED.
{
  const r = E.runEngineeringLot(authLot(), full(), { at: "2026-10-30T00:00:00Z" });
  ok("full ladder ⇒ ACCEPTED with proof; states PROPOSED..ACCEPTED recorded",
     r.accepted === true && r.status === "ACCEPTED" && r.ladder.some((s) => s.state === "ACCEPTED") && r.proof && typeof r.proof.digest === "string");
}
// (2) DENY-BY-DEFAULT: not authorized ⇒ stops at PROPOSED, never executes.
{
  let ran = 0;
  const r = E.runEngineeringLot(authLot({ authorization: { authorized: false } }), full({ execute: () => { ran++; return execOK(); } }));
  ok("unauthorized ⇒ PROPOSED, executor NEVER called (deny-by-default)", r.status === "PROPOSED" && r.accepted === false && ran === 0);
}
// (3) DENY-BY-DEFAULT: no bounded write-set (missing / glob / empty) ⇒ stops at AUTHORIZED.
{
  const glob = E.runEngineeringLot(authLot({ write_set: ["runtime/**"] }), full());
  const empty = E.runEngineeringLot(authLot({ write_set: [] }), full());
  ok("no bounded write-set (glob or empty) ⇒ AUTHORIZED stop, not accepted", glob.status === "AUTHORIZED" && !glob.accepted && empty.status === "AUTHORIZED" && !empty.accepted);
}
// (4) NO injected executor ⇒ honest AUTHORIZED stop (never a self-granted effect).
{
  const r = E.runEngineeringLot(authLot(), { runTests: testsOK, independentVerify: verifyFn });
  ok("no injected executor ⇒ NO_ENGINEERING_EXECUTOR_ATTACHED (AUTHORIZED, not accepted)", r.status === "AUTHORIZED" && /NO_ENGINEERING_EXECUTOR_ATTACHED/.test(r.reason));
}
// (5) WRITE-SET CONTAINMENT: an out-of-scope change ⇒ atomic refusal (ROLLED_BACK), not accepted.
{
  const r = E.runEngineeringLot(authLot(), full({ execute: () => ({ changes: [{ path: "runtime/core/x.ts" }, { path: "runtime/core/SECRET.ts" }], attempts: [{ command: "edit", exitCode: 0 }] }) }));
  ok("out-of-scope change ⇒ REJECTED (write-set refusal), not accepted", r.status === "REJECTED" && r.accepted === false && Array.isArray(r.outOfScope) && r.outOfScope.includes("runtime/core/SECRET.ts"));
}
// (6) tests fail ⇒ cannot pass EXECUTING, not accepted.
{
  const r = E.runEngineeringLot(authLot(), full({ runTests: () => ({ passed: false, exitCode: 1, detail: "assertion failed" }) }));
  ok("tests fail ⇒ stops at EXECUTING, not accepted (no false success)", r.status === "EXECUTING" && r.accepted === false && /tests did not pass/.test(r.reason));
}
// (7) SEPARATION: no independent verifier ⇒ cannot reach VERIFIED/ACCEPTED.
{
  const r = E.runEngineeringLot(authLot(), { execute: execOK, runTests: testsOK });
  ok("no independent verifier ⇒ cannot verify (execution can't self-verify), not accepted", r.status === "EXECUTING" && !r.accepted && /INDEPENDENT verifier/.test(r.reason));
}
// (8) SEPARATION: verifier === executor (self-verification) ⇒ refused.
{
  const sameFn = () => ({ changes: [{ path: "runtime/core/x.ts" }], attempts: [{ command: "x", exitCode: 0 }], ok: true, by: "self" });
  const r = E.runEngineeringLot(authLot(), { execute: sameFn, runTests: testsOK, independentVerify: sameFn });
  ok("verifier === executor ⇒ SEPARATION_VIOLATION, not accepted", r.accepted === false && /SEPARATION_VIOLATION/.test(r.reason));
}
// (9) independent verify returns ok:false ⇒ not accepted (verification is real, not assumed).
{
  const r = E.runEngineeringLot(authLot(), full({ independentVerify: () => ({ ok: false, by: "ci", reason: "regression found" }) }));
  ok("independent verify ok:false ⇒ not accepted", r.accepted === false && r.status === "EXECUTING");
}
// (10) highestProvenState reflects the real furthest state (checkpoint/resume reasoning).
{
  const acc = E.runEngineeringLot(authLot(), full());
  const unauth = E.runEngineeringLot(authLot({ authorization: { authorized: false } }), full());
  ok("highestProvenState: accepted⇒ACCEPTED, unauthorized⇒PROPOSED", E.highestProvenState(acc) === "ACCEPTED" && E.highestProvenState(unauth) === "PROPOSED");
}

// (11) AUDIT regression — false-ACCEPTED on zero evidence must be CLOSED: no-op (changes:[]) ⇒ NOT accepted.
{
  const r = E.runEngineeringLot(authLot(), { execute: () => ({ changes: [] }), runTests: () => ({ passed: true }), independentVerify: () => ({ ok: true, by: "ci" }) });
  ok("no-op (changes:[]) ⇒ NOT accepted (a no-op is not an engineering lot)", r.accepted === false && r.status === "EXECUTING" && /no concrete change/.test(r.reason));
}
// (12) AUDIT regression — proof is NEVER fabricated: executor reports NO attempts (no integer exit code) ⇒ NOT accepted.
{
  const r = E.runEngineeringLot(authLot(), full({ execute: () => ({ changes: [{ path: "runtime/core/x.ts" }] }) }));   // changes but NO attempts
  ok("changes present but NO real attempts ⇒ NOT accepted (no fabricated proof)", r.accepted === false && /no real attempts/.test(r.reason));
}
// (13) AUDIT regression — tests must carry a real integer exit code: passed:true with no exitCode ⇒ NOT accepted.
{
  const r = E.runEngineeringLot(authLot(), full({ runTests: () => ({ passed: true }) }));   // no exitCode
  ok("tests passed:true but NO integer exitCode ⇒ NOT accepted", r.accepted === false && /integer exit code/.test(r.reason));
}
// (14) AUDIT — authorization.scope must contain the write_set (no enforcing an ungranted path).
{
  const r = E.runEngineeringLot(authLot({ authorization: { authorized: true, scope: ["runtime/core/other.ts"] } }), full());
  ok("write_set path not in authorization.scope ⇒ deny-by-default (AUTHORIZED, not accepted)", r.accepted === false && r.status === "AUTHORIZED" && /not in authorization\.scope/.test(r.reason));
}
// (15) AUDIT — proof build cannot crash the policy: a circular lot field ⇒ graceful stop (not a throw, not accepted).
{
  const circ = authLot(); circ.title = {}; circ.title.self = circ.title;   // circular ⇒ JSON.stringify would throw inside digest
  let threw = false, r;
  try { r = E.runEngineeringLot(circ, full()); } catch { threw = true; }
  ok("circular lot field ⇒ graceful VERIFIED stop (no uncaught throw), not accepted", threw === false && r.accepted === false);
}

console.log(`\nENGINEERING-EXECUTOR V1 suite — ${pass} assertions passed. (deny-by-default ladder; write-set containment; exec↔verify separation; proof-required ACCEPTED; no fictitious transition; all effecting injected — nothing real modified.)`);
