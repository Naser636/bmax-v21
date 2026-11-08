#!/usr/bin/env node
"use strict";
const assert = require("assert");
const SC = require("./v124-scorecard");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V12.4 §90–§92 — EXECUTION SCORECARD");

// honest aggregate with full facts: professions met (15/15), but gates/campaigns NOT all pass/closed ⇒ IN_PROGRESS.
{
  const s = SC.buildScorecard({ primitivesPresent: 9, professionsProven: 15, registerAccepted: 239 });
  check(s.dimensions.professions.met === true && s.dimensions.primitives.met === true, "professions 15/15 + primitives 9/9 ⇒ met");
  check(s.dimensions.gates.met === false && s.dimensions.campaigns.met === false, "gates not all PASS + campaigns not all CLOSED ⇒ not met (honest)");
  check(s.overall === "IN_PROGRESS" && s.ready === false, "overall IN_PROGRESS, NOT inflated to READY (fail-closed)");
  check(s.forecast.remaining.length >= 1 && s.forecast.remaining.some((r: any) => /campaigns/.test(r)), "forecast names the remaining blockers (campaigns)");
}

// fail-closed on UNKNOWN facts: no profession/primitive count ⇒ met=null ⇒ not READY.
{
  const s = SC.buildScorecard({});
  check(s.dimensions.professions.met === null && s.dimensions.primitives.met === null, "unsupplied facts ⇒ UNKNOWN (null), not assumed met");
  check(s.ready === false && s.anyUnknown === true, "UNKNOWN facts ⇒ not READY (fail-closed), anyUnknown flagged");
}

// campaigns count toward closure only when CLOSED (the real ledger has 0 closed).
{
  const s = SC.buildScorecard({ primitivesPresent: 9, professionsProven: 15 });
  check(s.dimensions.campaigns.closed === 0 && s.dimensions.campaigns.allClosed === false, "campaigns: 0 CLOSED (sub-lot counts are not closure)");
}

check(SC.V124_SCORECARD_CONTRACT.invariants.some((i: any) => /fail-closed/.test(i)), "contract documents fail-closed readiness");

console.log(failures === 0 ? "ALL PASS — V12.4 §90–§92 SCORECARD" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
