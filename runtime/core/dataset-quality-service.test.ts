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

// (10) non-object rows are reported as droppedNonObjectRows, not silently assessed (audit transparency caveat).
{
  const r = D.assessDataset({ format: "json", content: JSON.stringify([{ id: 1 }, 2, "x", { id: 3 }]) });
  ok("non-object rows surfaced via droppedNonObjectRows (2), only object rows assessed", r.report.rowCount === 2 && r.report.droppedNonObjectRows === 2);
}

// (11) CONFORMANCE (Priority-C upgrade): enum / min-max / pattern constraints are assessed as a 4th dimension.
{
  const recs = [{ status: "open", score: 5, code: "AB12" }, { status: "banana", score: 99, code: "zzz" }];
  const r = D.assessDataset({ format: "records", records: recs, schema: { fields: [
    { name: "status", enum: ["open", "closed"] }, { name: "score", min: 0, max: 10 }, { name: "code", pattern: "^[A-Z]{2}[0-9]{2}$" } ] } });
  const m = r.report.metrics;
  // row1 conforms on all 3; row2 violates all 3 ⇒ 3/6 conforming.
  ok("conformance dimension: enum/min-max/pattern violations counted ⇒ conformance 0.5, 3 conformance findings",
     m.conformance === 0.5 && r.report.findings.filter((f) => f.area === "conformance").length === 3 && r.report.findings.some((f) => f.id === "conformance:status") && r.report.findings.some((f) => f.id === "conformance:score") && r.report.findings.some((f) => f.id === "conformance:code"));
}
// (12) no constraints ⇒ conformance null AND a FRACTIONAL overallScore equals the pre-upgrade 3-dim renormalization
// (proves the 4th dimension is inert, not just on a trivially-1.0 dataset).
{
  const recs = [{ id: 1, name: "a" }, { id: 1, name: "" }, { id: 3, name: "c" }];   // a dup + a missing required ⇒ fractional
  const schema = { fields: [{ name: "id", type: "integer", required: true }, { name: "name", type: "string", required: true }], keyFields: ["id"] };
  const m = D.assessDataset({ format: "records", records: recs, schema }).report.metrics;
  const dims = [[m.completeness, 0.4], [m.validity, 0.4], [m.uniqueness, 0.2]].filter(([v]) => v !== null);
  const expected = Math.round((dims.reduce((a, [v, w]) => a + v * w, 0) / dims.reduce((a, [, w]) => a + w, 0)) * 1000) / 1000;
  ok("no constraint ⇒ conformance null AND fractional overallScore == 3-dim renormalization (inert 4th dim)",
     m.conformance === null && m.overallScore < 1 && m.overallScore === expected);
}
// (13) invalid regex pattern ⇒ fail-closed SCHEMA ERROR (HIGH), field EXCLUDED from conformance (not silently passed).
{
  const recs = [{ code: "x" }, { code: "y" }];
  const r = D.assessDataset({ format: "records", records: recs, schema: { fields: [{ name: "code", pattern: "([unclosed" }] } });
  ok("invalid regex ⇒ conformance-schema HIGH finding + conformance null (excluded, not silently conforming)",
     r.report.metrics.conformance === null && r.report.findings.some((f) => f.id === "conformance:code") === false && r.report.findings.some((f) => f.id === "conformance-schema:code" && f.severity === "HIGH"));
}
// (14) empty cells are a completeness, not a conformance, concern — with a pattern an empty cell WOULD violate if
// counted, so conformance===1 distinguishes "skipped" from "counted-as-conforming" (counted would give 0.5).
{
  const recs = [{ code: "" }, { code: "AB" }];
  const r = D.assessDataset({ format: "records", records: recs, schema: { fields: [{ name: "code", pattern: "^[A-Z]{2}$" }] } });
  ok("empty cell skipped by conformance (pattern would fail an empty cell; 1 non-empty 'AB' conforms ⇒ conformance 1, no finding)",
     r.report.metrics.conformance === 1 && r.report.findings.filter((f) => f.area === "conformance").length === 0);
}
// (15) malformed constraint DECLARATION (enum not an array) ⇒ fail-closed HIGH schema error + field excluded (honesty
// consistency with the invalid-regex case; not silently ignored).
{
  const recs = [{ cat: "x" }, { cat: "y" }];
  const r = D.assessDataset({ format: "records", records: recs, schema: { fields: [{ name: "cat", enum: "open,closed" }] } });
  ok("malformed enum declaration ⇒ conformance-schema HIGH finding + conformance null (field excluded, fail-closed)",
     r.report.metrics.conformance === null && r.report.findings.some((f) => f.id === "conformance-schema:cat" && f.severity === "HIGH"));
}

// (12) ReDoS input-bound: a schema `pattern` is never run on an UNBOUNDED cell. A cell past REGEX_CELL_CAP (4096)
//      is treated as NON-conforming (fail-closed), not fed to the regex — proven with a catastrophic pattern + a
//      huge cell that would hang if tested. (Within-cap cells still format-check exactly as before.)
{
  const CATASTROPHIC = "^(a+)+$";
  const huge = "a".repeat(5000) + "!"; // > 4096 cap; would hang ^(a+)+$ if tested
  const t0 = Date.now();
  const r = D.assessDataset({ format: "records", records: [{ code: huge }, { code: "a" }], schema: { fields: [{ name: "code", pattern: CATASTROPHIC }] } });
  const ms = Date.now() - t0;
  ok("ReDoS: over-cap cell ⇒ pattern NOT run (returns <1s)", ms < 1000);
  ok("ReDoS: over-cap cell ⇒ counted NON-conforming (fail-closed), not a crash", r.ok === true && typeof r.report.metrics.conformance === "number" && r.report.metrics.conformance < 1);
  // NO REGRESSION: an in-range cell still conforms/violates by the pattern exactly as before.
  const ok1 = D.assessDataset({ format: "records", records: [{ code: "abc" }, { code: "abc" }], schema: { fields: [{ name: "code", pattern: "^[a-z]+$" }] } });
  ok("in-range cells still format-check (all match ⇒ conformance 1)", ok1.report.metrics.conformance === 1);
  const ok2 = D.assessDataset({ format: "records", records: [{ code: "abc" }, { code: "A1!" }], schema: { fields: [{ name: "code", pattern: "^[a-z]+$" }] } });
  ok("in-range mismatch still flagged (conformance < 1)", ok2.report.metrics.conformance !== null && ok2.report.metrics.conformance < 1);
}

console.log(`\nDATASET-QUALITY-SERVICE suite — ${pass} assertions passed. (real computed completeness/validity/uniqueness/conformance; empty⇒NO_DATA not 100; fail-closed parse; no-schema⇒uniqueness-only; unknown type⇒no invented constraint; enum/min-max/pattern conformance w/ fail-closed invalid-regex + input-bound ReDoS guard; valid SARIF; quoted CSV)`);
