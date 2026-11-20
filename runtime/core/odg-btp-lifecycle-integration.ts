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
const REVISION = require("./odg-btp-revision-prix.js");     // V330 M2 — price revision (index-derived), threaded into the chain
const RETENUE = require("./odg-btp-retenue-garantie.js");   // V330 M2 — retenue de garantie + gated release, threaded into the chain
const PRICEREF = require("./odg-btp-price-reference.js");   // V330 M2 — supplier/price reference (bordereau) — the sourced-price provenance
const SUPPLIER = require("./odg-btp-supplier-commitment.js"); // V330 M2 — supplier engagement from reference-sourced lines
const INTAKE = require("./odg-btp-client-intake.js");       // V330 M2 — multilingual pre-contractual client intake (journey entry)

function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }

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

  // 0. CLIENT INTAKE (V330 M2, OPT-IN) — the journey entry: a multilingual, PRE-CONTRACTUAL, human-confirmation-gated
  // estimate from the client's need. It is INDICATIVE only — the binding price is the formal devis (link C), never the
  // intake. Only runs when the scenario requests it (backward-compatible).
  if (isObj(s.intake)) {
    const intake = INTAKE.intakeEstimate(Object.assign({ chantierId: (isObj(s.dossier) && isStr(s.dossier.projectId)) ? s.dossier.projectId : "CH" }, s.intake));
    if (intake.ok !== true) return fail("INTAKE_FAILED", "intakeEstimate: " + (intake.code || "?"));
    stages.push(Object.freeze({ stage: "CLIENT_INTAKE", engine: "client-intake", locale: intake.locale.code, estimateStatus: intake.estimate.status, sellingMinor: intake.estimate.sellingMinor, requiresHumanConfirmation: intake.requiresHumanConfirmation === true }));
    // link M: the intake is a SOURCED, PRE-CONTRACTUAL, human-confirmation-gated estimate — never auto-committed, never the binding contract.
    links.push(link("M_INTAKE_PRECONTRACTUAL", "client intake is a complete, sourced, PRE-CONTRACTUAL estimate requiring human confirmation (indicative — never the binding devis, never auto-committed)", intake.estimate.status === "COMPLETE" && intake.requiresHumanConfirmation === true && arr(intake.assumptions).some((a: any) => /PRE-CONTRACTUAL/.test(String(a))), "status=" + intake.estimate.status + " humanConfirm=" + intake.requiresHumanConfirmation));
  }

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

  // 7. PROCUREMENT (V330 M2, OPT-IN) — achats et fournisseurs: the reference→commitment chain the engines were designed for.
  // price-reference.buildCatalog → priceLineItems (resolve requested items to SOURCED lines, cheapest valid + provenance) →
  // supplier-commitment.buildCommitment. Only runs when the scenario requests it (backward-compatible).
  if (isObj(s.procurement)) {
    const cat = PRICEREF.buildCatalog(arr(s.procurement.catalog), { currency: s.procurement.currency });
    if (cat.ok !== true) return fail("PRICE_CATALOG_FAILED", "buildCatalog: " + (cat.code || "?"));
    const asOf = s.procurement.asOfDate;
    const sourced = PRICEREF.priceLineItems(cat, arr(s.procurement.requestedLines), asOf, { preferSupplier: s.procurement.preferSupplier });
    if (sourced.ok !== true) return fail("PRICING_FAILED", "priceLineItems: " + (sourced.code || "?"));
    const commit = SUPPLIER.buildCommitment({ id: isStr(s.procurement.id) ? s.procurement.id : "C-PROC", chantierId: isStr(s.procurement.chantierId) ? s.procurement.chantierId : "CH", kind: isStr(s.procurement.kind) ? s.procurement.kind : "PURCHASE_ORDER", supplier: isStr(s.procurement.supplier) ? s.procurement.supplier : "S", retentionBps: s.procurement.retentionBps, lineItems: sourced.lineItems });
    if (commit.ok !== true) return fail("COMMITMENT_FAILED", "buildCommitment: " + (commit.code || "?"));
    const engageable = commit.status === "DRAFT";    // supplier-commitment: status DRAFT ⟺ engageable (all lines priced), else NOT_ENGAGEABLE
    stages.push(Object.freeze({ stage: "PROCUREMENT", engine: "price-reference→supplier-commitment", catalogEntries: cat.entries.length, sourcedLines: sourced.lineItems.length, unresolved: sourced.unresolved.length, status: commit.status, engageable, grossMinor: commit.grossMinor, retentionMinor: commit.retentionMinor, netPayableMinor: commit.netPayableMinor }));
    // link J: every requested item resolved to a reference-SOURCED price ⇒ engageable (an unresolved item ⇒ NOT_ENGAGEABLE; price never invented).
    links.push(link("J_PROCUREMENT_SOURCED", "every requested item resolved to a reference-sourced price ⇒ engageable (unresolved ⇒ NOT_ENGAGEABLE; price never invented)", sourced.unresolved.length === 0 && engageable === true, "unresolved=" + sourced.unresolved.length + " status=" + commit.status));
    // link K: every committed line carries a priceSource (provenance) from the reference catalog — traceable, not invented.
    links.push(link("K_PROCUREMENT_TRACES_REFERENCE", "every committed line carries a priceSource from the reference catalog (traceable provenance, never invented)", arr(commit.lineItems).length > 0 && arr(commit.lineItems).every((l: any) => l.status === "PRICED" && isStr(l.priceSource)), "lines=" + arr(commit.lineItems).length));
    // link L: net payable = gross − retention (retenue held per contract, not dropped).
    links.push(link("L_PROCUREMENT_NET", "net payable = gross − retention (retenue held, not dropped)", commit.netPayableMinor === commit.grossMinor - commit.retentionMinor, "gross=" + commit.grossMinor + " retention=" + commit.retentionMinor + " net=" + commit.netPayableMinor));
  }

  // 8. PRICE REVISION (V330 M2, OPT-IN) — a révision de prix on the ACCEPTED contract base, index-derived (never invented).
  // Only runs when the scenario requests it; absent ⇒ the chain is unchanged (backward-compatible 6-stage flow).
  if (isObj(s.revision)) {
    const base = quotation.sellingHT;
    const rev = REVISION.revisePrice(Object.assign({ baseAmountMinor: base }, s.revision));
    if (rev.ok !== true) return fail("REVISION_FAILED", "revisePrice: " + (rev.code || "?"));
    stages.push(Object.freeze({ stage: "PRICE_REVISION", engine: "revision-prix", baseAmountMinor: rev.baseAmountMinor, revisionCoefficient: rev.revisionCoefficient, revisedAmountMinor: rev.revisedAmountMinor, deltaMinor: rev.deltaMinor }));
    // link G: the revision base = the accepted contract sellingHT (traces to the devis) AND revised − base = delta (internally consistent, index-derived — not invented).
    links.push(link("G_REVISION_TRACES_CONTRACT", "revision base = accepted contract sellingHT, and revised − base = delta (index-derived, never invented)", rev.baseAmountMinor === quotation.sellingHT && (rev.revisedAmountMinor - rev.baseAmountMinor) === rev.deltaMinor, "base=" + rev.baseAmountMinor + " sellingHT=" + quotation.sellingHT + " revised=" + rev.revisedAmountMinor + " delta=" + rev.deltaMinor));
  }

  // 8. RETENUE DE GARANTIE (V330 M2, OPT-IN) — withhold on a situation + gated release. Only runs when the scenario requests it.
  if (isObj(s.retenue)) {
    const gross = typeof s.retenue.grossSituationHTMinor === "number" ? s.retenue.grossSituationHTMinor : quotation.sellingHT;
    const w = RETENUE.withholdOnSituation(Object.assign({ grossSituationHTMinor: gross }, s.retenue));
    if (w.ok !== true) return fail("RETENUE_FAILED", "withholdOnSituation: " + (w.code || "?"));
    stages.push(Object.freeze({ stage: "RETENUE_GARANTIE", engine: "retenue-garantie", grossSituationHTMinor: w.grossSituationHTMinor, retainedThisMinor: w.retainedThisMinor, netToPayHTMinor: w.netToPayHTMinor, cumulativeRetainedMinor: w.cumulativeRetainedMinor }));
    // link H: net to pay = gross − retenue withheld (retention is WITHHELD per contract, never silently dropped nor a collected payment).
    links.push(link("H_RETENUE_NET_CONSISTENT", "net to pay = gross situation − retenue withheld (retention never dropped; not a payment)", w.netToPayHTMinor === w.grossSituationHTMinor - w.retainedThisMinor, "gross=" + w.grossSituationHTMinor + " retained=" + w.retainedThisMinor + " net=" + w.netToPayHTMinor));
    if (isObj(s.retenue.release)) {
      const rel = RETENUE.releaseState(Object.assign({ cumulativeRetainedMinor: w.cumulativeRetainedMinor }, s.retenue.release));
      if (rel.ok !== true) return fail("RELEASE_FAILED", "releaseState: " + (rel.code || "?"));
      stages.push(Object.freeze({ stage: "RETENUE_RELEASE", engine: "retenue-garantie", releaseDate: rel.releaseDate, status: rel.status, releasableMinor: rel.releasableMinor }));
      // link I: release is owner/contract-gated (reserves + warranty delay) — releasable = cumulative ONLY when RELEASABLE, else 0 (never automatic).
      links.push(link("I_RELEASE_GATED", "release gated (reserves + warranty delay); releasable = cumulative only when RELEASABLE, else 0 (never automatic)", rel.status === "RELEASABLE" ? rel.releasableMinor === w.cumulativeRetainedMinor : rel.releasableMinor === 0, "status=" + rel.status + " releasable=" + rel.releasableMinor + " cumulative=" + w.cumulativeRetainedMinor));
    }
  }

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
  reuses: Object.freeze(["odg-btp-client-intake (V330 M2 — pre-contractual journey entry)", "odg-btp-devis-engine (V260)", "odg-btp-project-workflow (V266)", "odg-btp-billing-engine (V267)", "odg-btp-revision-prix (V330 M2 — price revision)", "odg-btp-retenue-garantie (V330 M2 — retention + release)", "odg-btp-price-reference + odg-btp-supplier-commitment (V330 M2 — procurement: reference→commitment)"]),
  invariants: Object.freeze([
    "threads ONE scenario through the REAL engines (V260→V266→V267, + V330 revision/retenue when requested) and asserts cross-stage consistency — no new engine/ledger/primitive",
    "data-flow links checked: work-package cost = quotation cost; work-package selling = quotation selling; contract = accepted sellingHT; Σ milestones ≤ contract; reconciliation invoiced = single ledger total; forecast margin = quotation margin",
    "V330 M2 OPT-IN stages (backward-compatible — absent ⇒ unchanged 6-stage flow): PROCUREMENT via the reference→commitment chain (every committed line reference-sourced WITH provenance; an unresolved item ⇒ NOT_ENGAGEABLE, price never invented; net = gross − retention); PRICE_REVISION base = accepted sellingHT and revised−base = delta (index-derived, never invented); RETENUE net = gross − withheld (retention never dropped); RELEASE owner/contract-gated (releasable = cumulative only when RELEASABLE, else 0 — never automatic)",
    "fails CLOSED: any cross-stage disagreement ⇒ dataFlowIntact false with the exact broken link (catches shadow state / duplicate ledger drift)",
    "deterministic/read-only; SYNTHETIC scenario proves INTEGRATION only — nothing OPERATIONAL/real-traction claimed",
  ]),
});

module.exports = { runLifecycle, BTP_LIFECYCLE_INTEGRATION_CONTRACT };

export {};
