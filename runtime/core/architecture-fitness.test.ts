#!/usr/bin/env node
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const F = require("./architecture-fitness");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V5 PHASE 1 / M-FIT-01 — ARCHITECTURE FITNESS");

// FIT-01 against the REAL register: all ACCEPTED carry evidence + 0 stale ⇒ PASS.
{
  const reg = JSON.parse(fs.readFileSync(path.join(__dirname, "../../docs/odg/closure-register.json"), "utf8"));
  const r = F.evaluateFitness({ register: reg });
  const fit01 = r.results.find((x: any) => x.id === "FIT-01");
  check(fit01.result === "PASS", `real register coherence ⇒ FIT-01 PASS (got ${fit01.result}: ${fit01.detail})`);
}
// fail-closed: no evidence ⇒ all UNVERIFIED ⇒ INCOMPLETE (never ALL_PASS).
{
  const r = F.evaluateFitness({});
  check(r.verdict === "INCOMPLETE" && r.summary.unverified === 10, "no evidence ⇒ every invariant UNVERIFIED ⇒ INCOMPLETE (never silent PASS)");
}
// anti-fabrication VIOLATION.
{
  const r = F.evaluateFitness({ missions: [{ id: "m1", status: "VALIDATED" }] });
  check(r.violations.includes("FIT-02"), "executed-state mission without evidence ⇒ FIT-02 VIOLATION");
}
// UNKNOWN-not-NATIVE VIOLATION.
{
  const r = F.evaluateFitness({ actorEntries: [{ labeledNative: true, authoredBy: "MYSTERY" }] });
  check(r.violations.includes("FIT-04"), "entry labeled NATIVE but resolving UNKNOWN ⇒ FIT-04 VIOLATION");
}
// UNKNOWN-not-NATIVE PASS when genuinely ODG.
{
  const r = F.evaluateFitness({ actorEntries: [{ labeledNative: true, authoredBy: "ODG_CAPABILITY", appliedBy: "ODG_EXECUTOR" }] });
  check(r.results.find((x: any) => x.id === "FIT-04").result === "PASS", "genuine ODG native entry ⇒ FIT-04 PASS");
}
// repair baseline+diff PASS/VIOLATION.
{
  check(F.evaluateFitness({ repairs: [{ initialState: {}, diff: "x" }] }).results.find((x: any) => x.id === "FIT-05").result === "PASS", "repair with baseline+diff ⇒ FIT-05 PASS");
  check(F.evaluateFitness({ repairs: [{ diff: "x" }] }).violations.includes("FIT-05"), "repair missing initial state ⇒ FIT-05 VIOLATION");
}
// promotion criteria.
check(F.evaluateFitness({ promotions: [{ validationCriteria: [] }] }).violations.includes("FIT-06"), "promotion without criteria ⇒ FIT-06 VIOLATION");
// preservation PASS.
{
  const pres = { decisions: ["DEC-V60-166-RETIREMENT"], ninePrimitives: Array(9).fill("x"), fifteenMetiers: Array(15).fill("P") };
  check(F.evaluateFitness({ preservation: pres }).results.find((x: any) => x.id === "FIT-07").result === "PASS", "preservation intact ⇒ FIT-07 PASS");
}
// full ALL_PASS with complete valid evidence.
{
  const reg = JSON.parse(fs.readFileSync(path.join(__dirname, "../../docs/odg/closure-register.json"), "utf8"));
  const r = F.evaluateFitness({
    register: reg,
    missions: [{ id: "m1", status: "ACCEPTED", evidence: "proven" }],
    actorEntries: [{ labeledNative: true, authoredBy: "ODG_CAPABILITY", appliedBy: "ODG_EXECUTOR" }],
    repairs: [{ initialState: {}, diff: "d" }],
    promotions: [{ validationCriteria: ["ci-green"] }],
    preservation: { decisions: ["DEC-V60-166-RETIREMENT"], ninePrimitives: Array(9).fill("x"), fifteenMetiers: Array(15).fill("P") },
    guardsPresent: { agentCannotSelfAuthorize: true, truthLockPresent: true, radarProposalGated: true },
  });
  check(r.verdict === "ALL_PASS" && r.summary.pass === 10, `complete valid evidence ⇒ ALL_PASS (got ${r.verdict}, ${r.summary.pass}/10)`);
}
check(F.ARCHITECTURE_FITNESS_CONTRACT.invariants.some((i: any) => /never silently PASS/.test(i)), "contract: never silently PASS");

console.log(failures === 0 ? "ALL PASS — V5 M-FIT-01 ARCHITECTURE FITNESS" : "FAILURES: " + failures);
process.exit(failures === 0 ? 0 : 1);
export {};
