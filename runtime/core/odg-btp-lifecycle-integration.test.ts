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

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-btp-lifecycle-integration (V272 §12: end-to-end data-flow across V260→V266→V267; 6 stages, 6 consistency links [WP cost 90000=quote, WP selling=quote 118800, contract=sellingHT 118800, milestones 71280≤contract, recon invoiced 42768=ledger, forecast margin 19800=quote]; dataFlowIntact true; fail-closed on over-scheduling [link D broken]; realized margin 25800; SYNTHETIC — integration proven, not traction)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
