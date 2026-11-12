#!/usr/bin/env node
"use strict";
/* V150 MÉTIER 2 — workforce/labour battery (SYNTHETIC, technical ids, labelled ≠ real staff/payroll). Proves: registry
 * (qualification provenance/verification, costSource), timesheets (status + anomalies, approved never silently modified),
 * labour cost (approved hours × SUPPLIED loaded rate, employer cost NEVER derived, COST_NOT_MEASURED, duplicate skip),
 * chantier imputation (only approved hours, ANTI-DOUBLE-COUNT vs subcontract invoices), analytics (sufficiency-guarded,
 * no personal ranking), and §7 consolidated déboursé sec (MO + matériaux + équipements + sous-traitance, no double count).
 * Adversarial + fail-closed. READ+CALCULATE only. */
const W = require("./workforce-labour-engine.js");
const P = require("./parc-stock-engine.js");
const CH = require("./chantier-profitability.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }
const DAY = 86400000, NOW = 1800000000000;
const has = (list: any[], code: string) => list.some((a: any) => a.code === code);

function main() {
  // ---- §2 registry ----
  const wf = W.buildWorkforce([
    { id: "S1", role: "SALARIE", loadedRateMinorPerHour: 3500, qualifications: [{ label: "CACES", provenance: "cert#123", validUntilMs: NOW + DAY, verified: true }] },
    { id: "S2", role: "SALARIE", loadedRateMinorPerHour: 3800, qualifications: [{ label: "habilitation élec" }] },
    { id: "I1", role: "INTERIMAIRE", loadedRateMinorPerHour: 4000 },
    { id: "ST1", role: "SOUS_TRAITANT" },
    { id: "S1" },
  ]);
  check("registry: valid kept, DUPLICATE_ID rejected", wf.count === 4 && wf.rejected.some((r: any) => r.reason === "DUPLICATE_ID"));
  check("qualification VERIFIED only with provenance+proof; else DECLARED_NO_PROOF (never 'qualified' without proof)", wf.items.find((x: any) => x.id === "S1").qualifications[0].status === "VERIFIED" && wf.items.find((x: any) => x.id === "S2").qualifications[0].status === "DECLARED_NO_PROOF");
  check("costSource: SOUS_TRAITANT ⇒ INVOICE, SALARIE/INTERIM ⇒ HOURS", wf.items.find((x: any) => x.id === "ST1").costSource === "INVOICE" && wf.items.find((x: any) => x.id === "S1").costSource === "HOURS");

  // ---- §3 timesheets + anomalies ----
  const ts = W.processTimesheets([
    { id: "T1", resourceId: "S1", chantierId: "CH1", dateMs: NOW, startMin: 480, endMin: 960, status: "APPROVED", activity: "MACONNERIE", periodMonth: "2026-09" },
    { id: "T2", resourceId: "S1", chantierId: "CH1", dateMs: NOW, startMin: 480, endMin: 960, status: "APPROVED", periodMonth: "2026-09" },   // duplicate
    { id: "T3", resourceId: "S1", chantierId: "CH2", dateMs: NOW, startMin: 900, endMin: 1020, status: "APPROVED" },                           // overlap + simultaneous
    { id: "T4", resourceId: "I1", chantierId: "CH1", dateMs: NOW, startMin: 480, endMin: 300, status: "APPROVED" },                            // negative duration
    { id: "T5", resourceId: null, chantierId: "CH1", dateMs: NOW, startMin: 480, endMin: 540, status: "DRAFT" },                               // unattached
    { id: "T6", resourceId: "S2", chantierId: "CH1", dateMs: NOW, startMin: 480, endMin: 960, status: "APPROVED", modified: true },           // approved modified w/o history
  ]);
  check("detects duplicate / overlap / simultaneous / negative / unattached / silent-modification", has(ts.anomalies, "POINTAGE_DUPLIQUE") && has(ts.anomalies, "CHEVAUCHEMENT") && has(ts.anomalies, "AFFECTATION_SIMULTANEE") && has(ts.anomalies, "DUREE_IMPOSSIBLE") && has(ts.anomalies, "TEMPS_NON_RATTACHE") && has(ts.anomalies, "MODIFICATION_SANS_HISTORIQUE"));
  check("statuses tracked", ts.byStatus.APPROVED === 5 && ts.byStatus.DRAFT === 1);
  check("planning/pointage écart detected when planned supplied", has(W.processTimesheets([{ id: "P1", resourceId: "S1", chantierId: "CH1", dateMs: NOW, startMin: 480, endMin: 960, status: "APPROVED" }], { planned: { ["S1|CH1|" + NOW]: 300 } }).anomalies, "ECART_PLANNING_POINTAGE"));

  // ---- §4 labour cost ----
  const cost = W.computeLabourCost(ts.entries.map((e: any) => ({ ...e, periodMonth: e.id === "T1" || e.id === "T2" ? "2026-09" : null })), wf, { currency: "EUR" });
  check("approved hours × supplied loaded rate (T1 8h×3500=28000)", cost.lines.find((l: any) => l.id === "T1").amountMinor === 28000);
  check("exact duplicate skipped (no double count)", cost.lines.find((l: any) => l.id === "T2").status === "SKIPPED_DUPLICATE" && cost.skippedDuplicateCount === 1);
  check("no supplied rate ⇒ COST_NOT_MEASURED (never derived from salary)", (() => { const c = W.computeLabourCost([{ id: "X", who: "NOEMP", chantierId: "C", minutes: 480, status: "APPROVED" }], wf, {}); return c.lines[0].status === "COST_NOT_MEASURED" && c.notMeasuredCount === 1; })());
  check("overtime majoration applied ONLY from an explicit param", (() => {
    const base = W.computeLabourCost([{ id: "O", who: "S1", chantierId: "C", dateMs: 1, startMin: 0, endMin: 600, minutes: 600, overtimeMin: 120, status: "APPROVED" }], wf, { currency: "EUR" });
    const maj = W.computeLabourCost([{ id: "O", who: "S1", chantierId: "C", dateMs: 1, startMin: 0, endMin: 600, minutes: 600, overtimeMin: 120, status: "APPROVED" }], wf, { currency: "EUR", overtimeMajorationBps: 2500 });
    return base.lines[0].overtimeMajorationApplied === false && maj.lines[0].overtimeMajorationApplied === true && maj.lines[0].amountMinor > base.lines[0].amountMinor;
  })());
  check("only APPROVED hours cost money (DRAFT/SUBMITTED excluded)", W.computeLabourCost([{ id: "D", who: "S1", chantierId: "C", minutes: 480, status: "DRAFT", dateMs: 2, startMin: 0, endMin: 480 }], wf, {}).lines.length === 0);

  // ---- §5 imputation + ANTI-DOUBLE-COUNT ----
  const imp = W.imputeLabourToChantier({
    currency: "EUR", workforce: wf, labourCost: cost,
    subcontractInvoices: [{ resourceId: "ST1", chantierId: "CH1", periodMonth: "2026-09", amountMinor: 200000, invoiceId: "SF1" }],
    travel: [{ chantierId: "CH1", amountMinor: 5000, justifRef: "km" }],
  });
  check("imputes approved own hours as LABOR + subcontract invoice as SUBCONTRACT + travel as TRANSPORT", imp.byCategory.LABOR === 65400 && imp.byCategory.SUBCONTRACT === 200000 && imp.byCategory.TRANSPORT === 5000);
  check("ANTI-DOUBLE-COUNT: resource with BOTH hours and a subcontract invoice ⇒ DOUBLE_IMPUTATION, hours skipped", (() => {
    const c2 = W.computeLabourCost([{ id: "H", who: "I1", chantierId: "CH1", dateMs: 5, startMin: 0, endMin: 480, minutes: 480, status: "APPROVED", periodMonth: "2026-09" }], wf, { currency: "EUR" });
    const r = W.imputeLabourToChantier({ currency: "EUR", workforce: wf, labourCost: c2, subcontractInvoices: [{ resourceId: "I1", chantierId: "CH1", periodMonth: "2026-09", amountMinor: 100000, invoiceId: "AG1" }] });
    return has(r.anomalies, "DOUBLE_IMPUTATION") && r.byCategory.LABOR === undefined && r.byCategory.SUBCONTRACT === 100000;
  })());
  check("INVOICE-sourced staff (sous-traitant) hours never imputed as LABOR", imp.expenses.every((e: any) => !(e.category === "LABOR" && e.supplier === "ST1")));

  // ---- §7 consolidated déboursé sec (MO + matériaux + équipements + sous-traitance), no double count ----
  const parc = P.imputeToChantier({ currency: "EUR", usages: [{ equipmentId: "EQ1", chantierId: "CH1", hours: 8, rateMinorPerHour: 6000, periodMonth: "2026-09", justifRef: "u" }], consumptions: [{ ref: "CIMENT", chantierId: "CH1", qty: 50, unitCostMinor: 800, kind: "CONSOMMATION", periodMonth: "2026-09" }], purchases: [{ id: "A1", amountMinor: 999999, invoiced: true }] });
  const ch = CH.computeChantier({ id: "CH1", currency: "EUR", quote: { devisInitialMinor: 2000000 }, expenses: [...imp.expenses, ...parc.expenses], clientInvoices: [{ id: "f", amountMinor: 1500000, paidMinor: 0, periodMonth: "2026-09" }] });
  check("consolidated déboursé sec: LABOR+MATERIAL+EQUIPMENT+SUBCONTRACT+TRANSPORT, purchase NOT double-counted", ch.finance.coutTotalConstateMinor === 358400 && ch.finance.costByCategory.LABOR === 65400 && ch.finance.costByCategory.SUBCONTRACT === 200000 && ch.finance.costByCategory.EQUIPMENT === 48000);
  check("marge brute reflects consolidated cost", ch.finance.margeBruteConstateeMinor === 1141600);

  // ---- §6 analytics (sufficiency-guarded, no ranking) ----
  const an = W.labourAnalytics({ labourCost: cost, timesheets: ts, debourseSecMinor: ch.finance.coutTotalConstateMinor });
  check("per-chantier avg hourly cost only when minutes>0 (else NOT_MEASURED); labour weight computed", an.byChantier.every((c: any) => c.avgHourlyMinor !== null || c.avgStatus === "NOT_MEASURED") && an.labourWeightInDebourseSecPct !== null);
  check("analytics note: no individual performance ranking", /not an individual performance ranking/i.test(an.note));

  // ---- fail-closed / read-only ----
  check("READ+CALCULATE only: runs no payroll, pays nothing (contract)", /runs no payroll/.test(W.WORKFORCE_LABOUR_CONTRACT.invariants[0]));
  check("empty inputs ⇒ ok empty (fail-closed, no throw)", W.buildWorkforce(null).count === 0 && W.processTimesheets(null).entries.length === 0 && W.computeLabourCost(null, null, null).totalMinor === 0 && W.imputeLabourToChantier(null).totalImputedMinor === 0 && W.labourAnalytics(null).totalLabourMinor === 0);

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — workforce-labour-engine (registry+qualif-proof / timesheets+anomalies / labour cost SUPPLIED-rate-only+COST_NOT_MEASURED+dup-skip / chantier imputation ANTI-DOUBLE-COUNT / consolidated déboursé sec / analytics guarded; read+calculate only; fail-closed)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
