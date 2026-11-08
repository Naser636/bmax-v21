#!/usr/bin/env node
"use strict";

/*
 * WI-A1-31 — cognitive-campaign-driver. Proves cognition drives ODG's real campaign-loop UNDER POLICY:
 * authorised objective ⇒ mission executed by campaign-loop; refused/deferred/contaminated ⇒ no mission, no
 * execution; inventory/POLICY changes change the piloted outcome. Pure (governed outcome deterministic).
 * Run: node_modules/.bin/tsx runtime/core/cognitive-campaign-driver.test.ts
 */
const assert = require("assert");
const D = require("./cognitive-campaign-driver");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }

const gap = (id: string) => [{ id, need: true, declared: true, implemented: false }];
console.log("WI-A1-31 — COGNITIVE CAMPAIGN DRIVER (cognition drives ODG campaign-loop under POLICY)");

// authorised objective ⇒ ODG campaign-loop runs the derived mission to ACCEPTED
{
  const r = D.runCognitiveCampaign({ situation: { inventory: gap("capX") } });
  check(r.selected === true && r.mission === "obj-capX" && r.executed === true && r.accepted.includes("obj-capX") && r.loopStopped === "COMPLETED", "authorised ⇒ mission obj-capX executed+ACCEPTED by campaign-loop");
}
// inventory change ⇒ piloted objective changes (cognition influences piloting)
check(D.runCognitiveCampaign({ situation: { inventory: gap("capY") } }).mission === "obj-capY", "changing inventory changes the piloted mission (capY)");
// POLICY refusal ⇒ no mission, no execution
{
  const r = D.runCognitiveCampaign({ situation: { inventory: gap("capX") }, policy: { denyList: ["capX"] } });
  check(r.selected === false && r.status === "REFUSED_POLICY" && r.executed === false && r.accepted.length === 0, "POLICY deny ⇒ REFUSED_POLICY, no mission, executed:false");
}
// contaminated signal ⇒ refused, nothing executed
{
  const r = D.runCognitiveCampaign({ situation: { inventory: gap("capX"), evaluation: { contamination: { benchmarkDigests: ["h"], seenDigests: ["h"] } } } });
  check(r.status === "REFUSED_INTEGRITY" && r.executed === false, "contamination ⇒ REFUSED_INTEGRITY, no execution");
}
// unmet dependency ⇒ deferred, nothing executed
check(D.runCognitiveCampaign({ situation: { inventory: [{ id: "capE", deps: ["ghost"] }] } }).status === "DEFERRED_DEPENDENCY", "unmet dependency ⇒ DEFERRED, no execution");
// no objective ⇒ NONE, nothing executed
check(D.runCognitiveCampaign({ situation: { inventory: [] } }).executed === false, "no objective ⇒ nothing executed");
// review gate carried ⇒ still run but flagged
{
  const r = D.runCognitiveCampaign({ situation: { inventory: gap("capX"), evaluation: { gaming: { metric: { before: 0.6, after: 0.9 }, independentCheck: { before: 0.6, after: 0.6 } } } } });
  check(r.status === "SELECTED_PENDING_REVIEW" && r.requiresReview === true && r.executed === true, "suspect ⇒ SELECTED_PENDING_REVIEW, runs but flagged for review");
}
// a failing provider ⇒ loop does not accept (ODG refuses on no evidence)
{
  const r = D.runCognitiveCampaign({ situation: { inventory: gap("capX") }, execute: () => ({ status: "FAILED", reason: "provider failed", retryable: false }) });
  check(r.selected === true && r.executed === false && r.accepted.length === 0, "authorised but provider FAILED ⇒ campaign-loop does NOT accept (executed:false)");
}
// determinism of the governed outcome
{
  const a = D.runCognitiveCampaign({ situation: { inventory: gap("capX") } });
  const b = D.runCognitiveCampaign({ situation: { inventory: gap("capX") } });
  check(JSON.stringify({ m: a.mission, e: a.executed, acc: a.accepted, s: a.status }) === JSON.stringify({ m: b.mission, e: b.executed, acc: b.accepted, s: b.status }), "deterministic governed outcome");
}

console.log(failures === 0 ? "ALL PASS — WI-A1-31 COGNITIVE CAMPAIGN DRIVER" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
