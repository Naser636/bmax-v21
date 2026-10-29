#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the §4 field-validation readiness contract is fail-closed and complete: all
// five domains are NOT_FIELD_VALIDATED by default (PARTIAL), each carries a full external-case contract, and the grader
// never declares FIELD_VALIDATED without real owner-confirmed evidence meeting the pre-registered success criteria.
"use strict";
const assert = require("assert");
const F = require("./field-validation-readiness.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const EXPECTED = ["Enterprise Software Engineering", "Cyber & Supply Chain", "Documents & Data", "Financial Auditing", "Legal & Compliance"];

// (1) all five domains present, each PARTIAL + NOT_FIELD_VALIDATED by default.
{
  const r = F.readiness();
  ok("all 5 domains present, each currentStatus PARTIAL + status NOT_FIELD_VALIDATED",
     r.domains.length === 5 && EXPECTED.every((d) => r.domains.some((x) => x.domain === d)) && r.domains.every((d) => d.currentStatus === "PARTIAL" && d.status === "NOT_FIELD_VALIDATED"));
}
// (2) each domain carries the full external-case contract (data/environment/consent/successCriteria/expectedResults/risks) + ownerAction.
{
  const r = F.readiness();
  const keys = ["data", "environment", "consent", "successCriteria", "expectedResults", "risks"];
  ok("every domain has a complete requiredEvidence contract + ownerAction",
     r.domains.every((d) => typeof d.ownerAction === "string" && d.ownerAction.length > 10 && keys.every((k) => typeof d.requiredEvidence[k] === "string" && d.requiredEvidence[k].length > 10)));
}
// (3) FAIL-CLOSED: no evidence ⇒ NOT_FIELD_VALIDATED for every domain.
{
  ok("no evidence ⇒ NOT_FIELD_VALIDATED (all domains)", EXPECTED.every((d) => F.assessFieldValidation(d).status === "NOT_FIELD_VALIDATED"));
}
// (4) incomplete evidence (missing owner confirmation or success criteria) ⇒ still NOT_FIELD_VALIDATED (no overclaim).
{
  const d = EXPECTED[0];
  ok("partial evidence ⇒ still NOT_FIELD_VALIDATED",
     F.assessFieldValidation(d, { realCaseRef: "case-1" }).status === "NOT_FIELD_VALIDATED" &&
     F.assessFieldValidation(d, { realCaseRef: "case-1", ownerConfirmed: true }).status === "NOT_FIELD_VALIDATED" &&
     F.assessFieldValidation(d, { ownerConfirmed: true, meetsSuccessCriteria: true }).status === "NOT_FIELD_VALIDATED");
}
// (5) only complete, owner-confirmed, criteria-meeting real evidence ⇒ FIELD_VALIDATED (the grader grades, never fabricates).
{
  const r = F.assessFieldValidation("Financial Auditing", { realCaseRef: "ledger-2026-Q3", ownerConfirmed: true, meetsSuccessCriteria: true });
  ok("complete real evidence ⇒ FIELD_VALIDATED (graded, not fabricated)", r.status === "FIELD_VALIDATED" && /ledger-2026-Q3/.test(r.reason));
}
// (6) unknown domain ⇒ fail-closed error.
{
  ok("unknown domain ⇒ UNKNOWN_DOMAIN", F.assessFieldValidation("Astrology").ok === false);
}

console.log(`\nFIELD-VALIDATION-READINESS suite — ${pass} assertions passed. (5 domains PARTIAL + NOT_FIELD_VALIDATED; full external-case contract each; fail-closed; graded-never-fabricated)`);
