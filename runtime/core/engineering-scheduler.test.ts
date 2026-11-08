#!/usr/bin/env node
"use strict";
const assert = require("assert");
const S = require("./engineering-scheduler");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V5-E / ENGINEERING SCHEDULER + CRITICAL PATH");
// LPT minimizes makespan: {100,50,50,30} on 2 workers ⇒ makespan 130 (100+30 vs 50+50).
{
  const r = S.schedule({ tasks: [{ id: "a", durationMs: 100 }, { id: "b", durationMs: 50 }, { id: "c", durationMs: 50 }, { id: "d", durationMs: 30 }], workers: 2, cores: 8 });
  check(r.makespan === 130, `LPT makespan 130 (got ${r.makespan})`);
  check(r.criticalPath.id === "a" && r.criticalPath.durationMs === 100, "critical path = longest task (a,100)");
  check(r.lowerBound === 115, `lower bound max(100, 230/2=115) = 115 (got ${r.lowerBound})`);
}
// worker cap at cores.
check(S.schedule({ tasks: [{ id: "a", durationMs: 10 }], workers: 20, cores: 4 }).workers === 4, "workers capped at cores");
// unknown-duration task scheduled conservatively, not dropped.
{
  const r = S.schedule({ tasks: [{ id: "a", durationMs: 100 }, { id: "b" }], workers: 1, cores: 8 });
  check(r.unknown.includes("b") && r.assignments[0].includes("b"), "unknown-duration task flagged + scheduled (not dropped)");
}
// empty ⇒ not schedulable.
check(S.schedule({ tasks: [], workers: 2 }).schedulable === false, "empty ⇒ not schedulable");
// critical path bound.
check(S.criticalPathBound([{ durationMs: 100 }, { durationMs: 50 }], 2) === 100, "critical path bound = max(longest=100, total/2=75) = 100");
check(S.ENGINEERING_SCHEDULER_CONTRACT.invariants.some((i: any) => /never dropped/i.test(i)), "contract: unknown never dropped");
console.log(failures === 0 ? "ALL PASS — V5-E ENGINEERING SCHEDULER" : "FAILURES: " + failures);
process.exit(failures === 0 ? 0 : 1);
export {};
