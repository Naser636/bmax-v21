#!/usr/bin/env node
/**
 * owner-console — V32 OWNER-ONLY operating model. Two things, composed from existing tested modules (no duplication):
 *  (1) the owner-intervention INVENTORY across the full 12-step commercial+delivery lifecycle, each touchpoint
 *      classified + anchored to the REAL code path that automates it (not a template/dashboard claim), and
 *  (2) a fail-closed OWNER DECISION interface that surfaces ONLY material decisions (signature / money / exceptional
 *      risk) and keeps ROUTINE work (qualification, tests, QA, drafting, follow-up, reconciliation) OFF the owner.
 *
 * HONESTY (mandate): a step is AUTOMATABLE_NOW only when a tested module actually performs it; outreach SEND needs an
 * authorized external channel; contract signature is LEGALLY_NONDELEGABLE. Default = NO spend, NO signature, NO binding
 * commitment, NO high-impact external action without the required authorization. The owner is NEVER silently made
 * responsible for a step claimed automated. Nothing is sent/invoiced/collected here. Pure/deterministic.
 */
"use strict";

const CLASS = Object.freeze({
  AUTOMATABLE_NOW: "AUTOMATABLE_NOW",
  AUTOMATABLE_AFTER_INTERNAL: "AUTOMATABLE_AFTER_SPECIFIC_INTERNAL_WORK",
  EXTERNAL: "EXTERNAL_PROVIDER_OR_CREDENTIAL_REQUIRED",
  OWNER: "OWNER_APPROVAL_OR_SIGNATURE_REQUIRED",
  NONDELEGABLE: "LEGALLY_OR_SAFETY_NONDELEGABLE",
  BLOCKED: "BLOCKED_WITH_EVIDENCE",
});

// Full lifecycle. ownerFacing = does this REQUIRE the owner? (true ONLY for OWNER/NONDELEGABLE material decisions.)
// codePath names the tested module that actually does the work (AUTOMATABLE_NOW must have one).
const LIFECYCLE = Object.freeze([
  { step: 1, name: "Opportunity discovery / lawful sourcing", classification: CLASS.EXTERNAL, codePath: "opportunity-detector + niche-scoring (ranking) — real external source + its terms required", ownerFacing: false, risk: "unauthorized scraping / unlawful source", missing: "authorized data source + its usage terms" },
  { step: 2, name: "Lead provenance / privacy / contact eligibility", classification: CLASS.AUTOMATABLE_NOW, codePath: "first-cash-activation.validateLeadIntake (fail-closed; lawful basis never inferred from an email)", ownerFacing: false, risk: "GDPR unlawful contact", missing: null },
  { step: 3, name: "Qualification / prioritization", classification: CLASS.AUTOMATABLE_NOW, codePath: "enterprise-qualification.qualify + first-cash-activation.qualifyFirstCustomer + niche-scoring", ownerFacing: false, risk: "pursuing unprofitable work", missing: null },
  { step: 4, name: "Outreach / responses / follow-ups / scheduling", classification: CLASS.EXTERNAL, codePath: "DRAFT: entry/mid/proposal templates (AUTOMATABLE_NOW) — SEND: email-gateway (needs Gmail creds + per-class send authorization)", ownerFacing: false, risk: "sending without channel/comms authorization", missing: "authorized channel + specific-communication-class authorization" },
  { step: 5, name: "Proposal / scope / pricing / capacity", classification: CLASS.AUTOMATABLE_NOW, codePath: "enterprise-proposal-template + enterprise-mission-model (scope-justified) + pricing-grid", ownerFacing: false, risk: "underpricing / over-capacity", missing: null },
  { step: 6, name: "Contract review + signature", classification: CLASS.NONDELEGABLE, codePath: "ODG prepares draft; signature is a legal act", ownerFacing: true, risk: "binding legal commitment", missing: "owner signature" },
  { step: 7, name: "Onboarding / dependency collection", classification: CLASS.AUTOMATABLE_NOW, codePath: "client-intake + structured descriptor intake", ownerFacing: false, risk: "collecting unnecessary personal data", missing: null },
  { step: 8, name: "Execution / automated tests / independent QA", classification: CLASS.AUTOMATABLE_NOW, codePath: "assurance-pilot-runner + validation-engine (independent verdict) + self-serve-assurance.triage", ownerFacing: false, risk: "false success", missing: null },
  { step: 9, name: "Delivery / acceptance evidence / exceptions", classification: CLASS.AUTOMATABLE_NOW, codePath: "assurance-pilot-runner + sarif-report (automated dossier+SARIF delivery); acceptance = client act (external evidence); exceptions ⇒ ODG analyst (NOT owner)", ownerFacing: false, risk: "unaccepted delivery invoiced", missing: "client acceptance evidence" },
  { step: 10, name: "Invoicing / payment monitoring / reconciliation / reporting", classification: CLASS.OWNER, codePath: "PREP + gate: first-cash-activation.invoiceReadiness; reconcile on evidenced receipt: collectionReadiness; chasing = ODG/provider (NOT owner)", ownerFacing: true, risk: "issuing a financial document (commitment)", missing: "owner approval to ISSUE the invoice (material); not the preparation" },
  { step: 11, name: "Complaints / incidents / refunds / recovery", classification: CLASS.OWNER, codePath: "incident-resolution-lifecycle (automated triage); refund = financial decision", ownerFacing: true, risk: "refund / financial exposure", missing: "owner approval for a refund above threshold (material only)" },
  { step: 12, name: "Learning capture / validated reuse / portfolio reporting", classification: CLASS.AUTOMATABLE_NOW, codePath: "reuse-ledger + mission-reuse-recorder + portfolio-dashboard (reuse-validated requires a measured delta)", ownerFacing: false, risk: "false reuse claim", missing: null },
]);

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function nonEmptyString(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }

/** inventory(): the classified lifecycle + counts + the owner-facing subset (the ONLY steps that reach the owner). */
function inventory(): any {
  const byClass: Record<string, number> = {}; for (const k of Object.values(CLASS)) byClass[k] = 0;
  for (const s of LIFECYCLE) byClass[s.classification]++;
  const ownerFacing = LIFECYCLE.filter((s) => s.ownerFacing).map((s) => ({ step: s.step, name: s.name, classification: s.classification, why: s.missing }));
  const automatableNow = LIFECYCLE.filter((s) => s.classification === CLASS.AUTOMATABLE_NOW).map((s) => s.step);
  return {
    lifecycle: LIFECYCLE, byClass, ownerFacing, ownerTouchpointCount: ownerFacing.length, automatableNow,
    note: "AUTOMATABLE_NOW steps are anchored to a tested module (codePath). The owner is NEVER handed routine work (qualification/tests/QA/drafting/follow-up/reconciliation) — only material decisions (signature/money/exceptional risk) reach the owner.",
  };
}

/** isOwnerFacing(step): does this lifecycle step genuinely require the owner? Routine steps return false. */
function isOwnerFacing(step: number): boolean {
  const s = LIFECYCLE.find((x) => x.step === step);
  return !!(s && s.ownerFacing);
}

/**
 * buildDecisionRequest(d): a concise OWNER decision request. FAIL-CLOSED — requires a recommendation, a real reason,
 * max financial exposure, the material risks, and the consequences of reject / no-answer. Defaults to NO spend / NO
 * signature / NO binding unless explicitly required. Routine (non-material) items are REFUSED (must not reach owner).
 */
function buildDecisionRequest(d: any): any {
  if (!isObj(d)) return { ok: false, code: "INVALID_INPUT" };
  if (d.material !== true) return { ok: false, code: "NOT_MATERIAL", detail: "routine/operational items must NOT be sent to the owner — route to ODG autonomous / provider" };
  const missing: string[] = [];
  if (!nonEmptyString(d.recommendation)) missing.push("recommendation");
  if (!nonEmptyString(d.whyDecisionNeeded)) missing.push("whyDecisionNeeded");
  if (!(typeof d.maxFinancialExposureEUR === "number" && d.maxFinancialExposureEUR >= 0)) missing.push("maxFinancialExposureEUR");
  if (!Array.isArray(d.risks) || d.risks.length === 0) missing.push("risks");
  if (!nonEmptyString(d.ifRejected)) missing.push("ifRejected");
  if (!nonEmptyString(d.ifNoAnswer)) missing.push("ifNoAnswer");
  if (missing.length) return { ok: false, code: "INCOMPLETE_REQUEST", missing, detail: "an owner decision must state recommendation, reason, exposure, risks, and reject/no-answer consequences" };
  return {
    ok: true,
    request: {
      title: nonEmptyString(d.title) ? d.title : "Decision required",
      recommendation: d.recommendation,
      whyDecisionNeeded: d.whyDecisionNeeded,
      maxFinancialExposureEUR: d.maxFinancialExposureEUR,
      recurringCommitment: nonEmptyString(d.recurringCommitment) ? d.recurringCommitment : "none",
      risks: d.risks,
      ifRejected: d.ifRejected,
      ifNoAnswer: d.ifNoAnswer,          // default-safe consequence (no spend/sign/binding)
      signatureRequired: d.signatureRequired === true,
      options: ["APPROVE", "REJECT"],
    },
    defaults: { noSpend: true, noSignature: true, noBindingCommitment: true },
    note: "Plain-language, owner-only, material decision. Default on no-answer is the SAFE path (no spend/signature/binding). Nothing executes until the owner approves.",
  };
}

/**
 * ownerQueue(items): filter candidate touchpoints → only the OWNER-facing material ones become decision requests;
 * everything routine is routed to ODG_AUTONOMOUS / PROVIDER (never surfaced to the owner). Guards against silently
 * handing the owner routine work.
 */
function ownerQueue(items: any): any {
  const list = Array.isArray(items) ? items : [];
  const ownerDecisions: any[] = [];
  const routedAway: any[] = [];
  for (const it of list) {
    if (isObj(it) && it.material === true && (it.signatureRequired === true || it.maxFinancialExposureEUR > 0 || it.exceptional === true)) {
      const r = buildDecisionRequest(it);
      if (r.ok) ownerDecisions.push(r.request); else routedAway.push({ item: it.title || null, reason: r.code });
    } else {
      routedAway.push({ item: (isObj(it) && it.title) || null, routedTo: "ODG_AUTONOMOUS_OR_PROVIDER", reason: "routine/non-material — owner not involved" });
    }
  }
  return { ownerDecisions, routedAway, ownerDecisionCount: ownerDecisions.length, note: "ONLY material decisions reach the owner; routine/operational items are handled by ODG or an authorized provider." };
}

export { CLASS, LIFECYCLE, inventory, isOwnerFacing, buildDecisionRequest, ownerQueue };
module.exports = { CLASS, LIFECYCLE, inventory, isOwnerFacing, buildDecisionRequest, ownerQueue };

if (require.main === module) {
  const inv = inventory();
  process.stdout.write(JSON.stringify({ model: "owner-console/1", ownerTouchpoints: inv.ownerFacing, byClass: inv.byClass, rule: "owner sees only signature/money/exceptional decisions; routine stays with ODG" }, null, 2) + "\n");
}
