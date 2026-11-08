#!/usr/bin/env node
"use strict";

/*
 * WI-P11-16 — document-pipeline. Locks: ingest validation (format/empty), kv/csv/text extraction, structure
 * required-field check, provenance (sourceDocId+contentSha), rejection of invalid/incomplete docs, dedup by
 * contentSha, inverted index + AND search, determinism. Synthetic docs; pure.
 * Run: node_modules/.bin/tsx runtime/core/document-pipeline.test.ts
 */
const assert = require("assert");
const P = require("./document-pipeline");

let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }

console.log("WI-P11-16 — DOCUMENT PIPELINE");

// ingest validation
check(P.ingest({ id: "d", format: "kv", content: "a: 1" }).ok === true, "valid kv doc ⇒ ingested with contentSha");
check(P.ingest({ id: "d", format: "pdf", content: "x" }).code === "UNSUPPORTED_FORMAT", "unsupported format ⇒ rejected (no OCR claim)");
check(P.ingest({ id: "d", format: "kv", content: "  " }).code === "EMPTY_CONTENT", "empty content ⇒ rejected");
check(P.ingest({ format: "kv", content: "a:1" }).code === "INVALID_DOC", "missing id ⇒ rejected");

// extraction
check(JSON.stringify(P.extract({ format: "kv", content: "name: ACME\namount: 10" }).fields) === JSON.stringify({ name: "ACME", amount: "10" }), "kv extraction");
check(P.extract({ format: "csv", content: "a,b\n1,2" }).fields.b === "2", "csv extraction (header+row)");
check(P.extract({ format: "text", content: "hello" }).fields.text === "hello", "text extraction");

// structure (required fields)
check(P.structure({ name: "x" }, { required: ["name", "amount"] }).code === "INCOMPLETE", "missing required ⇒ INCOMPLETE");
check(JSON.stringify(P.structure({ name: "x" }, { required: ["name", "amount"] }).missing) === JSON.stringify(["amount"]), "names the missing field");
check(P.structure({ name: "x", amount: "1" }, { required: ["name"] }).ok === true, "all required present ⇒ ok");

// processDocument + provenance
{
  const r = P.processDocument({ id: "inv1", format: "kv", content: "vendor: ACME\ntotal: 100" }, { required: ["vendor"] });
  check(r.ok && r.provenance.sourceDocId === "inv1" && typeof r.provenance.contentSha === "string" && r.provenance.extractedFields.includes("vendor"), "processDocument ⇒ record + provenance (sourceDocId+contentSha+fields)");
  const bad = P.processDocument({ id: "inv2", format: "kv", content: "total: 100" }, { required: ["vendor"] });
  check(bad.ok === false && bad.stage === "structure" && bad.code === "INCOMPLETE", "incomplete doc rejected at structure stage with trace");
}

// runPipeline: dedup + index + search over synthetic docs
{
  const docs = [
    { id: "a", format: "kv", content: "vendor: ACME\ncity: Paris" },
    { id: "b", format: "kv", content: "vendor: Globex\ncity: Paris" },
    { id: "c", format: "kv", content: "vendor: ACME\ncity: Paris" }, // duplicate content of a
    { id: "d", format: "pdf", content: "x" },                        // rejected (unsupported)
  ];
  const res = P.runPipeline(docs);
  check(res.records.length === 2 && res.duplicates.length === 1 && res.rejected.length === 1, "pipeline: 2 records, 1 duplicate (by contentSha), 1 rejected");
  check(res.duplicates[0].id === "c" && res.duplicates[0].duplicateOf === "a", "duplicate c flagged as duplicateOf a");
  check(JSON.stringify(P.search(res.index, "paris")) === JSON.stringify(["a", "b"]), "search 'paris' ⇒ [a,b]");
  check(JSON.stringify(P.search(res.index, "acme paris")) === JSON.stringify(["a"]), "AND search 'acme paris' ⇒ [a]");
  check(P.search(res.index, "nope").length === 0, "search miss ⇒ []");
}

// determinism
check(JSON.stringify(P.runPipeline([{ id: "a", format: "kv", content: "k: v" }])) === JSON.stringify(P.runPipeline([{ id: "a", format: "kv", content: "k: v" }])), "deterministic pipeline");

console.log(failures === 0 ? "ALL PASS — WI-P11-16 DOCUMENT PIPELINE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

// Module-scope marker (TS2451/TS2588 guard).
export {};
