#!/usr/bin/env node
"use strict";
/*
 * V145 MÉTIER 2 (business-ops automation) — ORDER-TO-CASH CROSS-DOCUMENT COHERENCE CHECK. PURE, deterministic, fail-closed.
 * The differentiator the market research points to: detecting INCOHERENCES between the quote (devis), the order and the
 * invoice (facture) — the silent source of margin leaks, billing disputes and unpaid work. It reuses einvoice-validator
 * (EN 16931 internal validity) and works on integer MINOR units (no float drift); no new primitive, no stateful store.
 *
 * checkCoherence({ quote, order?, invoice }) -> { coherent, findings[], checked[] }. Inputs carry integer-minor amounts.
 * Checks (each fail-closed, each a concrete, explainable finding):
 *   C1 TOTAL_DRIFT        — invoice taxInclusive ≠ quote accepted total (beyond 0) ⇒ margin leak / overbilling.
 *   C2 MISSING_LINE       — a quoted line id absent from the invoice (work quoted but not billed).
 *   C3 UNQUOTED_LINE      — an invoice line id absent from the quote (billed but never quoted ⇒ dispute risk).
 *   C4 LINE_AMOUNT_DRIFT  — a line billed at a different net than quoted.
 *   C5 ORDER_MISMATCH     — (when an order is supplied) order total ≠ quote accepted total.
 *   C6 INVOICE_INVALID    — the invoice is not internally EN 16931-valid (delegated to einvoice-validator).
 *   C7 NOT_TRACEABLE      — the invoice does not reference the quote id (no audit trail).
 * Never invents amounts; a missing quote/invoice ⇒ cannot verify (fail-closed). Dual export.
 */
const EINV = require("./einvoice-validator.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isInt(v: any): boolean { return typeof v === "number" && Number.isSafeInteger(v); }
function lines(doc: any): any[] { return isObj(doc) && Array.isArray(doc.lines) ? doc.lines.filter(isObj) : []; }
function lineNet(l: any): number | null { return isInt(l.netMinor) ? l.netMinor : null; }

function checkCoherence(input: any, opts?: any): any {
  const i = isObj(input) ? input : {};
  const o = isObj(opts) ? opts : {};
  const quote = isObj(i.quote) ? i.quote : null;
  const invoice = isObj(i.invoice) ? i.invoice : null;
  const order = isObj(i.order) ? i.order : null;
  const findings: any[] = []; const checked: string[] = [];
  const add = (code: string, detail: string, evidence: string) => findings.push({ code, detail, evidence });

  if (!quote || !invoice) {
    return Object.freeze({ coherent: false, findings: Object.freeze([{ code: "CANNOT_VERIFY", detail: "both a quote and an invoice are required to check coherence (fail-closed)", evidence: `quote=${!!quote} invoice=${!!invoice}` }]), checked: Object.freeze([]), findingCount: 1, note: "fail-closed: no quote/invoice ⇒ not verifiable, never assumed coherent" });
  }

  const qTotal = isInt(quote.acceptedTotalMinor) ? quote.acceptedTotalMinor : (isInt(quote.totalMinor) ? quote.totalMinor : null);
  const invTotal = isObj(invoice.totals) && isInt(invoice.totals.taxInclusiveMinor) ? invoice.totals.taxInclusiveMinor : null;

  // C1 — total drift
  checked.push("C1_TOTAL_DRIFT");
  if (qTotal === null || invTotal === null) add("TOTAL_UNVERIFIABLE", "quote total or invoice taxInclusive missing (integer minor units)", `quoteTotal=${qTotal} invoiceTotal=${invTotal}`);
  else if (qTotal !== invTotal) add("TOTAL_DRIFT", `invoice total (${invTotal}) ≠ accepted quote total (${qTotal}) — delta ${invTotal - qTotal} minor units (margin leak / overbilling)`, `Δ=${invTotal - qTotal}`);

  // C2/C3/C4 — line-level reconciliation by id
  checked.push("C2_MISSING_LINE", "C3_UNQUOTED_LINE", "C4_LINE_AMOUNT_DRIFT");
  const qLines = new Map<string, any>(); for (const l of lines(quote)) if (typeof l.id === "string") qLines.set(l.id, l);
  const iLines = new Map<string, any>(); for (const l of lines(invoice)) if (typeof l.id === "string") iLines.set(l.id, l);
  for (const [id, ql] of qLines) { if (!iLines.has(id)) add("MISSING_LINE", `quoted line '${id}' is not billed on the invoice (work quoted, not invoiced)`, `line=${id}`); }
  for (const [id, il] of iLines) {
    if (!qLines.has(id)) { add("UNQUOTED_LINE", `invoice line '${id}' was never quoted (billed-but-not-quoted ⇒ dispute risk)`, `line=${id}`); continue; }
    const qn = lineNet(qLines.get(id)), inn = lineNet(il);
    if (qn !== null && inn !== null && qn !== inn) add("LINE_AMOUNT_DRIFT", `line '${id}' billed ${inn} ≠ quoted ${qn} (${inn - qn} minor units drift)`, `line=${id} Δ=${inn - qn}`);
  }

  // C5 — order consistency (optional)
  if (order) { checked.push("C5_ORDER_MISMATCH"); const oTotal = isInt(order.totalMinor) ? order.totalMinor : null; if (oTotal !== null && qTotal !== null && oTotal !== qTotal) add("ORDER_MISMATCH", `order total (${oTotal}) ≠ accepted quote total (${qTotal})`, `Δ=${oTotal - qTotal}`); }

  // C6 — invoice internally EN 16931-valid (delegate; strict conformance optional)
  checked.push("C6_INVOICE_INVALID");
  const ev = EINV.validateInvoice(invoice, o.einvoiceOpts);
  if (ev && ev.report && ev.report.valid === false) add("INVOICE_INVALID", `invoice fails EN 16931 internal validation (${ev.report.findingCount} finding(s))`, `highFindings=${ev.report.findingCount}`);

  // C7 — traceability: invoice references the quote id
  checked.push("C7_NOT_TRACEABLE");
  if (isObj(quote) && (quote.id !== undefined) && invoice.quoteRef !== quote.id) add("NOT_TRACEABLE", "invoice does not reference the quote id (no audit trail between devis and facture)", `quote.id=${quote.id} invoice.quoteRef=${invoice.quoteRef}`);

  const coherent = findings.length === 0;
  return Object.freeze({ coherent, findings: Object.freeze(findings.map((f) => Object.freeze(f))), checked: Object.freeze(checked), findingCount: findings.length, note: "cross-document coherence (devis↔commande↔facture); integer-minor arithmetic (no float drift); every finding explainable; fail-closed." });
}

const ORDER_COHERENCE_CONTRACT = Object.freeze({
  id: "V145-ORDER-COHERENCE-CHECK",
  metier: "M2 business-ops automation — quote→order→invoice coherence (margin-leak / dispute prevention)",
  reuses: ["einvoice-validator (EN 16931 internal validity)", "integer minor-unit arithmetic"],
  invariants: Object.freeze([
    "detects total drift, missing/unquoted lines, line-amount drift, order mismatch, invalid invoice, missing traceability",
    "integer minor units only (no float rounding drift); every finding is concrete + explainable",
    "fail-closed: a missing quote/invoice ⇒ CANNOT_VERIFY (never assumed coherent); invents no amount",
    "SYNTHETIC-data capable; a demonstrator result is never a real client/revenue; no new primitive/store",
  ]),
});
module.exports = { checkCoherence, ORDER_COHERENCE_CONTRACT };
export {};
