#!/usr/bin/env node
"use strict";

/*
 * V271 §6 (Agent 06) — ODG GLOBAL EXECUTIVE DASHBOARD (deterministic, evidence-backed). Builds the REAL company-wide
 * management view by COMPOSING the existing engines — it adds NO new financial/ledger/accounting logic.
 *
 * REUSE (no 2nd engine/primitive):
 *   - odg-btp-billing-engine (V267): cashReconciliation / paymentLedger — the financial + receivables cells.
 *   - odg-btp-project-workflow (V266): planSchedule / actualCostLedger — the operational + cost cells.
 *   - odg-btp-company-management-coverage (V269): reconcile — the company-domain/assistant coverage cells.
 *   - ROADMAP.json mission register (supplied by the caller) — the ODG mission-queue cells.
 *
 * §6 DISCIPLINE (never violated): every KPI cell carries { source, calculation, evidenceId, asOf, status, uncertainty,
 * freshness }. UNKNOWN is NOT zero. ESTIMATED is NOT ACTUAL. INVOICED is NOT COLLECTED. FORECAST is NOT REALIZED. A dashboard
 * NEVER fabricates real company activity: when an input is absent the cell is NO_DATA/UNKNOWN (value null), never a made-up 0.
 * Deterministic/read-only (asOf + nowDay injected; no Date.now/Math.random/I/O). Nothing OPERATIONAL/world-class is claimed.
 */

const BILLING = require("./odg-btp-billing-engine.js");      // V267 (for type/shape reuse; caller passes its results)
const WORKFLOW = require("./odg-btp-project-workflow.js");   // V266
const COVERAGE = require("./odg-btp-company-management-coverage.js"); // V269

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function isNum(v: any): boolean { return typeof v === "number" && isFinite(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }

// a KPI's epistemic status — kept strictly distinct (§6).
const KPI_STATUS = Object.freeze(["ACTUAL", "ESTIMATED", "FORECAST", "UNKNOWN", "NO_DATA"]);
const FRESHNESS = Object.freeze(["FRESH", "STALE", "UNKNOWN"]);

/** freshness(asOf, nowDay, thresholdDays) -> FRESH/STALE/UNKNOWN (deterministic; day-stamps injected, no clock). */
function freshness(asOf: any, nowDay: any, thresholdDays: any): string {
  if (!isNum(asOf) || !isNum(nowDay)) return "UNKNOWN";
  const t = isNum(thresholdDays) ? thresholdDays : 7;
  return (nowDay - asOf) > t ? "STALE" : "FRESH";
}

/** cell(spec) -> a frozen KPI cell. When value is null/undefined the status is forced to NO_DATA (never a fabricated 0). */
function cell(spec: any): any {
  const s = isObj(spec) ? spec : {};
  const hasValue = s.value !== null && s.value !== undefined;
  let status = KPI_STATUS.indexOf(s.status) >= 0 ? s.status : "UNKNOWN";
  if (!hasValue && status !== "UNKNOWN") status = "NO_DATA";          // absent data is NEVER ACTUAL/ESTIMATED/FORECAST
  return Object.freeze({
    id: isStr(s.id) ? s.id : "KPI", section: isStr(s.section) ? s.section : "?", label: isStr(s.label) ? s.label : "",
    value: hasValue ? s.value : null, unit: isStr(s.unit) ? s.unit : null,
    status, source: isStr(s.source) ? s.source : "UNKNOWN", calculation: isStr(s.calculation) ? s.calculation : null,
    evidenceId: isStr(s.evidenceId) ? s.evidenceId : null, asOf: isNum(s.asOf) ? s.asOf : null,
    uncertainty: isStr(s.uncertainty) ? s.uncertainty : (status === "ACTUAL" ? "measured" : status === "FORECAST" || status === "ESTIMATED" ? "estimate" : "unknown"),
    freshness: freshness(s.asOf, s.nowDay, s.thresholdDays),
  });
}

// ---- Section A — Financial (from V267 cashReconciliation; INVOICED≠COLLECTED enforced as separate cells) ----
function sectionFinancial(fin: any, ctx: any): any[] {
  const r = isObj(fin) && fin.ok === true ? fin : null;                // a V267 cashReconciliation result
  const mk = (id: string, label: string, val: any, status: string, calc: string) => cell({ id, section: "A_FINANCIAL", label, value: r ? val : null, unit: "EURcent", status: r ? status : "NO_DATA", source: "odg-btp-billing-engine.cashReconciliation (V267)", calculation: calc, evidenceId: ctx.financeEvidenceId, asOf: ctx.asOf, nowDay: ctx.nowDay, thresholdDays: ctx.thresholdDays });
  return [
    mk("FIN_INVOICED", "Cumulative invoiced (TTC)", r && r.cumulativeInvoicedTTCMinor, "ACTUAL", "Σ invoice amounts (billed, NOT collected)"),
    mk("FIN_COLLECTED", "Cash collected", r && r.cashReceivedMinor, "ACTUAL", "Σ evidenced payment allocations (collected ≠ invoiced)"),
    mk("FIN_RECEIVABLE", "Outstanding receivables", r && r.outstandingReceivablesMinor, "ACTUAL", "invoiced − collected (a receivable is NOT cash)"),
    mk("FIN_OVERDUE", "Overdue receivables", r && r.overdueReceivablesMinor, "ACTUAL", "receivables past due date"),
    mk("FIN_SUPPLIER_PAID", "Supplier cost paid", r && r.paidSupplierCostMinor, "ACTUAL", "evidenced paid supplier cost"),
    mk("FIN_SUPPLIER_INVOICED", "Supplier cost invoiced", r && r.invoicedSupplierCostMinor, "ACTUAL", "invoiced supplier cost (not yet paid)"),
    mk("FIN_COMMITTED", "Committed cost", r && r.committedCostMinor, "FORECAST", "committed obligation (NOT incurred)"),
    mk("FIN_ESTIMATED", "Estimated cost", r && r.estimatedCostMinor, "ESTIMATED", "estimate (NOT actual)"),
    cell({ id: "FIN_REALIZED_MARGIN", section: "A_FINANCIAL", label: "Realized gross margin", value: r && r.realizedGrossMargin ? r.realizedGrossMargin.realizedMargin : null, unit: "EURcent", status: r && r.realizedGrossMargin ? "ACTUAL" : "NO_DATA", source: "V267→V266 realizedProfitability", calculation: "selling − evidence-backed incurred (forecast margin is NOT realized)", evidenceId: ctx.financeEvidenceId, asOf: ctx.asOf, nowDay: ctx.nowDay, thresholdDays: ctx.thresholdDays }),
    cell({ id: "FIN_FORECAST_MARGIN", section: "A_FINANCIAL", label: "Forecast gross margin", value: r && r.realizedGrossMargin ? r.realizedGrossMargin.forecastMargin : null, unit: "EURcent", status: r && r.realizedGrossMargin ? "FORECAST" : "NO_DATA", source: "V267→V266 realizedProfitability", calculation: "quotation forecast margin (estimate, never reported as realized)", evidenceId: ctx.financeEvidenceId, asOf: ctx.asOf, nowDay: ctx.nowDay, thresholdDays: ctx.thresholdDays }),
  ];
}

// ---- Section B — Commercial (from supplied pipeline; absent ⇒ UNKNOWN, never fabricated) ----
function sectionCommercial(com: any, ctx: any): any[] {
  const c = isObj(com) ? com : null;
  const mk = (id: string, label: string, key: string) => cell({ id, section: "B_COMMERCIAL", label, value: c && isNum(c[key]) ? c[key] : null, unit: "count", status: c && isNum(c[key]) ? "ACTUAL" : "UNKNOWN", source: c ? (isStr(c.source) ? c.source : "supplied pipeline") : "NO_INPUT", calculation: "count from supplied commercial pipeline", evidenceId: ctx.commercialEvidenceId, asOf: ctx.asOf, nowDay: ctx.nowDay, thresholdDays: ctx.thresholdDays });
  return [mk("COM_LEADS", "Leads", "leads"), mk("COM_PROSPECTS", "Prospects", "prospects"), mk("COM_CUSTOMERS", "Active customers", "customers"), mk("COM_CONVERTED", "Converted (period)", "converted")];
}

// ---- Section C — Operational (from V266 planSchedule) ----
function sectionOperational(ops: any, ctx: any): any[] {
  const s = isObj(ops) && ops.ok === true ? ops : null;
  const mk = (id: string, label: string, val: any, calc: string) => cell({ id, section: "C_OPERATIONAL", label, value: s ? val : null, unit: "count", status: s ? "ACTUAL" : "NO_DATA", source: "odg-btp-project-workflow.planSchedule (V266)", calculation: calc, evidenceId: ctx.operationsEvidenceId, asOf: ctx.asOf, nowDay: ctx.nowDay, thresholdDays: ctx.thresholdDays });
  return [
    mk("OPS_TASKS", "Tasks planned", s && s.taskCount, "schedule task count"),
    mk("OPS_COMPLETE", "Tasks complete", s && s.completedCount, "tasks at 100%"),
    mk("OPS_BLOCKED", "Tasks blocked", s && s.blocked ? s.blocked.length : null, "tasks with an incomplete prerequisite"),
    mk("OPS_DELAYED", "Tasks delayed", s && s.delayed ? s.delayed.length : null, "tasks past plannedFinish, not complete"),
  ];
}

// ---- Section D — BTP lifecycle (from V267 paymentLedger + supplied counts) ----
function sectionBtp(btp: any, ctx: any): any[] {
  const b = isObj(btp) ? btp : {};
  const led = isObj(b.invoiceLedger) && b.invoiceLedger.ok === true ? b.invoiceLedger : null;
  const cnt = (id: string, label: string, key: string) => cell({ id, section: "D_BTP", label, value: isNum(b[key]) ? b[key] : null, unit: "count", status: isNum(b[key]) ? "ACTUAL" : "UNKNOWN", source: isStr(b.source) ? b.source : "supplied BTP counts", calculation: "supplied lifecycle count", evidenceId: ctx.btpEvidenceId, asOf: ctx.asOf, nowDay: ctx.nowDay, thresholdDays: ctx.thresholdDays });
  return [
    cnt("BTP_QUOTATIONS", "Quotations", "quotationsCount"), cnt("BTP_APPROVED", "Approved quotations", "approvedCount"),
    cnt("BTP_WORKPACKAGES", "Work packages", "workPackageCount"),
    cell({ id: "BTP_INVOICES", section: "D_BTP", label: "Invoices issued", value: led ? led.rows.length : null, unit: "count", status: led ? "ACTUAL" : "NO_DATA", source: "odg-btp-billing-engine.paymentLedger (V267)", calculation: "invoice rows in the ledger", evidenceId: ctx.btpEvidenceId, asOf: ctx.asOf, nowDay: ctx.nowDay, thresholdDays: ctx.thresholdDays }),
    cell({ id: "BTP_PAID_TOTAL", section: "D_BTP", label: "Invoices paid (TTC)", value: led ? led.totalPaidMinor : null, unit: "EURcent", status: led ? "ACTUAL" : "NO_DATA", source: "odg-btp-billing-engine.paymentLedger (V267)", calculation: "Σ evidenced allocations (paid ≠ invoiced)", evidenceId: ctx.btpEvidenceId, asOf: ctx.asOf, nowDay: ctx.nowDay, thresholdDays: ctx.thresholdDays }),
  ];
}

// ---- Section E — Company management (from V269 coverage reconcile) ----
function sectionCompany(ctx: any): any[] {
  const rec = COVERAGE.reconcile();                                    // deterministic, read-only
  const t = rec.audit.tally;
  const mk = (id: string, label: string, val: any, calc: string) => cell({ id, section: "E_COMPANY", label, value: val, unit: "count", status: "ACTUAL", source: "odg-btp-company-management-coverage.reconcile (V269)", calculation: calc, evidenceId: "V269-coverage", asOf: ctx.asOf, nowDay: ctx.nowDay, thresholdDays: ctx.thresholdDays });
  return [
    mk("CO_DOMAINS", "Mega-domains mapped", rec.megaDomains.length, "count of mega-domains"),
    mk("CO_ASSISTANTS", "Assistants mapped", rec.assistants.length, "count of functional assistants"),
    mk("CO_EXISTING", "Domains EXISTING", t.EXISTING, "coverage status EXISTING (not operational)"),
    mk("CO_PARTIAL", "Domains PARTIAL", t.PARTIAL, "coverage status PARTIAL"),
    mk("CO_ABSENT", "Domains ABSENT", t.ABSENT, "coverage status ABSENT"),
  ];
}

// ---- Section F — ODG management (mission queue from the supplied ROADMAP register) ----
function sectionOdg(missions: any, ctx: any): any[] {
  const list = arr(missions).filter(isObj);
  const has = list.length > 0;
  const by = (st: string) => list.filter((m: any) => isStr(m.status) && m.status.toUpperCase() === st).length;
  const mk = (id: string, label: string, val: any, calc: string) => cell({ id, section: "F_ODG", label, value: has ? val : null, unit: "count", status: has ? "ACTUAL" : "NO_DATA", source: "ROADMAP.json mission register (supplied)", calculation: calc, evidenceId: "ROADMAP", asOf: ctx.asOf, nowDay: ctx.nowDay, thresholdDays: ctx.thresholdDays });
  return [
    mk("ODG_MISSIONS", "Missions (total)", list.length, "ROADMAP mission count"),
    mk("ODG_READY", "READY", by("READY"), "missions with status READY"),
    mk("ODG_BLOCKED", "BLOCKED", by("BLOCKED"), "missions with status BLOCKED"),
    mk("ODG_OWNER_GATED", "OWNER_GATED", by("OWNER_GATED"), "missions with status OWNER_GATED"),
  ];
}

/** buildDashboard(input) -> the full evidence-backed company dashboard (sections A-F). Deterministic; UNKNOWN ≠ 0. */
function buildDashboard(input: any): any {
  const i = isObj(input) ? input : {};
  const ctx = Object.freeze({
    asOf: isNum(i.asOf) ? i.asOf : null, nowDay: isNum(i.nowDay) ? i.nowDay : null, thresholdDays: isNum(i.stalenessThresholdDays) ? i.stalenessThresholdDays : 7,
    financeEvidenceId: isStr(i.financeEvidenceId) ? i.financeEvidenceId : null, commercialEvidenceId: isStr(i.commercialEvidenceId) ? i.commercialEvidenceId : null,
    operationsEvidenceId: isStr(i.operationsEvidenceId) ? i.operationsEvidenceId : null, btpEvidenceId: isStr(i.btpEvidenceId) ? i.btpEvidenceId : null,
  });
  const sections = Object.freeze({
    A_FINANCIAL: Object.freeze(sectionFinancial(i.finance && i.finance.cashReconciliation, ctx)),
    B_COMMERCIAL: Object.freeze(sectionCommercial(i.commercial, ctx)),
    C_OPERATIONAL: Object.freeze(sectionOperational(i.operations && i.operations.schedule, ctx)),
    D_BTP: Object.freeze(sectionBtp(i.btp, ctx)),
    E_COMPANY: Object.freeze(sectionCompany(ctx)),
    F_ODG: Object.freeze(sectionOdg(i.odg && i.odg.missions, ctx)),
  });
  const all = ([] as any[]).concat(...Object.values(sections) as any[]);
  const countStatus = (s: string) => all.filter((c: any) => c.status === s).length;
  const noData = all.filter((c: any) => c.value === null).length;
  return Object.freeze({
    ok: true, asOf: ctx.asOf, nowDay: ctx.nowDay, sections, kpiCount: all.length,
    statusTally: Object.freeze({ ACTUAL: countStatus("ACTUAL"), ESTIMATED: countStatus("ESTIMATED"), FORECAST: countStatus("FORECAST"), UNKNOWN: countStatus("UNKNOWN"), NO_DATA: countStatus("NO_DATA") }),
    noDataCount: noData, staleCount: all.filter((c: any) => c.freshness === "STALE").length,
    note: "every KPI carries source/calculation/evidenceId/asOf/status/uncertainty/freshness. UNKNOWN ≠ 0; ESTIMATED ≠ ACTUAL; INVOICED ≠ COLLECTED; FORECAST ≠ REALIZED. Absent inputs ⇒ NO_DATA/UNKNOWN (never a fabricated value). Composes V266/V267/V269 — no 2nd engine.",
  });
}

const EXECUTIVE_DASHBOARD_CONTRACT = Object.freeze({
  id: "V271-ODG-EXECUTIVE-DASHBOARD",
  source: "V271 §6 (Agent 06) — global evidence-backed executive dashboard",
  kpiStatuses: KPI_STATUS, freshnessStates: FRESHNESS,
  reuses: Object.freeze(["odg-btp-billing-engine (V267)", "odg-btp-project-workflow (V266)", "odg-btp-company-management-coverage (V269)", "ROADMAP.json mission register"]),
  invariants: Object.freeze([
    "every KPI cell carries source + calculation + evidenceId + asOf + status + uncertainty + freshness (§6)",
    "UNKNOWN is NOT zero; absent input ⇒ NO_DATA/UNKNOWN with value null — a dashboard NEVER fabricates company activity",
    "ESTIMATED ≠ ACTUAL; INVOICED ≠ COLLECTED; FORECAST ≠ REALIZED — kept as distinct cells, never conflated",
    "freshness derived from injected asOf vs nowDay (STALE past threshold) — deterministic, no clock",
    "COMPOSES V266/V267/V269 — no 2nd financial/ledger/accounting engine, no new primitive; nothing OPERATIONAL/world-class claimed",
  ]),
});

module.exports = { KPI_STATUS, FRESHNESS, freshness, cell, buildDashboard, EXECUTIVE_DASHBOARD_CONTRACT };

export {};
