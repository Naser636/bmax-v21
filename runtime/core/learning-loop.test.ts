#!/usr/bin/env node
"use strict";
const assert = require("assert");
const L = require("./learning-loop");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("WI-A5-35 — LEARNING LOOP (measured)");

// recurring REAL failure ⇒ lesson; measured improvement; regression surfaced
{
  const r = L.learn({
    results: [
      { missionId: "m1", outcome: "fail", kind: "REAL", failureKind: "timeout", evidence: ["e"], metricBefore: 0.6, metricAfter: 0.8 },
      { missionId: "m2", outcome: "fail", kind: "REAL", failureKind: "timeout", evidence: ["e"], metricBefore: 0.5, metricAfter: 0.7 },
      { missionId: "m3", outcome: "pass", kind: "REAL", evidence: ["e"], metricBefore: 0.9, metricAfter: 0.85 }, // a regression
    ],
  });
  check(r.recurringErrors.includes("timeout") && r.lessons.includes("lesson:timeout"), "recurring REAL failure ⇒ lesson extracted + stored (memory-taxonomy)");
  check(r.measured === true && r.improvement.improved === true && r.improvement.delta > 0, "improvement is MEASURED (before/after delta > 0)");
  check(r.regressions.includes("m3"), "a result whose metric dropped ⇒ regression surfaced");
  check(r.lessonIndex.byFamily.failure === 1, "lesson classified under memory family 'failure'");
}
// SIMULATED results are excluded from facts (no lesson, not counted)
{
  const r = L.learn({ results: [{ missionId: "s", outcome: "fail", kind: "SIMULATED", failureKind: "timeout", evidence: ["e"] }, { missionId: "s2", outcome: "fail", kind: "SIMULATED", failureKind: "timeout", evidence: ["e"] }] });
  check(r.recurringErrors.length === 0 && r.simulatedExcludedFromFacts === 2, "SIMULATED failures excluded from facts (no lesson; counted as simulated)");
}
// a single failure is not 'recurring'; no evidence ⇒ not counted
check(L.learn({ results: [{ missionId: "m", outcome: "fail", kind: "REAL", failureKind: "x", evidence: ["e"] }] }).recurringErrors.length === 0, "single failure ⇒ not recurring");
check(L.learn({ results: [{ missionId: "m", outcome: "fail", kind: "REAL", failureKind: "x" }] }).lessons.length === 0, "no evidence ⇒ not counted");
// a lesson alone (no metrics) is NOT measured improvement
check(L.learn({ results: [{ missionId: "a", outcome: "fail", kind: "REAL", failureKind: "y", evidence: ["e"] }, { missionId: "b", outcome: "fail", kind: "REAL", failureKind: "y", evidence: ["e"] }] }).measured === false, "lesson without metrics ⇒ measured:false (lesson ≠ improvement)");
// REUSE: only consolidated+provenanced prior lessons are reusable
{
  const prior = [{ id: "lesson:timeout", family: "failure", provenance: "p", consolidated: true }, { id: "lesson:nope", family: "failure" }];
  const r = L.learn({ results: [], priorLessons: prior });
  check(JSON.stringify(r.reusableValidatedLessons) === JSON.stringify(["lesson:timeout"]), "only validated (consolidated+provenanced) prior lessons are reusable");
}
// determinism
check(JSON.stringify(L.learn({ results: [{ missionId: "m1", outcome: "fail", kind: "REAL", failureKind: "t", evidence: ["e"] }] })) === JSON.stringify(L.learn({ results: [{ missionId: "m1", outcome: "fail", kind: "REAL", failureKind: "t", evidence: ["e"] }] })), "deterministic learning");
console.log(failures === 0 ? "ALL PASS — WI-A5-35 LEARNING LOOP" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
