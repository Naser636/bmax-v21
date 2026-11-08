#!/usr/bin/env node
"use strict";
const assert = require("assert");
const P = require("./p8-semver-enforcement");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 14 P8 — SEMVER ENFORCEMENT");

const base = { version: "1.0.0", requiredIn: ["id"], requiredOut: ["amount"], inputSchema: { id: "number" }, outputSchema: { amount: "number" } };

// breaking change (new required input) + major bump ⇒ OK.
{
  const r = P.enforce({ oldContract: base, newContract: { ...base, version: "2.0.0", requiredIn: ["id", "tok"], inputSchema: { id: "number", tok: "string" } } });
  check(r.requiredBump === "major" && r.actualBump === "major" && r.ok === true, "breaking change + major bump ⇒ OK");
}

// breaking change + only a MINOR bump ⇒ SEMVER_VIOLATION.
{
  const r = P.enforce({ oldContract: base, newContract: { ...base, version: "1.1.0", requiredIn: ["id", "tok"], inputSchema: { id: "number", tok: "string" } } });
  check(r.requiredBump === "major" && r.actualBump === "minor" && r.verdict === "SEMVER_VIOLATION", "breaking change + minor bump ⇒ SEMVER_VIOLATION");
  check(r.breaking.length >= 1, "the breaking change is listed");
}

// backward-compatible addition (new optional output) + minor bump ⇒ OK.
{
  const r = P.enforce({ oldContract: base, newContract: { ...base, version: "1.1.0", outputSchema: { amount: "number", currency: "string" } } });
  check(r.requiredBump === "minor" && r.ok === true, "additive change + minor bump ⇒ OK");
}

// addition with NO bump ⇒ SEMVER_VIOLATION.
{
  const r = P.enforce({ oldContract: base, newContract: { ...base, version: "1.0.0", outputSchema: { amount: "number", currency: "string" } } });
  check(r.verdict === "SEMVER_VIOLATION" && r.actualBump === "none", "additive change + no bump ⇒ SEMVER_VIOLATION");
}

// a downgrade ⇒ SEMVER_VIOLATION; an invalid version ⇒ INVALID_VERSION.
{
  check(P.enforce({ oldContract: base, newContract: { ...base, version: "0.9.0" } }).verdict === "SEMVER_VIOLATION", "version downgrade ⇒ SEMVER_VIOLATION");
  check(P.enforce({ oldContract: base, newContract: { ...base, version: "notaversion" } }).verdict === "INVALID_VERSION", "invalid version ⇒ INVALID_VERSION");
}

check(P.P8_SEMVER_CONTRACT.invariants.some((i: any) => /BREAKING change requires a MAJOR bump/.test(i)), "contract documents the SemVer rule");

console.log(failures === 0 ? "ALL PASS — SÉRIE 14 P8 SEMVER ENFORCEMENT" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
