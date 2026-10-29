#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the Documents/Data capability computes REAL quality metrics over a real dataset
// (CSV + JSON), with exact deterministic values, severity findings, and honest fail-closed behaviour: an empty dataset
// scores NO_DATA (null) NOT a fabricated 100 (the bug in the existing stub), unparseable input errors, a clean dataset
// scores 1.0, and without a schema only uniqueness is computed. Pure/deterministic.
"use strict";
const assert = require("assert");
const D = require("./dataset-quality-service.js");
const SARIF = require("./sarif-report.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const schema = { fields: [{ name: "id", type: "integer", required: true }, { name: "email", type: "email", required: true }], keyFields: ["id"] };

// (1) REAL CSV with a known missing cell, a bad email, and a duplicate id ⇒ exact computed metrics.
{
  const csv = "id,email\n1,a@b.com\n2,\n1,bad\n";   // 3 rows: row2 email missing; row3 email invalid + id dup of row1
  const r = D.assessDataset({ format: "csv", content: csv, schema });
  const m = r.report.metrics;
  ok("CSV assessed: completeness 0.833, validity 0.667, uniqueness 0.667, overall 0.733 (real computed)",
     r.ok && m.completeness === 0.833 && m.validity === 0.667 && m.uniqueness === 0.667 && m.overallScore === 0.733);
  ok("findings surface missing-required (HIGH), type-violation (MEDIUM), duplicate (MEDIUM)",
     r.report.findings.some((f) => f.area === "completeness" && f.severity === "HIGH") &&
     r.report.findings.some((f) => f.area === "validity") && r.report.findings.some((f) => f.area === "uniqueness") &&
     r.report.dedup.duplicates === 1);
}
// (2) JSON records form, equivalent data ⇒ same metrics (format-agnostic).
{
  const r = D.assessDataset({ format: "json", content: JSON.stringify([{ id: 1, email: "a@b.com" }, { id: 2, email: "" }, { id: 1, email: "bad" }]), schema });
  ok("JSON ingestion yields the same exact metrics as CSV", r.report.metrics.completeness === 0.833 && r.report.metrics.validity === 0.667 && r.report.metrics.uniqueness === 0.667);
}
// (3) a CLEAN dataset ⇒ overallScore 1.0, 0 findings, clean=true.
{
  const r = D.assessDataset({ format: "records", records: [{ id: 1, email: "a@b.com" }, { id: 2, email: "c@d.com" }], schema });
  ok("clean dataset ⇒ overallScore 1, 0 findings, clean=true", r.report.metrics.overallScore === 1 && r.report.findingCount === 0 && r.report.clean === true);
}
// (4) HONESTY: an EMPTY dataset ⇒ NO_DATA (null) metrics, clean=false — NEVER a fabricated 100 (the stub's bug).
{
  const r = D.assessDataset({ format: "records", records: [] });
  ok("empty dataset ⇒ overallScore null (NO_DATA), not 100; clean=false", r.ok && r.report.rowCount === 0 && r.report.metrics.overallScore === null && r.report.clean === false);
}
// (5) fail-closed on unparseable / invalid input.
{
  ok("bad JSON ⇒ PARSE_ERROR; non-array JSON ⇒ PARSE_ERROR; missing content ⇒ INVALID_INPUT",
     D.assessDataset({ format: "json", content: "{not json" }).code === "PARSE_ERROR" &&
     D.assessDataset({ format: "json", content: "{\"a\":1}" }).code === "PARSE_ERROR" &&
     D.assessDataset({ format: "csv" }).code === "INVALID_INPUT");
}
// (6) no schema ⇒ only uniqueness is computed (completeness/validity null — not invented).
{
  const r = D.assessDataset({ format: "records", records: [{ a: 1 }, { a: 1 }, { a: 2 }] });
  ok("no schema ⇒ completeness/validity null, uniqueness computed (0.667), 1 duplicate finding",
     r.report.metrics.completeness === null && r.report.metrics.validity === null && r.report.metrics.uniqueness === 0.667 && r.report.dedup.duplicates === 1);
}
// (7) unknown declared type carries NO validity constraint (honest — not silently pass/fail).
{
  const r = D.assessDataset({ format: "records", records: [{ x: "anything" }], schema: { fields: [{ name: "x", type: "currency-xyz" }] } });
  ok("unknown declared type ⇒ no type-violation invented (validity 1 over the typed cell)", r.report.metrics.validity === 1 && r.report.findings.every((f) => f.area !== "validity"));
}
// (8) findings emit valid SARIF 2.1.0 (same interoperable pipe).
{
  const r = D.assessDataset({ format: "csv", content: "id,email\n1,a@b.com\n2,\n1,bad\n", schema });
  const s = SARIF.toSarif({ ok: true, project: "dataset", findings: r.report.findings }, { toolName: "ODG-Data-Quality", version: "1" });
  ok("data-quality findings ⇒ valid SARIF 2.1.0 (completeness HIGH→error)", s.ok && SARIF.isValidSarif(s.sarif) && s.sarif.runs[0].results.some((x) => x.level === "error"));
}
// (9) CSV with quoted fields containing commas/newlines parses correctly.
{
  const csv = 'id,note\n1,"a, b"\n2,"line1\nline2"\n';
  const r = D.assessDataset({ format: "csv", content: csv, schema: { fields: [{ name: "id", type: "integer", required: true }] } });
  ok("quoted CSV (embedded comma + newline) ⇒ 2 rows parsed, complete", r.report.rowCount === 2 && r.report.metrics.completeness === 1);
}

console.log(`\nDATASET-QUALITY-SERVICE suite — ${pass} assertions passed. (real computed completeness/validity/uniqueness; empty⇒NO_DATA not 100; fail-closed parse; no-schema⇒uniqueness-only; unknown type⇒no invented constraint; valid SARIF; quoted CSV)`);
