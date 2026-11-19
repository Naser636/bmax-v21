#!/usr/bin/env node
"use strict";
/* Tests for odg-fr-invoice-compliance (FR mandatory-mentions + fiscal-consistency pre-check). PURE. Composes REAL modules. */
const C = require("./odg-fr-invoice-compliance.js");
const SIRET = require("./odg-fr-identifier-validation.js");
const VAT = require("./odg-fr-vat.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function validInvoice(): any {
  return { sellerName: "MatPro SAS", sellerSiret: "73282932000074", buyerName: "Client SARL", invoiceNumber: "F-2026-001", issueDate: "2026-11-19",
    paymentTermDays: 30, lineItems: [{ label: "Ciment", qty: 2, unitPriceHTMinor: 50000, vatRateBps: 2000 }, { label: "Sable", qty: 1, unitPriceHTMinor: 30000, vatRateBps: 550 }],
    statedTotalVatMinor: 21650, penaltyRateMentionPresent: true, indemnityMentionPresent: true };
}
function checkOf(r: any, name: string): any { return r.checks.find((c: any) => c.name === name); }

function main(): void {
  // complete valid invoice ⇒ ready, correct computed totals
  const r = C.precheckInvoice(validInvoice());
  check("valid invoice ⇒ ready, no failing checks", r.ok === true && r.ready === true && r.failing.length === 0);
  check("computed totals: HT 130000, VAT 21650, TTC 151650 (20%+5.5% lines)", r.computed.totalHTMinor === 130000 && r.computed.totalVatMinor === 21650 && r.computed.totalTTCMinor === 151650);

  // COMPOSITION FIDELITY: siret check == #731, vat == #732 recompute
  check("siret-checksum equals standalone validateSiret", checkOf(r, "siret-checksum").pass === (SIRET.validateSiret("73282932000074").valid === true));
  check("vat recompute equals standalone vatBreakdown totals", r.computed.totalVatMinor === VAT.vatBreakdown([{ netMinor: 100000, rateBps: 2000 }, { netMinor: 30000, rateBps: 550 }]).totals.vatMinor);

  // invalid SIRET ⇒ siret-checksum fails ⇒ not ready
  const badSiret = { ...validInvoice(), sellerSiret: "73282932000075" };
  check("invalid SIRET ⇒ not ready, siret-checksum fails", (() => { const x = C.precheckInvoice(badSiret); return x.ready === false && checkOf(x, "siret-checksum").pass === false && x.failing.indexOf("siret-checksum") >= 0; })());

  // stated VAT mismatch ⇒ vat-consistency fails
  const badVat = { ...validInvoice(), statedTotalVatMinor: 21649 };
  check("stated VAT ≠ recomputed ⇒ vat-consistency fails", (() => { const x = C.precheckInvoice(badVat); return x.ready === false && checkOf(x, "vat-consistency").pass === false && /≠ recomputed 21650/.test(checkOf(x, "vat-consistency").detail); })());

  // term > 60 ⇒ lme-term-ceiling fails
  const badTerm = { ...validInvoice(), paymentTermDays: 90 };
  check("term 90 > LME ceiling ⇒ lme-term-ceiling fails", (() => { const x = C.precheckInvoice(badTerm); return x.ready === false && checkOf(x, "lme-term-ceiling").pass === false; })());

  // missing mandatory mentions (penalty / indemnity) ⇒ fail
  check("missing penalty-rate mention ⇒ not ready", C.precheckInvoice({ ...validInvoice(), penaltyRateMentionPresent: false }).ready === false);
  check("missing indemnity mention ⇒ not ready", C.precheckInvoice({ ...validInvoice(), indemnityMentionPresent: false }).ready === false);

  // missing mandatory field ⇒ mandatory-fields fails
  const noBuyer = { ...validInvoice() }; delete noBuyer.buyerName;
  check("missing buyerName ⇒ mandatory-fields fails", (() => { const x = C.precheckInvoice(noBuyer); return x.ready === false && checkOf(x, "mandatory-fields").pass === false && /buyerName/.test(checkOf(x, "mandatory-fields").detail); })());

  // no line items ⇒ line-items fails
  check("no line items ⇒ line-items fails", (() => { const x = C.precheckInvoice({ ...validInvoice(), lineItems: [] }); return checkOf(x, "line-items").pass === false; })());
  // bad line (float qty) ⇒ line-items fails, VAT not computed
  check("bad line (float qty) ⇒ line-items fails", (() => { const x = C.precheckInvoice({ ...validInvoice(), lineItems: [{ qty: 1.5, unitPriceHTMinor: 100, vatRateBps: 2000 }] }); return checkOf(x, "line-items").pass === false; })());

  // no stated VAT ⇒ vat-consistency MEDIUM (recomputed, not blocking ready)
  const noStated = { ...validInvoice() }; delete noStated.statedTotalVatMinor;
  check("no stated VAT ⇒ MEDIUM check, still ready (recomputed)", (() => { const x = C.precheckInvoice(noStated); return x.ready === true && checkOf(x, "vat-consistency").severity === "MEDIUM"; })());

  // HONESTY: note disclaims legal certification + the composed-module disclaimers
  check("note: pre-check NOT legal certification, SIRET≠exists, rate≠applies", /NOT a legal-compliance certification/.test(r.note) && /SIRET entity exists/.test(r.note) && /VAT rate legally applies/.test(r.note));
  check("siret check detail disclaims existence", /NOT a confirmation the company exists/.test(checkOf(r, "siret-checksum").detail));

  // composes + modifies none (only MANDATORY_FIELDS/precheckInvoice exported)
  check("exports pre-check + mandatory fields, no fiscal engine", typeof C.precheckInvoice === "function" && Array.isArray(C.MANDATORY_FIELDS) && C.MANDATORY_FIELDS.indexOf("sellerSiret") >= 0);

  // determinism + frozen + contract
  check("deterministic", JSON.stringify(C.precheckInvoice(validInvoice())) === JSON.stringify(r));
  check("frozen", Object.isFrozen(r) && Object.isFrozen(r.checks) && Object.isFrozen(r.computed));
  check("contract: composes-modifies-none, pre-check-not-certification, checksum≠existence",
    C.FR_INVOICE_COMPLIANCE_CONTRACT.invariants.some((s: string) => /MODIFIES NONE/.test(s)) &&
    C.FR_INVOICE_COMPLIANCE_CONTRACT.invariants.some((s: string) => /NOT a legal-compliance CERTIFICATION/.test(s)) &&
    C.FR_INVOICE_COMPLIANCE_CONTRACT.invariants.some((s: string) => /SIRET checksum ≠ existence/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-fr-invoice-compliance (composes REAL SIRET+VAT+LME: valid invoice ⇒ ready, HT130000/VAT21650/TTC151650; fidelity vs standalone; invalid SIRET / stated-VAT-mismatch / term>60 / missing-mention / missing-field / bad-line all block ready; no-stated-VAT ⇒ MEDIUM still ready; HONEST pre-check NOT legal certification [SIRET≠exists, rate≠applies]; deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
