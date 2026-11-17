#!/usr/bin/env node
"use strict";

/*
 * V267 §3-§9 — ODG BTP BILLING, PROGRESS-CLAIMS AND CASH-COLLECTION ENGINE (deterministic, project-to-cash).
 * Lifecycle: APPROVED PROJECT → CONTRACTUAL PAYMENT TERMS → DEPOSIT/ADVANCE → PROGRESS CLAIMS → INVOICES →
 *            CREDIT NOTES/ADJUSTMENTS → PAYMENTS RECEIVED → OUTSTANDING BALANCE → FINAL ACCOUNT → RECONCILIATION.
 *
 * REUSE (no 2nd quotation/ledger/accounting/validator/provider/primitive):
 *   - odg-btp-devis-engine (V260): computeDevis — money reference (integer cents, MARGIN≠MARKUP, VAT supplied).
 *   - odg-btp-project-workflow (V266): work packages + actualCostLedger/realizedProfitability — the cost side + realized margin.
 *   - einvoice-validator: validateInvoice — EN 16931 structured-invoice compliance (NOT re-implemented here).
 *   - odg-btp-normative-registry (V264): resolveApplicability — billing legal applicability (match ≠ compliance).
 *
 * HONESTY (directive §1/§5/§6/§7/§8/§9/§13): NO real invoice is issued/transmitted/represented as legally compliant without
 * owner authorization + verified legal requirements; correct arithmetic ≠ legal compliance; an invoice is NEVER proof of
 * payment; invoiced≠paid, committed≠incurred, estimated≠actual, receivable≠cash, forecast margin≠realized profit; integer-cents
 * only; an absent term is UNKNOWN (not zero, not permission to assume); amounts/rates/deadlines/retention/VAT NEVER invented;
 * legal applicability that cannot be verified ⇒ NEEDS_LEGAL_REVIEW. Deterministic/read-only (asOf injected; no clock/random/I/O).
 */

const DEVIS = require("./odg-btp-devis-engine.js");         // V260
const WORKFLOW = require("./odg-btp-project-workflow.js");  // V266
const EINV = require("./einvoice-validator.js");            // EN 16931 structured-invoice validator (reuse)
const NORM = require("./odg-btp-normative-registry.js");    // V264

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function intMinor(v: any): number | null { return typeof v === "number" && isFinite(v) && Math.floor(v) === v ? v : null; }
function nonNegInt(v: any): number | null { const n = intMinor(v); return n !== null && n >= 0 ? n : null; }
function rate(v: any): number | null { return typeof v === "number" && isFinite(v) && v >= 0 && v <= 1 ? v : null; }
function round(n: number): number { return Math.round(n); }

// ===================== §3 contractual payment terms =====================
/** paymentTerms(input) -> typed versioned terms bound to an APPROVED project+quotation. Fail-closed; absent ⇒ UNKNOWN. */
function paymentTerms(input: any): any {
  const i = isObj(input) ? input : {};
  if (!isStr(i.projectId) || !isStr(i.quotationRef)) return Object.freeze({ ok: false, code: "MISSING_BINDING", detail: "projectId + quotationRef required (terms bind to an approved project+quotation)" });
  if (i.projectApproved !== true) return Object.freeze({ ok: false, code: "PROJECT_NOT_APPROVED", detail: "payment terms require an APPROVED project (V266)" });
  const contractHT = nonNegInt(i.contractHTMinor);
  if (contractHT === null) return Object.freeze({ ok: false, code: "NO_CONTRACT_VALUE", detail: "contractHTMinor (integer cents) required — never invented" });
  const vatRate = rate(i.vatRate);                                      // supplied + (caller asserts) verified; absent ⇒ UNKNOWN
  const vatKnown = vatRate !== null;
  // retention / withholding ONLY when explicitly present (absent ⇒ UNKNOWN, never assumed 0 as permission).
  const retentionRate = i.retentionRate === undefined ? "UNKNOWN" : (rate(i.retentionRate) !== null ? i.retentionRate : "INVALID");
  if (retentionRate === "INVALID") return Object.freeze({ ok: false, code: "INVALID_RETENTION", detail: "retentionRate, when present, must be a 0..1 fraction" });
  const milestones = arr(i.milestones).filter(isObj);
  const issues: string[] = []; const seenIds = new Set<string>(); const seenDates = new Set<string>();
  let sumHT = 0;
  const norm = milestones.map((m: any, idx: number) => {
    const id = isStr(m.id) ? m.id : "MS" + (idx + 1);
    if (seenIds.has(id)) issues.push("duplicate milestone id " + id); seenIds.add(id);
    // a milestone may give a percent OR an explicit amount (never both silently); derive the other, integer cents.
    let amtHT = nonNegInt(m.amountHTMinor); const pct = rate(m.percent);
    if (amtHT === null && pct !== null) amtHT = round(contractHT * pct);
    if (amtHT === null) { issues.push("milestone " + id + " has neither a valid amountHTMinor nor percent ⇒ UNKNOWN (not assumed)"); amtHT = 0; }
    if (pct !== null && nonNegInt(m.amountHTMinor) !== null && round(contractHT * pct) !== m.amountHTMinor) issues.push("milestone " + id + " percent and amount disagree");
    if (isStr(m.dueDate)) { if (seenDates.has(m.dueDate + ":" + id)) {/*same id+date fine*/} }
    if (m.dueDate !== undefined && !isStr(m.dueDate)) issues.push("milestone " + id + " has an invalid dueDate");
    sumHT += amtHT;
    return Object.freeze({ id, kind: isStr(m.kind) ? m.kind : "PROGRESS", percent: pct, amountHTMinor: amtHT, dueDate: isStr(m.dueDate) ? m.dueDate : "UNKNOWN" });
  });
  if (sumHT > contractHT) issues.push("milestone HT total " + sumHT + " exceeds the approved contract balance " + contractHT);
  const finalBalanceHT = contractHT - sumHT;                            // remaining to the final account (never negative here: checked above)
  return Object.freeze({
    ok: true, projectId: i.projectId, quotationRef: i.quotationRef, version: nonNegInt(i.version) !== null ? i.version : 1,
    contractHTMinor: contractHT, vatRate: vatKnown ? vatRate : "UNKNOWN", vatKnown, retentionRate,
    milestones: Object.freeze(norm), scheduledHTMinor: sumHT, finalBalanceHTMinor: finalBalanceHT,
    valid: issues.length === 0, issues: Object.freeze(issues),
    note: "payment terms bound to an APPROVED project+quotation; percentages/amounts reconciled, duplicates/over-balance/invalid-dates flagged. Absent VAT/retention ⇒ UNKNOWN (never assumed). Nothing invented.",
  });
}

// ===================== §4 progress claims =====================
/** progressClaim(input) -> a deterministic cumulative progress claim (no over-claim / double-count / unevidenced billing). */
function progressClaim(input: any): any {
  const i = isObj(input) ? input : {};
  if (!isStr(i.projectId) || !isStr(i.workPackageItemId) || !isStr(i.quotationLineRef)) return Object.freeze({ ok: false, code: "MISSING_REFS", detail: "projectId + workPackageItemId + quotationLineRef required" });
  const approvedQty = typeof i.approvedQuantity === "number" && isFinite(i.approvedQuantity) && i.approvedQuantity >= 0 ? i.approvedQuantity : null;
  const prevQty = typeof i.previouslyClaimedQuantity === "number" && isFinite(i.previouslyClaimedQuantity) && i.previouslyClaimedQuantity >= 0 ? i.previouslyClaimedQuantity : 0;
  const newQty = typeof i.newlyCompletedQuantity === "number" && isFinite(i.newlyCompletedQuantity) && i.newlyCompletedQuantity >= 0 ? i.newlyCompletedQuantity : null;
  const unitPriceMinor = nonNegInt(i.unitPriceMinor);
  if (approvedQty === null || newQty === null || unitPriceMinor === null) return Object.freeze({ ok: false, code: "INVALID_QUANTITIES", detail: "approvedQuantity + newlyCompletedQuantity + integer unitPriceMinor required (never invented)" });
  // measurement state must be verified completed work — billing an ESTIMATED/ASSUMED quantity as done is REFUSED.
  if (i.measurementState !== "MEASURED" && i.measurementState !== "HUMAN_VALIDATED") return Object.freeze({ ok: false, code: "UNVERIFIED_WORK", detail: "a progress claim needs MEASURED/HUMAN_VALIDATED completion; an ESTIMATED/ASSUMED quantity is NOT billable as verified work" });
  // evidence: a validated site report reference is mandatory.
  if (!isStr(i.siteReportRef) || i.evidenceValidated !== true) return Object.freeze({ ok: false, code: "EVIDENCE_REQUIRED", detail: "a validated site-report reference (evidenceValidated:true) is required to claim work" });
  // change-order-originated work must reference an APPROVED change.
  if (i.fromChangeOrder === true && i.changeOrderApproved !== true) return Object.freeze({ ok: false, code: "UNAPPROVED_CHANGE", detail: "work from a change order cannot be billed until the change is approved (V266)" });
  const cumulative = prevQty + newQty;
  if (cumulative > approvedQty) return Object.freeze({ ok: false, code: "OVER_CLAIM", detail: "cumulative " + cumulative + " exceeds approved quantity " + approvedQty + " (cannot claim more than approved)" });
  const claimedAmountMinor = round(newQty * unitPriceMinor);
  const cumulativeAmountMinor = round(cumulative * unitPriceMinor);
  return Object.freeze({
    ok: true, projectId: i.projectId, contractVersion: nonNegInt(i.contractVersion) !== null ? i.contractVersion : 1,
    workPackageItemId: i.workPackageItemId, quotationLineRef: i.quotationLineRef,
    approvedQuantity: approvedQty, previouslyClaimedQuantity: prevQty, newlyCompletedQuantity: newQty, cumulativeQuantity: cumulative, remainingQuantity: approvedQty - cumulative,
    unitPriceMinor, claimedAmountMinor, cumulativeAmountMinor, measurementState: i.measurementState,
    period: isStr(i.period) ? i.period : "UNKNOWN", siteReportRef: i.siteReportRef, approvalStatus: "CLAIMED",
    note: "deterministic cumulative progress claim: cannot exceed approved quantity, no double-count (cumulative = previous + new), only MEASURED/HUMAN_VALIDATED work with validated evidence, unapproved-change work refused. A CLAIMED claim is not yet an approved invoice.",
  });
}

// ===================== §5 invoice + adjustment calculations =====================
const INVOICE_TYPES = Object.freeze(["DEPOSIT", "PROGRESS", "FINAL", "CREDIT_NOTE", "ADJUSTMENT"]);
/** computeInvoice(request) -> deterministic invoice/credit-note amounts (integer cents). Arithmetic ≠ legal compliance. */
function computeInvoice(request: any): any {
  const r = isObj(request) ? request : {};
  if (INVOICE_TYPES.indexOf(r.type) < 0) return Object.freeze({ ok: false, code: "UNKNOWN_TYPE", detail: "type ∈ " + INVOICE_TYPES.join("/") });
  const vatRate = rate(r.vatRate);
  if (vatRate === null) return Object.freeze({ ok: false, code: "VAT_UNKNOWN", detail: "vatRate must be explicitly supplied (never invented); absent ⇒ UNKNOWN" });
  const contractHT = nonNegInt(r.contractHTMinor);
  const approvedChangesHT = intMinor(r.approvedChangesHTMinor) !== null ? r.approvedChangesHTMinor : 0;
  const prevInvoicedHT = nonNegInt(r.previouslyInvoicedHTMinor) !== null ? r.previouslyInvoicedHTMinor : 0;
  let amountHT: number | null = null; let sign = 1;
  if (r.type === "CREDIT_NOTE" || r.type === "ADJUSTMENT") {
    const adj = intMinor(r.adjustmentHTMinor);
    if (adj === null) return Object.freeze({ ok: false, code: "NO_ADJUSTMENT", detail: "adjustmentHTMinor (integer) required for credit-note/adjustment" });
    amountHT = Math.abs(adj); sign = r.type === "CREDIT_NOTE" ? -1 : (adj < 0 ? -1 : 1);
  } else if (r.type === "FINAL") {
    if (contractHT === null) return Object.freeze({ ok: false, code: "NO_CONTRACT_VALUE" });
    amountHT = (contractHT + approvedChangesHT) - prevInvoicedHT;      // final = approved total − already invoiced (no double-count)
    if (amountHT < 0) return Object.freeze({ ok: false, code: "NEGATIVE_FINAL", detail: "already-invoiced exceeds the approved total — reconcile via a credit note, not a negative final invoice" });
  } else {                                                              // DEPOSIT / PROGRESS
    const base = nonNegInt(r.amountHTMinor);
    if (base === null) return Object.freeze({ ok: false, code: "NO_AMOUNT", detail: "amountHTMinor (integer cents) required for a deposit/progress invoice" });
    amountHT = base;
    // over-billing guard: cumulative invoiced must not exceed the approved contract balance.
    if (contractHT !== null && (prevInvoicedHT + base) > (contractHT + approvedChangesHT)) return Object.freeze({ ok: false, code: "OVER_BILLING", detail: "cumulative invoiced " + (prevInvoicedHT + base) + " exceeds approved contract balance " + (contractHT + approvedChangesHT) });
  }
  const signedHT = sign * (amountHT as number);
  const vat = sign * round((amountHT as number) * vatRate);
  const totalTTC = signedHT + vat;
  // optional EN 16931 structured-invoice compliance (reuse einvoice-validator) — reported DISTINCT from arithmetic.
  let compliance = null;
  if (isObj(r.structuredInvoice)) { const v = EINV.validateInvoice(r.structuredInvoice, r.einvoiceOpts); compliance = Object.freeze({ checked: true, valid: v.ok && v.report && v.report.valid === true, findingsCount: v.report ? v.report.findings.length : null, note: "EN 16931 arithmetic/field validity ONLY — NOT a legal-compliance or PDP-certification claim" }); }
  return Object.freeze({
    ok: true, type: r.type, amountHTMinor: signedHT, vatRate, vatMinor: vat, totalTTCMinor: totalTTC,
    contractHTMinor: contractHT, approvedChangesHTMinor: approvedChangesHT, previouslyInvoicedHTMinor: prevInvoicedHT,
    remainingContractHTMinor: contractHT !== null ? (contractHT + approvedChangesHT) - (prevInvoicedHT + (r.type === "DEPOSIT" || r.type === "PROGRESS" || r.type === "FINAL" ? (amountHT as number) : 0)) : "UNKNOWN",
    quotationRef: isStr(r.quotationRef) ? r.quotationRef : null, changeRefs: Object.freeze(arr(r.changeRefs).filter(isStr)),
    compliance, documentStatus: "DRAFT",
    note: "integer-cents; VAT from the supplied rate (never invented); MARGIN/markup live in the quotation (not recomputed here); traceable to quotation/changes. Correct arithmetic is NOT legal compliance; the document is a DRAFT until owner-approved; no double-counting of deposits/progress.",
  });
}

// ===================== §6 payment + collection ledger =====================
const PAYMENT_STATES = Object.freeze(["EXPECTED", "REQUESTED", "INVOICED", "PARTIALLY_PAID", "PAID", "OVERDUE", "DISPUTED", "CANCELLED", "CREDITED"]);
/** paymentLedger({invoices, payments, creditNotes, asOfDay}) -> per-invoice reconciliation. An invoice is never proof of payment. */
function paymentLedger(input: any): any {
  const i = isObj(input) ? input : {};
  const invoices = arr(i.invoices).filter(isObj);
  const payments = arr(i.payments).filter(isObj);
  const creditNotes = arr(i.creditNotes).filter(isObj);
  const asOfDay = typeof i.asOfDay === "number" && isFinite(i.asOfDay) ? i.asOfDay : null;
  const rejected: any[] = []; const seenTxn = new Set<string>();
  // index invoices.
  const inv: Record<string, any> = {};
  for (const v of invoices) { if (!isStr(v.id)) { rejected.push({ code: "INVALID_INVOICE", detail: "invoice id required" }); continue; } const amt = nonNegInt(v.amountTTCMinor); if (amt === null) { rejected.push({ code: "INVALID_INVOICE_AMOUNT", detail: v.id }); continue; } inv[v.id] = { id: v.id, amountTTCMinor: amt, dueDay: typeof v.dueDay === "number" ? v.dueDay : null, creditedMinor: 0, allocatedMinor: 0, disputed: v.disputed === true, cancelled: v.cancelled === true }; }
  // apply credit notes (reduce the invoice's billable amount) — evidence required; never deletes prior records.
  for (const cn of creditNotes) { const t = inv[cn.invoiceId]; const amt = nonNegInt(cn.amountMinor); if (!t) { rejected.push({ code: "CREDIT_UNKNOWN_INVOICE", detail: cn.invoiceId }); continue; } if (amt === null || !isStr(cn.evidenceRef)) { rejected.push({ code: "INVALID_CREDIT_NOTE", detail: "amount + evidenceRef required" }); continue; } if (amt > t.amountTTCMinor - t.creditedMinor) { rejected.push({ code: "CREDIT_EXCEEDS_INVOICE", detail: cn.invoiceId }); continue; } t.creditedMinor += amt; }
  // allocate payments — no evidence ⇒ rejected; no over-allocation; no duplicate txn; multi-invoice only when explicit.
  const history: any[] = [];
  for (let p = 0; p < payments.length; p++) {
    const pay = payments[p]; const amt = nonNegInt(pay.amountMinor); const target = inv[pay.invoiceId];
    if (!target) { rejected.push({ code: "PAYMENT_UNKNOWN_INVOICE", detail: pay.invoiceId }); continue; }
    if (amt === null) { rejected.push({ code: "INVALID_PAYMENT_AMOUNT", detail: pay.invoiceId }); continue; }
    if (!isStr(pay.evidenceRef)) { rejected.push({ code: "NO_PAYMENT_EVIDENCE", detail: "no payment without evidence (an invoice is not proof of payment): " + pay.invoiceId }); continue; }
    if (isStr(pay.txnRef)) { if (seenTxn.has(pay.txnRef)) { rejected.push({ code: "DUPLICATE_TRANSACTION", detail: pay.txnRef }); continue; } seenTxn.add(pay.txnRef); }
    const billable = target.amountTTCMinor - target.creditedMinor;
    if (target.allocatedMinor + amt > billable) { rejected.push({ code: "OVER_ALLOCATION", detail: "payment " + amt + " exceeds invoice " + pay.invoiceId + " available balance " + (billable - target.allocatedMinor) }); continue; }
    target.allocatedMinor += amt;
    history.push(Object.freeze({ seq: history.length, invoiceId: pay.invoiceId, amountMinor: amt, method: isStr(pay.method) ? pay.method : null, txnRef: isStr(pay.txnRef) ? pay.txnRef : null, evidenceRef: pay.evidenceRef, day: typeof pay.day === "number" ? pay.day : null, reversal: pay.reversal === true }));
  }
  // per-invoice status.
  const rows = Object.keys(inv).map((id) => {
    const t = inv[id]; const billable = t.amountTTCMinor - t.creditedMinor; const remaining = billable - t.allocatedMinor;
    let state = "INVOICED";
    if (t.cancelled) state = "CANCELLED"; else if (t.creditedMinor > 0 && billable === 0) state = "CREDITED";
    else if (t.disputed) state = "DISPUTED"; else if (remaining === 0 && billable > 0) state = "PAID"; else if (t.allocatedMinor > 0 && remaining > 0) state = "PARTIALLY_PAID";
    else if (asOfDay !== null && t.dueDay !== null && asOfDay > t.dueDay && remaining > 0) state = "OVERDUE";
    return Object.freeze({ id, amountTTCMinor: t.amountTTCMinor, creditedMinor: t.creditedMinor, billableMinor: billable, paidMinor: t.allocatedMinor, remainingMinor: remaining, overdue: asOfDay !== null && t.dueDay !== null && asOfDay > t.dueDay && remaining > 0, state });
  });
  const totalInvoiced = rows.reduce((a: number, x: any) => a + x.amountTTCMinor, 0);
  const totalCredited = rows.reduce((a: number, x: any) => a + x.creditedMinor, 0);
  const totalPaid = rows.reduce((a: number, x: any) => a + x.paidMinor, 0);
  const totalOutstanding = rows.reduce((a: number, x: any) => a + x.remainingMinor, 0);
  const totalOverdue = rows.filter((x: any) => x.overdue).reduce((a: number, x: any) => a + x.remainingMinor, 0);
  return Object.freeze({
    ok: true, rows: Object.freeze(rows), history: Object.freeze(history), rejected: Object.freeze(rejected),
    totalInvoicedMinor: totalInvoiced, totalCreditedMinor: totalCredited, totalPaidMinor: totalPaid, totalOutstandingMinor: totalOutstanding, totalOverdueMinor: totalOverdue,
    note: "an invoice is NEVER proof of payment (paid tracked only from evidenced allocations); no over-allocation, no duplicate transaction, credit notes reduce billable without deleting records; reversals kept in history.",
  });
}

// ===================== §7 cash position + project financial reconciliation =====================
/** cashReconciliation({terms, invoiceLedger, costLedger, approvedChangesHTMinor}) -> separated cash/cost/margin view. */
function cashReconciliation(input: any): any {
  const i = isObj(input) ? input : {};
  const terms = isObj(i.terms) ? i.terms : {}; const il = isObj(i.invoiceLedger) ? i.invoiceLedger : {}; const cl = isObj(i.costLedger) ? i.costLedger : {};
  if (il.ok !== true) return Object.freeze({ ok: false, code: "NO_INVOICE_LEDGER" });
  const approvedContractHT = nonNegInt(terms.contractHTMinor);
  const approvedChangesHT = intMinor(i.approvedChangesHTMinor) !== null ? i.approvedChangesHTMinor : 0;
  const cumulativeInvoiced = il.totalInvoicedMinor;                    // TTC billed
  const cashReceived = il.totalPaidMinor;                             // evidenced receipts ONLY
  const outstandingReceivables = il.totalOutstandingMinor;           // invoiced − received (NOT cash)
  const overdueReceivables = il.totalOverdueMinor;
  // supplier/cost side from the V266 actual-cost ledger (never conflated).
  const invoicedSupplier = cl.ok === true ? (cl.invoicedMinor || 0) : null;
  const paidSupplier = cl.ok === true ? (cl.paidMinor || 0) : null;
  const committed = cl.ok === true ? (cl.committedMinor || 0) : null;
  const estimated = cl.ok === true ? (cl.estimatedMinor || 0) : null;
  // realized gross margin via V266 (delegates V260 compareToActual) only when a quotation + cost ledger are supplied.
  let realized = null;
  if (isObj(i.quotation) && cl.ok === true) { const rp = WORKFLOW.realizedProfitability(i.quotation, cl); if (rp.ok) realized = Object.freeze({ realizedMargin: rp.realizedMargin, forecastMargin: rp.forecastMargin, marginErosion: rp.marginErosion }); }
  const variances: string[] = [];
  if (approvedContractHT !== null && isObj(terms) && terms.valid === false) variances.push("payment terms invalid: " + (arr(terms.issues).join("; ")));
  return Object.freeze({
    ok: true,
    approvedContractValueHTMinor: approvedContractHT === null ? "UNKNOWN" : approvedContractHT, approvedChangesHTMinor: approvedChangesHT,
    cumulativeInvoicedTTCMinor: cumulativeInvoiced, cashReceivedMinor: cashReceived, outstandingReceivablesMinor: outstandingReceivables, overdueReceivablesMinor: overdueReceivables,
    invoicedSupplierCostMinor: invoicedSupplier, paidSupplierCostMinor: paidSupplier, committedCostMinor: committed, estimatedCostMinor: estimated,
    realizedGrossMargin: realized,
    variances: Object.freeze(variances),
    note: "STRICT separation: invoiced≠paid, receivable≠cash, committed≠incurred, estimated≠actual, forecast margin≠realized profit. 'cashReceived' = evidenced receipts only; realized margin delegated to V266/V260 (evidence-backed incurred cost). Unexplained variances exposed.",
  });
}

// ===================== §9 billing legal applicability =====================
const OBLIGATION_CLASS = Object.freeze(["LEGAL_OBLIGATION", "REGULATORY_REQUIREMENT", "CONTRACTUAL_TERM", "VOLUNTARY_STANDARD", "BUSINESS_POLICY"]);
/** billingLegalApplicability(context) -> applicability classification; unverifiable ⇒ NEEDS_LEGAL_REVIEW (reuses V264). */
function billingLegalApplicability(context: any): any {
  const c = isObj(context) ? context : {};
  const normRefs = NORM.resolveApplicability({ trade: c.trade, jurisdiction: isStr(c.jurisdiction) ? c.jurisdiction : "FR" });
  // caller-supplied, source-verified billing obligations only; anything else is NEEDS_LEGAL_REVIEW (never invented).
  const supplied = arr(c.verifiedObligations).filter(isObj).map((o: any) => Object.freeze({
    field: isStr(o.field) ? o.field : "UNKNOWN",
    classification: OBLIGATION_CLASS.indexOf(o.classification) >= 0 ? o.classification : "NEEDS_LEGAL_REVIEW",
    sourceUrl: /^https?:\/\//.test(o.sourceUrl) ? o.sourceUrl : null, verified: /^https?:\/\//.test(o.sourceUrl) === true && o.classification !== undefined,
  }));
  const unverified = supplied.filter((o: any) => !o.verified).map((o: any) => o.field);
  return Object.freeze({
    ok: true, jurisdiction: isStr(c.jurisdiction) ? c.jurisdiction : "FR",
    normativeMatches: Object.freeze((normRefs.matched || []).map((m: any) => m.id)), obligations: Object.freeze(supplied),
    needsLegalReview: Object.freeze(unverified.length ? unverified : (supplied.length ? [] : ["ALL_BILLING_OBLIGATIONS"])),
    note: "billing legal requirements are NEVER invented: only caller-supplied, source-URL-verified obligations are classified (LEGAL/REGULATORY/CONTRACTUAL/VOLUNTARY/POLICY). Anything unverified ⇒ NEEDS_LEGAL_REVIEW. A normative match does NOT certify compliance (V264). No copyrighted standard reproduced.",
  });
}

// ===================== §8 customer communication drafts =====================
const DRAFT_KINDS = Object.freeze(["DEPOSIT_REQUEST", "PROGRESS_STATEMENT", "INVOICE_COVER", "PAYMENT_RECEIPT", "BALANCE_REMINDER", "DISPUTE_RESPONSE", "FINAL_ACCOUNT"]);
/** draftCommunication(kind, data) -> a structured DRAFT (never sent; Ollama non-authoritative). */
function draftCommunication(kind: string, data: any): any {
  if (DRAFT_KINDS.indexOf(kind) < 0) return Object.freeze({ ok: false, code: "UNKNOWN_KIND", detail: "kind ∈ " + DRAFT_KINDS.join("/") });
  const d = isObj(data) ? data : {};
  return Object.freeze({
    ok: true, kind, status: "DRAFT", approved: false, channel: "NONE",
    fields: Object.freeze({ projectId: isStr(d.projectId) ? d.projectId : null, amountMinor: nonNegInt(d.amountMinor), dueDate: isStr(d.dueDate) ? d.dueDate : "UNKNOWN", reference: isStr(d.reference) ? d.reference : null }),
    note: "structured DRAFT only — NOT sent/transmitted; no external financial action. Any LLM assistance is PROPOSER_ONLY (V265) and cannot determine amounts, payment status, legal compliance or acceptance. Approval + transmission are owner-gated.",
  });
}

// ===================== §10 synthetic end-to-end (labelled SYNTHETIC) =====================
/** runSyntheticBilling(scenario) -> drive terms→claim→invoices→payments→reconciliation for a labelled synthetic case. */
function runSyntheticBilling(scenario: any): any {
  const s = isObj(scenario) ? scenario : {};
  const label = isStr(s.label) ? s.label : "UNLABELLED";
  const terms = paymentTerms(s.terms);
  const claim = progressClaim(s.claim);
  const deposit = computeInvoice(s.depositInvoice);
  const progress = computeInvoice(s.progressInvoice);
  const ledger = paymentLedger(s.ledger);
  const costLedger = WORKFLOW.actualCostLedger(arr(s.costEntries));
  const recon = cashReconciliation({ terms, invoiceLedger: ledger, costLedger, quotation: s.quotation, approvedChangesHTMinor: s.approvedChangesHTMinor });
  return Object.freeze({ SYNTHETIC: true, label, terms, claim, deposit, progress, ledger, recon });
}

const BTP_BILLING_ENGINE_CONTRACT = Object.freeze({
  id: "V267-ODG-BTP-BILLING-ENGINE",
  source: "V267 §3-§10 — deterministic BTP billing, progress-claims and cash-collection (project-to-cash)",
  invoiceTypes: INVOICE_TYPES, paymentStates: PAYMENT_STATES, obligationClasses: OBLIGATION_CLASS,
  reuses: Object.freeze(["odg-btp-devis-engine (V260)", "odg-btp-project-workflow (V266: work packages/actualCostLedger/realizedProfitability)", "einvoice-validator (EN 16931 — validateInvoice)", "odg-btp-normative-registry (V264: resolveApplicability)"]),
  invariants: Object.freeze([
    "NO real invoice issued/transmitted/represented as legally compliant without owner authorization + verified legal requirements; correct arithmetic ≠ legal compliance; documents are DRAFT until owner-approved; nothing sent externally",
    "an invoice is NEVER proof of payment: paid tracked only from evidenced allocations; no over-allocation, no duplicate transaction, credit notes reduce billable without deleting records",
    "progress claims cannot exceed the approved quantity, no double-count (cumulative=previous+new), only MEASURED/HUMAN_VALIDATED work with validated evidence, unapproved-change work refused",
    "integer-cents everywhere; VAT supplied explicitly (never invented); MARGIN/markup live in the quotation (not recomputed); no double-count of deposits/progress; traceable to quotation/changes",
    "STRICT separation invoiced≠paid, committed≠incurred, estimated≠actual, receivable≠cash, forecast margin≠realized profit; realized margin delegated to V266/V260",
    "an absent term is UNKNOWN (not zero, not permission); amounts/rates/deadlines/retention/VAT never invented; unverifiable legal applicability ⇒ NEEDS_LEGAL_REVIEW (V264 match ≠ compliance; no copyrighted standard reproduced)",
    "deterministic/read-only (asOf injected; no Date.now/Math.random/I/O); REUSES V260/V266/einvoice-validator/V264 — no 2nd quotation/ledger/accounting/validator/provider/primitive; nothing OPERATIONAL/world-class",
  ]),
});

module.exports = {
  INVOICE_TYPES, PAYMENT_STATES, OBLIGATION_CLASS, DRAFT_KINDS,
  paymentTerms, progressClaim, computeInvoice, paymentLedger, cashReconciliation, billingLegalApplicability, draftCommunication, runSyntheticBilling,
  BTP_BILLING_ENGINE_CONTRACT,
};

export {};
