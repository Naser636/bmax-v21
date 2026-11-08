#!/usr/bin/env node
"use strict";
const assert = require("assert");
const C = require("./parcours-workflow-stream-reliability");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("WI-INT-27 — PARCOURS C (P15→P12→P7)");
const slo = { maxLossRate: 0, maxDuplicateRate: 0, maxOrderingViolations: 0 };

// clean workflow ⇒ RELIABLE
{
  const r = C.runWorkflowStreamReliability({ slo });
  check(r.verdict === "RELIABLE" && r.p15.status === "COMPLETED" && r.p15.emitted === 3, "clean workflow emits 3 ordered events ⇒ RELIABLE");
}
// duplicate events ⇒ DEGRADED
{
  const extra = [{ type: "step.done", key: "emit", idempotencyKey: "d", payload: { order: 10 } }, { type: "step.done", key: "emit", idempotencyKey: "d", payload: { order: 11 } }];
  const r = C.runWorkflowStreamReliability({ slo, extraEvents: extra });
  check(r.verdict === "DEGRADED" && r.p7.breaches.includes("duplicateRate"), "duplicate events ⇒ DEGRADED (duplicateRate breach)");
}
// disorder ⇒ DEGRADED
{
  const r = C.runWorkflowStreamReliability({ slo, extraEvents: [{ type: "step.done", key: "emit", payload: { order: 1 } }] });
  check(r.verdict === "DEGRADED" && r.p7.breaches.includes("orderingViolations"), "out-of-order event ⇒ DEGRADED (ordering breach)");
}
// workflow failure ⇒ DEGRADED
{
  const proc = { id: "emit", steps: [{ id: "s1" }, { id: "s2", deps: ["s1"] }] };
  const r = C.runWorkflowStreamReliability({ process: proc, ctx: { inject: { s2: "error" } }, slo });
  check(r.verdict === "DEGRADED" && r.p15.status === "FAILED", "workflow failure ⇒ DEGRADED");
}
// determinism
check(JSON.stringify(C.runWorkflowStreamReliability({ slo })) === JSON.stringify(C.runWorkflowStreamReliability({ slo })), "deterministic parcours C");
console.log(failures === 0 ? "ALL PASS — WI-INT-27 PARCOURS C" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
