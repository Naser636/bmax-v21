#!/usr/bin/env node
"use strict";
/*
 * V330 M2 BTP — COMPLETE PARCOURS RUN (runtime entry). Makes the §7 end-to-end BTP/TP journey REACHABLE + reproducible on
 * demand (directive §7: "un parcours complet ... reproductible"). It drives odg-btp-lifecycle-integration.runLifecycle with
 * ONE fully-specified SYNTHETIC scenario that exercises every real engine:
 *   CLIENT_INTAKE → QUOTATION → WORK_PACKAGE → PLANNING → PAYMENT_TERMS → CASH_RECONCILIATION → REALIZED_PROFITABILITY →
 *   PROCUREMENT → PRICE_REVISION → RETENUE_GARANTIE → RETENUE_RELEASE  (11 stages, 13 cross-stage consistency links).
 * Pure composition of EXISTING engines; it builds nothing new, mutates nothing, opens no network, writes nothing.
 *
 * HONESTY: the scenario is SYNTHETIC — it proves INTEGRATION (the data flows consistently across the real engines), NOT
 * real client traction. The intake is pre-contractual and human-confirmation-gated; no order/quote/payment is committed.
 *
 * Usage: npx tsx runtime/bin/odg-btp-journey-run.ts
 */
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const L = require(path.join(ROOT, "runtime", "core", "odg-btp-lifecycle-integration.js"));

// ONE synthetic BTP scenario threading every stage (minor units = cents; single currency EUR; no implicit FX).
const scenario = {
  intake: { localeCode: "fr-FR", lineItems: [{ ref: "L1", qty: 10, unit: "m3", sellUnitPriceMinor: 12000, costUnitPriceMinor: 9000, priceSource: "tarif-fournisseur-2026" }] },
  quotationRequest: { overheadRate: 0.10, marginRate: 0.20, vatRate: 0.20, lines: [{ id: "L1", quantity: 100, materialQty: 100, materialUnitPriceMinor: 500, labourHours: 10, labourRateMinor: 4000, measurementState: "MEASURED" }] },
  dossier: { projectId: "P-DEMO", quotationRefs: ["Q"] }, approvedBy: "chef", vatRate: 0.20,
  terms: { milestones: [{ id: "MS1", percent: 0.30 }, { id: "MS2", percent: 0.30 }] },
  tasks: [{ id: "T1", percentComplete: 100 }],
  ledger: { invoices: [{ id: "INV-DEP", amountTTCMinor: 42768 }], payments: [{ invoiceId: "INV-DEP", amountMinor: 42768, evidenceRef: "e", txnRef: "t" }] },
  costEntries: [{ phase: "PAID", category: "MATERIAL", amountMinor: 52000, evidenceRef: "f" }],
  procurement: { catalog: [{ itemRef: "CIM-42.5", unit: "sac", supplier: "SupA", unitPriceMinor: 850, priceSource: "bordereau-2026", validFrom: "2026-01-01" }], requestedLines: [{ itemRef: "CIM-42.5", qty: 100 }], asOfDate: "2026-06-01", kind: "PURCHASE_ORDER" },
  revision: { fixedTermCoeff: 0.15, indexedTerms: [{ coeff: 0.85, baseIndex: 100, currentIndex: 110 }] },
  // V15.0 — the FR invoice DOCUMENT behind ledger invoice INV-DEP (35 640 HT + 20 % VAT = 42 768 TTC), pre-checked + due date
  frInvoice: { ledgerInvoiceId: "INV-DEP", document: { sellerName: "ODG BTP (synthetic)", sellerSiret: "73282932000074", buyerName: "Client démo", invoiceNumber: "F-2026-0001", issueDate: "2026-11-22", paymentTermDays: 30, lineItems: [{ label: "Acompte 30 %", qty: 1, unitPriceHTMinor: 35640, vatRateBps: 2000 }], statedTotalVatMinor: 7128, penaltyRateMentionPresent: true, indemnityMentionPresent: true } },
  retenue: { retentionRate: 0.05, release: { receptionDate: "2026-01-15", warrantyPeriodDays: 365, reservesLifted: true, asOfDate: "2027-06-01" } },
};

const r = L.runLifecycle(scenario);
if (r.ok !== true) { process.stdout.write("PARCOURS FAILED: " + r.code + " — " + r.detail + "\n"); process.exit(1); }
process.stdout.write(JSON.stringify({
  ran: "M2-BTP-complete-parcours", SYNTHETIC: r.SYNTHETIC === true,
  stageCount: r.stageCount, linkCount: r.linkCount, dataFlowIntact: r.dataFlowIntact, brokenLinks: r.brokenLinks,
  stages: r.stages.map((s: any) => s.stage),
}, null, 2) + "\n");
const ok = r.dataFlowIntact === true && r.stageCount === 11 && r.linkCount === 13;
process.stdout.write(ok
  ? "\nOK — complete M2 BTP parcours ran end-to-end (11 stages / 13 cross-stage consistency links, dataFlowIntact). SYNTHETIC: integration proven, not real traction.\n"
  : "\nPARTIAL — see brokenLinks above\n");
process.exit(ok ? 0 : 1);
export {};
