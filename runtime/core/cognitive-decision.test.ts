#!/usr/bin/env node
"use strict";

/*
 * WI-COG-28 — cognitive-decision. PROVES the cognitive brain INFLUENCES the governed decision (not a no-op):
 * discovery drives the objective, causal impact drives the test plan, meta-intelligence gates integrity.
 * Changing a cognitive input changes the decision. Read-only proposal (no authority). Pure.
 * Run: node_modules/.bin/tsx runtime/core/cognitive-decision.test.ts
 */
const assert = require("assert");
const D = require("./cognitive-decision");
const WM = require("./world-model");

let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }

// situation: a causal graph a→b→c
let m = WM.emptyModel();
for (const id of ["a", "b", "c"]) m = WM.putEntity(m, id, { type: "module", status: "OBSERVED" }).model;
m = WM.linkRelation(m, "a-b", { from: "a", to: "b", type: "causes", status: "OBSERVED" }).model;
m = WM.linkRelation(m, "b-c", { from: "b", to: "c", type: "causes", status: "OBSERVED" }).model;
const invX = [{ id: "capX", need: true, declared: true, implemented: false }];

console.log("WI-COG-28 — COGNITIVE DECISION");

// baseline: discovery→objective, causal→test plan, meta→ALLOW ⇒ PROCEED
{
  const r = D.decide({ model: m, inventory: invX, change: { nodeId: "a" } });
  check(r.selectedObjective && r.selectedObjective.subject === "capX", "DISCOVERY influences: objective = capX gap");
  check(JSON.stringify(r.testPlan) === JSON.stringify(["a", "b", "c"]), "CAUSAL influences: change 'a' ⇒ test plan [a,b,c] (impact)");
  check(r.decision === "PROCEED" && r.integrity.gate === "ALLOW", "clean integrity ⇒ PROCEED");
  check(r.rationale.length === 3 && r.notAuthority.indexOf("grants no authority") >= 0, "traceable rationale (3 lines) + read-only proposal (no authority)");
}

// INFLUENCE of discovery: a DIFFERENT inventory ⇒ a DIFFERENT objective
check(D.decide({ model: m, inventory: [{ id: "capY", need: true, declared: true, implemented: false }], change: { nodeId: "a" } }).selectedObjective.subject === "capY", "changing the inventory changes the selected objective (real influence)");

// INFLUENCE of causal: a DIFFERENT change node ⇒ a DIFFERENT test plan
check(JSON.stringify(D.decide({ model: m, inventory: invX, change: { nodeId: "b" } }).testPlan) === JSON.stringify(["b", "c"]), "changing the change node 'b' ⇒ test plan [b,c] (real influence)");

// INFLUENCE of meta-intelligence: contamination ⇒ integrity BLOCK ⇒ decision BLOCKED_INTEGRITY
{
  const r = D.decide({ model: m, inventory: invX, change: { nodeId: "a" }, evaluation: { contamination: { benchmarkDigests: ["h"], seenDigests: ["h"] } } });
  check(r.integrity.overall === "DETECTED" && r.integrity.gate === "BLOCK" && r.decision === "BLOCKED_INTEGRITY", "benchmark contamination ⇒ BLOCKED_INTEGRITY (meta influences the decision)");
}
// suspicion ⇒ PROCEED_UNDER_REVIEW (never a certain accusation)
{
  const r = D.decide({ model: m, inventory: invX, change: { nodeId: "a" }, evaluation: { gaming: { metric: { before: 0.6, after: 0.9 }, independentCheck: { before: 0.6, after: 0.6 } } } });
  check(r.integrity.overall === "SUSPECTED" && r.decision === "PROCEED_UNDER_REVIEW", "a suspicion ⇒ PROCEED_UNDER_REVIEW (flag, not a blocking accusation)");
}

// no gap ⇒ NO_OBJECTIVE
check(D.decide({ model: m, inventory: [] }).decision === "NO_OBJECTIVE", "no discovery finding ⇒ NO_OBJECTIVE");

// a SIMULATION entity is not promoted to observation (epistemic safety carried from world-model)
{
  let ms = WM.putEntity(WM.emptyModel(), "simnode", { type: "m", status: "SIMULATION" }).model;
  const r = D.decide({ model: ms, inventory: invX });
  check(r.situation.entitiesByStatus.SIMULATION === 1, "SIMULATION entity stays SIMULATION in the situation (no silent promotion)");
}

// determinism
check(JSON.stringify(D.decide({ model: m, inventory: invX, change: { nodeId: "a" } })) === JSON.stringify(D.decide({ model: m, inventory: invX, change: { nodeId: "a" } })), "deterministic decision");

console.log(failures === 0 ? "ALL PASS — WI-COG-28 COGNITIVE DECISION" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

// Module-scope marker (TS2451/TS2588 guard).
export {};
