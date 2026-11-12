#!/usr/bin/env node
"use strict";
/* V149 MÉTIER 2 — parc-matériel/flotte/stocks battery (SYNTHETIC, labelled ≠ real parc). Proves: registry (common extensible
 * model, unknown category flagged), availability (double-booking/missing return), maintenance/control/insurance alerts (never
 * "conforme" from a document), fuel indicators with NOT_MEASURED guard, stock (negative/unit/justif/rupture, explicit
 * adjustments), supply reconciliation reuse, and the CENTRAL §8 chantier cost integration with ANTI-DOUBLE-COUNT (only
 * consumption+usage imputed; purchases are commitments). Adversarial + fail-closed. READ+CALCULATE only. */
const P = require("./parc-stock-engine.js");
const CH = require("./chantier-profitability.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }
const DAY = 86400000, NOW = 1800000000000;
const has = (list: any[], code: string) => list.some((a: any) => a.code === code);

function main() {
  // ---- §2 registry ----
  const reg = P.buildRegistry([{ id: "EQ1", category: "EXCAVATOR", brand: "Cat", meter: 1200, meterKind: "HOURS" }, { category: "TRUCK" }, { id: "EQ1", category: "TRUCK" }, { id: "EQ2", category: "NOPE", attributes: { bucketM3: 1.2 } }]);
  check("registry: valid kept, NO_ID + DUPLICATE_ID rejected", reg.count === 2 && reg.rejected.some((r: any) => r.reason === "NO_ID") && reg.rejected.some((r: any) => r.reason === "DUPLICATE_ID"));
  check("registry: unknown category ⇒ SPECIALIZED (flagged, not guessed) + attributes kept", reg.items.find((x: any) => x.id === "EQ2").category === "SPECIALIZED" && reg.items.find((x: any) => x.id === "EQ2").categoryKnown === false && reg.items.find((x: any) => x.id === "EQ2").attributes.bucketM3 === 1.2);

  // ---- §3 availability: double-booking + missing return + incoherent ----
  check("double affectation (overlapping periods) detected", has(P.checkAvailability([{ equipmentId: "EQ1", chantierId: "A", fromMs: NOW, toMs: NOW + 5 * DAY }, { equipmentId: "EQ1", chantierId: "B", fromMs: NOW + 2 * DAY, toMs: NOW + 7 * DAY }]).anomalies, "DOUBLE_AFFECTATION"));
  check("missing return (sequential, no returnedMs) ⇒ RETOUR_MANQUANT", has(P.checkAvailability([{ equipmentId: "EQ1", chantierId: "A", fromMs: NOW, toMs: NOW + 2 * DAY }, { equipmentId: "EQ1", chantierId: "B", fromMs: NOW + 3 * DAY, toMs: NOW + 5 * DAY }]).anomalies, "RETOUR_MANQUANT"));
  check("returned-before-assigned ⇒ AFFECTATION_INCOHERENTE", has(P.checkAvailability([{ equipmentId: "EQ1", chantierId: "A", fromMs: NOW, toMs: NOW + 2 * DAY, returnedMs: NOW - DAY }]).anomalies, "AFFECTATION_INCOHERENTE"));

  // ---- §4 maintenance / controls / insurance ----
  const ma = P.maintenanceAlerts({ nowMs: NOW, windowMs: 7 * DAY, maintenance: [{ equipmentId: "EQ1", kind: "PREVENTIVE", dueMs: NOW - DAY }, { id: "mc", equipmentId: "EQ1", kind: "CORRECTIVE" }], controls: [{ equipmentId: "EQ1", dueMs: NOW + 3 * DAY }], insurances: [{ equipmentId: "EQ1", expiresMs: NOW - DAY }] });
  check("maintenance overdue + control near + insurance expired alerts", has(ma.alerts, "MAINTENANCE_ECHUE") && has(ma.alerts, "CONTROLE_PROCHE") && has(ma.alerts, "ASSURANCE_EXPIREE"));
  check("corrective w/o cost+parts ⇒ HISTORIQUE_INCOMPLET", has(ma.alerts, "HISTORIQUE_INCOMPLET"));
  check("regressive maintenance meter ⇒ COMPTEUR_INCOHERENT", has(P.maintenanceAlerts({ nowMs: NOW, maintenance: [{ equipmentId: "EQ1", doneMs: NOW, meterAt: 100 }, { equipmentId: "EQ1", doneMs: NOW + DAY, meterAt: 80 }] }).alerts, "COMPTEUR_INCOHERENT"));
  check("never declares conforme from a document's presence (note)", /never declares an equipment conforme/i.test(ma.note));

  // ---- §5 fuel indicators + NOT_MEASURED ----
  const fi = P.fuelIndicators({ consumptions: [{ id: "f1", equipmentId: "EQ1", dateMs: NOW, meter: 1000, quantity: 100, costMinor: 15000, justifRef: "t1" }, { id: "f2", equipmentId: "EQ1", dateMs: NOW + DAY, meter: 1050, quantity: 80, costMinor: 12000, justifRef: "t2" }, { id: "f3", equipmentId: "EQ2", dateMs: NOW, meter: 500, quantity: 50, costMinor: 8000 }] });
  check("fuel cost-per-unit computed when meter delta>0 (27000/50=540)", fi.indicators.find((i: any) => i.equipmentId === "EQ1").costPerUnitMinor === 540);
  check("no denominator ⇒ NOT_MEASURED (never fabricated)", fi.indicators.find((i: any) => i.equipmentId === "EQ2").status === "NOT_MEASURED");
  check("consumption without justif ⇒ CONSOMMATION_SANS_JUSTIF", has(fi.anomalies, "CONSOMMATION_SANS_JUSTIF"));
  check("regressive fuel meter ⇒ COMPTEUR_INCOHERENT", has(P.fuelIndicators({ consumptions: [{ id: "a", equipmentId: "E", dateMs: NOW, meter: 100 }, { id: "b", equipmentId: "E", dateMs: NOW + DAY, meter: 90 }] }).anomalies, "COMPTEUR_INCOHERENT"));
  check("duplicate consumption ⇒ CONSOMMATION_DOUBLON", has(P.fuelIndicators({ consumptions: [{ id: "a", equipmentId: "E", dateMs: NOW, quantity: 10, costMinor: 100, justifRef: "j" }, { id: "b", equipmentId: "E", dateMs: NOW, quantity: 10, costMinor: 100, justifRef: "j" }] }).anomalies, "CONSOMMATION_DOUBLON"));

  // ---- §6 stock ----
  const st = P.computeStock({ movements: [{ id: "m1", ref: "CIMENT", kind: "RECEPTION", qty: 100, unit: "sac", justifRef: "BL1" }, { id: "m2", ref: "CIMENT", kind: "CONSOMMATION", qty: 120, unit: "sac", justifRef: "C1", chantierId: "A" }], thresholds: { CIMENT: 0 } });
  check("stock theoretical + consumed computed; negative ⇒ STOCK_NEGATIF + RUPTURE", st.stock[0].theoretical === -20 && st.stock[0].consumed === 120 && has(st.anomalies, "STOCK_NEGATIF") && has(st.anomalies, "RUPTURE_POTENTIELLE"));
  check("stock movement w/o justif ⇒ MOUVEMENT_SANS_JUSTIF", has(P.computeStock({ movements: [{ id: "m", ref: "X", kind: "SORTIE", qty: 1, unit: "u" }] }).anomalies, "MOUVEMENT_SANS_JUSTIF"));
  check("incompatible unit ⇒ UNITE_INCOHERENTE", has(P.computeStock({ movements: [{ id: "m1", ref: "X", kind: "ENTREE", qty: 1, unit: "kg", justifRef: "j" }, { id: "m2", ref: "X", kind: "ENTREE", qty: 1, unit: "t", justifRef: "j" }] }).anomalies, "UNITE_INCOHERENTE"));
  check("transfer without destination ⇒ TRANSFERT_NON_RECU", has(P.computeStock({ movements: [{ id: "m", ref: "X", kind: "TRANSFERT", qty: 1, unit: "u", justifRef: "j" }] }).anomalies, "TRANSFERT_NON_RECU"));
  check("explicit signed adjustment applied (not silent)", P.computeStock({ movements: [{ id: "m1", ref: "X", kind: "ENTREE", qty: 10, unit: "u", justifRef: "j" }, { id: "m2", ref: "X", kind: "AJUSTEMENT", qty: -3, unit: "u", justifRef: "inv" }] }).stock[0].theoretical === 7);

  // ---- §7 supply reconciliation reuse ----
  const QUOTE = `TYPE: QUOTE\nDOC_NUMBER: D-1\nSUPPLIER: S\nCLIENT: C\nCHANTIER: CH\nISSUE_DATE: 2026-10-01\nCURRENCY: EUR\nLINE: id=L1; qty=10; unit=m3; unitPriceMinor=1000; netMinor=10000\nTOTAL_HT_MINOR: 10000\nTAX_MINOR: 2000\nTOTAL_TTC_MINOR: 12000`;
  const INV = `TYPE: INVOICE\nDOC_NUMBER: F-1\nSUPPLIER: S\nCLIENT: C\nQUOTE_REF: D-1\nCHANTIER: CH\nISSUE_DATE: 2026-11-01\nCURRENCY: EUR\nLINE: id=L1; qty=10; unit=m3; unitPriceMinor=1000; netMinor=10000\nTOTAL_HT_MINOR: 10000\nTAX_MINOR: 2000\nTOTAL_TTC_MINOR: 12000`;
  check("supply reconciliation delegates to document-intelligence (MATCHED)", P.reconcileSupply([{ quote: QUOTE, invoice: INV }]).results[0].status === "MATCHED");

  // ---- §8 CENTRAL: chantier cost integration, ANTI-DOUBLE-COUNT ----
  const imp = P.imputeToChantier({
    currency: "EUR",
    usages: [{ equipmentId: "EQ1", chantierId: "CH1", hours: 40, rateMinorPerHour: 5000, periodMonth: "2026-09", justifRef: "u1" }, { equipmentId: "EQ2", chantierId: "CH1", hours: 0, rateMinorPerHour: 5000 }],
    consumptions: [{ ref: "CIMENT", chantierId: "CH1", qty: 100, unitCostMinor: 800, kind: "CONSOMMATION", periodMonth: "2026-09", justifRef: "c1" }, { ref: "SABLE", chantierId: "CH1", qty: 10, unitCostMinor: 500, kind: "RECEPTION" }],
    purchases: [{ id: "ACH1", amountMinor: 500000, invoiced: true }],
  });
  check("impute: usage (40h×5000) + consumption (100×800) only", imp.totalImputedMinor === 280000 && imp.byCategory.EQUIPMENT === 200000 && imp.byCategory.MATERIAL === 80000);
  check("ANTI-DOUBLE-COUNT: RECEPTION not imputed; purchase ⇒ commitment, not a charge", imp.skipped.some((s: any) => /not a consumption \(RECEPTION\)/.test(s.reason)) && imp.commitments.length === 1 && imp.commitments[0].amountMinor === 500000);
  check("impute: zero-hours usage ⇒ skipped NOT_MEASURED (no fabricated cost)", imp.skipped.some((s: any) => /NOT_MEASURED/.test(s.reason)));
  // feed into chantier-profitability — the 500k purchase must NOT inflate the chantier cost
  const ch = CH.computeChantier({ id: "CH1", currency: "EUR", quote: { devisInitialMinor: 1000000 }, expenses: imp.expenses, commitments: imp.commitments, clientInvoices: [{ id: "f", amountMinor: 1000000, paidMinor: 0, periodMonth: "2026-09" }] });
  check("chantier integration: cost = 280000 (purchase NOT double-counted); marge 720000", ch.finance.coutTotalConstateMinor === 280000 && ch.finance.margeBruteConstateeMinor === 720000);

  // ---- fail-closed / read-only ----
  check("registry note documents read-only extensible model", /common extensible model/.test(reg.note));
  check("imputeToChantier note states anti-double-count + feeds computeChantier", /no double counting/.test(imp.note) && /chantier-profitability/.test(imp.note));
  check("empty inputs ⇒ ok with empty results (fail-closed, no throw)", P.buildRegistry(null).count === 0 && P.checkAvailability(null).assignmentsChecked === 0 && P.computeStock(null).stock.length === 0 && P.imputeToChantier(null).totalImputedMinor === 0);

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — parc-stock-engine (registry/availability/maintenance/fuel/stock/supply + §8 chantier cost integration with anti-double-count; reuses document-intelligence + chantier-profitability; NOT_MEASURED guard; read+calculate only; fail-closed)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
