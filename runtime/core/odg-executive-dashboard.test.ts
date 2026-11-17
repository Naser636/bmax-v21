#!/usr/bin/env node
"use strict";
/* V271 §6 — ODG executive dashboard. Feeds REAL V266/V267/V269 engine outputs through buildDashboard and asserts the §6
 * discipline on actual numbers: INVOICED≠COLLECTED (distinct cells/values), FORECAST≠REALIZED, committed FORECAST / estimated
 * ESTIMATED, absent input ⇒ UNKNOWN/NO_DATA (never a fabricated 0), freshness FRESH/STALE from injected day-stamps. SYNTHETIC. */
const D = require("./odg-executive-dashboard.js");
const DEVIS = require("./odg-btp-devis-engine.js");
const WORKFLOW = require("./odg-btp-project-workflow.js");
const BILLING = require("./odg-btp-billing-engine.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

function main() {
  // ---- assemble REAL engine outputs (SYNTHETIC inputs) ----
  const quotation = DEVIS.computeDevis({ overheadRate: 0.10, marginRate: 0.20, vatRate: 0.20, lines: [{ id: "L1", quantity: 100, materialQty: 100, materialUnitPriceMinor: 500, labourHours: 10, labourRateMinor: 4000, measurementState: "MEASURED" }] });
  const costLedger = WORKFLOW.actualCostLedger([
    { phase: "PAID", category: "MATERIAL", amountMinor: 52000, evidenceRef: "f" }, { phase: "INVOICED", category: "LABOUR", amountMinor: 41000, evidenceRef: "s" },
    { phase: "COMMITTED", category: "MATERIAL", amountMinor: 10000 }, { phase: "ESTIMATED", category: "OVERHEAD", amountMinor: 9900 },
  ]);
  const invoiceLedger = BILLING.paymentLedger({ asOfDay: 70, invoices: [{ id: "INV-DEP", amountTTCMinor: 42768, dueDay: 30 }, { id: "INV-PRG", amountTTCMinor: 42768, dueDay: 60 }], payments: [{ invoiceId: "INV-DEP", amountMinor: 42768, evidenceRef: "e", txnRef: "t" }], creditNotes: [{ invoiceId: "INV-PRG", amountMinor: 5000, evidenceRef: "c" }] });
  const terms = BILLING.paymentTerms({ projectId: "P1", quotationRef: "Q1", projectApproved: true, contractHTMinor: 118800, vatRate: 0.20, milestones: [{ id: "MS1", percent: 0.30 }] });
  const cashReconciliation = BILLING.cashReconciliation({ terms, invoiceLedger, costLedger, quotation });
  const schedule = WORKFLOW.planSchedule([{ id: "T1", percentComplete: 50 }, { id: "T2", dependencies: ["T1"], percentComplete: 0 }]);

  const dash = D.buildDashboard({
    asOf: 10, nowDay: 12, stalenessThresholdDays: 7,
    finance: { cashReconciliation }, financeEvidenceId: "FIN-ev1",
    operations: { schedule }, operationsEvidenceId: "OPS-ev1",
    btp: { invoiceLedger, quotationsCount: 3, approvedCount: 1, workPackageCount: 1, source: "synthetic", btpEvidenceId: "BTP-ev1" },
    odg: { missions: [{ id: "M1", status: "READY" }, { id: "M2", status: "BLOCKED" }, { id: "M3", status: "OWNER_GATED" }, { id: "M4", status: "READY" }] },
    // commercial intentionally ABSENT ⇒ must be UNKNOWN, never fabricated 0
  });
  const get = (sec: string, id: string) => dash.sections[sec].find((c: any) => c.id === id);

  check("dashboard ok, 6 sections, every KPI carries source + status", dash.ok && Object.keys(dash.sections).length === 6 && dash.kpiCount > 20 && [].concat(...Object.values(dash.sections) as any).every((c: any) => c.source && D.KPI_STATUS.indexOf(c.status) >= 0));

  // ---- §6 crux: INVOICED ≠ COLLECTED (distinct cells, distinct values) ----
  check("A: invoiced 85536 (ACTUAL) and collected 42768 (ACTUAL) are DISTINCT cells with distinct values (invoiced ≠ collected)",
    get("A_FINANCIAL", "FIN_INVOICED").value === 85536 && get("A_FINANCIAL", "FIN_COLLECTED").value === 42768 && get("A_FINANCIAL", "FIN_INVOICED").value !== get("A_FINANCIAL", "FIN_COLLECTED").value);
  check("A: receivable 37768 + overdue 37768 (ACTUAL); a receivable is not cash", get("A_FINANCIAL", "FIN_RECEIVABLE").value === 37768 && get("A_FINANCIAL", "FIN_OVERDUE").value === 37768);
  check("A: realized margin 25800 is ACTUAL; forecast margin 19800 is FORECAST (never conflated)",
    get("A_FINANCIAL", "FIN_REALIZED_MARGIN").value === 25800 && get("A_FINANCIAL", "FIN_REALIZED_MARGIN").status === "ACTUAL" && get("A_FINANCIAL", "FIN_FORECAST_MARGIN").value === 19800 && get("A_FINANCIAL", "FIN_FORECAST_MARGIN").status === "FORECAST");
  check("A: committed 10000 is FORECAST, estimated 9900 is ESTIMATED (committed ≠ incurred, estimated ≠ actual)",
    get("A_FINANCIAL", "FIN_COMMITTED").value === 10000 && get("A_FINANCIAL", "FIN_COMMITTED").status === "FORECAST" && get("A_FINANCIAL", "FIN_ESTIMATED").value === 9900 && get("A_FINANCIAL", "FIN_ESTIMATED").status === "ESTIMATED");

  // ---- §6 crux: absent input ⇒ UNKNOWN, value null, NEVER a fabricated 0 ----
  check("B: commercial input absent ⇒ leads UNKNOWN with value null (NOT 0 — no fabricated activity)",
    get("B_COMMERCIAL", "COM_LEADS").value === null && get("B_COMMERCIAL", "COM_LEADS").status === "UNKNOWN");

  // ---- C/D/E/F ----
  check("C: operational from V266 schedule — 2 tasks, T2 blocked (prereq T1 incomplete)", get("C_OPERATIONAL", "OPS_TASKS").value === 2 && get("C_OPERATIONAL", "OPS_BLOCKED").value === 1);
  check("D: BTP invoices=2 rows, paid total 42768 (from V267 ledger); quotations=3 supplied", get("D_BTP", "BTP_INVOICES").value === 2 && get("D_BTP", "BTP_PAID_TOTAL").value === 42768 && get("D_BTP", "BTP_QUOTATIONS").value === 3);
  check("E: company coverage from V269 — 20 domains, 20 assistants (ACTUAL)", get("E_COMPANY", "CO_DOMAINS").value === 20 && get("E_COMPANY", "CO_ASSISTANTS").value === 20);
  check("F: ODG mission queue — total 4, READY 2, BLOCKED 1, OWNER_GATED 1", get("F_ODG", "ODG_MISSIONS").value === 4 && get("F_ODG", "ODG_READY").value === 2 && get("F_ODG", "ODG_BLOCKED").value === 1 && get("F_ODG", "ODG_OWNER_GATED").value === 1);

  // ---- freshness (deterministic, injected day-stamps) ----
  check("freshness: asOf 10 / now 12 / threshold 7 ⇒ FRESH; a cell has evidenceId + asOf", get("A_FINANCIAL", "FIN_INVOICED").freshness === "FRESH" && get("A_FINANCIAL", "FIN_INVOICED").evidenceId === "FIN-ev1" && get("A_FINANCIAL", "FIN_INVOICED").asOf === 10);
  const stale = D.buildDashboard({ asOf: 1, nowDay: 20, stalenessThresholdDays: 7, finance: { cashReconciliation }, financeEvidenceId: "x" });
  check("freshness: asOf 1 / now 20 / threshold 7 ⇒ STALE", stale.sections.A_FINANCIAL.find((c: any) => c.id === "FIN_INVOICED").freshness === "STALE" && stale.staleCount > 0);

  // ---- absent finance entirely ⇒ NO_DATA, value null ----
  const empty = D.buildDashboard({ asOf: 5, nowDay: 6 });
  check("absent finance ⇒ NO_DATA cells (value null), not fabricated zeros", empty.sections.A_FINANCIAL.every((c: any) => c.value === null && (c.status === "NO_DATA" || c.status === "UNKNOWN")) && empty.noDataCount > 0);

  // ---- cell() guard: a value-less cell can never be ACTUAL ----
  check("cell(): a null-value cell marked ACTUAL is forced to NO_DATA (absent data never claimed as measured)", D.cell({ id: "x", value: null, status: "ACTUAL" }).status === "NO_DATA");

  // ---- determinism + contract ----
  check("deterministic + frozen", JSON.stringify(D.buildDashboard({ asOf: 10, nowDay: 12, finance: { cashReconciliation } })) === JSON.stringify(D.buildDashboard({ asOf: 10, nowDay: 12, finance: { cashReconciliation } })) && Object.isFrozen(D.KPI_STATUS) && Object.isFrozen(dash.sections));
  check("contract: composes V266/V267/V269; UNKNOWN≠0; INVOICED≠COLLECTED; no 2nd engine",
    D.EXECUTIVE_DASHBOARD_CONTRACT.reuses.some((r: string) => /V267/.test(r)) && D.EXECUTIVE_DASHBOARD_CONTRACT.reuses.some((r: string) => /V266/.test(r)) && D.EXECUTIVE_DASHBOARD_CONTRACT.reuses.some((r: string) => /V269/.test(r)) &&
    D.EXECUTIVE_DASHBOARD_CONTRACT.invariants.some((i: string) => /UNKNOWN is NOT zero/.test(i)) && D.EXECUTIVE_DASHBOARD_CONTRACT.invariants.some((i: string) => /INVOICED ≠ COLLECTED/.test(i)));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-executive-dashboard (V271 §6: evidence-backed company dashboard composing V266/V267/V269; 6 sections A-F; INVOICED 85536 ≠ COLLECTED 42768 as distinct cells; realized 25800 ACTUAL ≠ forecast 19800 FORECAST; committed FORECAST / estimated ESTIMATED; absent commercial ⇒ UNKNOWN value null [no fabricated 0]; freshness FRESH/STALE from injected day-stamps; mission queue READY 2/BLOCKED 1/OWNER_GATED 1; no 2nd engine)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
