#!/usr/bin/env node
"use strict";
const assert = require("assert");
const CL = require("./campaign-closure-ledger");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V12.4 §83–§87 — CAMPAIGNS C1–C4 CLOSURE LEDGER");

// completeness + closure discipline.
{
  const v = CL.verifyLedger();
  check(v.ok === true && v.count === 4 && v.distinct === 4, "exactly four campaigns C1–C4, all complete");
  check(v.incomplete.length === 0 && v.unsoundClosure.length === 0, "no incomplete campaign, no unsound closure");
  check(v.closedCount === 0, "no campaign closed by fiat (none DEMONSTRATED end-to-end yet)");
}

// every campaign cites a real mechanism + an independent verifier; closed is a boolean, never true without CLOSED status.
{
  for (const c of CL.CAMPAIGNS) {
    check(Array.isArray(c.mechanism) && c.mechanism.length >= 1 && typeof c.verifier === "string" && typeof c.closed === "boolean", `${c.id}: mechanism + verifier + boolean closed`);
    check(!(c.closed === true && c.status !== "CLOSED"), `${c.id}: not closed unless status CLOSED (fail-closed)`);
  }
}

// verbatim objectives are honestly marked NOT_RECOVERABLE (not fabricated).
check(CL.CAMPAIGNS.every((c: any) => /NOT_RECOVERABLE_VERBATIM/.test(c.objective)), "verbatim objectives marked NOT_RECOVERABLE (index-only), not fabricated");

// §87 gates defer to the A–G ledger (no second gate set).
check(/gates-ledger/.test(CL.GATES_REF.defersTo), "§87 closure gates defer to the A–G gates-ledger (no duplicate gate set)");

// verifyLedger is checkable against a present-mechanism set (a cited mechanism absent from the set is surfaced).
check(Array.isArray(CL.verifyLedger(["campaign-controller"]).unknownMechanisms), "verifyLedger checkable against a present-mechanism set");

console.log(failures === 0 ? "ALL PASS — V12.4 §83–§87 CAMPAIGN CLOSURE LEDGER" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
