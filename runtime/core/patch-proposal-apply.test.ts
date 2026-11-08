#!/usr/bin/env node
"use strict";
const assert = require("assert");
const PPA = require("./patch-proposal-apply");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("PATCH-PROPOSAL-APPLY guard paths (direct unit coverage — no writes)");

// These exercise ONLY the fail-closed guard paths that return BEFORE any filesystem write.

// a missing authoritative mission id is a HARD guard ⇒ throws (fail-closed; never silently applies).
{
  let threw = false;
  try { PPA.applyProposal({}); } catch (e: any) { threw = /mission id is required/.test(String(e && e.message)); }
  check(threw === true, "missing mission id ⇒ throws (hard guard, fail-closed)");
}

// empty proposedEdits (with a mission) ⇒ NO_PROPOSAL (not applied).
{
  const r2 = PPA.applyProposal({ mission: "m", authorizedPaths: ["x"], proposedEdits: [] });
  check(r2.applied === false && r2.reason === "NO_PROPOSAL", "empty proposedEdits ⇒ NO_PROPOSAL");
}

// malformed proposal (edits without a target) ⇒ MALFORMED_PROPOSAL (fail-closed, no write).
{
  const r = PPA.applyProposal({ mission: "m", authorizedPaths: ["x"], proposedEdits: [{ content: "x" }] });
  check(r.applied === false && r.reason === "MALFORMED_PROPOSAL", "edit without a target ⇒ MALFORMED_PROPOSAL");
  check(Array.isArray(r.executed) && r.executed.length === 0, "nothing executed on a malformed proposal");
}

console.log(failures === 0 ? "ALL PASS — PATCH-PROPOSAL-APPLY" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
