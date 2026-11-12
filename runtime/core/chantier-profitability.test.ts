#!/usr/bin/env node
"use strict";
/* V148 MÉTIER 2 — chantier-profitability battery (SYNTHETIC BTP/TP dossiers, labelled ≠ real chantier measurement). Proves
 * deterministic integer-minor finance (devis/budget révisé/CA/déboursé/engagements/EAC/écart), the 5 §3 parcours, adversarial
 * anomalies (unjustified, duplicate, partial delivery, wrong price, unattached, order-without-invoice, missing cost, partial
 * payment, budget overrun), explainable alerts (signal≠certainty), SELLING≠COST≠ESTIMATE≠NET separation, reuse of
 * finops-analyzer + document-intelligence, and fail-closed (no id / mixed currency). READ+CALCULATE only. */
const CH = require("./chantier-profitability.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }
const codes = (r: any) => r.anomalies.map((a: any) => a.code);
const alerts = (r: any) => r.alerts.map((a: any) => a.code);

function main() {
  // ---- §3 parcours 1: house (terrassement→second œuvre), healthy ----
  const house = {
    id: "CH-MAISON-01", currency: "EUR",
    quote: { devisInitialMinor: 10000000, versions: [{ id: "av1", deltaMinor: 1500000, approved: true }, { id: "av2", deltaMinor: 500000, approved: false }] },
    costBudgetMinor: 8000000,
    commitments: [{ id: "CMD-1", kind: "ORDER", amountMinor: 3000000, invoiced: true }, { id: "CMD-2", kind: "SUBCONTRACT", amountMinor: 2000000, invoiced: false }],
    expenses: [
      { id: "E1", category: "MATERIAL", amountMinor: 1200000, justifRef: "F-A1", commitmentId: "CMD-1", periodMonth: "2026-09" },
      { id: "E2", category: "LABOR", amountMinor: 2500000, justifRef: "PAIE-09", periodMonth: "2026-09" },
      { id: "E3", category: "SUBCONTRACT", amountMinor: 1800000, justifRef: "ST-1", commitmentId: "CMD-2", periodMonth: "2026-10" },
    ],
    clientInvoices: [{ id: "FC-1", amountMinor: 4000000, paidMinor: 4000000, periodMonth: "2026-09" }, { id: "FC-2", amountMinor: 3000000, paidMinor: 0, periodMonth: "2026-10" }],
    forecast: { resteAEngagerMinor: 1000000 },
  };
  const r = CH.computeChantier(house);
  check("budget révisé = devis + ONLY approved mods (av2 excluded)", r.finance.budgetReviseMinor === 11500000 && r.finance.modificationsApprouveesMinor === 1500000);
  check("déboursé constaté = Σ expenses (integer-minor)", r.finance.coutTotalConstateMinor === 5500000 && r.finance.costByCategory.LABOR === 2500000);
  check("CA facturé ≠ encaissements (billed 7M, paid 4M)", r.finance.caFactureMinor === 7000000 && r.finance.encaissementsMinor === 4000000);
  check("marge brute constatée = CA − déboursé (EXCLUDES frais de structure ⇒ not net)", r.finance.margeBruteConstateeMinor === 1500000 && /NOT net/.test(r.finance.marginDefinitions.margeBruteConstatee));
  check("engagements non facturés = uninvoiced commitments only", r.finance.engagementsNonFacturesMinor === 2000000);
  check("projected cost = déboursé + engagements + reste(ESTIMATE); EAC margin = budget révisé − projected", r.finance.projectedCostAtCompletionMinor === 8500000 && r.finance.margePrevisionnelleATerminaisonMinor === 3000000);
  check("écart budget/réel = cost budget − projected (overrun −500000)", r.finance.ecartBudgetReelMinor === -500000);
  check("cost overrun ⇒ COUT_DEPASSE_BUDGET anomaly + BUDGET_DEPASSE alert", codes(r).indexOf("COUT_DEPASSE_BUDGET") >= 0 && alerts(r).indexOf("BUDGET_DEPASSE") >= 0);
  check("timeline cumulative margin by month (évolution)", r.timeline.length === 2 && r.timeline[0].cumulativeMarginMinor === 300000 && r.timeline[1].cumulativeMarginMinor === 1500000);
  check("healthy chantier ⇒ no false margin-degradation alert", alerts(r).indexOf("MARGE_EN_DEGRADATION") < 0);

  // ---- §3 parcours 2–4 shape smoke (exterior / TP / subcontractors+rentals) : engine computes without error ----
  const ext = CH.computeChantier({ id: "CH-EXT-01", currency: "EUR", quote: { devisInitialMinor: 2000000 }, expenses: [{ id: "x", category: "MATERIAL", amountMinor: 800000, justifRef: "j" }], clientInvoices: [{ id: "f", amountMinor: 2000000, paidMinor: 2000000 }] });
  check("parcours exterior computes (margin 1.2M)", ext.ok === true && ext.finance.margeBruteConstateeMinor === 1200000);
  const tp = CH.computeChantier({ id: "CH-TP-01", currency: "EUR", quote: { devisInitialMinor: 50000000 }, costBudgetMinor: 40000000, commitments: [{ id: "c", kind: "RENTAL", amountMinor: 5000000, invoiced: false }], expenses: [{ id: "e", category: "EQUIPMENT", amountMinor: 12000000, justifRef: "loc1" }], clientInvoices: [{ id: "f", amountMinor: 20000000, paidMinor: 10000000 }], forecast: { resteAEngagerMinor: 20000000 } });
  check("parcours TP with rentals computes engagements + EAC", tp.ok === true && tp.finance.engagementsNonFacturesMinor === 5000000);

  // ---- §3 parcours 5 + adversarial: duplicate, partial, wrong price, unattached, order-without-invoice, missing cost, overrun ----
  const bad = {
    id: "CH-ADV-01", currency: "EUR",
    quote: { devisInitialMinor: 5000000 }, costBudgetMinor: 4000000,
    commitments: [{ id: "CMD-X", kind: "ORDER", amountMinor: 1000000 }],
    expenses: [
      { id: "X1", category: "MATERIAL", amountMinor: 2000000, commitmentId: "CMD-X", periodMonth: "2026-09" },                   // no justif + commande dépassée
      { id: "X2", category: "TRANSPORT", amountMinor: 3000000, justifRef: "T1", chantierId: "OTHER", periodMonth: "2026-10" },   // non rattachée
      { id: "X3", category: "MATERIAL", amountMinor: 2000000, justifRef: "D1", supplier: "MatCo", periodMonth: "2026-09", invoiceId: "INV9" }, // unreconciled supplier invoice + dup
      { id: "X4", category: "MATERIAL", amountMinor: 2000000, justifRef: "D2", supplier: "MatCo", periodMonth: "2026-09" },       // duplicate of X3 shape
    ],
    clientInvoices: [{ id: "FC-9", amountMinor: 7000000, paidMinor: 1000000, periodMonth: "2026-09" }],                           // over-billing vs 5M + partial payment
    forecast: { resteAEngagerMinor: 2000000 },
  };
  const b = CH.computeChantier(bad);
  check("adversarial: unjustified expense ⇒ DEPENSE_SANS_JUSTIFICATIF (impact=amount)", codes(b).indexOf("DEPENSE_SANS_JUSTIFICATIF") >= 0 && b.anomalies.some((a: any) => a.code === "DEPENSE_SANS_JUSTIFICATIF" && a.impactMinor === 2000000));
  check("adversarial: expense on another chantier ⇒ DEPENSE_NON_RATTACHEE", codes(b).indexOf("DEPENSE_NON_RATTACHEE") >= 0);
  check("adversarial: spend > commitment ⇒ COMMANDE_DEPASSEE", codes(b).indexOf("COMMANDE_DEPASSEE") >= 0);
  check("adversarial: supplier invoice w/o commitment ⇒ FACTURE_FOURNISSEUR_NON_RAPPROCHEE", codes(b).indexOf("FACTURE_FOURNISSEUR_NON_RAPPROCHEE") >= 0);
  check("adversarial: duplicate expense ⇒ DEPENSE_DOUBLON (via finops-analyzer reuse)", codes(b).indexOf("DEPENSE_DOUBLON") >= 0);
  check("adversarial: billed > devis+avenants ⇒ FACTURE_CLIENT_NON_PREVUE", codes(b).indexOf("FACTURE_CLIENT_NON_PREVUE") >= 0);
  check("adversarial: negative forecast margin ⇒ RISQUE_DEPASSEMENT alert", alerts(b).indexOf("RISQUE_DEPASSEMENT") >= 0 && b.finance.margePrevisionnelleATerminaisonMinor < 0);
  check("adversarial: uncovered remaining cost ⇒ COUT_RESTANT_NON_COUVERT alert", alerts(b).indexOf("COUT_RESTANT_NON_COUVERT") >= 0);
  check("every anomaly carries origin+proof+impact+confidence", b.anomalies.every((a: any) => typeof a.detail === "string" && typeof a.confidence === "string" && "impactMinor" in a && typeof a.evidence === "string"));
  check("every alert is a signal, not a certainty", b.alerts.every((a: any) => /signal, not a certainty/.test(a.note)));

  // ---- document dossier reuse: a dossier with a duplicate/partial folds into chantier anomalies ----
  const QUOTE = `TYPE: QUOTE\nDOC_NUMBER: D-1\nSUPPLIER: S\nCLIENT: C\nCHANTIER: CH-D\nISSUE_DATE: 2026-10-01\nCURRENCY: EUR\nLINE: id=L1; qty=10; unit=m3; unitPriceMinor=1000; netMinor=10000\nTOTAL_HT_MINOR: 10000\nTAX_MINOR: 2000\nTOTAL_TTC_MINOR: 12000`;
  const INV = `TYPE: INVOICE\nDOC_NUMBER: F-1\nSUPPLIER: S\nCLIENT: C\nQUOTE_REF: D-1\nCHANTIER: CH-D\nISSUE_DATE: 2026-11-01\nCURRENCY: EUR\nLINE: id=L1; qty=10; unit=m3; unitPriceMinor=1000; netMinor=10000\nLINE: id=L9; qty=1; unit=u; unitPriceMinor=5000; netMinor=5000\nTOTAL_HT_MINOR: 15000\nTAX_MINOR: 3000\nTOTAL_TTC_MINOR: 18000`;
  const withDossier = CH.computeChantier({ id: "CH-D", currency: "EUR", quote: { devisInitialMinor: 12000 }, dossiers: [{ quote: QUOTE, invoice: INV }] });
  check("dossier reconciliation (document-intelligence) folds UNQUOTED line ⇒ LIGNE_FACTUREE_NON_JUSTIFIEE", codes(withDossier).indexOf("LIGNE_FACTUREE_NON_JUSTIFIEE") >= 0 && withDossier.dossierReconciliations.length === 1);

  // ---- forecast hypotheses visible + missing-data ----
  const noReste = CH.computeChantier({ id: "CH-F", currency: "EUR", quote: { devisInitialMinor: 100 }, expenses: [{ id: "e", amountMinor: 50, justifRef: "j" }] });
  check("forecast exposes hypotheses (no reste ⇒ understated) + no-cost-budget caveat", noReste.forecast.hypotheses.some((h: string) => /UNDERSTATED/.test(h)) && noReste.finance.ecartBudgetReelMinor === null);

  // ---- READ-ONLY + fail-closed ----
  check("READ+CALCULATE only: note states books/pays/orders/emits nothing", /books\/pays\/orders\/emits NOTHING/.test(r.note));
  check("fail-closed: no chantier id ⇒ NO_CHANTIER_ID", CH.computeChantier({ currency: "EUR" }).code === "NO_CHANTIER_ID" && CH.computeChantier(null).code === "NO_CHANTIER_ID");
  check("fail-closed: mixed currency ⇒ MIXED_CURRENCY (no implicit FX)", CH.computeChantier({ id: "C", currency: "EUR", expenses: [{ id: "e", amountMinor: 1, currency: "USD" }] }).code === "MIXED_CURRENCY");

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — chantier-profitability (déboursé-sec cost/margin, budget-vs-réel, EAC forecast, reconciliation anomalies reusing finops+document-intelligence, explainable alerts; SELLING≠COST≠ESTIMATE≠NET; integer-minor; read+calculate only; fail-closed)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
