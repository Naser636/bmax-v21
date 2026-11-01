// @ts-nocheck
// einvoice-workflow-demonstrator — conformance + governed-workflow composition tests. A valid invoice round-trips
// (CII/UBL subset) and drives the workflow to PROPOSAL_AUTHORIZED but STOPS at the human-gated PROPOSAL_SENT
// (deny-by-default); an invalid model fails closed (no XML, no workflow progress); the verdict is never a
// certified PDP transmission; determinism holds; bad input fails closed without throwing.
"use strict";
const assert = require("assert");
const D = require("./einvoice-workflow-demonstrator.js");

let n = 0;
const ok = (name, cond) => { n++; assert.ok(cond, name); };

const validInvoice = () => ({
  id: "INV-1", issueDate: "2026-10-29", currency: "EUR",
  seller: { name: "Seller SARL" }, buyer: { name: "Buyer SAS" },
  lines: [{ id: 1, netMinor: 120000 }, { id: 2, netMinor: 80000 }],
  totals: { lineNetSumMinor: 200000, taxExclusiveMinor: 200000, vatMinor: 40000, taxInclusiveMinor: 240000 },
});

// (1) VALID invoice ⇒ conformance holds + workflow reaches PROPOSAL_AUTHORIZED, blocked at PROPOSAL_SENT.
(() => {
  const r = D.runEinvoiceWorkflow({ invoice: validInvoice(), format: "CII" });
  ok("valid: ok + verdict PREPARED", r.ok && r.verdict === D.VERDICT.PREPARED);
  ok("valid: validation + roundTripEqual + reparsedValid", r.summary.valid === true && r.summary.roundTripEqual === true && r.summary.reparsedValid === true);
  ok("valid: XML emitted (CII)", typeof r.xml === "string" && r.xml.length > 0 && r.summary.format === "CII");
  ok("valid: workflow reached PROPOSAL_AUTHORIZED", r.summary.workflowStageReached === "PROPOSAL_AUTHORIZED");
  ok("valid: blocked at human-gated PROPOSAL_SENT (deny-by-default)", r.summary.blockedAtHumanGate === "PROPOSAL_SENT");
  ok("valid: a prepared≠sent gap is reported", r.gaps.some((g) => /human-gated|prepared ≠ sent/i.test(g)));
})();

// (2) UBL format also round-trips.
(() => {
  const r = D.runEinvoiceWorkflow({ invoice: validInvoice(), format: "UBL" });
  ok("ubl: roundTripEqual true, format UBL", r.summary.roundTripEqual === true && r.summary.format === "UBL");
})();

// (3) HUMAN-GATED act proceeds ONLY with explicit authorization (and still never fabricates send).
(() => {
  const r = D.runEinvoiceWorkflow({ invoice: validInvoice(), authorizations: { proposalSent: true } });
  ok("authorized: PROPOSAL_SENT reached only when explicitly authorized", r.summary.workflowStageReached === "PROPOSAL_SENT" && r.summary.blockedAtHumanGate === null);
})();

// (4) INVALID model (missing currency BT-5) ⇒ FAIL-CLOSED: no XML, criterion not met, workflow does not reach PROPOSAL_AUTHORIZED.
(() => {
  const bad = validInvoice(); delete bad.currency;
  const r = D.runEinvoiceWorkflow({ invoice: bad });
  ok("invalid: valid false, no XML emitted (fail-closed)", r.summary.valid === false && r.xml === null);
  ok("invalid: workflow did NOT reach PROPOSAL_AUTHORIZED", r.summary.workflowStageReached !== "PROPOSAL_AUTHORIZED");
  ok("invalid: a validation gap is reported", r.gaps.some((g) => /EN16931-core validation/i.test(g)));
})();

// (5) BROKEN totals (BT-112 mismatch) ⇒ invalid ⇒ fail-closed (no false conformance).
(() => {
  const bad = validInvoice(); bad.totals.taxInclusiveMinor = 999999;
  const r = D.runEinvoiceWorkflow({ invoice: bad });
  ok("bad-totals: not valid, criterion not met", r.summary.valid === false && r.summary.workflowStageReached !== "PROPOSAL_AUTHORIZED");
})();

// (6) HONESTY INVARIANT: never a certified PDP transmission; note disclaims; supportedSubset present.
(() => {
  const r = D.runEinvoiceWorkflow({ invoice: validInvoice() });
  ok("honesty: verdict is PREPARED, never CERTIFIED/TRANSMITTED", !/CERTIF|TRANSMIT|CONFORMANT/i.test(r.verdict));
  ok("honesty: basis CONFORMANCE_PREP_NOT_CERTIFIED_TRANSMISSION", r.basis === "CONFORMANCE_PREP_NOT_CERTIFIED_TRANSMISSION");
  ok("honesty: note disclaims full EN16931/Factur-X + certified PDP", /SUPPORTED SUBSET/i.test(r.note) && /NOT a certified Plateforme Agréée|PDP/i.test(r.note));
  ok("honesty: supportedSubset enumerated", Array.isArray(r.summary.supportedSubset) && r.summary.supportedSubset.length > 0);
})();

// (7) FAIL-CLOSED input: non-object / missing invoice ⇒ INVALID_INPUT, no throw.
(() => {
  ok("bad-input null ⇒ INVALID_INPUT", D.runEinvoiceWorkflow(null).code === "INVALID_INPUT");
  ok("bad-input {} ⇒ INVALID_INPUT (no invoice)", D.runEinvoiceWorkflow({}).code === "INVALID_INPUT");
  ok("bad-input invoice=number ⇒ INVALID_INPUT", D.runEinvoiceWorkflow({ invoice: 5 }).code === "INVALID_INPUT");
})();

// (8) DETERMINISM: same input ⇒ identical emitted XML + stage reached.
(() => {
  const a = D.runEinvoiceWorkflow({ invoice: validInvoice() });
  const b = D.runEinvoiceWorkflow({ invoice: validInvoice() });
  ok("determinism: identical XML + stage across runs", a.xml === b.xml && a.summary.workflowStageReached === b.summary.workflowStageReached);
})();

console.log(`einvoice-workflow-demonstrator: ${n} checks passed`);
