#!/usr/bin/env node
"use strict";
/* V272 §12 — end-to-end BTP lifecycle data-flow verification. Threads ONE SYNTHETIC scenario through the real V260/V266/V267
 * engines and asserts the cross-stage consistency links; then proves fail-closed (over-scheduled milestones break a link ⇒
 * dataFlowIntact false). Real integration verification, not a matrix. */
const L = require("./odg-btp-lifecycle-integration.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

const QREQ = { overheadRate: 0.10, marginRate: 0.20, vatRate: 0.20, lines: [{ id: "L1", quantity: 100, materialQty: 100, materialUnitPriceMinor: 500, labourHours: 10, labourRateMinor: 4000, measurementState: "MEASURED" }] };

function main() {
  const scenario = {
    quotationRequest: QREQ, dossier: { projectId: "P-INTEG", quotationRefs: ["Q"] }, approvedBy: "chef", vatRate: 0.20,
    terms: { milestones: [{ id: "MS1", percent: 0.30 }, { id: "MS2", percent: 0.30 }] },
    tasks: [{ id: "T1", percentComplete: 100 }],
    ledger: { invoices: [{ id: "INV-DEP", amountTTCMinor: 42768 }], payments: [{ invoiceId: "INV-DEP", amountMinor: 42768, evidenceRef: "e", txnRef: "t" }] },
    costEntries: [{ phase: "PAID", category: "MATERIAL", amountMinor: 52000, evidenceRef: "f" }, { phase: "INVOICED", category: "LABOUR", amountMinor: 41000, evidenceRef: "s" }],
  };
  const r = L.runLifecycle(scenario);
  check("lifecycle runs end-to-end: ok, SYNTHETIC, 6 stages, 6 consistency links", r.ok && r.SYNTHETIC === true && r.stageCount === 6 && r.linkCount === 6);
  check("dataFlowIntact true — every cross-stage link consistent, 0 broken", r.dataFlowIntact === true && r.brokenLinks.length === 0);
  const lk = (id: string) => r.links.find((x: any) => x.id === id);
  check("link A: work-package direct cost 90000 = quotation subtotalDirectHT 90000", lk("A_WP_COST_TRACES_QUOTATION").consistent === true && /wp=90000 quote=90000/.test(lk("A_WP_COST_TRACES_QUOTATION").detail));
  check("link B: work-package sellingHT = quotation sellingHT 118800 (one price, no shadow value)", lk("B_WP_SELLING_TRACES_QUOTATION").consistent === true && /118800/.test(lk("B_WP_SELLING_TRACES_QUOTATION").detail));
  check("link C: contract value 118800 = accepted quotation sellingHT 118800", lk("C_CONTRACT_EQUALS_ACCEPTED_PRICE").consistent === true && /contract=118800 sellingHT=118800/.test(lk("C_CONTRACT_EQUALS_ACCEPTED_PRICE").detail));
  check("link D: Σ milestones 71280 ≤ contract 118800 and terms valid", lk("D_MILESTONES_WITHIN_CONTRACT").consistent === true && /scheduled=71280 contract=118800/.test(lk("D_MILESTONES_WITHIN_CONTRACT").detail));
  check("link E: reconciliation invoiced 42768 = payment-ledger total invoiced 42768 (single ledger)", lk("E_RECON_TRACES_LEDGER").consistent === true && /recon=42768 ledger=42768/.test(lk("E_RECON_TRACES_LEDGER").detail));
  check("link F: forecast margin 19800 = quotation margin 19800 (traces to the devis, never invented)", lk("F_FORECAST_MARGIN_TRACES_QUOTATION").consistent === true && /forecast=19800 quoteMargin=19800/.test(lk("F_FORECAST_MARGIN_TRACES_QUOTATION").detail));

  // stage numbers surfaced correctly.
  const stage = (st: string) => r.stages.find((x: any) => x.stage === st);
  check("stages carry the real engine numbers (quotation TTC 142560, realized margin 25800, erosion −6000)",
    stage("QUOTATION").totalTTC === 142560 && stage("REALIZED_PROFITABILITY").realizedMargin === 25800 && stage("REALIZED_PROFITABILITY").marginErosion === -6000);

  // FAIL-CLOSED: over-scheduled milestones (Σ > contract) ⇒ terms invalid ⇒ link D breaks ⇒ dataFlowIntact false.
  const broken = L.runLifecycle(Object.assign({}, scenario, { terms: { milestones: [{ id: "MS1", percent: 0.60 }, { id: "MS2", percent: 0.60 }] } }));
  check("fail-closed: over-scheduled milestones (Σ 142560 > contract 118800) ⇒ dataFlowIntact false, link D broken (catches drift)",
    broken.ok === true && broken.dataFlowIntact === false && broken.brokenLinks.indexOf("D_MILESTONES_WITHIN_CONTRACT") >= 0);

  // a failed upstream stage fails the whole chain closed.
  check("fail-closed: an invalid quotation request ⇒ QUOTATION_FAILED (whole chain stops)", L.runLifecycle({ quotationRequest: { lines: [] } }).code === "QUOTATION_FAILED");

  // determinism + contract.
  check("deterministic + frozen", JSON.stringify(L.runLifecycle(scenario)) === JSON.stringify(L.runLifecycle(scenario)) && Object.isFrozen(r.links));
  check("contract: reuses V260/V266/V267; cross-stage links; fails closed on shadow state; integration only",
    L.BTP_LIFECYCLE_INTEGRATION_CONTRACT.reuses.some((x: string) => /V260/.test(x)) && L.BTP_LIFECYCLE_INTEGRATION_CONTRACT.reuses.some((x: string) => /V267/.test(x)) &&
    L.BTP_LIFECYCLE_INTEGRATION_CONTRACT.invariants.some((i: string) => /fails CLOSED/.test(i)) && L.BTP_LIFECYCLE_INTEGRATION_CONTRACT.invariants.some((i: string) => /INTEGRATION only/.test(i)));

  // V330 M2 — OPT-IN price-revision + retenue-de-garantie stages thread the two engines into the complete journey.
  const extended = L.runLifecycle(Object.assign({}, scenario, {
    revision: { fixedTermCoeff: 0.15, indexedTerms: [{ coeff: 0.85, baseIndex: 100, currentIndex: 110 }] },  // K = 0.15 + 0.85·1.1
    retenue: { retentionRate: 0.05, release: { receptionDate: "2026-01-15", warrantyPeriodDays: 365, reservesLifted: true, asOfDate: "2027-06-01" } },
  }));
  check("V330 extended journey: 9 stages / 9 links, dataFlowIntact true (revision + retenue + release threaded)", extended.ok && extended.stageCount === 9 && extended.linkCount === 9 && extended.dataFlowIntact === true && extended.brokenLinks.length === 0);
  const elk = (id: string) => extended.links.find((l: any) => l.id === id) || { consistent: false };
  check("link G: revision base = accepted contract sellingHT, revised − base = delta (index-derived)", elk("G_REVISION_TRACES_CONTRACT").consistent === true);
  check("link H: net to pay = gross − retenue withheld (retention never dropped)", elk("H_RETENUE_NET_CONSISTENT").consistent === true);
  check("link I: release gated — RELEASABLE ⇒ releasable = cumulative (owner/contract-gated, not automatic)", elk("I_RELEASE_GATED").consistent === true && extended.stages.some((s: any) => s.stage === "RETENUE_RELEASE" && s.status === "RELEASABLE"));
  // backward-compatible: absent revision/retenue ⇒ still exactly 6/6 (the original scenario above already asserted this)
  check("backward-compatible: no revision/retenue fields ⇒ unchanged 6-stage flow", r.stageCount === 6 && r.linkCount === 6);
  // fail-closed: a malformed revision (coefficients not summing to 1) ⇒ REVISION_FAILED (chain stops honestly)
  check("fail-closed: revision coefficients not summing to 1 ⇒ REVISION_FAILED", L.runLifecycle(Object.assign({}, scenario, { revision: { fixedTermCoeff: 0.5, indexedTerms: [{ coeff: 0.2, baseIndex: 100, currentIndex: 100 }] } })).code === "REVISION_FAILED");

  // V330 M2 — PROCUREMENT (achats): reference→commitment chain threaded into the journey.
  const procScenario = Object.assign({}, scenario, { procurement: {
    catalog: [
      { itemRef: "CIM-42.5", unit: "sac", supplier: "SupA", unitPriceMinor: 850, priceSource: "bordereau-2026", validFrom: "2026-01-01" },
      { itemRef: "CIM-42.5", unit: "sac", supplier: "SupB", unitPriceMinor: 900, priceSource: "devis-SupB", validFrom: "2026-01-01" },
      { itemRef: "ACIER-HA", unit: "kg", supplier: "SupA", unitPriceMinor: 120, priceSource: "bordereau-2026", validFrom: "2026-01-01" },
    ],
    requestedLines: [{ itemRef: "CIM-42.5", qty: 100 }, { itemRef: "ACIER-HA", qty: 500 }],
    asOfDate: "2026-06-01", kind: "PURCHASE_ORDER", supplier: "SupA",
  } });
  const proc = L.runLifecycle(procScenario);
  const plk = (id: string) => proc.links.find((l: any) => l.id === id) || { consistent: false };
  const procStage = proc.stages.find((s: any) => s.stage === "PROCUREMENT") || {};
  check("V330 procurement: 7 stages / 9 links, dataFlowIntact true; gross = 100·850 + 500·120 = 145000, cheapest-sourced", proc.ok && proc.stageCount === 7 && proc.linkCount === 9 && proc.dataFlowIntact === true && procStage.grossMinor === 145000 && procStage.unresolved === 0);
  check("link J: all requested items reference-sourced ⇒ engageable", plk("J_PROCUREMENT_SOURCED").consistent === true);
  check("link K: every committed line carries a priceSource (provenance)", plk("K_PROCUREMENT_TRACES_REFERENCE").consistent === true);
  check("link L: net = gross − retention (PO retention 0 ⇒ net = gross)", plk("L_PROCUREMENT_NET").consistent === true && procStage.netPayableMinor === 145000);
  // V330 M2 — PROCUREMENT RECONCILIATION (achats→cost loop): committed vs actually incurred.
  const procRecon = L.runLifecycle(Object.assign({}, procScenario, { procurement: Object.assign({}, procScenario.procurement, { id: "C-PROC", expenses: [{ commitmentId: "C-PROC", amountMinor: 60000 }, { commitmentId: "C-PROC", amountMinor: 20000 }] }) }));
  const rStage = procRecon.stages.find((s: any) => s.stage === "PROCUREMENT_RECONCILIATION") || {};
  check("V330 procurement reconciliation: 8 stages / 10 links, committed 145000 − spent 80000 = remaining 65000, not over", procRecon.ok && procRecon.stageCount === 8 && procRecon.linkCount === 10 && procRecon.dataFlowIntact === true && rStage.committedMinor === 145000 && rStage.spentMinor === 80000 && rStage.remainingMinor === 65000 && rStage.overCommitment === false);
  // over-commitment is correctly FLAGGED (spend > committed) — link N still consistent (arithmetic), the flag is the signal
  const procOver = L.runLifecycle(Object.assign({}, procScenario, { procurement: Object.assign({}, procScenario.procurement, { id: "C-PROC", expenses: [{ commitmentId: "C-PROC", amountMinor: 150000 }] }) }));
  const oStage = procOver.stages.find((s: any) => s.stage === "PROCUREMENT_RECONCILIATION") || {};
  check("over-commitment flagged: spent 150000 > committed 145000 ⇒ overCommitment true, link N still consistent (arithmetic correct)", procOver.dataFlowIntact === true && oStage.overCommitment === true && oStage.remainingMinor === -5000 && (procOver.links.find((l: any) => l.id === "N_PROCUREMENT_RECONCILED") || {}).consistent === true);

  // fail-closed: a requested item with NO reference ⇒ unresolved ⇒ link J breaks ⇒ dataFlowIntact false (no invented price)
  const procBroken = L.runLifecycle(Object.assign({}, procScenario, { procurement: Object.assign({}, procScenario.procurement, { requestedLines: [{ itemRef: "CIM-42.5", qty: 100 }, { itemRef: "UNKNOWN-ITEM", qty: 10 }] }) }));
  check("fail-closed: a requested item with no reference ⇒ dataFlowIntact false, link J broken (price never invented)", procBroken.ok === true && procBroken.dataFlowIntact === false && procBroken.brokenLinks.indexOf("J_PROCUREMENT_SOURCED") >= 0);

  // V330 M2 — CLIENT INTAKE (journey entry): multilingual, pre-contractual, human-confirmation-gated.
  const intakeFields = { localeCode: "fr-FR", lineItems: [{ ref: "L1", qty: 10, unit: "m3", sellUnitPriceMinor: 12000, costUnitPriceMinor: 9000, priceSource: "tarif-fournisseur-2026" }] };
  const withIntake = L.runLifecycle(Object.assign({}, scenario, { intake: intakeFields }));
  const ilk = (id: string) => withIntake.links.find((l: any) => l.id === id) || { consistent: false };
  check("V330 intake: 7 stages / 7 links, dataFlowIntact true; CLIENT_INTAKE first, pre-contractual + human-confirm", withIntake.ok && withIntake.stageCount === 7 && withIntake.linkCount === 7 && withIntake.dataFlowIntact === true && withIntake.stages[0].stage === "CLIENT_INTAKE" && ilk("M_INTAKE_PRECONTRACTUAL").consistent === true);
  // fail-closed: an intake line without a sourced price ⇒ estimate INCOMPLETE ⇒ link M breaks (price never invented)
  const intakeBroken = L.runLifecycle(Object.assign({}, scenario, { intake: { localeCode: "fr-FR", lineItems: [{ ref: "L1", qty: 10, unit: "m3" }] } }));
  check("fail-closed: intake line without a sourced price ⇒ link M broken, dataFlowIntact false (price never invented)", intakeBroken.ok === true && intakeBroken.dataFlowIntact === false && intakeBroken.brokenLinks.indexOf("M_INTAKE_PRECONTRACTUAL") >= 0);

  // V330 M2 — FULL §7 COMPLETE JOURNEY: Client → besoin → devis → validation → chantier → achats → facturation → paiements
  //           → révision → retenue → rentabilité. All real engines, cross-stage consistency, SYNTHETIC.
  const full = L.runLifecycle(Object.assign({}, scenario, {
    intake: intakeFields,
    procurement: { catalog: [{ itemRef: "CIM-42.5", unit: "sac", supplier: "SupA", unitPriceMinor: 850, priceSource: "bordereau-2026", validFrom: "2026-01-01" }], requestedLines: [{ itemRef: "CIM-42.5", qty: 100 }], asOfDate: "2026-06-01", kind: "PURCHASE_ORDER" },
    revision: { fixedTermCoeff: 0.15, indexedTerms: [{ coeff: 0.85, baseIndex: 100, currentIndex: 110 }] },
    retenue: { retentionRate: 0.05, release: { receptionDate: "2026-01-15", warrantyPeriodDays: 365, reservesLifted: true, asOfDate: "2027-06-01" } },
  }));
  check("V330 FULL journey: 11 stages / 13 links, dataFlowIntact true (Client→…→rentabilité, every engine threaded)", full.ok && full.stageCount === 11 && full.linkCount === 13 && full.dataFlowIntact === true && full.brokenLinks.length === 0);
  const names = full.stages.map((s: any) => s.stage);
  check("FULL journey stage order: CLIENT_INTAKE → QUOTATION … → PROCUREMENT → PRICE_REVISION → RETENUE_GARANTIE → RETENUE_RELEASE", names[0] === "CLIENT_INTAKE" && names[1] === "QUOTATION" && names.indexOf("PROCUREMENT") > 0 && names.indexOf("RETENUE_RELEASE") === names.length - 1);

  // V15.0 — opt-in FR_INVOICE_PRECHECK stage: the live journey now exercises odg-fr-invoice-compliance + odg-fr-due-date
  {
    const doc = { sellerName: "ODG BTP (synthetic)", sellerSiret: "73282932000074", buyerName: "Client", invoiceNumber: "F-1", issueDate: "2026-11-22", paymentTermDays: 30, lineItems: [{ qty: 1, unitPriceHTMinor: 35640, vatRateBps: 2000 }], statedTotalVatMinor: 7128, penaltyRateMentionPresent: true, indemnityMentionPresent: true };
    const ok = L.runLifecycle({ ...scenario, frInvoice: { ledgerInvoiceId: "INV-DEP", document: doc } });
    const st = ok.stages.find((x: any) => x.stage === "FR_INVOICE_PRECHECK"); const lk = ok.links.find((x: any) => x.id === "L_FR_DOCUMENT_TRACES_LEDGER");
    check("FR stage runs: pre-check ready, TTC 42768 recomputed, due date 2026-12-22, link L consistent, flow intact", !!st && st.ready === true && st.computedTotalTTCMinor === 42768 && st.dueDate === "2026-12-22" && !!lk && lk.consistent === true && ok.dataFlowIntact === true);
    const mism = L.runLifecycle({ ...scenario, frInvoice: { ledgerInvoiceId: "INV-DEP", document: { ...doc, lineItems: [{ qty: 1, unitPriceHTMinor: 35000, vatRateBps: 2000 }], statedTotalVatMinor: 7000 } } });
    check("document TTC ≠ ledger invoice ⇒ link L broken, dataFlowIntact false (no shadow document)", mism.dataFlowIntact === false && mism.brokenLinks.includes("L_FR_DOCUMENT_TRACES_LEDGER"));
    const nosiret = L.runLifecycle({ ...scenario, frInvoice: { ledgerInvoiceId: "INV-DEP", document: { ...doc, sellerSiret: "12345678901234" } } });
    const st2 = nosiret.stages.find((x: any) => x.stage === "FR_INVOICE_PRECHECK");
    check("invalid seller SIRET ⇒ pre-check not ready (siret-checksum failed), link L broken", !!st2 && st2.ready === false && st2.failedChecks.includes("siret-checksum") && nosiret.brokenLinks.includes("L_FR_DOCUMENT_TRACES_LEDGER"));
    check("without frInvoice the flow is unchanged (opt-in, no FR stage)", !r.stages.some((x: any) => x.stage === "FR_INVOICE_PRECHECK"));
  }
  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-btp-lifecycle-integration (V272 §12 + V330 M2: end-to-end data-flow across V260→V266→V267; 6 stages, 6 consistency links [WP cost 90000=quote, WP selling=quote 118800, contract=sellingHT 118800, milestones 71280≤contract, recon invoiced 42768=ledger, forecast margin 19800=quote]; dataFlowIntact true; fail-closed on over-scheduling [link D broken]; realized margin 25800; SYNTHETIC — integration proven, not traction)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
