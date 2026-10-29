#!/usr/bin/env node
/**
 * finance-ledger-service — the Financial Auditing (#3) business capability: reconcile a REAL accounts-receivable
 * ledger — match many PAYMENTS against many INVOICES by reference — and emit a discrepancy audit. This is additive to
 * financial-reconciliation.ts, which reconciles the lifecycle STAGES of ONE transaction (anti-double-count); here we
 * match SETS of invoices↔payments and classify each invoice PAID / PARTIAL / OVERPAID / UNPAID with exact money.
 *
 * Reuses the money primitive economic-unit (EXACT integer minor units; same-unit enforcement — NO implicit FX).
 * Amounts are supplied as integer minor units (cents) + currency, so there is no floating-point error, ever.
 *
 * Honesty / fail-closed (deny-by-default):
 *   - a non-integer or missing amount ⇒ INVALID_INPUT (no silent coercion of money).
 *   - a payment whose currency differs from its invoice is a HIGH discrepancy — NEVER auto-converted.
 *   - an unmatched payment, an over-payment, and duplicate ids are surfaced as findings, never netted away.
 *   - this is a reconciliation/discrepancy report, NOT an accounting certification or audit opinion.
 * Pure/deterministic; no fs/network/clock. Findings use the SARIF-emittable {id,area,severity,detail,…} shape.
 */
"use strict";

const EU = require("./economic-unit.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isInt(n: any): boolean { return typeof n === "number" && Number.isInteger(n); }
function q(currency: string, minor: number, scale: number): any { return EU.quantity(currency, EU.KIND.COST_UNIT, minor, scale); }

/**
 * reconcileLedger(input): input = { invoices:[{id, amountMinor, currency, ref?}],
 *   payments:[{id, amountMinor, currency, invoiceRef}], scale? }. Payments match an invoice when
 * payment.invoiceRef === invoice.ref (or invoice.id). Returns { ok, report } or fail-closed error.
 */
function reconcileLedger(input: any): any {
  if (!isObj(input) || !Array.isArray(input.invoices) || !Array.isArray(input.payments)) return { ok: false, code: "INVALID_INPUT", reason: "input { invoices:[], payments:[] } required" };
  const scale = isInt(input.scale) ? input.scale : 2;
  // validate money up front — no silent coercion.
  for (const [label, arr] of [["invoice", input.invoices], ["payment", input.payments]] as any[]) {
    for (const x of arr) {
      if (!isObj(x) || (x.id === undefined || x.id === null || x.id === "") || !isInt(x.amountMinor) || typeof x.currency !== "string" || !x.currency) {
        return { ok: false, code: "INVALID_INPUT", reason: `each ${label} needs { id, amountMinor(integer), currency }` };
      }
      if (x.amountMinor < 0) return { ok: false, code: "INVALID_INPUT", reason: `${label} ${x.id} has a negative amount` };
    }
  }

  const findings: any[] = [];
  const addFinding = (id: string, area: string, severity: string, detail: string, remediation: string, evidence: string) => findings.push({ id, area, severity, detail, remediation, evidence });

  // duplicate ids.
  const invSeen = new Set<string>(), invDup = new Set<string>();
  for (const inv of input.invoices) { const k = String(inv.id); if (invSeen.has(k)) invDup.add(k); else invSeen.add(k); }
  const paySeen = new Set<string>(), payDup = new Set<string>();
  for (const p of input.payments) { const k = String(p.id); if (paySeen.has(k)) payDup.add(k); else paySeen.add(k); }
  if (invDup.size) addFinding(`duplicate:invoice`, "integrity", "HIGH", `duplicate invoice id(s): ${[...invDup].join(", ")}`, "deduplicate invoices or correct the ledger", `${invDup.size} duplicate invoice id(s)`);
  if (payDup.size) addFinding(`duplicate:payment`, "integrity", "MEDIUM", `duplicate payment id(s): ${[...payDup].join(", ")}`, "deduplicate payments", `${payDup.size} duplicate payment id(s)`);

  // index invoices by ref AND id for matching.
  const invByRef: Record<string, any> = {};
  for (const inv of input.invoices) { invByRef[String(inv.ref !== undefined ? inv.ref : inv.id)] = inv; if (inv.id !== undefined) invByRef[String(inv.id)] = inv; }

  // accumulate payments per invoice (exact), detect currency mismatch + unmatched payments.
  const paidByInvoice: Record<string, any> = {};
  const unmatchedPayments: any[] = [];
  for (const p of input.payments) {
    const key = String(p.invoiceRef !== undefined ? p.invoiceRef : "");
    const inv = invByRef[key];
    if (!inv) { unmatchedPayments.push({ id: p.id, invoiceRef: p.invoiceRef, amountMinor: p.amountMinor, currency: p.currency }); continue; }
    if (p.currency !== inv.currency) { addFinding(`currency:${inv.id}`, "currency", "HIGH", `payment ${p.id} currency ${p.currency} ≠ invoice ${inv.id} currency ${inv.currency}`, "resolve the currency mismatch; no implicit FX is applied", `payment ${p.id} vs invoice ${inv.id}`); continue; }
    const ik = String(inv.id);
    paidByInvoice[ik] = paidByInvoice[ik] ? EU.add(paidByInvoice[ik], q(p.currency, p.amountMinor, scale)) : q(p.currency, p.amountMinor, scale);
  }
  if (unmatchedPayments.length) addFinding(`unmatched:payments`, "matching", "MEDIUM", `${unmatchedPayments.length} payment(s) match no invoice`, "link each payment to an invoice or investigate", `payment ids: ${unmatchedPayments.map((u) => u.id).slice(0, 20).join(", ")}`);

  // per-invoice status + totals.
  const byStatus = { PAID: 0, PARTIAL: 0, OVERPAID: 0, UNPAID: 0 };
  const outstanding: any[] = [];
  let invoicedMinor = 0, collectedMinor = 0; let currency: string | null = null; let multiCurrency = false;
  const invoiceStatuses: any[] = [];
  for (const inv of input.invoices) {
    if (currency === null) currency = inv.currency; else if (currency !== inv.currency) multiCurrency = true;
    const invoiced = q(inv.currency, inv.amountMinor, scale);
    const paid = paidByInvoice[String(inv.id)] || q(inv.currency, 0, scale);
    invoicedMinor += inv.amountMinor;
    // collected counted only in the invoice's currency bucket (we sum minor only when single-currency; else report NA).
    let status: string;
    let c: number;
    try { c = EU.compare(paid, invoiced); } catch { c = 0; }
    if (paid.minor === 0) status = "UNPAID";
    else if (c < 0) status = "PARTIAL";
    else if (c === 0) status = "PAID";
    else status = "OVERPAID";
    (byStatus as any)[status]++;
    collectedMinor += paid.minor;
    if (status === "OVERPAID") addFinding(`overpaid:${inv.id}`, "overpayment", "MEDIUM", `invoice ${inv.id} is OVERPAID (${EU.format(paid)} vs ${EU.format(invoiced)})`, "issue a refund/credit or confirm the overpayment", `invoice ${inv.id}`);
    if (status === "UNPAID" || status === "PARTIAL") outstanding.push({ id: inv.id, invoiced: EU.format(invoiced), paid: EU.format(paid), status });
    invoiceStatuses.push({ id: inv.id, status, invoicedMinor: inv.amountMinor, paidMinor: paid.minor, currency: inv.currency });
  }

  const outstandingMinor = invoicedMinor - collectedMinor;
  return {
    ok: true,
    report: {
      invoiceCount: input.invoices.length,
      paymentCount: input.payments.length,
      currency: multiCurrency ? "MIXED" : currency,
      totals: multiCurrency
        ? { note: "multi-currency ledger — per-currency totals not summed (no implicit FX)", invoicedMinor: null, collectedMinor: null, outstandingMinor: null }
        : { invoicedMinor, collectedMinor, outstandingMinor },
      byStatus,
      invoiceStatuses,
      outstanding,
      unmatchedPayments,
      duplicates: { invoices: [...invDup], payments: [...payDup] },
      findingCount: findings.length,
      findings: findings.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "HIGH" ? -1 : 1)),
      reconciled: findings.filter((f) => f.severity === "HIGH").length === 0,   // no HIGH discrepancy (balances may still be outstanding)
      limits: [
        "amounts are EXACT integer minor units — supply cents; floats are rejected (no silent coercion)",
        "a payment in a different currency than its invoice is a HIGH discrepancy, NEVER auto-converted (no FX)",
        "multi-currency ledgers are NOT summed into one total (per-currency only)",
        "this is a reconciliation/discrepancy report, NOT an accounting certification or audit opinion",
      ],
      note: "Accounts-receivable reconciliation over a real invoice/payment ledger with EXACT integer money (economic-unit). UNPAID/PARTIAL are reported as outstanding (expected states), not hidden; OVERPAID/unmatched/currency-mismatch/duplicates are surfaced as findings. Nothing netted away; nothing sent anywhere.",
    },
  };
}

export { reconcileLedger };
module.exports = { reconcileLedger };

if (require.main === module) {
  const demo = reconcileLedger({
    invoices: [{ id: "INV-1", amountMinor: 10000, currency: "EUR" }, { id: "INV-2", amountMinor: 5000, currency: "EUR" }, { id: "INV-3", amountMinor: 2000, currency: "EUR" }],
    payments: [{ id: "PAY-1", amountMinor: 10000, currency: "EUR", invoiceRef: "INV-1" }, { id: "PAY-2", amountMinor: 3000, currency: "EUR", invoiceRef: "INV-2" }, { id: "PAY-X", amountMinor: 999, currency: "EUR", invoiceRef: "NONE" }],
  });
  process.stdout.write(JSON.stringify({ byStatus: demo.report.byStatus, totals: demo.report.totals, findings: demo.report.findingCount }, null, 2) + "\n");
}
