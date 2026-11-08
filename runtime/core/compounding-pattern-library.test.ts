#!/usr/bin/env node
"use strict";
const assert = require("assert");
const L = require("./compounding-pattern-library");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V5 PHASE 8 / M-CH5-02 — COMPOUNDING PATTERN LIBRARY");
// validated + conditions + limits + provenance ⇒ PROCEDURE.
check(L.admitPattern({ id: "p", method: "m", conditions: ["c"], limits: ["l"], validation: { status: "VALIDATED", provenance: "M1" } }).tier === "PROCEDURE", "validated + conditions + limits ⇒ PROCEDURE");
// observed-but-unvalidated ⇒ WORKING (not a procedure).
{
  const r = L.admitPattern({ id: "p", method: "m", conditions: ["c"], limits: ["l"], validation: { status: "OBSERVED" } });
  check(r.tier === "WORKING" && r.admittedAsProcedure === false, "unvalidated ⇒ WORKING (not an official procedure)");
}
// missing conditions/limits ⇒ INCOMPLETE.
check(L.admitPattern({ id: "p", method: "m", validation: { status: "VALIDATED", provenance: "M1" } }).tier === "INCOMPLETE", "missing conditions/limits ⇒ INCOMPLETE");
// no shape ⇒ REJECTED.
check(L.admitPattern({}).tier === "REJECTED", "no id/method ⇒ REJECTED");
// §8.3 classifyMemory: an unvalidated observation is NOT a fact.
{
  const r = L.classifyMemory({ family: "semantic", kind: "observation", provenance: "p", status: "UNVERIFIED" }, 1);
  check(r.isFact === false, "unverified observation ⇒ NOT a fact (§8.3)");
}
// a validated, corroborated observation ⇒ fact.
{
  const r = L.classifyMemory({ family: "semantic", kind: "observation", provenance: "mission:M1", corroborated: true }, 1);
  check(r.quality === "OK" && r.isFact === true, "validated + corroborated observation ⇒ fact");
}
// an unvalidated procedural record is NOT an official procedure.
{
  const r = L.classifyMemory({ family: "procedural", provenance: "p", status: "UNVERIFIED" }, 1);
  check(r.isProcedure === false, "unvalidated procedural ⇒ NOT an official procedure (§8.3)");
}
// a validated procedural record ⇒ procedure.
check(L.classifyMemory({ family: "procedural", provenance: "mission:M1" }, 1).isProcedure === true, "validated procedural ⇒ procedure");
check(L.COMPOUNDING_PATTERN_LIBRARY_CONTRACT.invariants.some((i: any) => /NOT automatically a fact/i.test(i)), "contract: observation not automatically a fact");
console.log(failures === 0 ? "ALL PASS — V5 M-CH5-02 COMPOUNDING PATTERN LIBRARY" : "FAILURES: " + failures);
process.exit(failures === 0 ? 0 : 1);
export {};
