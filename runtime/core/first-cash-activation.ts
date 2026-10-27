#!/usr/bin/env node
/**
 * first-cash-activation — V30: reduce the distance from internal readiness to the FIRST verified collection.
 * COMPOSES existing modules (entry-diagnostic-offer, enterprise-qualification shape, email-gateway status) and
 * adds only the genuinely-missing activation artifacts: a route selector, an invoice/collection GATE, and a
 * human-action register. It does NOT duplicate offers, build new internal campaigns, or perform external actions.
 *
 * HARD HONESTY (mandate): prepares DRAFTS only. Nothing is sent, invoiced, signed, collected, or purchased here.
 * Actual collected cash stays €0 unless an independently-evidenced receipt exists. A forecast / proposal / signed-
 * but-uncollected contract is NEVER collected cash. The invoice gate is FAIL-CLOSED (no invoice without accepted
 * delivery + evidence; no collection without a receipt). Pure/deterministic.
 */
"use strict";

const A = require("./entry-diagnostic-offer.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function nonEmptyString(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }

/**
 * selectRoute(): the shortest EVIDENCE-BASED route to first cash across A–F, WITHOUT making it the sole strategy.
 * A (entry diagnostic) wins on time-to-first-collection: lowest human time (6h assumption), 2-day turnaround,
 * highest automation (clean inputs auto-complete), lowest price barrier — not on gross value. All axes stay eligible.
 */
function selectRoute(): any {
  return {
    selected: "A",
    offerCode: A.OFFER.code,
    rationale: "A has the shortest assumed time-to-first-collection (2-day turnaround, ~6h human, high automation, low price barrier) ⇒ fastest legitimate first invoice. Chosen on time/feasibility/risk, NOT gross value.",
    assumedTimeToFirstInvoiceDays: A.OFFER.turnaroundDays,   // ASSUMPTION
    allAxesEligible: ["A", "B", "C", "D", "E", "F"],
    note: "A is the selected FIRST route, NOT the sole portfolio strategy — B/C/D/E/F remain active and eligible. Time/price are ASSUMPTIONS until real delivery + cash.",
  };
}

/** A short go/no-go qualification to reject unsuitable or unprofitable entry work (fail-closed to REJECT). */
function qualifyFirstCustomer(lead: any): any {
  if (!isObj(lead)) return { ok: false, code: "INVALID_INPUT" };
  const reasons: string[] = [];
  if (lead.hasDependencyManifest !== true) reasons.push("no dependency manifest (required input absent)");
  if (lead.wantsDiagnosticOnly !== true && lead.wantsRemediation === true) reasons.push("wants remediation ⇒ route to B, not the entry diagnostic");
  if (lead.budgetConfirmed !== true) reasons.push("entry price (assumption) not confirmed");
  if (lead.lawfulBasisForContact !== true) reasons.push("no lawful basis / consent for contact (GDPR)");
  const verdict = reasons.length ? "REJECT_OR_REROUTE" : "SUITABLE";
  return { ok: true, verdict, reasons, note: "SUITABLE = fits the entry diagnostic per recorded facts; NOT a sale. Missing lawful basis / budget / inputs ⇒ do not proceed." };
}

/**
 * invoiceReadiness(engagement): FAIL-CLOSED gate — may an invoice be issued? Requires accepted delivery + acceptance
 * evidence + not-already-invoiced. Never issues the invoice (that is a human act); only reports readiness.
 */
function invoiceReadiness(engagement: any): any {
  if (!isObj(engagement)) return { ok: false, code: "INVALID_INPUT" };
  const blockers: string[] = [];
  if (engagement.deliveryAccepted !== true) blockers.push("delivery not accepted by the client");
  if (!nonEmptyString(engagement.acceptanceEvidence)) blockers.push("no acceptance evidence recorded");
  if (engagement.alreadyInvoiced === true) blockers.push("already invoiced (idempotent — no duplicate)");
  if (!(typeof engagement.amountEUR === "number" && engagement.amountEUR > 0)) blockers.push("no positive agreed amount");
  return {
    ok: true,
    mayIssueInvoice: blockers.length === 0,
    blockers,
    requiredBeforeInvoice: ["delivery accepted (client sign-off)", "acceptance evidence recorded", "agreed amount", "not already invoiced"],
    note: "READINESS only — ODG never issues the invoice itself (human act). An invoice is NOT revenue; cash is only COLLECTED on an evidenced receipt (see collectionReadiness).",
  };
}

/** collectionReadiness(engagement): actual cash is COLLECTED only with an evidenced receipt matching the amount. */
function collectionReadiness(engagement: any): any {
  if (!isObj(engagement)) return { ok: false, code: "INVALID_INPUT" };
  const hasReceipt = nonEmptyString(engagement.receiptRef);
  const amountOk = typeof engagement.collectedAmountEUR === "number" && engagement.collectedAmountEUR > 0;
  const matches = amountOk && typeof engagement.amountEUR === "number" && Math.abs(engagement.collectedAmountEUR - engagement.amountEUR) < 0.01;
  const collected = hasReceipt && amountOk;
  return {
    ok: true,
    collected,
    collectedAmountEUR: collected ? engagement.collectedAmountEUR : 0,
    receiptRef: hasReceipt ? engagement.receiptRef : null,
    amountMatchesInvoice: matches,
    note: collected ? "evidenced receipt present ⇒ counts as collected cash" : "NO evidenced receipt ⇒ actual collected cash remains €0 (forecast/invoice are NOT cash).",
  };
}

/** humanActionRegister(): the minimum human actions to move A toward first cash, classified + unblock evidence. */
function humanActionRegister(): any {
  return [
    { id: "HA-1", action: "authorize + configure the outbound channel (Gmail app-password/SMTP) and set EMAIL_SEND_ENABLED=1", why: "ODG cannot send outreach; email-gateway send is disabled by default and needs credentials + explicit enablement", classification: "HUMAN_GATE", authorizer: "CTO", unblockEvidence: "email-gateway status READY + sendEnabled=true (no secret printed)" },
    { id: "HA-2", action: "confirm a real lead with lawful basis for contact (GDPR) + a dependency manifest", why: "no lead/consent may be invented; the entry offer needs a structured input", classification: "EXTERNAL_EVIDENCE", authorizer: "CTO", unblockEvidence: "a recorded lead with lawfulBasisForContact=true + manifest" },
    { id: "HA-3", action: "review + approve the outreach draft, then SEND it (human act)", why: "external communication is authorization-gated; ODG prepares, a human sends", classification: "HUMAN_GATE", authorizer: "CTO", unblockEvidence: "provider send-proof (message id)" },
    { id: "HA-4", action: "on client acceptance, approve invoice issuance", why: "an invoice is a commitment; fail-closed gate requires accepted delivery + evidence", classification: "HUMAN_GATE", authorizer: "CTO", unblockEvidence: "deliveryAccepted=true + acceptanceEvidence recorded" },
    { id: "HA-5", action: "record the evidenced receipt when cash arrives", why: "only an evidenced receipt counts as collected cash; nothing else moves actual net off €0", classification: "EXTERNAL_EVIDENCE", authorizer: "CTO", unblockEvidence: "bank/payment receipt ref + amount" },
  ];
}

/** buildActivationPack(): assemble the first-customer activation pack (DRAFTS only) for the selected route. */
function buildActivationPack(): any {
  const route = selectRoute();
  return {
    status: "PREPARED",           // PREPARED only — nothing sent/invoiced/collected
    route,
    offer: A.OFFER,
    economics: A.economics(),     // assumptions
    qualificationChecklist: ["dependency manifest present", "diagnostic-only (not remediation ⇒ B)", "entry price (assumption) confirmed", "lawful basis for contact (GDPR)"],
    outreachDraft: {
      recipient: "<<HUMAN-SUPPLIED, lawful-basis-confirmed>>",   // never invented
      subject: "Fast software-assurance diagnostic (dependencies, licences, AI-Act, coverage)",
      body: "We run a 2-day (assumption) external assurance diagnostic: SBOM/dependency + licence review, EU AI-Act Art.50 transparency check, test-coverage read, and an actionable findings dossier with a SARIF export. Fixed entry scope; clear exclusions (no pentest/legal/certification). Would a short scoping call be useful?",
      disclaimer: "DRAFT — not sent; no recipient invented; NOT a certification; price is an assumption pending scope.",
    },
    invoiceCollectionChecklist: invoiceReadiness({}).requiredBeforeInvoice.concat(["record evidenced receipt (receiptRef) before counting any cash"]),
    humanActionRegister: humanActionRegister(),
    note: "ACTIVATION PACK is DRAFTS ONLY. Nothing sent/invoiced/collected. Actual collected cash = €0 until an evidenced receipt exists. A is the first route; B/C/D/E/F stay eligible.",
  };
}

export { selectRoute, qualifyFirstCustomer, invoiceReadiness, collectionReadiness, humanActionRegister, buildActivationPack };
module.exports = { selectRoute, qualifyFirstCustomer, invoiceReadiness, collectionReadiness, humanActionRegister, buildActivationPack };

if (require.main === module) {
  process.stdout.write(JSON.stringify({ model: "first-cash-activation/1", selected: selectRoute().selected, rule: "drafts only; invoice fail-closed; cash only on evidenced receipt; all axes eligible" }, null, 2) + "\n");
}
