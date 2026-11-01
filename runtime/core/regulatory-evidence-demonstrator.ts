#!/usr/bin/env node
/**
 * regulatory-evidence-demonstrator — ONE composed EU-regulatory readiness-evidence run for profession P10
 * (European Regulatory, AI Assurance & Compliance). CTO Master Campaign V3, Wave-2 integrated demonstrator.
 *
 * ORCHESTRATES already-MERGED modules (NO new capability, NO new primitive):
 *   1. classify the AI-Act role from DECLARED activities (deny-by-default)     → ai-act-role-classifier.classifyRole
 *   2. anti-overclaim review of the public statement/claims (refuse superlatives) → excellence-policy.reviewForExcellence/requireExcellence
 *   3. assert the statement does NOT claim certification/conformity (fail-closed) → regulatory-assurance.assertNotCertified
 *   4. seal the composed readiness dossier as tamper-evident evidence           → evidence-provenance.stampProvenance
 *   5. compose one verdict: REGULATORY_EVIDENCE_PREPARED (+ roles, excellence, notCertified, sealed, gaps)
 *
 * HONEST SCOPE: ODG is NOT a certification body. This prepares technical EVIDENCE/READINESS only — role criteria &
 * obligation FAMILIES (principle-level, declared-not-verified), mechanism ≠ satisfied, NOT_CERTIFIED. FAIL-CLOSED:
 * no declared activity ⇒ UNDETERMINED (asserts no obligation); a prohibited superlative ⇒ excellence refuses; a
 * certification claim ⇒ notCertified refuses. PURE compute (activities/statement/registry passed in; no network/
 * clock). NOTE: the dossier seal (evidence-provenance) reads git HEAD for provenance unless a `revision` is
 * injected — fail-closed + per-process cached, never network. assertNotCertified's refusal is only as strong as
 * the merged primitive's phrasing coverage (a follow-up lot hardens it). ADDITIVE. Dual export.
 */
"use strict";

const AIACT = require("./ai-act-role-classifier.js");
const XP = require("./excellence-policy.js");
const RA = require("./regulatory-assurance.js");
const EP = require("./evidence-provenance.js");

const SCHEMA = "odg.regulatory-evidence-demonstrator.v1";
const BASIS = "REGULATORY_EVIDENCE_PREP_NOT_CERTIFICATION";
const VERDICT = Object.freeze({ PREPARED: "REGULATORY_EVIDENCE_PREPARED", INCOMPLETE: "REGULATORY_EVIDENCE_INCOMPLETE" });

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/**
 * runRegulatoryEvidence(input) — classify → anti-overclaim → not-certified → seal. input:
 *   { activities:{<flag>:bool}, statement?:string, excellence?:{domain,registry,currentPractices,thresholds,measured,claims,now,benchmark}, strict?, key?, revision?, runId? }
 * NEVER throws on bad input (fail-closed).
 */
function runRegulatoryEvidence(input: any): any {
  if (!isObj(input)) return { ok: false, schema: SCHEMA, verdict: VERDICT.INCOMPLETE, code: "INVALID_INPUT", reason: "input object required", basis: BASIS };
  const gaps: string[] = [];
  const steps: any = {};

  // STEP 1 — AI-Act role classification from DECLARED activities (deny-by-default).
  const rolec = AIACT.classifyRole(input.activities);
  steps.role = rolec;
  if (rolec && rolec.undetermined === true) gaps.push("AI-Act role UNDETERMINED — no qualifying activity declared; ODG asserts NO obligation (deny-by-default).");

  // STEP 2 — anti-overclaim review (refuse unproven superlatives).
  const review = XP.reviewForExcellence(isObj(input.excellence) ? input.excellence : {});
  const req = XP.requireExcellence(review, { strict: input.strict === true });
  steps.excellence = { verdict: review.verdict, admit: req.admit, reason: req.reason, prohibited: req.prohibited || [] };
  const excellenceAdmit = req.admit === true;
  if (!excellenceAdmit) gaps.push(`anti-overclaim REFUSED the statement: ${req.reason}.`);

  // STEP 3 — assert the statement makes NO certification/conformity claim (fail-closed).
  const statement = typeof input.statement === "string" && input.statement.trim() ? input.statement : "ODG prepared technical regulatory EVIDENCE/readiness. This is NOT a certification, conformity assessment, or legal advice.";
  const nc = RA.assertNotCertified(statement);
  steps.notCertified = nc;
  const notCertified = nc && nc.ok === true;
  if (!notCertified) gaps.push(`statement rejected — it reads as a certification/conformity claim (ODG is NOT a cert body): ${nc && nc.reason ? nc.reason : "refused"}.`);

  // STEP 4 — seal the composed readiness dossier (tamper-evident; reuses the EVIDENCE primitive).
  const core = {
    schema: SCHEMA, basis: BASIS,
    roles: rolec.roles, obligations: rolec.obligations, art50: rolec.art50, undetermined: rolec.undetermined,
    declaredNotVerified: true,
    excellence: { verdict: review.verdict, admit: excellenceAdmit },
    notCertified, statement,
  };
  const sealed = EP.stampProvenance(core, { key: input.key, revision: input.revision, runId: input.runId });
  steps.sealed = sealed;
  const verify = EP.verifyProvenance(sealed, { key: input.key });
  if (!(verify && verify.ok)) gaps.push("dossier seal did not re-verify.");

  return {
    ok: true,
    schema: SCHEMA,
    verdict: VERDICT.PREPARED,
    basis: BASIS,
    summary: {
      roles: rolec.roles, undetermined: rolec.undetermined === true,
      obligationsCount: Array.isArray(rolec.obligations) ? rolec.obligations.length : 0,
      excellenceVerdict: review.verdict, excellenceAdmit,
      notCertified, sealed: !!(verify && verify.ok),
      gapCount: gaps.length,
    },
    gaps,
    dossier: sealed,
    steps,
    note: "Composed EU-regulatory readiness evidence: AI-Act role classification (declared-not-verified, principle-level) → anti-overclaim review → NOT_CERTIFIED assertion → sealed tamper-evident dossier. ODG is NOT a certification body; mechanism ≠ satisfied; this is EVIDENCE/readiness, not conformity.",
  };
}

export { runRegulatoryEvidence, SCHEMA, VERDICT, BASIS };
module.exports = { runRegulatoryEvidence, SCHEMA, VERDICT, BASIS };
