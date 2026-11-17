#!/usr/bin/env node
"use strict";
/* V267 — ODG BTP billing / progress-claims / cash-collection. Tests ACTUAL numbers, state transitions and refusal
 * conditions: contractual payment terms, cumulative progress claims (no over-claim/double-count), invoice+credit-note
 * arithmetic (integer cents, VAT supplied), payment allocation (no over-allocation/duplicate/unevidenced), cash
 * reconciliation (invoiced≠paid, receivable≠cash, forecast≠realized margin), legal NEEDS_LEGAL_REVIEW, DRAFT comms.
 * Every fixture is labelled SYNTHETIC — no real customer/invoice/payment/compliance implied. */
const B = require("./odg-btp-billing-engine.js");
const DEVIS = require("./odg-btp-devis-engine.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

const MASONRY_REQ = { overheadRate: 0.10, marginRate: 0.20, vatRate: 0.20, lines: [{ id: "L1", quantity: 100, materialQty: 100, materialUnitPriceMinor: 500, labourHours: 10, labourRateMinor: 4000, measurementState: "MEASURED" }] };

function main() {
  const quotation = DEVIS.computeDevis(MASONRY_REQ);   // sellingHT 118800 (contract HT)

  // ===== §3 contractual payment terms =====
  const terms = B.paymentTerms({ projectId: "P1", quotationRef: "Q1", projectApproved: true, contractHTMinor: 118800, vatRate: 0.20, milestones: [{ id: "MS1", kind: "DEPOSIT", percent: 0.30 }, { id: "MS2", percent: 0.30 }, { id: "MS3", percent: 0.30 }] });
  check("paymentTerms: deposit+2 progress @30% ⇒ scheduledHT 106920, finalBalanceHT 11880, valid; VAT known", terms.ok && terms.scheduledHTMinor === 106920 && terms.finalBalanceHTMinor === 11880 && terms.valid === true && terms.vatKnown === true && terms.milestones[0].amountHTMinor === 35640);
  check("paymentTerms fail-closed: not APPROVED ⇒ PROJECT_NOT_APPROVED; no contract value ⇒ NO_CONTRACT_VALUE",
    B.paymentTerms({ projectId: "P", quotationRef: "Q", contractHTMinor: 1 }).code === "PROJECT_NOT_APPROVED" && B.paymentTerms({ projectId: "P", quotationRef: "Q", projectApproved: true }).code === "NO_CONTRACT_VALUE");
  check("paymentTerms: milestones exceeding contract balance ⇒ flagged invalid (not silently accepted)",
    B.paymentTerms({ projectId: "P", quotationRef: "Q", projectApproved: true, contractHTMinor: 118800, milestones: [{ percent: 0.30 }, { percent: 0.30 }, { percent: 0.30 }, { percent: 0.30 }, { percent: 0.30 }] }).issues.some((x: string) => /exceeds the approved contract balance/.test(x)));
  check("paymentTerms: absent VAT/retention ⇒ UNKNOWN (not assumed 0)", (() => { const t = B.paymentTerms({ projectId: "P", quotationRef: "Q", projectApproved: true, contractHTMinor: 100000, milestones: [] }); return t.vatRate === "UNKNOWN" && t.retentionRate === "UNKNOWN"; })());

  // ===== §4 progress claims =====
  const claim = B.progressClaim({ projectId: "P1", workPackageItemId: "L1", quotationLineRef: "L1", approvedQuantity: 100, previouslyClaimedQuantity: 40, newlyCompletedQuantity: 30, unitPriceMinor: 1188, measurementState: "MEASURED", siteReportRef: "SR1", evidenceValidated: true });
  check("progressClaim: cumulative 70, remaining 30, claimedAmount 35640, cumulativeAmount 83160 (no double-count)",
    claim.ok && claim.cumulativeQuantity === 70 && claim.remainingQuantity === 30 && claim.claimedAmountMinor === 35640 && claim.cumulativeAmountMinor === 83160);
  check("progressClaim REFUSES over-claim (cumulative>approved) ⇒ OVER_CLAIM",
    B.progressClaim({ projectId: "P1", workPackageItemId: "L1", quotationLineRef: "L1", approvedQuantity: 100, previouslyClaimedQuantity: 80, newlyCompletedQuantity: 30, unitPriceMinor: 1188, measurementState: "MEASURED", siteReportRef: "SR", evidenceValidated: true }).code === "OVER_CLAIM");
  check("progressClaim REFUSES billing ESTIMATED work as verified ⇒ UNVERIFIED_WORK",
    B.progressClaim({ projectId: "P1", workPackageItemId: "L1", quotationLineRef: "L1", approvedQuantity: 100, newlyCompletedQuantity: 10, unitPriceMinor: 1188, measurementState: "ESTIMATED", siteReportRef: "SR", evidenceValidated: true }).code === "UNVERIFIED_WORK");
  check("progressClaim REFUSES without validated evidence ⇒ EVIDENCE_REQUIRED",
    B.progressClaim({ projectId: "P1", workPackageItemId: "L1", quotationLineRef: "L1", approvedQuantity: 100, newlyCompletedQuantity: 10, unitPriceMinor: 1188, measurementState: "MEASURED" }).code === "EVIDENCE_REQUIRED");
  check("progressClaim REFUSES unapproved change-order work ⇒ UNAPPROVED_CHANGE",
    B.progressClaim({ projectId: "P1", workPackageItemId: "L1", quotationLineRef: "L1", approvedQuantity: 100, newlyCompletedQuantity: 10, unitPriceMinor: 1188, measurementState: "MEASURED", siteReportRef: "SR", evidenceValidated: true, fromChangeOrder: true, changeOrderApproved: false }).code === "UNAPPROVED_CHANGE");

  // ===== §5 invoice + adjustment calculations =====
  const dep = B.computeInvoice({ type: "DEPOSIT", amountHTMinor: 35640, vatRate: 0.20, contractHTMinor: 118800, previouslyInvoicedHTMinor: 0, quotationRef: "Q1" });
  check("computeInvoice DEPOSIT: HT 35640, VAT 7128, TTC 42768, remainingContractHT 83160, documentStatus DRAFT",
    dep.ok && dep.amountHTMinor === 35640 && dep.vatMinor === 7128 && dep.totalTTCMinor === 42768 && dep.remainingContractHTMinor === 83160 && dep.documentStatus === "DRAFT");
  const fin = B.computeInvoice({ type: "FINAL", vatRate: 0.20, contractHTMinor: 118800, previouslyInvoicedHTMinor: 106920 });
  check("computeInvoice FINAL: HT = 118800−106920 = 11880, VAT 2376, TTC 14256 (no double-count of prior invoices)", fin.ok && fin.amountHTMinor === 11880 && fin.vatMinor === 2376 && fin.totalTTCMinor === 14256);
  const cn = B.computeInvoice({ type: "CREDIT_NOTE", adjustmentHTMinor: 5000, vatRate: 0.20 });
  check("computeInvoice CREDIT_NOTE: negative HT −5000, VAT −1000, TTC −6000", cn.ok && cn.amountHTMinor === -5000 && cn.vatMinor === -1000 && cn.totalTTCMinor === -6000);
  check("computeInvoice REFUSES over-billing (cumulative>contract) ⇒ OVER_BILLING",
    B.computeInvoice({ type: "PROGRESS", amountHTMinor: 100000, vatRate: 0.20, contractHTMinor: 118800, previouslyInvoicedHTMinor: 35640 }).code === "OVER_BILLING");
  check("computeInvoice REFUSES unsupplied VAT ⇒ VAT_UNKNOWN (never invented)", B.computeInvoice({ type: "DEPOSIT", amountHTMinor: 100 }).code === "VAT_UNKNOWN");
  // arithmetic ≠ legal compliance: a structured-invoice check is reported distinctly and never claims legal compliance.
  const withCompliance = B.computeInvoice({ type: "DEPOSIT", amountHTMinor: 35640, vatRate: 0.20, contractHTMinor: 118800, structuredInvoice: { id: "F1", issueDate: "2026-11-17", currency: "EUR" } });
  check("computeInvoice: EN 16931 compliance reported DISTINCT from arithmetic (not a legal-compliance claim)", withCompliance.compliance && withCompliance.compliance.checked === true && /NOT a legal-compliance/.test(withCompliance.compliance.note));

  // ===== §6 payment + collection ledger =====
  const ledger = B.paymentLedger({
    asOfDay: 70,
    invoices: [{ id: "INV-DEP", amountTTCMinor: 42768, dueDay: 30 }, { id: "INV-PRG", amountTTCMinor: 42768, dueDay: 60 }],
    payments: [
      { invoiceId: "INV-DEP", amountMinor: 20000, txnRef: "t1", evidenceRef: "e1", day: 25 },      // partial
      { invoiceId: "INV-DEP", amountMinor: 22768, txnRef: "t2", evidenceRef: "e2", day: 28 },      // completes INV-DEP
      { invoiceId: "INV-DEP", amountMinor: 1, txnRef: "t2", evidenceRef: "e9" },                   // duplicate txn ⇒ rejected
      { invoiceId: "INV-PRG", amountMinor: 50000, evidenceRef: "e3" },                             // over-allocation ⇒ rejected
      { invoiceId: "INV-PRG", amountMinor: 1000 },                                                  // no evidence ⇒ rejected
    ],
    creditNotes: [{ invoiceId: "INV-PRG", amountMinor: 5000, evidenceRef: "c1" }],
  });
  const depRow = ledger.rows.find((r: any) => r.id === "INV-DEP"); const prgRow = ledger.rows.find((r: any) => r.id === "INV-PRG");
  check("paymentLedger: INV-DEP fully paid 42768 ⇒ PAID; INV-PRG credited 5000 ⇒ billable 37768, unpaid+overdue ⇒ OVERDUE",
    depRow.state === "PAID" && depRow.remainingMinor === 0 && prgRow.billableMinor === 37768 && prgRow.remainingMinor === 37768 && prgRow.state === "OVERDUE");
  check("paymentLedger totals: invoiced 85536, credited 5000, paid 42768 (evidenced only), outstanding 37768, overdue 37768",
    ledger.totalInvoicedMinor === 85536 && ledger.totalCreditedMinor === 5000 && ledger.totalPaidMinor === 42768 && ledger.totalOutstandingMinor === 37768 && ledger.totalOverdueMinor === 37768);
  check("paymentLedger REJECTS duplicate transaction, over-allocation and unevidenced payment (invoice ≠ proof of payment)",
    ledger.rejected.some((r: any) => r.code === "DUPLICATE_TRANSACTION") && ledger.rejected.some((r: any) => r.code === "OVER_ALLOCATION") && ledger.rejected.some((r: any) => r.code === "NO_PAYMENT_EVIDENCE"));

  // ===== §7 cash position + reconciliation =====
  const costLedger = B.runSyntheticBilling ? require("./odg-btp-project-workflow.js").actualCostLedger([
    { phase: "PAID", category: "MATERIAL", amountMinor: 52000, evidenceRef: "f" },
    { phase: "INVOICED", category: "LABOUR", amountMinor: 41000, evidenceRef: "s" },
    { phase: "COMMITTED", category: "MATERIAL", amountMinor: 10000 },
    { phase: "ESTIMATED", category: "OVERHEAD", amountMinor: 9900 },
  ]) : null;
  const recon = B.cashReconciliation({ terms, invoiceLedger: ledger, costLedger, quotation, approvedChangesHTMinor: 0 });
  check("cashReconciliation separates: invoiced 85536 ≠ cash 42768; outstanding 37768; receivable ≠ cash",
    recon.ok && recon.cumulativeInvoicedTTCMinor === 85536 && recon.cashReceivedMinor === 42768 && recon.outstandingReceivablesMinor === 37768);
  check("cashReconciliation cost side: invoicedSupplier 41000, paidSupplier 52000, committed 10000, estimated 9900 (never conflated)",
    recon.invoicedSupplierCostMinor === 41000 && recon.paidSupplierCostMinor === 52000 && recon.committedCostMinor === 10000 && recon.estimatedCostMinor === 9900);
  check("cashReconciliation realized margin via V266/V260 = 25800 (incurred only), forecast 19800, erosion −6000 — forecast ≠ realized",
    recon.realizedGrossMargin && recon.realizedGrossMargin.realizedMargin === 25800 && recon.realizedGrossMargin.forecastMargin === 19800 && recon.realizedGrossMargin.marginErosion === -6000);

  // ===== §9 billing legal applicability =====
  const legal = B.billingLegalApplicability({ trade: "electrical", jurisdiction: "FR", verifiedObligations: [{ field: "mentions-obligatoires-facture", classification: "LEGAL_OBLIGATION", sourceUrl: "https://entreprendre.service-public.fr/vosdroits/F31808" }, { field: "penalites-retard", classification: "LEGAL_OBLIGATION" }] });
  check("billingLegalApplicability: source-verified obligation classified; unverified field ⇒ NEEDS_LEGAL_REVIEW (never invented)",
    legal.ok && legal.obligations[0].verified === true && legal.needsLegalReview.indexOf("penalites-retard") >= 0);
  check("billingLegalApplicability: no supplied obligations ⇒ needsLegalReview ALL_BILLING_OBLIGATIONS", B.billingLegalApplicability({ trade: "x" }).needsLegalReview.indexOf("ALL_BILLING_OBLIGATIONS") >= 0);

  // ===== §8 drafts =====
  const draft = B.draftCommunication("DEPOSIT_REQUEST", { projectId: "P1", amountMinor: 42768, dueDate: "2026-12-01" });
  check("draftCommunication: DRAFT, not approved, channel NONE (never sent; LLM non-authoritative)", draft.ok && draft.status === "DRAFT" && draft.approved === false && draft.channel === "NONE");
  check("draftCommunication unknown kind ⇒ UNKNOWN_KIND", B.draftCommunication("PAY_NOW", {}).code === "UNKNOWN_KIND");

  // ===== §10 synthetic end-to-end + determinism + contract =====
  const scen = { label: "deposit+progress", terms: { projectId: "P1", quotationRef: "Q1", projectApproved: true, contractHTMinor: 118800, vatRate: 0.20, milestones: [{ id: "MS1", percent: 0.30 }, { id: "MS2", percent: 0.30 }] }, claim: { projectId: "P1", workPackageItemId: "L1", quotationLineRef: "L1", approvedQuantity: 100, newlyCompletedQuantity: 30, unitPriceMinor: 1188, measurementState: "MEASURED", siteReportRef: "SR1", evidenceValidated: true }, depositInvoice: { type: "DEPOSIT", amountHTMinor: 35640, vatRate: 0.20, contractHTMinor: 118800 }, progressInvoice: { type: "PROGRESS", amountHTMinor: 35640, vatRate: 0.20, contractHTMinor: 118800, previouslyInvoicedHTMinor: 35640 }, ledger: { invoices: [{ id: "INV-DEP", amountTTCMinor: 42768 }], payments: [{ invoiceId: "INV-DEP", amountMinor: 42768, evidenceRef: "e", txnRef: "t" }] }, costEntries: [{ phase: "PAID", category: "MATERIAL", amountMinor: 52000, evidenceRef: "f" }, { phase: "INVOICED", category: "LABOUR", amountMinor: 41000, evidenceRef: "s" }], quotation };
  const run = B.runSyntheticBilling(scen);
  check("runSyntheticBilling: SYNTHETIC labelled, deposit TTC 42768, cash 42768 fully received, realized margin 25800",
    run.SYNTHETIC === true && run.deposit.totalTTCMinor === 42768 && run.ledger.totalPaidMinor === 42768 && run.recon.realizedGrossMargin.realizedMargin === 25800);
  check("deterministic + frozen", JSON.stringify(B.runSyntheticBilling(scen)) === JSON.stringify(B.runSyntheticBilling(scen)) && Object.isFrozen(B.INVOICE_TYPES));
  check("contract: reuses V260/V266/einvoice/V264; invoice≠payment; estimated≠billable; forecast≠realized; no 2nd ledger",
    B.BTP_BILLING_ENGINE_CONTRACT.reuses.some((r: string) => /V266/.test(r)) && B.BTP_BILLING_ENGINE_CONTRACT.reuses.some((r: string) => /einvoice-validator/.test(r)) &&
    B.BTP_BILLING_ENGINE_CONTRACT.invariants.some((i: string) => /NEVER proof of payment/.test(i)) && B.BTP_BILLING_ENGINE_CONTRACT.invariants.some((i: string) => /no 2nd quotation\/ledger/.test(i)));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-btp-billing-engine (V267: deterministic project-to-cash; versioned payment terms [absent⇒UNKNOWN]; cumulative progress claims [no over-claim/double-count, evidence+MEASURED required]; invoice/credit-note integer-cent arithmetic [DEPOSIT 42768/FINAL 14256/CN −6000, VAT supplied]; payment ledger [invoice≠proof, no over-alloc/dup/unevidenced]; cash reconciliation [invoiced 85536≠cash 42768, realized margin 25800≠forecast 19800]; NEEDS_LEGAL_REVIEW; DRAFT comms; reuses V260/V266/einvoice/V264 — no 2nd ledger)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
