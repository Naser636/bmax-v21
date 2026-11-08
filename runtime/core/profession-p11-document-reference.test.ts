#!/usr/bin/env node
"use strict";
const assert = require("assert");
const P11 = require("./profession-p11-document-reference");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V12.4 §43 P11 — IDP/DOCUMENT REFERENCE (E2/E3)");

// E2: a well-formed EN 16931 invoice ⇒ accepted (no HIGH findings).
{
  const r = P11.runReferenceProject({});
  check(r.synthetic === true && r.profession === "P11" && r.document.accepted === true && r.document.highFindings === 0 && r.degraded === false, "E2: well-formed invoice ⇒ accepted, 0 HIGH, not degraded");
}

// E3: a missing mandatory term ⇒ rejected (HIGH finding surfaced).
{
  const bad = { issueDate: "2026-11-08", currency: "EUR", seller: { name: "S" }, buyer: { name: "B" }, lines: [{ id: "l", netMinor: 100 }], totals: { lineNetSumMinor: 100, taxExclusiveMinor: 100, vatMinor: 0, taxInclusiveMinor: 100 } };
  const r = P11.processDocument(bad); // no id (BT-1)
  check(r.accepted === false && r.highFindings >= 1, "E3: missing mandatory BT-1 ⇒ rejected (HIGH)");
}

// E3: a broken calculation (Σ lines ≠ BT-106) ⇒ rejected.
{
  const bad = { id: "I", issueDate: "d", currency: "EUR", seller: { name: "S" }, buyer: { name: "B" }, lines: [{ id: "l", netMinor: 100 }], totals: { lineNetSumMinor: 999, taxExclusiveMinor: 999, vatMinor: 0, taxInclusiveMinor: 999 } };
  const r = P11.processDocument(bad);
  check(r.accepted === false && r.highFindings >= 1, "E3: broken BR-CO-10 calculation ⇒ rejected (HIGH)");
}

check(P11.P11_DOCUMENT_REFERENCE_CONTRACT.invariants.some((i: any) => /E5.*owner-gated NOT_RUN/.test(i)), "honesty: SYNTHETIC only, E5 owner-gated NOT_RUN");

console.log(failures === 0 ? "ALL PASS — V12.4 §43 P11 DOCUMENT REFERENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
