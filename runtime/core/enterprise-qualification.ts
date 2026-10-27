#!/usr/bin/env node
/**
 * enterprise-qualification — axis C (CTO V27): an actionable enterprise qualification checklist that produces a
 * QUALIFIED | DISQUALIFIED | INCOMPLETE verdict from a prospect record, plus the next action and the matching
 * commercial-pipeline stage. Composes commercial-pipeline (STAGES) and feeds the pipeline / portfolio view.
 *
 * HONESTY (mandate): an ESTIMATED win-probability is an explicit ASSUMPTION — kept SEPARATE from observed
 * conversion, which is NO_DATA until real outcomes exist (never invented). A QUALIFIED verdict means "worth
 * pursuing per the recorded facts", NOT a won deal, a confirmed budget, or a customer commitment. Nothing here
 * invents a prospect, a response, a budget, or a signature. Fail-closed: a missing REQUIRED dimension ⇒
 * INCOMPLETE (never QUALIFIED); an explicit disqualifier ⇒ DISQUALIFIED. Pure/deterministic.
 */
"use strict";

const CP = require("./commercial-pipeline.js");

// BANT + MEDDPICC-flavoured dimensions. `required` ones gate QUALIFIED; some carry explicit disqualifiers.
const DIMENSIONS: ReadonlyArray<{ key: string; required: boolean; label: string }> = Object.freeze([
  { key: "problem", required: true, label: "business problem" },
  { key: "impact", required: true, label: "measurable impact" },
  { key: "budget", required: true, label: "budget range + funding status" },
  { key: "authority", required: true, label: "economic buyer / decision authority" },
  { key: "timeline", required: true, label: "timeline" },
  { key: "deliveryCapacity", required: true, label: "delivery capacity / expertise" },
  { key: "acceptanceCriteria", required: true, label: "acceptance criteria" },
  { key: "urgency", required: false, label: "urgency" },
  { key: "procurement", required: false, label: "procurement process" },
  { key: "complianceNeeds", required: false, label: "security/compliance/privacy/evidence needs" },
  { key: "paymentMilestones", required: false, label: "payment milestones" },
  { key: "contractualConstraints", required: false, label: "contractual constraints" },
]);
const REQUIRED = DIMENSIONS.filter((d) => d.required).map((d) => d.key);

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function present(v: any): boolean {
  if (v === undefined || v === null || v === false) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (isObj(v)) return Object.keys(v).length > 0;
  return true;
}
function r2(x: number): number { return Math.round(x * 100) / 100; }

/** disqualifiers(record): explicit, evidence-based reasons to stop (no budget / no authority / flagged out). */
function disqualifiers(record: any): string[] {
  const out: string[] = [];
  const b = record.budget;
  if (isObj(b) && typeof b.status === "string" && /^(none|no[_-]?budget|unfunded)$/i.test(b.status)) out.push("no budget / unfunded");
  const a = record.authority;
  if (a === false || (isObj(a) && a.identified === false)) out.push("no economic buyer / decision authority identified");
  if (record.disqualified === true) out.push("explicitly disqualified (recorded)");
  return out;
}

/**
 * qualify(record, opts?): verdict + missing dimensions + disqualifiers + next action + ESTIMATED probability
 * (assumption) + pipeline stage. Returns fail-closed { ok:false, code } on bad input.
 */
function qualify(record: any, opts: any = {}): any {
  if (!isObj(record)) return { ok: false, code: "INVALID_INPUT", detail: "prospect record object required" };
  const coverage: Record<string, boolean> = {};
  for (const d of DIMENSIONS) coverage[d.key] = present(record[d.key]);
  const missingRequired = REQUIRED.filter((k) => !coverage[k]);
  const disq = disqualifiers(record);

  let verdict: string, nextAction: string;
  if (disq.length) { verdict = "DISQUALIFIED"; nextAction = `disqualify / nurture: ${disq.join("; ")}`; }
  else if (missingRequired.length) { verdict = "INCOMPLETE"; nextAction = `gather missing required facts: ${missingRequired.map((k) => DIMENSIONS.find((d) => d.key === k)!.label).join(", ")}`; }
  else { verdict = "QUALIFIED"; nextAction = "prepare proposal (proposal-generator) + advance commercial-pipeline to QUALIFIED; price via enterprise-mission-model (scope-justified)"; }

  // ESTIMATED win-probability (ASSUMPTION): coverage-weighted, ONLY for a QUALIFIED record; never for DISQUALIFIED/
  // INCOMPLETE. This is NOT an observed conversion rate (that is NO_DATA until real outcomes exist).
  const coveredCount = DIMENSIONS.filter((d) => coverage[d.key]).length;
  const estimatedProbability = verdict === "QUALIFIED" ? r2(0.1 + 0.3 * (coveredCount / DIMENSIONS.length)) : 0;

  const stageIndex = CP.STAGES.indexOf("QUALIFIED");
  const pipelineStage = verdict === "QUALIFIED" ? "QUALIFIED" : null;

  return {
    ok: true,
    verdict,
    coverage,
    missingRequired,
    disqualifiers: disq,
    nextAction,
    pipelineStage,
    estimatedProbability,                       // ASSUMPTION
    observedConversion: null,                   // NO_DATA — never invented
    note: "QUALIFIED = worth pursuing per recorded facts, NOT a won deal / confirmed budget / commitment. estimatedProbability is an ASSUMPTION; observedConversion is NO_DATA until real outcomes exist. No prospect/response/budget/signature is invented.",
    stageIndex,
  };
}

export { DIMENSIONS, REQUIRED, qualify, disqualifiers };
module.exports = { DIMENSIONS, REQUIRED, qualify, disqualifiers };

// Read-only CLI: print the checklist dimensions; mutates nothing.
if (require.main === module) {
  process.stdout.write(JSON.stringify({ model: "enterprise-qualification/1", dimensions: DIMENSIONS, required: REQUIRED, rule: "missing required ⇒ INCOMPLETE; no budget/authority ⇒ DISQUALIFIED; estimate ≠ observed" }, null, 2) + "\n");
}
