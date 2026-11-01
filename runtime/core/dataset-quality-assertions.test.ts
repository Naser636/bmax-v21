#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves dataset-quality-assertions (G-04): an enumerable dbt-style
// assertion-type registry over dataset-quality-service + a SARIF adapter that REUSES sarif-report.toSarif.
// Honest: NOT_YET_IMPLEMENTED types declared as GAPS (not silent passes); fail-closed SARIF adapter
// (non-ok input ⇒ INVALID_INPUT); real dataset-quality findings emit a VALID SARIF log with assertionType
// annotations. Additive — does not modify dataset-quality-service or sarif-report.
"use strict";
const assert = require("assert");
const A = require("./dataset-quality-assertions.js");
const DQ = require("./dataset-quality-service.js");
const SARIF = require("./sarif-report.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const schema = { fields: [{ name: "id", type: "integer", required: true }, { name: "email", type: "email", required: true }], keyFields: ["id"] };
const dq = DQ.assessDataset({ format: "csv", content: "id,email\n1,a@b.com\n2,\n1,bad\n", schema }); // missing + bad + dup

// (1) enumerable registry: implemented types + honest NOT_YET_IMPLEMENTED gaps, frozen.
{
  ok("ASSERTION_TYPES is a non-empty frozen array", Array.isArray(A.ASSERTION_TYPES) && A.ASSERTION_TYPES.length >= 6 && Object.isFrozen(A.ASSERTION_TYPES));
  const cov = A.coverage();
  ok("implemented includes required_not_missing/type_valid/unique/accepted_values/range_min_max/pattern_match",
     ["required_not_missing", "type_valid", "unique", "accepted_values", "range_min_max", "pattern_match"].every((t) => cov.implemented.includes(t)));
  ok("gaps declared explicitly (freshness/distribution/volume/relationships) — not silent passes",
     ["freshness", "distribution", "volume", "relationships"].every((t) => cov.notYetImplemented.includes(t)) && /not silently-passing/.test(cov.note));
}

// (2) assertionTypeOf maps a dataset-quality finding by area to a named type; unknown ⇒ null (honest).
{
  const byArea = {};
  for (const f of dq.report.findings) byArea[f.area] = A.assertionTypeOf(f);
  ok("completeness finding ⇒ required_not_missing", byArea["completeness"] === "required_not_missing");
  ok("validity finding ⇒ type_valid", byArea["validity"] === "type_valid");
  ok("uniqueness finding ⇒ unique", byArea["uniqueness"] === "unique");
  ok("an unknown-area finding ⇒ null (not fabricated)", A.assertionTypeOf({ area: "freshness", id: "freshness:x" }) === null && A.assertionTypeOf(null) === null);
}

// (3) SARIF adapter: real dataset-quality findings ⇒ a VALID SARIF 2.1.0 log, delegating to sarif-report.
// toSarif returns a WRAPPER { ok, sarif, resultCount, ruleCount, truncated } — the log is under .sarif.
{
  const res = A.toSarifFromDatasetQuality(dq);
  ok("ok wrapper with a valid SARIF log under .sarif (reuses sarif-report.toSarif)", res.ok === true && SARIF.isValidSarif(res.sarif) === true);
  ok("one SARIF result per dataset-quality finding", res.resultCount === dq.report.findings.length && res.sarif.runs[0].results.length === dq.report.findings.length);
  ok("source report.findings NOT mutated (annotation applied on a copy)", typeof dq.report.findings[0].assertionType === "undefined");
}

// (4) FAIL-CLOSED: non-ok / findings-less inputs ⇒ INVALID_INPUT (never a hollow empty SARIF).
{
  ok("non-ok dataset-quality result ⇒ INVALID_INPUT", A.toSarifFromDatasetQuality({ ok: false }).code === "INVALID_INPUT");
  ok("ok but no report.findings ⇒ INVALID_INPUT", A.toSarifFromDatasetQuality({ ok: true, report: {} }).code === "INVALID_INPUT");
  ok("null ⇒ INVALID_INPUT", A.toSarifFromDatasetQuality(null).code === "INVALID_INPUT");
}

// (5) a CLEAN dataset (no findings) ⇒ a valid, EMPTY-results SARIF (honest: zero findings, not an error).
{
  const clean = DQ.assessDataset({ format: "csv", content: "id,email\n1,a@b.com\n2,c@d.com\n", schema });
  const res = A.toSarifFromDatasetQuality(clean);
  ok("clean dataset ⇒ valid SARIF with zero results", res.ok === true && SARIF.isValidSarif(res.sarif) === true && res.sarif.runs[0].results.length === 0 && res.resultCount === 0);
}

console.log(`\ndataset-quality-assertions: ${pass} assertions passed`);
