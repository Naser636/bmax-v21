#!/usr/bin/env node
"use strict";
const assert = require("assert");
const P1 = require("./profession-p1-fullstack-reference");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V12.4 §43 P1 — SOFTWARE/FULL-STACK REFERENCE (E2/E3)");

// E2: a behaviour-preserving refactor ⇒ BEHAVIOR_PRESERVED.
{
  const r = P1.runReferenceProject({});
  check(r.synthetic === true && r.profession === "P1" && r.refactor.verdict === "BEHAVIOR_PRESERVED" && r.degraded === false, "E2: behaviour-preserving refactor ⇒ BEHAVIOR_PRESERVED, not degraded");
}

// E3: a behaviour-changing refactor ⇒ BEHAVIOR_CHANGED (regression caught).
{
  const r = P1.runReferenceProject({ after: (n: number) => (n % 2 === 0 ? "EVEN" : "odd") });
  check(r.refactor.verdict === "BEHAVIOR_CHANGED" && r.refactor.changed >= 1 && r.degraded === true, "E3: behaviour-changing refactor ⇒ BEHAVIOR_CHANGED (regression caught)");
}

// E3: an incomplete sample set ⇒ INCOMPLETE (a coverage gap is NOT a pass).
{
  const before = [{ input: 1, observedOutput: "a" }, { input: 2, observedOutput: "b" }];
  const after = [{ input: 1, observedOutput: "a" }];
  const r = P1.refactorPreservesBehaviour(before, after, "p1");
  check(r.verdict === "INCOMPLETE" && r.ok === false, "E3: coverage gap ⇒ INCOMPLETE (fail-closed, not a pass)");
}

check(P1.P1_FULLSTACK_REFERENCE_CONTRACT.invariants.some((i: any) => /E5.*owner-gated NOT_RUN/.test(i)), "honesty: SYNTHETIC only, E5 owner-gated NOT_RUN");

console.log(failures === 0 ? "ALL PASS — V12.4 §43 P1 FULL-STACK REFERENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
