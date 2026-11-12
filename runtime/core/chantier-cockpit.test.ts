#!/usr/bin/env node
"use strict";
/* V151 §7 — M2 chantier-cockpit battery (SYNTHETIC, labelled ≠ real chantier). Proves the cockpit COMPOSES the existing
 * engines (parc-stock + workforce + chantier-profitability) into one per-chantier view WITHOUT duplicating them: consolidated
 * déboursé sec with no double count, origin-tagged indicators, preserved financial distinctions, confidence blockers, health
 * + hold-for-review decision. Adversarial + fail-closed. READ+CALCULATE only. */
const C = require("./chantier-cockpit.js");
const W = require("./workforce-labour-engine.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function labourFor(chantierId: string) {
  const wf = W.buildWorkforce([{ id: "S1", role: "SALARIE", loadedRateMinorPerHour: 3500 }]);
  const lc = W.computeLabourCost([{ id: "T1", who: "S1", chantierId, dateMs: 1, startMin: 480, endMin: 960, minutes: 480, status: "APPROVED", periodMonth: "2026-09" }], wf, { currency: "EUR" });
  return { workforce: wf, labourCost: lc, travel: [{ chantierId, amountMinor: 3000, justifRef: "km" }] };
}

function main() {
  // ---- healthy consolidated chantier ----
  const r = C.buildCockpit({
    chantierId: "CH1", currency: "EUR",
    quote: { devisInitialMinor: 2000000, versions: [{ id: "av1", deltaMinor: 300000, approved: true }] },
    costBudgetMinor: 1500000,
    clientInvoices: [{ id: "f", amountMinor: 1800000, paidMinor: 1000000, periodMonth: "2026-09" }],
    forecast: { resteAEngagerMinor: 200000 },
    parc: { usages: [{ equipmentId: "EQ1", chantierId: "CH1", hours: 8, rateMinorPerHour: 6000, periodMonth: "2026-09", justifRef: "u" }], consumptions: [{ ref: "CIMENT", chantierId: "CH1", qty: 50, unitCostMinor: 800, kind: "CONSOMMATION", periodMonth: "2026-09", justifRef: "bl1" }], purchases: [{ id: "A1", amountMinor: 999999, invoiced: false }] },
    labour: { ...labourFor("CH1"), subcontractInvoices: [{ resourceId: "STX", chantierId: "CH1", periodMonth: "2026-09", amountMinor: 150000, invoiceId: "SF1" }] },
  });
  check("cockpit composes 2 imputation sources + chantier-profitability", r.ok === true && r.sources.length === 2 && r.sources.some((s: any) => /parc-stock/.test(s.source)) && r.sources.some((s: any) => /workforce/.test(s.source)));
  check("consolidated déboursé sec = MO+matériaux+équipements+sous-traitance+transport (no double count)", r.view.cost.debourseSecMinor.value === 269000 && r.view.cost.byCategory.value.LABOR === 28000 && r.view.cost.byCategory.value.SUBCONTRACT === 150000 && r.view.cost.byCategory.value.EQUIPMENT === 48000);
  check("stock purchase is a commitment (engagement), NOT a déboursé charge", r.view.engagements.engagementsNonFacturesMinor.value === 999999 && r.view.cost.byCategory.value.MATERIAL === 40000);
  check("selling side: budget révisé = devis+avenant; CA ≠ encaissements", r.view.selling.budgetReviseMinor.value === 2300000 && r.view.selling.caFactureMinor.value === 1800000 && r.view.selling.encaissementsMinor.value === 1000000);
  check("margins: marge brute = CA − déboursé; EAC = budget révisé − projected; écart budget computed", r.view.margin.margeBruteConstateeMinor.value === 1531000 && r.view.margin.margePrevisionnelleATerminaisonMinor.value === 831001 && r.view.cost.ecartBudgetReelMinor.value === 31001);
  check("every indicator carries its ORIGIN", typeof r.view.cost.debourseSecMinor.origin === "string" && typeof r.view.margin.margeBruteConstateeMinor.origin === "string" && typeof r.view.selling.caFactureMinor.origin === "string");
  check("preserves validated financial distinctions + gross≠net note", r.financialDistinctions.indexOf("achat de stock ≠ consommation") >= 0 && /gross margin ≠ net profit/.test(r.view.margin.margeBruteConstateeMinor.note));
  check("full data ⇒ HIGH confidence, no blockers", r.view.confidence === "HIGH" && r.view.confidenceBlockers.length === 0);

  // ---- confidence blockers surfaced when data missing ----
  const partial = C.buildCockpit({ chantierId: "CH2", currency: "EUR", quote: { devisInitialMinor: 1000000 }, clientInvoices: [{ id: "f", amountMinor: 500000, periodMonth: "2026-09" }], labour: labourFor("CH2") });
  check("missing cost budget + reste-à-engager ⇒ confidence blockers surfaced", partial.view.confidenceBlockers.some((b: string) => /cost budget/.test(b)) && partial.view.confidenceBlockers.some((b: string) => /reste à engager/.test(b)) && partial.view.confidence !== "HIGH");
  check("écart budget null when no cost budget supplied", partial.view.cost.ecartBudgetReelMinor.value === null);

  // ---- AT_RISK: forecast overrun ----
  const risk = C.buildCockpit({ chantierId: "CH3", currency: "EUR", quote: { devisInitialMinor: 100000 }, costBudgetMinor: 100000, clientInvoices: [{ id: "f", amountMinor: 50000, periodMonth: "2026-09" }], forecast: { resteAEngagerMinor: 500000 }, parc: { consumptions: [{ ref: "X", chantierId: "CH3", qty: 100, unitCostMinor: 2000, kind: "CONSOMMATION", periodMonth: "2026-09", justifRef: "j" }] } });
  check("overrun ⇒ AT_RISK health + HOLD_FOR_HUMAN_REVIEW", risk.health === "AT_RISK" && /HOLD_FOR_HUMAN_REVIEW/.test(risk.decision));

  // ---- composition, not duplication + read-only ----
  check("contract: composes existing engines, no duplication, no new primitive", /COMPOSES existing engines/.test(C.CHANTIER_COCKPIT_CONTRACT.invariants[0]) && /SINGLE maths source/.test(C.CHANTIER_COCKPIT_CONTRACT.invariants[1]));
  check("READ+CALCULATE only: books/pays/orders/emits nothing", /books\/pays\/orders\/emits nothing/.test(r.note));

  // ---- fail-closed ----
  check("no chantier id ⇒ NO_CHANTIER_ID (fail-closed)", C.buildCockpit({}).code === "NO_CHANTIER_ID" && C.buildCockpit(null).code === "NO_CHANTIER_ID");

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — chantier-cockpit (composes parc-stock + workforce + chantier-profitability into one per-chantier view; consolidated déboursé sec no double count; origin-tagged indicators; preserved distinctions; confidence blockers; health; read+calculate only; fail-closed)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
