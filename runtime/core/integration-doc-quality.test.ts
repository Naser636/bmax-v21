#!/usr/bin/env node
"use strict";

/*
 * WI-INT-21 — P11→P4→P6 integration. Locks: clean docs ⇒ PASS with provenance; incomplete/invalid docs degrade
 * the verdict; rejected (unsupported) + duplicate docs surfaced; P4 metrics present; determinism. Pure.
 * Run: node_modules/.bin/tsx runtime/core/integration-doc-quality.test.ts
 */
const assert = require("assert");
const I = require("./integration-doc-quality");

let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }

console.log("WI-INT-21 — INTEGRATION P11 → P4 → P6");

const dataSchema = { fields: [{ name: "vendor", required: true, type: "string" }, { name: "amount", required: true, type: "string" }], keyFields: ["vendor"] };

// clean path ⇒ PASS, provenance carried
{
  const docs = [
    { id: "a", format: "kv", content: "vendor: ACME\namount: 100" },
    { id: "b", format: "kv", content: "vendor: Globex\namount: 50" },
  ];
  const r = I.runDocToQuality(docs, { docSchema: { required: ["vendor", "amount"] }, dataSchema });
  check(r.verdict === "PASS", "clean docs ⇒ PASS");
  check(r.stages.p11.records === 2 && r.stages.p4.ok === true && r.stages.p4.metrics !== null, "P11 2 records → P4 metrics computed");
  check(r.provenance.length === 2 && typeof r.provenance[0].contentSha === "string", "provenance carried end-to-end (contentSha)");
}

// incomplete data (missing required 'amount') ⇒ verdict degraded (not PASS)
{
  const docs = [{ id: "a", format: "kv", content: "vendor: ACME\namount: 100" }, { id: "b", format: "kv", content: "vendor: Globex" }];
  const r = I.runDocToQuality(docs, { docSchema: { required: ["vendor"] }, dataSchema });
  check(r.verdict !== "PASS", "a row missing a required field ⇒ verdict degraded (REVIEW/FAIL, not PASS)");
}

// rejected (unsupported) + duplicate docs surfaced
{
  const docs = [
    { id: "a", format: "kv", content: "vendor: ACME\namount: 1" },
    { id: "c", format: "kv", content: "vendor: ACME\namount: 1" }, // duplicate content of a
    { id: "x", format: "pdf", content: "x" },                      // unsupported ⇒ rejected
  ];
  const r = I.runDocToQuality(docs, { docSchema: { required: ["vendor", "amount"] }, dataSchema });
  check(r.stages.p11.duplicates.length === 1 && r.stages.p11.rejected.length === 1, "duplicate + rejected docs surfaced by P11");
  check(r.verdict !== "PASS", "rejected doc present ⇒ verdict not PASS (fail-closed)");
}

// no valid docs ⇒ P4 NO_DATA, verdict degraded
check(I.runDocToQuality([{ id: "x", format: "pdf", content: "y" }], { dataSchema }).stages.p4.ok === false, "all docs rejected ⇒ P4 NO_DATA");

// determinism
check(JSON.stringify(I.runDocToQuality([{ id: "a", format: "kv", content: "vendor: A\namount: 1" }], { dataSchema })) === JSON.stringify(I.runDocToQuality([{ id: "a", format: "kv", content: "vendor: A\namount: 1" }], { dataSchema })), "deterministic integration");

console.log(failures === 0 ? "ALL PASS — WI-INT-21 P11→P4→P6" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

// Module-scope marker (TS2451/TS2588 guard).
export {};
