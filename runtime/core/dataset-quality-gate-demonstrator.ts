#!/usr/bin/env node
/**
 * dataset-quality-gate-demonstrator — ONE composed data-quality gate run for profession P4 (Data Engineering &
 * Database Systems). CTO Master Campaign V3, Wave-3 integrated demonstrator.
 *
 * ORCHESTRATES already-MERGED modules (NO new capability, NO new primitive):
 *   1. assess a dataset against a declared schema (completeness/validity/uniqueness) → dataset-quality-service.assessDataset
 *   2. emit an annotated SARIF log (assertionType FORWARDED — closes the G-04 note)   → dataset-quality-assertions.toSarifFromDatasetQuality
 *   3. report assertion-type coverage (implemented vs not-yet)                         → dataset-quality-assertions.coverage
 *   4. compose one verdict: DATASET_QUALITY_GATED (+ completeness, findingCount, sarifValid, gate, gaps)
 *
 * HONEST SCOPE: this is data-quality EVIDENCE over the supplied records+schema, NOT a correctness/fitness
 * guarantee and NOT a fairness assessment (fairness needs an independently-labelled set — owner-gated OG-03).
 * FAIL-CLOSED: any finding ⇒ gate "REVIEW"/"FAIL"; completeness < 1 ⇒ gap. PURE (records+schema passed in — no
 * fs/net/clock). ADDITIVE. Dual export.
 */
"use strict";

const DQS = require("./dataset-quality-service.js");
const DQA = require("./dataset-quality-assertions.js");
const SARIF = require("./sarif-report.js");

const SCHEMA = "odg.dataset-quality-gate-demonstrator.v1";
const BASIS = "DATA_QUALITY_EVIDENCE_NOT_FITNESS_GUARANTEE";
const VERDICT = Object.freeze({ GATED: "DATASET_QUALITY_GATED", INCOMPLETE: "DATASET_QUALITY_INCOMPLETE" });

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/**
 * runDatasetQualityGate(input) — assess → SARIF → coverage → gate. input:
 *   { records:[{...}] | csv:string, schema:{fields:[{name,required,type}], keyFields?}, failOnFinding?:bool }
 * NEVER throws on bad input (fail-closed).
 */
function runDatasetQualityGate(input: any): any {
  if (!isObj(input)) return { ok: false, schema: SCHEMA, verdict: VERDICT.INCOMPLETE, code: "INVALID_INPUT", reason: "input object required", basis: BASIS };
  const gaps: string[] = [];
  const steps: any = {};

  // STEP 1 — assess the dataset against the declared schema.
  const dq = DQS.assessDataset(input);
  steps.assess = dq;
  if (!dq.ok) {
    gaps.push(`dataset assessment failed: ${dq.code} (${dq.reason}).`);
    return { ok: true, schema: SCHEMA, verdict: VERDICT.INCOMPLETE, basis: BASIS, summary: { assessed: false, gate: "FAIL", gapCount: gaps.length }, gaps, steps, note: "No assessment ⇒ no quality evidence (fail-closed)." };
  }
  const report = dq.report || {};
  const findings = Array.isArray(report.findings) ? report.findings : [];
  const completeness = report.metrics && typeof report.metrics.completeness === "number" ? report.metrics.completeness : null;
  if (completeness !== null && completeness < 1) gaps.push(`completeness ${completeness} < 1 — required cells missing.`);
  if (findings.length > 0) gaps.push(`${findings.length} data-quality finding(s) (completeness/validity/uniqueness) require review.`);

  // STEP 2 — annotated SARIF (assertionType forwarded).
  const sarifRes = DQA.toSarifFromDatasetQuality(dq);
  steps.sarif = sarifRes;
  const sarifValid = !!(sarifRes && sarifRes.ok && SARIF.isValidSarif(sarifRes.sarif));
  if (!sarifValid) gaps.push("SARIF emission invalid.");

  // STEP 3 — assertion-type coverage (implemented vs not-yet-implemented).
  const cov = DQA.coverage();
  steps.coverage = cov;

  // STEP 4 — gate. CRITICAL: PASS must mean "data was assessed AND is clean", NOT merely "no finding emitted".
  // A gate that keys only on findings.length would falsely PASS an empty dataset / all-non-object rows / a
  // malformed schema (nothing actually checked). Guard by the caller's expected outcome, not the self-report.
  const rowCount = typeof report.rowCount === "number" ? report.rowCount : 0;
  const dropped = typeof report.droppedNonObjectRows === "number" ? report.droppedNonObjectRows : 0;
  const schemaApplied = !!(isObj(input.schema) && Array.isArray(input.schema.fields) && input.schema.fields.length > 0);
  const nothingAssessed = rowCount === 0 || !schemaApplied;
  if (nothingAssessed) gaps.push("no data actually assessed (zero rows or no schema fields applied) — gate cannot PASS.");
  if (dropped > 0) gaps.push(`${dropped} non-object row(s) dropped (not assessed) — partial coverage.`);
  let gate: string;
  if (findings.length > 0) gate = input.failOnFinding === true ? "FAIL" : "REVIEW";
  else if (nothingAssessed || dropped > 0 || report.clean !== true) gate = "REVIEW"; // NOT a clean PASS — nothing/partial assessed
  else gate = "PASS";

  return {
    ok: true,
    schema: SCHEMA,
    verdict: VERDICT.GATED,
    basis: BASIS,
    summary: {
      assessed: true,
      records: typeof report.rowCount === "number" ? report.rowCount : null,
      clean: report.clean === true,
      completeness,
      findingCount: findings.length,
      sarifValid,
      sarifResultCount: sarifRes && typeof sarifRes.resultCount === "number" ? sarifRes.resultCount : null,
      assertionCoverage: cov && typeof cov === "object" ? cov : null,
      gate,
      gapCount: gaps.length,
    },
    gaps,
    steps,
    note: "Composed data-quality gate: schema-driven assessment → annotated SARIF (assertionType forwarded) → coverage → gate. Data-quality EVIDENCE over the supplied records+schema — NOT a correctness/fitness guarantee, NOT fairness (owner-gated). gate=FAIL only when failOnFinding is requested and a finding exists; REVIEW surfaces findings without failing a build by default.",
  };
}

export { runDatasetQualityGate, SCHEMA, VERDICT, BASIS };
module.exports = { runDatasetQualityGate, SCHEMA, VERDICT, BASIS };
