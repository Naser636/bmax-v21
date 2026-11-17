#!/usr/bin/env node
"use strict";

/*
 * V272 §12 — ODG BTP END-TO-END LIFECYCLE INTEGRATION HARNESS (deterministic). The directive requires that the company's
 * capabilities not stay disconnected modules: it must "verify the ACTUAL data flow" with "no duplicate ledger / scheduler /
 * customer database / disconnected shadow state". This harness threads ONE scenario through the real engines and ASSERTS the
 * cross-stage data-consistency invariants — a functioning integration-verification capability, not a matrix/report.
 *
 * Chain: QUOTATION (V260) → WORK PACKAGE (V266) → PLANNING (V266) → PAYMENT TERMS + INVOICES (V267) → PAYMENT LEDGER +
 * CASH RECONCILIATION (V267) → REALIZED PROFITABILITY (V266/V267). REUSE only — NO new engine/ledger/primitive.
 *
 * It fails CLOSED: if any cross-stage number disagrees (work package ≠ quotation cost, contract ≠ accepted selling price,
 * milestones exceed contract, forecast margin ≠ quotation margin, invoiced ≠ ledger), dataFlowIntact is false with the exact
 * broken link. Deterministic/read-only. Nothing OPERATIONAL claimed — the scenario is SYNTHETIC, proving integration, not traction.
 */

const DEVIS = require("./odg-btp-devis-engine.js");         // V260
const WORKFLOW = require("./odg-btp-project-workflow.js");  // V266
const BILLING = require("./odg-btp-billing-engine.js");     // V267

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

function link(id: string, description: string, ok: boolean, detail: string): any {
  return Object.freeze({ id, description, consistent: ok === true, detail });
}

/** runLifecycle(scenario) -> drives the full BTP chain through the real engines and checks cross-stage data consistency. */
function runLifecycle(scenario: any): any {
  const s = isObj(scenario) ? scenario : {};
  const stages: any[] = []; const links: any[] = [];
  const fail = (code: string, detail: string) => Object.freeze({ ok: false, code, detail, stages: Object.freeze(stages), links: Object.freeze(links) });

  // 1. QUOTATION (V260).
  const quotation = DEVIS.computeDevis(s.quotationRequest);
  if (quotation.ok !== true) return fail("QUOTATION_FAILED", "computeDevis: " + (quotation.code || "?"));
  stages.push(Object.freeze({ stage: "QUOTATION", engine: "V260", subtotalDirectHT: quotation.subtotalDirectHT, sellingHT: quotation.sellingHT, margin: quotation.margin, totalTTC: quotation.totalTTC }));

  // 2. WORK PACKAGE (V266) — requires an APPROVED dossier. Consistency link A: work package direct cost = quotation direct cost.
  let dossier = WORKFLOW.openDossier(Object.assign({ quotationRefs: ["Q"] }, s.dossier));
  dossier = WORKFLOW.transition(dossier, "SUBMITTED", {});
  dossier = WORKFLOW.transition(dossier, "APPROVED", { approvedBy: s.approvedBy || "chef", asOf: s.asOf });
  const workPackage = WORKFLOW.buildWorkPackage(dossier, quotation);
  if (workPackage.ok !== true) return fail("WORKPACKAGE_FAILED", "buildWorkPackage: " + (workPackage.code || "?"));
  stages.push(Object.freeze({ stage: "WORK_PACKAGE", engine: "V266", totalDirectCostMinor: workPackage.totalDirectCostMinor, sellingHT: workPackage.sellingHT }));
  links.push(link("A_WP_COST_TRACES_QUOTATION", "work-package direct cost = quotation subtotalDirectHT (no cost drift)", workPackage.totalDirectCostMinor === quotation.subtotalDirectHT, "wp=" + workPackage.totalDirectCostMinor + " quote=" + quotation.subtotalDirectHT));
  links.push(link("B_WP_SELLING_TRACES_QUOTATION", "work-package sellingHT = quotation sellingHT (one price, no shadow value)", workPackage.sellingHT === quotation.sellingHT, "wp=" + workPackage.sellingHT + " quote=" + quotation.sellingHT));

  // 3. PLANNING (V266).
  const schedule = WORKFLOW.planSchedule(arr(s.tasks));
  stages.push(Object.freeze({ stage: "PLANNING", engine: "V266", ok: schedule.ok === true, taskCount: schedule.ok ? schedule.taskCount : null }));

  // 4. PAYMENT TERMS (V267) — contract value MUST equal the accepted quotation selling price (link C). Milestones ≤ contract (link D).
  const contractHT = quotation.sellingHT;
  const terms = BILLING.paymentTerms(Object.assign({ projectId: "P", quotationRef: "Q", projectApproved: true, contractHTMinor: contractHT, vatRate: s.vatRate }, s.terms));
  if (terms.ok !== true) return fail("TERMS_FAILED", "paymentTerms: " + (terms.code || "?"));
  stages.push(Object.freeze({ stage: "PAYMENT_TERMS", engine: "V267", contractHTMinor: terms.contractHTMinor, scheduledHTMinor: terms.scheduledHTMinor, valid: terms.valid }));
  links.push(link("C_CONTRACT_EQUALS_ACCEPTED_PRICE", "contract value = accepted quotation sellingHT (contract traces to the devis)", terms.contractHTMinor === quotation.sellingHT, "contract=" + terms.contractHTMinor + " sellingHT=" + quotation.sellingHT));
  links.push(link("D_MILESTONES_WITHIN_CONTRACT", "Σ milestone HT ≤ contract HT (no over-scheduling) and terms valid", terms.scheduledHTMinor <= terms.contractHTMinor && terms.valid === true, "scheduled=" + terms.scheduledHTMinor + " contract=" + terms.contractHTMinor + " valid=" + terms.valid));

  // 5. INVOICES + LEDGER + CASH RECONCILIATION (V267).
  const invoiceLedger = BILLING.paymentLedger(isObj(s.ledger) ? s.ledger : { invoices: [], payments: [] });
  const costLedger = WORKFLOW.actualCostLedger(arr(s.costEntries));
  const cashRecon = BILLING.cashReconciliation({ terms, invoiceLedger, costLedger, quotation });
  if (cashRecon.ok !== true) return fail("RECON_FAILED", "cashReconciliation: " + (cashRecon.code || "?"));
  stages.push(Object.freeze({ stage: "CASH_RECONCILIATION", engine: "V267", cumulativeInvoiced: cashRecon.cumulativeInvoicedTTCMinor, cashReceived: cashRecon.cashReceivedMinor, outstanding: cashRecon.outstandingReceivablesMinor }));
  // link E: reconciliation's cumulative invoiced = Σ invoice ledger amounts (one ledger, no shadow billing).
  const ledgerInvoiced = invoiceLedger.ok === true ? invoiceLedger.totalInvoicedMinor : null;
  links.push(link("E_RECON_TRACES_LEDGER", "reconciliation cumulative invoiced = payment-ledger total invoiced (single ledger)", cashRecon.cumulativeInvoicedTTCMinor === ledgerInvoiced, "recon=" + cashRecon.cumulativeInvoicedTTCMinor + " ledger=" + ledgerInvoiced));

  // 6. REALIZED PROFITABILITY — forecast margin MUST trace to the quotation margin (link F); realized uses incurred only.
  const realized = cashRecon.realizedGrossMargin;
  stages.push(Object.freeze({ stage: "REALIZED_PROFITABILITY", engine: "V266/V267", realizedMargin: realized ? realized.realizedMargin : null, forecastMargin: realized ? realized.forecastMargin : null, marginErosion: realized ? realized.marginErosion : null }));
  links.push(link("F_FORECAST_MARGIN_TRACES_QUOTATION", "forecast gross margin = quotation margin (forecast traces to the devis, never invented)", !!realized && realized.forecastMargin === quotation.margin, "forecast=" + (realized ? realized.forecastMargin : null) + " quoteMargin=" + quotation.margin));

  const dataFlowIntact = links.every((l: any) => l.consistent);
  return Object.freeze({
    ok: true, SYNTHETIC: true, dataFlowIntact, stageCount: stages.length, linkCount: links.length,
    stages: Object.freeze(stages), links: Object.freeze(links),
    brokenLinks: Object.freeze(links.filter((l: any) => !l.consistent).map((l: any) => l.id)),
    note: "end-to-end data-flow verification across V260→V266→V267: work-package cost and selling price trace to the quotation, the contract equals the accepted selling price, milestones stay within the contract, the reconciliation ties to the single payment ledger, and the forecast margin traces to the quotation margin. Fails closed on any cross-stage disagreement (shadow state). SYNTHETIC — proves integration, not real traction.",
  });
}

const BTP_LIFECYCLE_INTEGRATION_CONTRACT = Object.freeze({
  id: "V272-ODG-BTP-LIFECYCLE-INTEGRATION",
  source: "V272 §12 — end-to-end BTP lifecycle data-flow verification",
  reuses: Object.freeze(["odg-btp-devis-engine (V260)", "odg-btp-project-workflow (V266)", "odg-btp-billing-engine (V267)"]),
  invariants: Object.freeze([
    "threads ONE scenario through the REAL engines (V260→V266→V267) and asserts cross-stage consistency — no new engine/ledger/primitive",
    "data-flow links checked: work-package cost = quotation cost; work-package selling = quotation selling; contract = accepted sellingHT; Σ milestones ≤ contract; reconciliation invoiced = single ledger total; forecast margin = quotation margin",
    "fails CLOSED: any cross-stage disagreement ⇒ dataFlowIntact false with the exact broken link (catches shadow state / duplicate ledger drift)",
    "deterministic/read-only; SYNTHETIC scenario proves INTEGRATION only — nothing OPERATIONAL/real-traction claimed",
  ]),
});

module.exports = { runLifecycle, BTP_LIFECYCLE_INTEGRATION_CONTRACT };

export {};
