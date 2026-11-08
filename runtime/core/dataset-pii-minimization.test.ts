#!/usr/bin/env node
"use strict";
const assert = require("assert");
const M = require("./dataset-pii-minimization");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 23/W7 — DATASET PII MINIMIZATION");

// email + health field not in purpose ⇒ violations + redaction plan.
{
  const r = M.assessPiiMinimization({ dataset: { format: "csv", content: "id,email,health_notes\n1,a@b.com,diabetes\n2,c@d.com,none\n" }, purpose: { allowedFields: ["id"] } });
  check(r.verdict === "VIOLATIONS_FOUND", "personal+special not in purpose ⇒ VIOLATIONS_FOUND");
  check(r.redactionPlan.includes("email") && r.redactionPlan.includes("health_notes"), "redaction plan includes email + health_notes");
  check(r.findings.some((f: any) => f.id === "special-category:no-art9-basis"), "special-category no-basis finding");
}
// personal field IN purpose + special with basis ⇒ fewer/no violations.
{
  const r = M.assessPiiMinimization({ dataset: { format: "csv", content: "id,email\n1,a@b.com\n" }, purpose: { allowedFields: ["id", "email"] } });
  check(r.findings.length === 0, "personal field in declared purpose ⇒ no excess finding");
}
// deny-by-default: no purpose ⇒ every PII field is excess.
{
  const r = M.assessPiiMinimization({ dataset: { format: "csv", content: "id,phone\n1,+33123456789\n" } });
  check(r.purposeDeclared === false && r.redactionPlan.includes("phone"), "no purpose ⇒ phone flagged (deny-by-default)");
}
// value-based detection: a generically-named column holding emails ⇒ PERSONAL.
{
  const r = M.assessPiiMinimization({ dataset: { format: "csv", content: "id,col2\n1,user@x.com\n2,v@y.com\n" }, purpose: { allowedFields: ["id"] } });
  check(r.fieldClassifications.find((f: any) => f.field === "col2").class === "PERSONAL", "email VALUES in a neutral column ⇒ PERSONAL (value-based)");
}
// honesty: no match on sample ⇒ NO_VIOLATION_UNVERIFIED, never asserted CLEAN.
{
  const r = M.assessPiiMinimization({ dataset: { format: "csv", content: "id,score\n1,42\n2,43\n" }, purpose: { allowedFields: ["id", "score"] } });
  check(r.verdict === "NO_VIOLATION_UNVERIFIED", "no PII on sample ⇒ UNVERIFIED (never CLEAN)");
}
check(M.DATASET_PII_MINIMIZATION_CONTRACT.invariants.some((i: any) => /never asserted CLEAN/.test(i)), "contract: never asserted CLEAN");
console.log(failures === 0 ? "ALL PASS — SÉRIE 23/W7 DATASET PII MINIMIZATION" : "FAILURES: " + failures);
process.exit(failures === 0 ? 0 : 1);
export {};
