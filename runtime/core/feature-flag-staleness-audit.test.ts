#!/usr/bin/env node
"use strict";
const assert = require("assert");
const F = require("./feature-flag-staleness-audit");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 23/W10 — FEATURE-FLAG STALENESS AUDIT");
// varying observations ⇒ ACTIVE.
check(F.audit({ flags: [{ name: "f", observations: [true, false, true, true, false] }] }).flags[0].staleness === "ACTIVE", "varying ⇒ ACTIVE");
// constant true ⇒ FULLY_ROLLED_OUT.
check(F.audit({ flags: [{ name: "f", observations: [true, true, true, true, true] }] }).flags[0].staleness === "FULLY_ROLLED_OUT", "constant true ⇒ FULLY_ROLLED_OUT");
// constant false ⇒ DEAD.
check(F.audit({ flags: [{ name: "f", observations: [false, false, false, false, false] }] }).flags[0].staleness === "DEAD", "constant false ⇒ DEAD");
// REMOVE-eligible only if pre-announced + not referenced.
{
  const r = F.audit({ flags: [{ name: "f", observations: [true, true, true, true, true], deprecated: true, stillReferenced: false }] });
  check(r.flags[0].removeEligible === true, "stale + deprecated + not-referenced ⇒ removeEligible");
}
// stale but not pre-announced ⇒ NOT removeEligible (deny-by-default).
check(F.audit({ flags: [{ name: "f", observations: [true, true, true, true, true] }] }).flags[0].removeEligible === false, "stale but not deprecated ⇒ not removeEligible");
// stale + still referenced ⇒ NOT removeEligible.
check(F.audit({ flags: [{ name: "f", observations: [true, true, true, true, true], deprecated: true, stillReferenced: true }] }).flags[0].removeEligible === false, "still referenced ⇒ not removeEligible");
// insufficient window ⇒ INSUFFICIENT (never auto-retire).
check(F.audit({ flags: [{ name: "f", observations: [true, true] }], minWindow: 5 }).flags[0].staleness === "INSUFFICIENT", "below minWindow ⇒ INSUFFICIENT (fail-closed)");
check(F.FEATURE_FLAG_STALENESS_CONTRACT.invariants.some((i: any) => /never auto-retire/.test(i)), "contract: never auto-retire");
console.log(failures === 0 ? "ALL PASS — SÉRIE 23/W10 FEATURE-FLAG STALENESS" : "FAILURES: " + failures);
process.exit(failures === 0 ? 0 : 1);
export {};
