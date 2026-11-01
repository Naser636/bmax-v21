#!/usr/bin/env node
/**
 * acceptance-evidence-demonstrator — ONE composed evidence-gated acceptance run for profession P6
 * (Quality Engineering & Software Testing). CTO Master Campaign V3, Wave-2 integrated demonstrator.
 *
 * ORCHESTRATES already-MERGED modules (NO new capability, NO new primitive):
 *   1. parse a Gherkin spec into deny-by-default acceptance criteria → executable-spec-intake.intake
 *   2. evaluate observations against the criteria (missing/non-boolean ⇒ UNKNOWN, any false ⇒ REJECT) → executable-spec-intake.evaluateCriteria
 *   3. (optional) place caller-supplied evidence on the reality-gate ladder → reality-gate.classify
 *   4. charter the overall verdict with method + ground-truth provenance → charter-record.makeCharter
 *   5. compose one verdict: ACCEPTANCE_EVALUATED (+ criteriaVerdict, realityState, chartered, gaps)
 *
 * HONEST SCOPE: deny-by-default — a criterion with no boolean observation is UNKNOWN, never a silent pass; any
 * REJECT dominates. This is acceptance EVALUATION against stated criteria, not a correctness proof. PURE compute
 * (spec + observations + evidence passed in; no network/clock). NOTE: the charter seal (charter-record →
 * evidence-provenance) reads git HEAD for provenance unless a `revision` is injected — fail-closed + per-process
 * cached, never network. ADDITIVE. Dual export.
 */
"use strict";

const SPEC = require("./executable-spec-intake.js");
const RG = require("./reality-gate.js");
const CH = require("./charter-record.js");

const SCHEMA = "odg.acceptance-evidence-demonstrator.v1";
const BASIS = "ACCEPTANCE_EVALUATION_NOT_CORRECTNESS_PROOF";
const VERDICT = Object.freeze({ EVALUATED: "ACCEPTANCE_EVALUATED", INCOMPLETE: "ACCEPTANCE_INCOMPLETE" });

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/**
 * runAcceptance(input) — intake → evaluate → (optional reality-gate) → charter. input:
 *   { gherkin:string, observations:{<criterionId>:boolean|{result}}, realityEvidence?, realityState?, method?, groundTruth?, key?, revision?, runId? }
 * NEVER throws on bad input (fail-closed).
 */
function runAcceptance(input: any): any {
  if (!isObj(input) || typeof input.gherkin !== "string") {
    return { ok: false, schema: SCHEMA, verdict: VERDICT.INCOMPLETE, code: "INVALID_INPUT", reason: "input { gherkin:string } required", basis: BASIS };
  }
  const gaps: string[] = [];
  const steps: any = {};

  // STEP 1 — Gherkin → criteria.
  const intake = SPEC.intake(input.gherkin);
  steps.intake = intake;
  if (!intake.ok || !Array.isArray(intake.criteria) || intake.criteria.length === 0) {
    gaps.push(`no acceptance criteria extracted: ${intake && intake.reason ? intake.reason : "empty/invalid spec"}.`);
    return { ok: true, schema: SCHEMA, verdict: VERDICT.INCOMPLETE, basis: BASIS, summary: { criteriaCount: 0, criteriaVerdict: "UNKNOWN", chartered: false, gapCount: gaps.length }, gaps, steps, note: "No criteria ⇒ nothing to accept. deny-by-default." };
  }

  // STEP 2 — evaluate observations (deny-by-default).
  const evalr = SPEC.evaluateCriteria(intake.criteria, input.observations);
  steps.evaluate = evalr;
  const criteriaVerdict = evalr && evalr.overall ? evalr.overall : "UNKNOWN";
  if (criteriaVerdict === "REJECT") gaps.push("at least one criterion observed FALSE ⇒ REJECT.");
  else if (criteriaVerdict === "UNKNOWN") gaps.push("at least one criterion has no boolean observation ⇒ UNKNOWN (deny-by-default, not a pass).");

  // STEP 3 — (optional) reality-gate ladder on caller-supplied evidence (honest: only if provided).
  let realityState: string | null = null;
  if (isObj(input.realityEvidence)) {
    const cls = RG.classify(input.realityEvidence);
    steps.reality = cls;
    realityState = cls && cls.state ? cls.state : null;
  }

  // STEP 4 — charter the overall verdict.
  const charter = CH.makeCharter({
    subject: "acceptance of spec against observations",
    method: isObj(input.method) || typeof input.method === "string" ? input.method : "executable-spec-intake (Gherkin → deny-by-default criteria) + evaluateCriteria",
    verdict: { verdict: criteriaVerdict }, // ACCEPT | REJECT | UNKNOWN — MA-shaped object, normalized by charter-record
    groundTruth: input.groundTruth,
    key: input.key, revision: input.revision, runId: input.runId,
  });
  steps.charter = charter;
  const chartered = !!(charter && charter.ok);
  if (!chartered) gaps.push(`charter not produced: ${charter && charter.reason ? charter.reason : "unknown"}.`);

  return {
    ok: true,
    schema: SCHEMA,
    verdict: VERDICT.EVALUATED,
    basis: BASIS,
    summary: {
      criteriaCount: intake.criteria.length,
      criteriaVerdict,
      counts: evalr && evalr.counts ? evalr.counts : null,
      realityState,
      chartered,
      grounded: chartered && charter.charter ? charter.charter.grounded === true : false,
      gapCount: gaps.length,
    },
    gaps,
    steps,
    note: "Composed evidence-gated acceptance: Gherkin → deny-by-default criteria → observation evaluation → optional reality-gate ladder → chartered verdict. ACCEPT means every criterion was observed true; missing/non-boolean ⇒ UNKNOWN; any false ⇒ REJECT. Acceptance EVALUATION, not a correctness proof.",
  };
}

export { runAcceptance, SCHEMA, VERDICT, BASIS };
module.exports = { runAcceptance, SCHEMA, VERDICT, BASIS };
