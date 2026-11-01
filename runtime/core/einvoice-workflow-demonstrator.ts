#!/usr/bin/env node
/**
 * einvoice-workflow-demonstrator — ONE composed, end-to-end e-invoice CONFORMANCE + governed B2B WORKFLOW run
 * for profession P8 (API, Integration & Business Software). CTO Master Campaign V3, Wave-1 integrated demonstrator.
 *
 * It ORCHESTRATES already-MERGED, independently-validated modules — NO new capability, NO new primitive:
 *   1. validate the invoice model against EN16931-core mandatory terms → einvoice-validator.validateInvoice
 *   2. export + REAL round-trip verify (emit CII/UBL subset XML, re-parse, re-validate, prove equality) → einvoice-export.exportAndVerify
 *   3. independently re-parse + re-validate the emitted XML                → einvoice-parser.parseAndValidate
 *   4. drive a GOVERNED commercial workflow with honest stage separation   → commercial-pipeline.createOpportunity/advance
 *      (code-criterion stages advance on supplied evidence; the HUMAN-GATED acts PROPOSAL_SENT / SIGNED are
 *       DENY-BY-DEFAULT — the demonstrator stops at the gate and never self-authorizes an external/legal act)
 *   5. compose one verdict: EINVOICE_WORKFLOW_PREPARED (+valid, roundTripEqual, reparsedValid, stageReached,
 *      blockedAtHumanGate, gaps)
 *
 * HONEST SCOPE (preserved from every constituent): this emits the SUPPORTED SUBSET of EN16931 business terms, NOT a
 * full EN16931 CII/UBL document, NOT a Factur-X PDF/A-3, and NOT a certified Plateforme Agréée (PDP) transmission
 * (the France 2026/2027 mandate requires a real PDP — owner-gated, not done here). prepared ≠ sent ≠ signed ≠ cashed:
 * the workflow NEVER advances past a human-gated act on its own. roundTripEqual=false is fail-safe (conservative,
 * never a false pass; the diff is reported). FAIL-CLOSED on an invalid model (no XML is emitted).
 *
 * PURE: all inputs (invoice model, format, opportunity, authorizations) passed in — no fs/net/clock. ADDITIVE
 * (modifies none of the composed modules). Deterministic. Dual export (ESM + CJS).
 */
"use strict";

const EV = require("./einvoice-validator.js");
const EX = require("./einvoice-export.js");
const EP = require("./einvoice-parser.js");
const CP = require("./commercial-pipeline.js");

const SCHEMA = "odg.einvoice-workflow-demonstrator.v1";
const VERDICT = Object.freeze({ PREPARED: "EINVOICE_WORKFLOW_PREPARED", INCOMPLETE: "EINVOICE_WORKFLOW_INCOMPLETE" });
// The stages a caller's CODE evidence can advance autonomously (everything up to, but NOT including, the first
// human-gated external/legal act). PROPOSAL_SENT and SIGNED (and thus INVOICED/CASHED) are deny-by-default.
const CODE_STAGES = Object.freeze(["VERIFIED", "QUALIFIED", "INTERESTED", "PROPOSAL_PREPARED", "PROPOSAL_AUTHORIZED"]);

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/**
 * runEinvoiceWorkflow(input) — compose the four steps. input:
 *   { invoice:{id,issueDate,currency,seller:{name},buyer:{name},lines[],totals{}}, format?:"CII"|"UBL",
 *     opportunity?:{id,at}, authorizations?:{proposalSent?:bool, signed?:bool} }
 * Returns a single composed, honest result. NEVER throws on bad input (fail-closed).
 */
function runEinvoiceWorkflow(input: any): any {
  if (!isObj(input) || !isObj(input.invoice)) {
    return { ok: false, schema: SCHEMA, verdict: VERDICT.INCOMPLETE, code: "INVALID_INPUT", reason: "input { invoice{...} } required", basis: "CONFORMANCE_PREP_NOT_CERTIFIED_TRANSMISSION" };
  }
  const gaps: string[] = [];
  const steps: any = {};
  const format = input.format === "UBL" ? "UBL" : "CII";

  // STEP 1 — validate against EN16931-core mandatory terms (BT-1/2/5 + parties + totals).
  const validation = EV.validateInvoice(input.invoice);
  steps.validation = validation;
  const report = validation && validation.report;
  const valid = !!(validation && validation.ok === true && report && report.valid === true);
  if (!valid) {
    const findings = report && Array.isArray(report.findings) ? report.findings.map((f: any) => (f && (f.rule || f.id || f.message)) || JSON.stringify(f)) : [];
    gaps.push(`invoice fails EN16931-core validation: ${findings.length ? findings.join("; ") : "invalid / not validated"}.`);
  }

  // STEP 2 — export + REAL round-trip verify (only a valid model emits XML — fail-closed).
  let exported: any = { ok: false, reason: "not attempted (invalid model)" };
  if (valid) exported = EX.exportAndVerify(input.invoice, { format });
  steps.export = exported;
  const roundTripEqual = !!(exported && exported.ok && exported.roundTripEqual === true);
  if (valid && !(exported && exported.ok)) gaps.push(`export did not produce XML: ${exported && exported.reason ? exported.reason : "unknown"}.`);
  else if (valid && !roundTripEqual) gaps.push(`round-trip NOT equal (fail-safe, conservative): ${exported && exported.diff ? JSON.stringify(exported.diff) : "diff unavailable"}.`);

  // STEP 3 — independent re-parse + re-validate of the emitted XML.
  let reparse: any = { ok: false, reason: "no xml to re-parse" };
  if (exported && exported.ok && typeof exported.xml === "string") reparse = EP.parseAndValidate(exported.xml);
  steps.reparse = reparse;
  const reparsedValid = !!(reparse && reparse.ok && (reparse.valid === true || (reparse.validation && reparse.validation.valid === true)));
  if (exported && exported.ok && !reparsedValid) gaps.push("emitted XML failed independent re-parse/re-validation.");

  // STEP 4 — governed commercial workflow with honest stage separation (deny-by-default human gates).
  const oppId = (isObj(input.opportunity) && typeof input.opportunity.id === "string") ? input.opportunity.id : "einvoice-demo";
  const at = (isObj(input.opportunity) && typeof input.opportunity.at === "string") ? input.opportunity.at : (input.invoice.issueDate || "");
  const amount = isObj(input.invoice.totals) && typeof input.invoice.totals.taxInclusiveMinor === "number" ? input.invoice.totals.taxInclusiveMinor : 0;
  let entry = CP.createOpportunity(oppId, amount, at);
  const chain: any[] = [];
  let blockedAtHumanGate: string | null = null;
  // advance the CODE stages on the conformance evidence (criterion met only when the invoice actually conformed).
  const criterionMet = valid && roundTripEqual && reparsedValid;
  for (const stage of CODE_STAGES) {
    const r = CP.advance(entry, stage, { criterionMet, at });
    chain.push({ stage, ok: r.ok, code: r.code || null, reason: r.reason });
    if (!r.ok) { blockedAtHumanGate = null; break; }
    entry = r.entry;
  }
  // attempt the FIRST human-gated act (PROPOSAL_SENT) — deny-by-default unless explicitly authorized by the owner.
  const auth = isObj(input.authorizations) ? input.authorizations : {};
  if (entry.stage === "PROPOSAL_AUTHORIZED") {
    const r = CP.advance(entry, "PROPOSAL_SENT", { criterionMet: true, humanAuthorized: auth.proposalSent === true, at });
    chain.push({ stage: "PROPOSAL_SENT", ok: r.ok, code: r.code || null, reason: r.reason });
    if (r.ok) entry = r.entry; else if (r.code === "HUMAN_AUTH_REQUIRED") blockedAtHumanGate = "PROPOSAL_SENT";
  }
  steps.workflow = { chain, stageReached: entry.stage, blockedAtHumanGate };
  if (blockedAtHumanGate) gaps.push(`workflow stopped at human-gated act ${blockedAtHumanGate} (prepared ≠ sent — explicit owner authorisation required; not self-authorized).`);
  if (!criterionMet) gaps.push("commercial-workflow criterion not evidenced (invoice did not fully conform) — workflow did not reach PROPOSAL_AUTHORIZED.");

  // STEP 5 — composed verdict. ALWAYS conformance/readiness prep, NEVER a certified PDP transmission.
  return {
    ok: true,
    schema: SCHEMA,
    verdict: VERDICT.PREPARED,
    basis: "CONFORMANCE_PREP_NOT_CERTIFIED_TRANSMISSION",
    summary: {
      valid, format, roundTripEqual, reparsedValid,
      workflowStageReached: entry.stage,
      blockedAtHumanGate,
      supportedSubset: EX.SUPPORTED_SUBSET,
      gapCount: gaps.length,
    },
    gaps,
    xml: exported && exported.ok ? exported.xml : null,
    steps,
    note: "Composed e-invoice conformance (validate + round-trip-verified CII/UBL subset export + independent re-parse) + governed commercial workflow with honest prepared≠sent≠signed≠cashed separation. SUPPORTED SUBSET of EN16931 only — NOT a full EN16931/Factur-X document and NOT a certified Plateforme Agréée (PDP) transmission (France 2026/2027 mandate ⇒ owner-gated PDP). Human-gated acts are deny-by-default.",
  };
}

export { runEinvoiceWorkflow, SCHEMA, VERDICT, CODE_STAGES };
module.exports = { runEinvoiceWorkflow, SCHEMA, VERDICT, CODE_STAGES };
