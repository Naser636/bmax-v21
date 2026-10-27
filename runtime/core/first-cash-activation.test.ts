#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves V30 first-cash activation is honest + fail-closed: route A selected (not sole),
// qualification rejects unsuitable/no-lawful-basis work, the invoice gate blocks without accepted delivery + evidence,
// cash is collected ONLY on an evidenced receipt, and the human-action register classifies the gates. Drafts only.
"use strict";
const assert = require("assert");
const FC = require("./first-cash-activation.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// (1) route A selected on time-to-cash, all axes stay eligible (not sole strategy).
const r = FC.selectRoute();
ok("route A selected + all six axes eligible (not sole)", r.selected === "A" && r.allAxesEligible.length === 6 && /NOT the sole/i.test(r.note));

// (2) qualification rejects unsuitable / no lawful basis.
ok("no lawful basis ⇒ REJECT_OR_REROUTE", FC.qualifyFirstCustomer({ hasDependencyManifest: true, wantsDiagnosticOnly: true, budgetConfirmed: true, lawfulBasisForContact: false }).verdict === "REJECT_OR_REROUTE");
ok("remediation want ⇒ reroute to B", FC.qualifyFirstCustomer({ hasDependencyManifest: true, wantsRemediation: true, budgetConfirmed: true, lawfulBasisForContact: true }).reasons.some(x => /route to B/i.test(x)));
ok("all boxes ticked ⇒ SUITABLE (still not a sale)", FC.qualifyFirstCustomer({ hasDependencyManifest: true, wantsDiagnosticOnly: true, budgetConfirmed: true, lawfulBasisForContact: true }).verdict === "SUITABLE");

// (3) invoice gate fail-closed.
ok("no accepted delivery/evidence ⇒ may NOT invoice", FC.invoiceReadiness({ amountEUR: 900 }).mayIssueInvoice === false);
ok("accepted + evidence + amount + not-invoiced ⇒ MAY invoice (readiness only)", FC.invoiceReadiness({ deliveryAccepted: true, acceptanceEvidence: "signoff.pdf", amountEUR: 900, alreadyInvoiced: false }).mayIssueInvoice === true);
ok("already invoiced ⇒ blocked (idempotent)", FC.invoiceReadiness({ deliveryAccepted: true, acceptanceEvidence: "x", amountEUR: 900, alreadyInvoiced: true }).mayIssueInvoice === false);

// (4) cash collected ONLY on evidenced receipt.
ok("no receipt ⇒ collected false, €0", FC.collectionReadiness({ amountEUR: 900 }).collected === false && FC.collectionReadiness({ amountEUR: 900 }).collectedAmountEUR === 0);
const col = FC.collectionReadiness({ amountEUR: 900, collectedAmountEUR: 900, receiptRef: "BANK-2026-11-TX1" });
ok("evidenced receipt ⇒ collected, amount matches invoice", col.collected === true && col.collectedAmountEUR === 900 && col.amountMatchesInvoice === true);

// (5) human-action register classifies gates + unblock evidence.
const reg = FC.humanActionRegister();
ok("human-action register: Gmail HUMAN_GATE + receipt EXTERNAL_EVIDENCE + unblock evidence each", reg.length >= 5 && reg.some(a => /Gmail|SMTP/i.test(a.action) && a.classification === "HUMAN_GATE") && reg.some(a => /receipt/i.test(a.action) && a.classification === "EXTERNAL_EVIDENCE") && reg.every(a => a.unblockEvidence));

// (6) activation pack: PREPARED, drafts only, no invented recipient, cash €0.
const pack = FC.buildActivationPack();
ok("pack PREPARED; outreach recipient NOT invented; drafts only", pack.status === "PREPARED" && /HUMAN-SUPPLIED/i.test(pack.outreachDraft.recipient) && /DRAFT/i.test(pack.outreachDraft.disclaimer));
ok("pack note: actual cash €0 until evidenced receipt; A not sole", /€0 until an evidenced receipt/i.test(pack.note) && /eligible/i.test(pack.note));
ok("fail-closed input", FC.invoiceReadiness(null).code === "INVALID_INPUT" && FC.qualifyFirstCustomer(null).code === "INVALID_INPUT");

// (7) HA-1 checklist separates channel CONFIGURATION from AUTHORIZATION-TO-SEND; no secret printed.
const ha1 = FC.ha1Checklist();
ok("HA-1 checklist separates config from send-authorization", Array.isArray(ha1.configuration) && Array.isArray(ha1.authorizationToSend) && /EMAIL_SEND_ENABLED=1 is an AUTHORIZATION/i.test(ha1.authorizationToSend.join(" ")) && /DISTINCT/i.test(ha1.note));
ok("HA-1 checklist instructs out-of-band secret handling (no secret in output)", ha1.configuration.some(x => /OUT-OF-BAND|never typed in chat/i.test(x)) && !/password\s*[:=]/i.test(JSON.stringify(ha1)));

// (8) HA-2 lead intake — fail-closed; lawful basis NEVER inferred from an email alone.
ok("email-only lead ⇒ REJECTED (lawful basis not inferred from email)", (() => { const v = FC.validateLeadIntake({ businessEmail: "x@acme.com" }); return v.verdict === "REJECTED" && v.emailDoesNotImplyLawfulBasis === true && v.reasons.some(r => /never inferred from an email/i.test(r)); })());
ok("missing provenance/purpose/human-confirm ⇒ REJECTED", FC.validateLeadIntake({ businessEmail: "x@acme.com", lawfulBasis: "B2B legitimate interest" }).verdict === "REJECTED");
ok("complete, human-confirmed intake ⇒ ACCEPTED (still not send-authorization)", (() => {
  const v = FC.validateLeadIntake({ organization: "Acme", businessEmail: "ciso@acme.com", lawfulBasis: "B2B legitimate interest", provenance: { source: "inbound request", at: "2026-10-27" }, purposeCompatible: true, humanConfirmed: true });
  return v.verdict === "ACCEPTED" && /NOT contact authorization to SEND/i.test(v.note);
})());
ok("HA-2 fail-closed input", FC.validateLeadIntake(null).code === "INVALID_INPUT");

console.log(`\nFIRST-CASH-ACTIVATION suite — ${pass} assertions passed. (route A; qualification; fail-closed invoice; receipt-only cash; human-action register; drafts only)`);
