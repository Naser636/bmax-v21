#!/usr/bin/env node
"use strict";
const assert = require("assert");
const F = require("./flaky-ci-intelligence");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V5-E WAVE-2 / FLAKY CI INTELLIGENCE");
// stable pass history ⇒ STABLE_PASS.
check(F.analyzeHistory({ testId: "t", history: [{ runId: 1, passed: true }, { runId: 2, passed: true }, { runId: 3, passed: true }] }).verdict === "STABLE_PASS", "all-pass history ⇒ STABLE_PASS");
// env-dependent: fails concentrated on 'mac' ⇒ ENV_DEPENDENT, NOT PASS.
{
  const h = [{ runId: 1, passed: true, env: "linux" }, { runId: 2, passed: false, env: "mac" }, { runId: 3, passed: true, env: "linux" }, { runId: 4, passed: false, env: "mac" }, { runId: 5, passed: false, env: "mac" }];
  const r = F.analyzeHistory({ testId: "t", history: h });
  check(r.verdict === "ENV_DEPENDENT" && r.suspectEnv === "mac" && r.isPass === false, "fails concentrated in mac ⇒ ENV_DEPENDENT, never PASS");
  check(r.prevention.some((p: any) => p.kind === "pin-environment" && p.status === "PROPOSED"), "proposes pin-environment");
}
// recurrent flaky (same env, many distinct fail runs) ⇒ RECURRENT_FLAKY, NOT PASS.
{
  const h = [{ runId: 1, passed: true, env: "ci" }, { runId: 2, passed: false, env: "ci" }, { runId: 3, passed: true, env: "ci" }, { runId: 4, passed: false, env: "ci" }, { runId: 5, passed: false, env: "ci" }, { runId: 6, passed: true, env: "ci" }];
  const r = F.analyzeHistory({ testId: "t", history: h });
  check((r.verdict === "RECURRENT_FLAKY" || r.verdict === "FLAKY_QUARANTINE") && r.isPass === false, "recurrent flaky ⇒ not PASS");
  check(r.recurrent === true, "failures across >=3 distinct runs ⇒ recurrent");
}
// a flaky test is NEVER PASS, however many passes.
check(F.analyzeHistory({ testId: "t", history: [{ runId: 1, passed: true }, { runId: 2, passed: true }, { runId: 3, passed: true }, { runId: 4, passed: false }] }).isPass === false, "one failure among passes ⇒ never PASS (no masking)");
// insufficient history ⇒ INSUFFICIENT.
check(F.analyzeHistory({ testId: "t", history: [{ runId: 1, passed: true }] }).verdict === "INSUFFICIENT", "too little history ⇒ INSUFFICIENT (fail-closed)");
check(F.FLAKY_CI_INTELLIGENCE_CONTRACT.invariants.some((i: any) => /NEVER declared PASS/i.test(i)), "contract: flaky never PASS");
console.log(failures === 0 ? "ALL PASS — V5-E WAVE-2 FLAKY CI INTELLIGENCE" : "FAILURES: " + failures);
process.exit(failures === 0 ? 0 : 1);
export {};
