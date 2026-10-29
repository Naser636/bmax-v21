#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the Financial Auditing capability reconciles a real invoice/payment ledger with
// EXACT integer money (economic-unit): per-invoice PAID/PARTIAL/OVERPAID/UNPAID, exact totals with no float drift,
// overpayment/unmatched/currency-mismatch/duplicate findings, multi-currency NOT summed (no implicit FX), and
// fail-closed money validation. Pure/deterministic.
"use strict";
const assert = require("assert");
const F = require("./finance-ledger-service.js");
const SARIF = require("./sarif-report.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// (1) mixed ledger ⇒ exact status counts + totals + unmatched-payment finding.
{
  const r = F.reconcileLedger({
    invoices: [{ id: "INV-1", amountMinor: 10000, currency: "EUR" }, { id: "INV-2", amountMinor: 5000, currency: "EUR" }, { id: "INV-3", amountMinor: 2000, currency: "EUR" }],
    payments: [{ id: "P1", amountMinor: 10000, currency: "EUR", invoiceRef: "INV-1" }, { id: "P2", amountMinor: 3000, currency: "EUR", invoiceRef: "INV-2" }, { id: "PX", amountMinor: 999, currency: "EUR", invoiceRef: "NONE" }],
  });
  ok("mixed ledger ⇒ PAID1/PARTIAL1/UNPAID1, invoiced 17000 collected 13000 outstanding 4000",
     r.ok && r.report.byStatus.PAID === 1 && r.report.byStatus.PARTIAL === 1 && r.report.byStatus.UNPAID === 1 &&
     r.report.totals.invoicedMinor === 17000 && r.report.totals.collectedMinor === 13000 && r.report.totals.outstandingMinor === 4000);
  ok("unmatched payment surfaced (MEDIUM), listed, not netted away", r.report.unmatchedPayments.length === 1 && r.report.findings.some((f) => f.area === "matching"));
}
// (2) EXACT money: two partial payments sum exactly to PAID (no float drift).
{
  const r = F.reconcileLedger({ invoices: [{ id: "A", amountMinor: 5000, currency: "EUR" }], payments: [{ id: "p1", amountMinor: 2500, currency: "EUR", invoiceRef: "A" }, { id: "p2", amountMinor: 2500, currency: "EUR", invoiceRef: "A" }] });
  ok("2×2500 ⇒ PAID exactly (exact integer money)", r.report.byStatus.PAID === 1 && r.report.totals.collectedMinor === 5000 && r.report.totals.outstandingMinor === 0);
}
// (3) OVERPAID ⇒ MEDIUM finding.
{
  const r = F.reconcileLedger({ invoices: [{ id: "A", amountMinor: 1000, currency: "EUR" }], payments: [{ id: "p", amountMinor: 1500, currency: "EUR", invoiceRef: "A" }] });
  ok("overpayment ⇒ OVERPAID status + MEDIUM overpayment finding", r.report.byStatus.OVERPAID === 1 && r.report.findings.some((f) => f.area === "overpayment" && f.severity === "MEDIUM"));
}
// (4) currency mismatch ⇒ HIGH finding, NOT auto-converted, reconciled=false.
{
  const r = F.reconcileLedger({ invoices: [{ id: "A", amountMinor: 1000, currency: "EUR" }], payments: [{ id: "p", amountMinor: 1000, currency: "USD", invoiceRef: "A" }] });
  ok("currency mismatch ⇒ HIGH, no FX applied (invoice stays UNPAID), reconciled=false",
     r.report.findings.some((f) => f.area === "currency" && f.severity === "HIGH") && r.report.byStatus.UNPAID === 1 && r.report.reconciled === false);
}
// (5) duplicate ids ⇒ invoice HIGH, payment MEDIUM.
{
  const r = F.reconcileLedger({ invoices: [{ id: "A", amountMinor: 100, currency: "EUR" }, { id: "A", amountMinor: 100, currency: "EUR" }], payments: [{ id: "p", amountMinor: 1, currency: "EUR", invoiceRef: "Z" }, { id: "p", amountMinor: 1, currency: "EUR", invoiceRef: "Z" }] });
  ok("duplicate invoice id ⇒ HIGH; duplicate payment id ⇒ MEDIUM", r.report.findings.some((f) => f.id === "duplicate:invoice" && f.severity === "HIGH") && r.report.findings.some((f) => f.id === "duplicate:payment" && f.severity === "MEDIUM"));
}
// (6) multi-currency ledger ⇒ totals NOT summed (no implicit FX); per-invoice still classified.
{
  const r = F.reconcileLedger({ invoices: [{ id: "E", amountMinor: 1000, currency: "EUR" }, { id: "U", amountMinor: 1000, currency: "USD" }], payments: [{ id: "pe", amountMinor: 1000, currency: "EUR", invoiceRef: "E" }, { id: "pu", amountMinor: 1000, currency: "USD", invoiceRef: "U" }] });
  ok("multi-currency ⇒ currency MIXED, totals null (not summed), both invoices PAID",
     r.report.currency === "MIXED" && r.report.totals.invoicedMinor === null && r.report.byStatus.PAID === 2);
}
// (7) fail-closed money validation.
{
  ok("float amount ⇒ INVALID_INPUT; negative ⇒ INVALID_INPUT; missing arrays ⇒ INVALID_INPUT",
     F.reconcileLedger({ invoices: [{ id: "A", amountMinor: 10.5, currency: "EUR" }], payments: [] }).code === "INVALID_INPUT" &&
     F.reconcileLedger({ invoices: [{ id: "A", amountMinor: -5, currency: "EUR" }], payments: [] }).code === "INVALID_INPUT" &&
     F.reconcileLedger({}).code === "INVALID_INPUT");
}
// (8) reconciled=true when there is NO HIGH discrepancy even though balances are outstanding (honest semantics).
{
  const r = F.reconcileLedger({ invoices: [{ id: "A", amountMinor: 1000, currency: "EUR" }], payments: [] });
  ok("all-unpaid but no HIGH discrepancy ⇒ reconciled=true, outstanding reported", r.report.reconciled === true && r.report.totals.outstandingMinor === 1000 && r.report.outstanding.length === 1);
}
// (9) findings emit valid SARIF 2.1.0.
{
  const r = F.reconcileLedger({ invoices: [{ id: "A", amountMinor: 1000, currency: "EUR" }], payments: [{ id: "p", amountMinor: 1000, currency: "USD", invoiceRef: "A" }] });
  const s = SARIF.toSarif({ ok: true, project: "ledger", findings: r.report.findings }, { toolName: "ODG-Finance-Reconcile", version: "1" });
  ok("ledger findings ⇒ valid SARIF 2.1.0 (currency HIGH→error)", s.ok && SARIF.isValidSarif(s.sarif) && s.sarif.runs[0].results.some((x) => x.level === "error"));
}

console.log(`\nFINANCE-LEDGER-SERVICE suite — ${pass} assertions passed. (exact integer money; PAID/PARTIAL/OVERPAID/UNPAID; unmatched/overpaid/currency/duplicate findings; multi-currency not summed; fail-closed; valid SARIF)`);
