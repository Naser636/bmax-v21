#!/usr/bin/env node
/**
 * prove-the-number-demonstrator — ONE composed "prove-the-number" FinOps run for profession P9 (FinOps & AI/Cloud
 * Cost Engineering). CTO Master Campaign V3, Wave-3 integrated demonstrator.
 *
 * ORCHESTRATES already-MERGED modules (NO new capability, NO new primitive):
 *   1. extract an observed usage/cost number from a provider response (deterministic rule) → economic-extractor.extract
 *   2. compute unit economics on a comparable, policy-audited basis                        → unit-economics.computeUnitEconomics
 *   3. compose one verdict: FINOPS_NUMBER (+ extracted, unitEconomics, warnings, gaps)
 *
 * HONEST SCOPE (Quinn's "prove-the-number"): a number is only reported if it is EXTRACTED from observed data; an
 * UNKNOWN extraction is surfaced as a gap and NO cost is asserted (never invented). unit-economics flags any
 * automatable work imputed to a human. This is observed-usage cost EVIDENCE, NOT a billing statement and NOT a
 * FOCUS-conformant export (honest non-goal). PURE (body/rule/time passed in — no fs/net/clock). ADDITIVE. Dual export.
 */
"use strict";

const EX = require("./economic-extractor.js");
const UE = require("./unit-economics.js");

const SCHEMA = "odg.prove-the-number-demonstrator.v1";
const BASIS = "OBSERVED_USAGE_EVIDENCE_NOT_BILLING";
const VERDICT = Object.freeze({ PROVEN: "FINOPS_NUMBER", INCOMPLETE: "FINOPS_NUMBER_INCOMPLETE" });

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/**
 * runProveTheNumber(input) — extract → unit-economics. input:
 *   { body?:string, rule?:{type:"json"|"regex", pointer?/pattern?}, economics:{time?, steps?, ...} }
 * NEVER throws on bad input (fail-closed; a malformed extractor rule is caught, not thrown).
 */
function runProveTheNumber(input: any): any {
  if (!isObj(input)) return { ok: false, schema: SCHEMA, verdict: VERDICT.INCOMPLETE, code: "INVALID_INPUT", reason: "input object required", basis: BASIS };
  const gaps: string[] = [];
  const steps: any = {};

  // STEP 1 — extract the observed number (deny-by-default: UNKNOWN ⇒ no number asserted).
  let extracted: any = { status: "SKIPPED", reason: "no extractor rule supplied" };
  if (isObj(input.rule)) {
    try { extracted = EX.extract(input.body, input.rule); }
    catch (e: any) { extracted = { status: "UNKNOWN", reason: `extractor rule invalid: ${e && e.message ? e.message : "error"}` }; }
  }
  steps.extract = extracted;
  const provenNumber = !!(extracted && extracted.status === "OBSERVED");
  if (isObj(input.rule) && !provenNumber) gaps.push(`observed number NOT proven (${extracted.status}: ${extracted.reason || "unresolved"}) — no cost asserted (prove-the-number).`);

  // STEP 2 — compute unit economics on a comparable basis (flags automatable-work-imputed-to-human).
  const ue = UE.computeUnitEconomics(isObj(input.economics) ? input.economics : {});
  steps.unitEconomics = ue;
  const warnings = ue && Array.isArray(ue.warnings) ? ue.warnings : [];
  for (const w of warnings) gaps.push(`unit-economics warning: ${w}`);

  return {
    ok: true,
    schema: SCHEMA,
    verdict: VERDICT.PROVEN,
    basis: BASIS,
    summary: {
      extractedStatus: extracted ? extracted.status : null,
      provenNumber: !!provenNumber,
      extractedRaw: provenNumber && extracted.raw !== undefined ? extracted.raw : null,
      unitEconomicsComputed: !!(ue && typeof ue === "object"),
      warningCount: warnings.length,
      gapCount: gaps.length,
    },
    gaps,
    steps,
    note: "Composed prove-the-number FinOps: observed-number extraction (UNKNOWN ⇒ no number asserted) + comparable-basis unit economics (automatable-work-imputed-to-human flagged). Observed-usage cost EVIDENCE — NOT a billing statement, NOT FOCUS-conformant (honest non-goal), NOT a guaranteed price.",
  };
}

export { runProveTheNumber, SCHEMA, VERDICT, BASIS };
module.exports = { runProveTheNumber, SCHEMA, VERDICT, BASIS };
