#!/usr/bin/env node
"use strict";
const assert = require("assert");
const G = require("./p1-semantic-regression-guard");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 13 P1 — SEMANTIC-REGRESSION GUARD");

const before = [{ input: 1, observedOutput: "a" }, { input: 2, observedOutput: "b" }];

// SAFE: stated tests pass AND behaviour preserved.
{
  const r = G.assess({ statedTestsPass: true, before, after: [{ input: 1, observedOutput: "a" }, { input: 2, observedOutput: "b" }] });
  check(r.verdict === "SAFE" && r.safe === true, "tests pass + behaviour preserved ⇒ SAFE");
}

// SEMANTIC_REGRESSION: the dangerous case — stated tests PASS but held-out behaviour CHANGED (the 19.78% failure mode).
{
  const r = G.assess({ statedTestsPass: true, before, after: [{ input: 1, observedOutput: "a" }, { input: 2, observedOutput: "CHANGED" }] });
  check(r.verdict === "SEMANTIC_REGRESSION" && r.safe === false, "tests pass but behaviour changed ⇒ SEMANTIC_REGRESSION (not safe)");
  check(/19\.78%/.test(r.note), "the failure mode is identified (SWE-bench 19.78%)");
}

// TEST_FAILURE: stated tests fail ⇒ not safe regardless of behaviour.
{
  const r = G.assess({ statedTestsPass: false, before, after: before });
  check(r.verdict === "TEST_FAILURE" && r.safe === false, "stated tests fail ⇒ TEST_FAILURE");
}

// INCOMPLETE: tests pass but behaviour coverage has a gap ⇒ not a pass (fail-closed).
{
  const r = G.assess({ statedTestsPass: true, before, after: [{ input: 1, observedOutput: "a" }] }); // input 2 uncovered
  check(r.verdict === "INCOMPLETE" && r.safe === false, "tests pass but behaviour coverage gap ⇒ INCOMPLETE (not safe)");
}

// anti-overclaim: a green stated-test ALONE never yields SAFE without the behaviour check.
{
  const r = G.assess({ statedTestsPass: true, before: [], after: [] });
  check(r.safe === false, "green stated-test with no behaviour baseline ⇒ NOT safe (green test alone is not proof)");
}

check(G.P1_SEMANTIC_REGRESSION_GUARD_CONTRACT.invariants.some((i: any) => /green stated-test alone is not proof/.test(i)), "contract documents: green test alone is not proof");

console.log(failures === 0 ? "ALL PASS — SÉRIE 13 P1 SEMANTIC-REGRESSION GUARD" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
