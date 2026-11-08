// @ts-nocheck
// dataset-quality-gate-demonstrator — assess→SARIF→coverage→gate composition. A clean dataset ⇒ gate PASS,
// 0 findings; a dataset with a missing required cell ⇒ findings + completeness<1 + gate REVIEW (FAIL when
// failOnFinding); SARIF valid; assertion coverage surfaced; honesty/determinism/bad-input fail-closed.
"use strict";
const assert = require("assert");
const D = require("./dataset-quality-gate-demonstrator.js");

let n = 0; const ok = (name, cond) => { n++; assert.ok(cond, name); };
const schema = { fields: [{ name: "id", required: true, type: "string" }, { name: "name", required: true, type: "string" }], keyFields: ["id"] };
const cleanDs = { records: [{ id: "1", name: "a" }, { id: "2", name: "b" }], schema };
const dirtyDs = { records: [{ id: "1", name: "a" }, { id: "2", name: "" }], schema };

// (1) clean dataset ⇒ gate PASS, 0 findings, completeness 1.
(() => {
  const r = D.runDatasetQualityGate(cleanDs);
  ok("clean: verdict GATED", r.ok && r.verdict === D.VERDICT.GATED);
  ok("clean: gate PASS, 0 findings", r.summary.gate === "PASS" && r.summary.findingCount === 0);
  ok("clean: completeness 1, clean true", r.summary.completeness === 1 && r.summary.clean === true);
  ok("clean: SARIF valid", r.summary.sarifValid === true);
})();

// (2) dirty dataset ⇒ findings + completeness<1 + gate REVIEW (default).
(() => {
  const r = D.runDatasetQualityGate(dirtyDs);
  ok("dirty: findings > 0", r.summary.findingCount > 0);
  ok("dirty: completeness < 1", r.summary.completeness !== null && r.summary.completeness < 1);
  ok("dirty: gate REVIEW (default, not FAIL)", r.summary.gate === "REVIEW");
  ok("dirty: a completeness gap reported", r.gaps.some((g) => /completeness/i.test(g)));
})();

// (3) failOnFinding ⇒ gate FAIL (CI-breaking).
(() => {
  const r = D.runDatasetQualityGate({ ...dirtyDs, failOnFinding: true });
  ok("failOnFinding: gate FAIL", r.summary.gate === "FAIL");
})();

// (4) SARIF validity + assertion coverage surfaced (implemented vs not-yet).
(() => {
  const r = D.runDatasetQualityGate(dirtyDs);
  ok("coverage: implemented + notYetImplemented present", r.summary.assertionCoverage && Array.isArray(r.summary.assertionCoverage.implemented) && Array.isArray(r.summary.assertionCoverage.notYetImplemented));
  ok("coverage: sarifResultCount matches findings", r.summary.sarifResultCount === r.summary.findingCount);
})();

// (5) assessment failure ⇒ INCOMPLETE, gate FAIL.
(() => {
  const r = D.runDatasetQualityGate({ records: "not-an-array", schema });
  ok("bad-dataset: INCOMPLETE or assessed false", r.verdict === D.VERDICT.INCOMPLETE || r.summary.assessed === false);
})();

// (5b) NOTHING-ASSESSED must NEVER PASS (gate guards the caller's outcome, not findings.length===0):
//      empty records, all-non-object rows, and a malformed schema each ⇒ gate !== PASS + a gap.
(() => {
  const empty = D.runDatasetQualityGate({ records: [], schema });
  ok("empty: gate not PASS", empty.summary.gate !== "PASS");
  ok("empty: a nothing-assessed gap reported", empty.gaps.some((g) => /no data actually assessed/i.test(g)));
  const junk = D.runDatasetQualityGate({ records: [1, 2, 3], schema });
  ok("all-junk rows: gate not PASS (dropped, nothing assessed)", junk.summary.gate !== "PASS");
  const noSchema = D.runDatasetQualityGate({ records: [{ id: "1", name: "a" }], schema: "nope" });
  ok("malformed schema: gate not PASS (no constraints applied)", noSchema.summary.gate !== "PASS");
  ok("malformed schema: a nothing-assessed gap reported", noSchema.gaps.some((g) => /no data actually assessed/i.test(g)));
})();

// (5c) completeness ≠ validity: a FILLED-but-wrong-type required cell keeps completeness=1 while a finding
//      appears (validity drops) — pins that the demonstrator reports completeness, not some other metric.
(() => {
  const typed = { records: [{ id: "1", name: "a" }, { id: "2", name: 123 }], schema };
  const r = D.runDatasetQualityGate(typed);
  ok("type-violation: completeness stays 1 (both name cells filled)", r.summary.completeness === 1);
  ok("type-violation: a finding appears (validity < completeness)", r.summary.findingCount > 0 && r.summary.gate !== "PASS");
})();

// (6) HONESTY + bad-input + determinism.
(() => {
  const r = D.runDatasetQualityGate(dirtyDs);
  ok("honesty: basis DATA_QUALITY_EVIDENCE_NOT_FITNESS_GUARANTEE", r.basis === "DATA_QUALITY_EVIDENCE_NOT_FITNESS_GUARANTEE");
  ok("honesty: note disclaims fitness + fairness", /NOT a correctness\/fitness guarantee/i.test(r.note) && /NOT fairness/i.test(r.note));
  ok("bad-input: non-object ⇒ INVALID_INPUT", D.runDatasetQualityGate(null).code === "INVALID_INPUT");
  const a = D.runDatasetQualityGate(dirtyDs); const b = D.runDatasetQualityGate(dirtyDs);
  ok("determinism: identical gate + findingCount", a.summary.gate === b.summary.gate && a.summary.findingCount === b.summary.findingCount);
})();

console.log(`dataset-quality-gate-demonstrator: ${n} checks passed`);
