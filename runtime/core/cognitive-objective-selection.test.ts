#!/usr/bin/env node
"use strict";

/*
 * WI-COG-30 — cognitive-objective-selection. Proves the §2 governance assertions: inventory changes ⇒ proposal
 * changes; POLICY changes ⇒ authorised selection changes; unknown dependency ⇒ defer; contaminated ⇒ refuse;
 * suspect ⇒ review; unauthorised ⇒ refuse; accepted ⇒ traceable mission; refused ⇒ no execution. Pure.
 * Run: node_modules/.bin/tsx runtime/core/cognitive-objective-selection.test.ts
 */
const assert = require("assert");
const S = require("./cognitive-objective-selection");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }

const invGap = (id: string) => [{ id, need: true, declared: true, implemented: false }];
const invDep = [{ id: "capE", deps: ["ghost"] }];           // unmet-dependency CONFIRMED (top priority)

console.log("WI-COG-30 — COGNITIVE OBJECTIVE SELECTION (ODG decides under POLICY)");

// (7) accepted ⇒ traceable mission (no execution) + (gov) executed is always false
{
  const r = S.selectObjective({ situation: { inventory: invGap("capX") } });
  check(r.status === "SELECTED" && r.selected && r.selected.id === "obj-capX" && r.selected.authority === "ODG" && r.executed === false, "accepted proposal ⇒ SELECTED traceable mission (ODG authority, not executed)");
  check(r.notAuthority.indexOf("grants no authority") >= 0 && r.rationale.length >= 3, "cognitive grants no authority; rationale traceable");
}
// (1) changing the inventory changes the proposal
check(S.selectObjective({ situation: { inventory: invGap("capY") } }).selected.objective.subject === "capY", "changing inventory ⇒ different objective (capY)");
// (2) changing POLICY changes the authorised selection
check(S.selectObjective({ situation: { inventory: invGap("capX") }, policy: { allowedKinds: ["duplicate"] } }).status === "REFUSED_POLICY", "POLICY allowedKinds excludes 'gap' ⇒ REFUSED_POLICY");
check(S.selectObjective({ situation: { inventory: invGap("capX") }, policy: { allowedKinds: ["gap"] } }).status === "SELECTED", "POLICY allowedKinds includes 'gap' ⇒ SELECTED");
// (6) unauthorised (deny-listed) ⇒ refused
check(S.selectObjective({ situation: { inventory: invGap("capX") }, policy: { denyList: ["capX"] } }).status === "REFUSED_POLICY", "deny-listed subject ⇒ REFUSED_POLICY");
// (3) unknown dependency ⇒ defer
{
  const r = S.selectObjective({ situation: { inventory: invDep } });
  check(r.status === "DEFERRED_DEPENDENCY" && r.selected === null && r.executed === false, "CONFIRMED unmet dependency ⇒ DEFERRED_DEPENDENCY (no execution)");
}
// requireDep not ACCEPTED ⇒ defer
check(S.selectObjective({ situation: { inventory: invGap("capX") }, policy: { requireDep: "capZ" }, register: { items: [] } }).status === "DEFERRED_DEPENDENCY", "required dep not ACCEPTED ⇒ DEFERRED_DEPENDENCY");
check(S.selectObjective({ situation: { inventory: invGap("capX") }, policy: { requireDep: "capZ" }, register: { items: [{ id: "capZ", status: "ACCEPTED" }] } }).status === "SELECTED", "required dep ACCEPTED ⇒ SELECTED");
// (4) contaminated signal ⇒ refuse (no execution)
{
  const r = S.selectObjective({ situation: { inventory: invGap("capX"), evaluation: { contamination: { benchmarkDigests: ["h"], seenDigests: ["h"] } } } });
  check(r.status === "REFUSED_INTEGRITY" && r.selected === null && r.executed === false, "contaminated signal ⇒ REFUSED_INTEGRITY (no execution)");
}
// (5) suspect signal ⇒ review
check(S.selectObjective({ situation: { inventory: invGap("capX"), evaluation: { gaming: { metric: { before: 0.6, after: 0.9 }, independentCheck: { before: 0.6, after: 0.6 } } } } }).status === "SELECTED_PENDING_REVIEW", "suspect signal ⇒ SELECTED_PENDING_REVIEW (review, not accusation)");
// (8) no proposal ⇒ NONE, nothing executed
check(S.selectObjective({ situation: { inventory: [] } }).status === "NONE" && S.selectObjective({ situation: { inventory: [] } }).executed === false, "no cognitive objective ⇒ NONE (no execution)");
// determinism
check(JSON.stringify(S.selectObjective({ situation: { inventory: invGap("capX") } })) === JSON.stringify(S.selectObjective({ situation: { inventory: invGap("capX") } })), "deterministic selection");

console.log(failures === 0 ? "ALL PASS — WI-COG-30 COGNITIVE OBJECTIVE SELECTION" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
