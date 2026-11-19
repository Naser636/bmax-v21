#!/usr/bin/env node
"use strict";
/*
 * Tests for odg-btp-supplier-commitment (supplier/subcontractor engagement-document lifecycle). PURE.
 * Includes a REAL integration check: the emitted record is consumed by the canonical chantier-profitability.computeChantier
 * (engagements reflected; COMMANDE_DEPASSEE fires on over-spend) — proving it FEEDS the engine, not duplicates it.
 */
const S = require("./odg-btp-supplier-commitment.js");
const CH = require("./chantier-profitability.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function poLines(): any[] { return [{ ref: "A", label: "Ciment", qty: 100, unit: "sac", unitPriceMinor: 650, priceSource: "devis fournisseur #F-12" },
                                     { ref: "B", label: "Sable", qty: 10, unit: "m3", unitPriceMinor: 3500, priceSource: "devis fournisseur #F-12" }]; }
// 100*650 + 10*3500 = 65000 + 35000 = 100000 (1000.00 EUR)

function main(): void {
  // --- build: sourced prices ⇒ DRAFT, gross summed, COST classification, owner-gated issue ---
  const po = S.buildCommitment({ id: "BC-1", chantierId: "CH-9", kind: "PURCHASE_ORDER", supplier: "MatPro SARL", lineItems: poLines() });
  check("PO builds ⇒ DRAFT", po.ok === true && po.status === "DRAFT");
  check("PO gross = 100000 (summed from sourced lines, not invented)", po.grossMinor === 100000);
  check("PO classification COST_ENGAGEMENT (never revenue/margin)", po.classification === "COST_ENGAGEMENT");
  check("PO retention 0 + net = gross", po.retentionMinor === 0 && po.netPayableMinor === 100000);
  check("PO issue is OWNER_GATED + not issued", po.issue.gate === "OWNER_GATED" && po.issue.issued === false);

  // --- fail-closed: a line without a sourced price ⇒ NOT_ENGAGEABLE, amount withheld (never invented) ---
  const bad = S.buildCommitment({ id: "BC-2", chantierId: "CH-9", kind: "PURCHASE_ORDER", supplier: "X", lineItems: [{ ref: "A", qty: 5, unitPriceMinor: 100, priceSource: "src" }, { ref: "B", qty: 5 /* no price */ }] });
  check("unsourced line ⇒ NOT_ENGAGEABLE, gross null (price NEVER invented)", bad.status === "NOT_ENGAGEABLE" && bad.grossMinor === null && bad.lineItems[1].missing === "unitPriceMinor");
  check("overflow guarded", S.buildCommitment({ id: "o", chantierId: "c", kind: "PURCHASE_ORDER", supplier: "s", lineItems: [{ qty: Number.MAX_SAFE_INTEGER, unitPriceMinor: 2, priceSource: "src" }] }).status === "NOT_ENGAGEABLE");

  // --- subcontract retention (retenue de garantie): held, not paid, released only by owner ---
  const sub = S.buildCommitment({ id: "ST-1", chantierId: "CH-9", kind: "SUBCONTRACT", supplier: "Plombier SAS", retentionBps: 500, lineItems: [{ qty: 1, unitPriceMinor: 200000, priceSource: "contrat ST-1" }] });
  check("SUBCONTRACT 5% retention ⇒ retention 10000, net 190000, gross 200000", sub.grossMinor === 200000 && sub.retentionMinor === 10000 && sub.netPayableMinor === 190000);
  check("retention starts NOT released (owner action only)", sub.retentionReleased === false);
  check("retention on a PURCHASE_ORDER is rejected", S.buildCommitment({ id: "p", chantierId: "c", kind: "PURCHASE_ORDER", supplier: "s", retentionBps: 500, lineItems: poLines() }).code === "RETENTION_ON_PO");

  // --- fail-closed guards ---
  check("no id ⇒ NO_ID", S.buildCommitment({ chantierId: "c", kind: "PURCHASE_ORDER", supplier: "s", lineItems: poLines() }).code === "NO_ID");
  check("bad kind ⇒ BAD_KIND", S.buildCommitment({ id: "x", chantierId: "c", kind: "LEASE", supplier: "s", lineItems: poLines() }).code === "BAD_KIND");
  check("bad retentionBps (>100%) ⇒ BAD_RETENTION", S.buildCommitment({ id: "x", chantierId: "c", kind: "SUBCONTRACT", supplier: "s", retentionBps: 10001, lineItems: poLines() }).code === "BAD_RETENTION");
  check("no lines ⇒ NO_LINES", S.buildCommitment({ id: "x", chantierId: "c", kind: "PURCHASE_ORDER", supplier: "s", lineItems: [] }).code === "NO_LINES");

  // --- issuance is ALWAYS owner-gated, never auto ---
  check("issue blocked without auth", S.issueReadiness(po, {}).readyToIssue === false && S.issueReadiness(po, {}).gate === "OWNER_GATED");
  check("issue ready with ownerAuthorized+owner+evidenceRef", S.issueReadiness(po, { ownerAuthorized: true, owner: "akabi", evidenceRef: "signed-BC-1.pdf" }).readyToIssue === true);
  check("partial auth (no evidence) ⇒ not ready", S.issueReadiness(po, { ownerAuthorized: true, owner: "akabi" }).readyToIssue === false);
  check("NOT_ENGAGEABLE cannot be issued", S.issueReadiness(bad, { ownerAuthorized: true, owner: "a", evidenceRef: "e" }).readyToIssue === false);

  // --- integration seam: emitted record is the shape computeChantier consumes ---
  const feed = S.toChantierCommitment(po);
  check("toChantierCommitment yields {id,amountMinor,invoiced:false}", feed.ok === true && feed.commitment.id === "BC-1" && feed.commitment.amountMinor === 100000 && feed.commitment.invoiced === false);
  check("NOT_ENGAGEABLE yields no chantier record", S.toChantierCommitment(bad).code === "NOT_ENGAGEABLE");

  // --- REAL integration: feed into canonical computeChantier (no duplicate cost model) ---
  const engaged = CH.computeChantier({ id: "CH-9", commitments: [feed.commitment], expenses: [], clientInvoices: [] });
  check("computeChantier consumes the commitment: engagementsNonFacturesMinor === 100000", engaged.ok === true && engaged.finance.engagementsNonFacturesMinor === 100000);
  // over-spend on this commitment ⇒ canonical COMMANDE_DEPASSEE fires (our reconcileReadiness mirrors it)
  const over = CH.computeChantier({ id: "CH-9", commitments: [feed.commitment], expenses: [{ id: "E1", amountMinor: 120000, commitmentId: "BC-1", category: "MATERIAL", justifRef: "F-99", chantierId: "CH-9" }], clientInvoices: [] });
  check("over-spend ⇒ canonical COMMANDE_DEPASSEE anomaly", over.anomalies.some((a: any) => a.code === "COMMANDE_DEPASSEE"));

  // --- our single-commitment reconcile view mirrors the canonical rule ---
  const rec = S.reconcileReadiness(po, [{ id: "E1", amountMinor: 120000, commitmentId: "BC-1" }]);
  check("reconcileReadiness: committed 100000, spent 120000, over by 20000", rec.committedMinor === 100000 && rec.spentMinor === 120000 && rec.overCommitment === true && rec.overByMinor === 20000);
  check("reconcile ignores expenses of other commitments", S.reconcileReadiness(po, [{ id: "E2", amountMinor: 999, commitmentId: "OTHER" }]).spentMinor === 0);

  // --- frozen + determinism + contract ---
  check("frozen output", Object.isFrozen(po) && Object.isFrozen(po.lineItems) && Object.isFrozen(sub));
  check("deterministic", JSON.stringify(S.buildCommitment({ id: "BC-1", chantierId: "CH-9", kind: "PURCHASE_ORDER", supplier: "MatPro SARL", lineItems: poLines() })) === JSON.stringify(po));
  check("contract: price never invented, cost≠revenue, issuance owner-gated, feeds canonical engine",
    S.SUPPLIER_COMMITMENT_CONTRACT.invariants.some((s: string) => /price is NEVER invented/.test(s)) &&
    S.SUPPLIER_COMMITMENT_CONTRACT.invariants.some((s: string) => /NEVER revenue\/margin/.test(s)) &&
    S.SUPPLIER_COMMITMENT_CONTRACT.invariants.some((s: string) => /ALWAYS OWNER_GATED/.test(s)) &&
    S.SUPPLIER_COMMITMENT_CONTRACT.invariants.some((s: string) => /no 2nd cost model/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-btp-supplier-commitment (supplier/subcontractor engagement-document lifecycle; sourced prices or NOT_ENGAGEABLE; retenue-de-garantie held-not-paid; issuance OWNER_GATED; FEEDS canonical computeChantier — engagements + COMMANDE_DEPASSEE verified against the real engine; PURE/deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
