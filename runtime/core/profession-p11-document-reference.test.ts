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

// V254 §2 — batch STP rate + exception queue.
{
  const good = { id: "G1", issueDate: "2026-11-08", currency: "EUR", seller: { name: "S" }, buyer: { name: "B" }, lines: [{ id: "l1", netMinor: 10000 }], totals: { lineNetSumMinor: 10000, taxExclusiveMinor: 10000, vatMinor: 2000, taxInclusiveMinor: 12000 } };
  const badMissing = { issueDate: "d", currency: "EUR", seller: { name: "S" }, buyer: { name: "B" }, lines: [{ id: "l", netMinor: 100 }], totals: { lineNetSumMinor: 100, taxExclusiveMinor: 100, vatMinor: 0, taxInclusiveMinor: 100 } }; // no id ⇒ HIGH
  const mixed = P11.processBatch([good, badMissing, good]);
  check(mixed.total === 3 && mixed.accepted === 2 && mixed.exceptionCount === 1 && Math.abs(mixed.stpRate - 0.667) < 0.001 && mixed.allStraightThrough === false, "batch: 2 good + 1 bad ⇒ STP 0.667, 1 exception, not all-straight-through");
  check(mixed.exceptions[0].index === 1 && mixed.exceptions[0].highFindings >= 1, "batch: the exception carries the doc index + HIGH finding count (routed, not accepted)");
  const allGood = P11.processBatch([good, good]);
  check(allGood.stpRate === 1 && allGood.exceptionCount === 0 && allGood.allStraightThrough === true, "batch: all valid ⇒ STP 1, 0 exceptions");
  const allBad = P11.processBatch([badMissing, badMissing]);
  check(allBad.stpRate === 0 && allBad.exceptionCount === 2 && allBad.accepted === 0, "batch: all invalid ⇒ STP 0, all in the exception queue (none auto-accepted)");
  const empty = P11.processBatch([]);
  check(empty.stpRate === 0 && empty.allStraightThrough === false, "batch fail-closed: empty batch ⇒ STP 0 (NOT a fake 100%)");
  check(JSON.stringify(P11.processBatch([good, badMissing, good])) === JSON.stringify(mixed) && Object.isFrozen(mixed), "batch deterministic + frozen");
  const integ = P11.runReferenceProject({ batch: [good, badMissing] });
  check(integ.batch && integ.batch.exceptionCount === 1 && integ.degraded === true, "integration: runReferenceProject batch surfaces the exception + degrades");
}

console.log(failures === 0 ? "ALL PASS — V12.4 §43 P11 DOCUMENT REFERENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
