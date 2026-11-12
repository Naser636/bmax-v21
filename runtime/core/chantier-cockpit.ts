#!/usr/bin/env node
"use strict";
/*
 * V151 §7 — M2 BTP/TP CONSOLIDATED COCKPIT. PURE, deterministic, fail-closed. A UNIFIED per-chantier surface COMPOSED over
 * the existing engines — it DUPLICATES no engine, builds no new finance/stock/labour logic, adds no primitive:
 *   - parc-stock-engine.imputeToChantier      → equipment usage + material consumption (+ commitments)
 *   - workforce-labour-engine.imputeLabourToChantier → approved labour + subcontract + travel
 *   - chantier-profitability.computeChantier   → devis/budget/déboursé/marge/forecast/anomalies (the single source of maths)
 *   - document-intelligence (via chantier-profitability dossiers)
 *
 * It assembles ONE cockpit view for a chantier, preserving the already-validated financial distinctions: achat ≠ consommation,
 * commande ≠ facture, facture ≠ paiement, estimation ≠ coût réel, marge brute ≠ bénéfice net. Every indicator carries its
 * ORIGIN; every missing datum / confidence blocker is surfaced. READ+CALCULATE only: it books/pays/orders/emits nothing.
 */
const PARC = require("./parc-stock-engine.js");
const WORK = require("./workforce-labour-engine.js");
const CHAN = require("./chantier-profitability.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isInt(v: any): boolean { return typeof v === "number" && Number.isSafeInteger(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }

/*
 * buildCockpit(input) — input = {
 *   chantierId, currency,
 *   quote, order?, clientInvoices?, dossiers?, costBudgetMinor?, forecast?, priorInvoiceNumbers?,   // chantier-profitability inputs
 *   parc?: { usages?, consumptions?, fuel?, maintenanceImputable?, purchases? },                     // parc-stock imputation inputs
 *   labour?: { workforce?, labourCost?, subcontractInvoices?, travel? },                              // workforce imputation inputs
 *   directExpenses?: [...]                                                                            // any pre-built expense records
 * }
 */
function buildCockpit(input: any): any {
  const i = isObj(input) ? input : {};
  const chantierId = isStr(i.chantierId) ? i.chantierId : null;
  const currency = isStr(i.currency) ? i.currency : "EUR";
  if (!chantierId) return Object.freeze({ ok: false, code: "NO_CHANTIER_ID", detail: "a chantier id is required" });

  const sources: any[] = [];
  const expenses: any[] = []; const commitments: any[] = [];

  // 1) equipment + materials (parc-stock) — purchases become commitments (not charges).
  if (isObj(i.parc)) {
    const p = PARC.imputeToChantier({ currency, ...i.parc });
    for (const e of p.expenses) expenses.push(e);
    for (const c of p.commitments) commitments.push(c);
    sources.push({ source: "parc-stock-engine.imputeToChantier", expenseCount: p.expenses.length, commitmentCount: p.commitments.length, byCategory: p.byCategory, antiDoubleCount: "purchases/receptions are commitments, not charges" });
  }
  // 2) labour + subcontract + travel (workforce) — anti-double-count handled inside.
  let labourAnomalies: any[] = [];
  if (isObj(i.labour)) {
    const l = WORK.imputeLabourToChantier({ currency, ...i.labour });
    for (const e of l.expenses) expenses.push(e);
    labourAnomalies = l.anomalies || [];
    sources.push({ source: "workforce-labour-engine.imputeLabourToChantier", expenseCount: l.expenses.length, byCategory: l.byCategory, anomalies: l.anomalies.map((a: any) => a.code), antiDoubleCount: "INVOICE-sourced staff hours skipped; DOUBLE_IMPUTATION detected" });
  }
  // 3) any direct expense records supplied as-is.
  if (Array.isArray(i.directExpenses)) { for (const e of i.directExpenses) if (isObj(e)) expenses.push(e); sources.push({ source: "directExpenses", expenseCount: i.directExpenses.length }); }

  // 4) THE single maths source: chantier-profitability.computeChantier (devis/budget/déboursé/marge/forecast/anomalies).
  const chInput: any = { id: chantierId, currency, expenses, commitments };
  for (const k of ["quote", "order", "clientInvoices", "dossiers", "costBudgetMinor", "forecast", "priorInvoiceNumbers", "nowMs", "staleMs"]) if (i[k] !== undefined) chInput[k] = i[k];
  const ch = CHAN.computeChantier(chInput);
  if (ch.ok !== true) return Object.freeze({ ok: false, code: ch.code || "CHANTIER_COMPUTE_FAILED", detail: ch.detail, upstream: ch });

  const f = ch.finance;
  // confidence blockers: what prevents a reliable conclusion.
  const blockers: string[] = [];
  if (ch.anomalies.some((a: any) => a.code === "MISSING_DATA")) blockers.push("extraction/reconciliation flagged missing or ambiguous data");
  if (f.resteAEngagerMinor === null) blockers.push("no 'reste à engager' estimate ⇒ forecast understated");
  if (f.costBudgetMinor === null) blockers.push("no cost budget ⇒ budget/réel écart not computed");
  for (const a of labourAnomalies) if (a.code === "DOUBLE_IMPUTATION") blockers.push("a labour double-imputation was prevented (hours vs subcontract invoice)");
  const confidence = blockers.length === 0 ? "HIGH" : (blockers.length <= 2 ? "MEDIUM" : "LOW");

  // the cockpit view — each indicator tagged with its ORIGIN.
  const view = Object.freeze({
    chantierId, currency,
    selling: Object.freeze({
      devisInitialMinor: { value: f.devisInitialMinor, origin: "chantier-profitability (quote)" },
      avenantsApprouvesMinor: { value: f.modificationsApprouveesMinor, origin: "chantier-profitability (approved quote versions)" },
      budgetReviseMinor: { value: f.budgetReviseMinor, origin: "devis + avenants approuvés" },
      caFactureMinor: { value: f.caFactureMinor, origin: "client invoices (billed ≠ devis)" },
      encaissementsMinor: { value: f.encaissementsMinor, origin: "client invoice payments (≠ billed)" },
    }),
    engagements: Object.freeze({ engagementsNonFacturesMinor: { value: f.engagementsNonFacturesMinor, origin: "commitments not yet invoiced (incl. parc purchases)" } }),
    cost: Object.freeze({
      debourseSecMinor: { value: f.coutTotalConstateMinor, origin: "Σ imputed expenses (MO + matériaux + équipements + sous-traitance + transport)", note: "déboursé sec; EXCLUDES frais de structure" },
      byCategory: { value: f.costByCategory, origin: "parc-stock + workforce imputations (no double count: purchases/INVOICE-staff excluded)" },
      justifiedMinor: { value: f.justifiedCostMinor, origin: "expenses carrying a justifRef" },
      unjustifiedMinor: { value: f.unjustifiedCostMinor, origin: "expenses without a justifRef (anomaly)" },
      projectedAtCompletionMinor: { value: f.projectedCostAtCompletionMinor, origin: "déboursé + engagements + reste-à-engager(ESTIMATE)" },
      ecartBudgetReelMinor: { value: f.ecartBudgetReelMinor, origin: "cost budget − projected (null if no cost budget)" },
    }),
    margin: Object.freeze({
      margeBruteConstateeMinor: { value: f.margeBruteConstateeMinor, origin: "CA facturé − déboursé constaté", note: "gross margin ≠ net profit (excludes frais de structure)" },
      margePrevisionnelleATerminaisonMinor: { value: f.margePrevisionnelleATerminaisonMinor, origin: "budget révisé − projected cost (FORECAST)" },
    }),
    anomalies: ch.anomalies,
    forecast: ch.forecast,
    confidence, confidenceBlockers: Object.freeze(blockers),
  });

  // derive a cockpit HEALTH from the composed engine outputs (computeChantier exposes anomalies + alerts, not a headline).
  const alertCodes = (ch.alerts || []).map((a: any) => a.code);
  const health = alertCodes.indexOf("RISQUE_DEPASSEMENT") >= 0 || alertCodes.indexOf("BUDGET_DEPASSE") >= 0 ? "AT_RISK"
    : (ch.anomalies.length > 0 || alertCodes.length > 0) ? "WATCH"
    : (f.margeBruteConstateeMinor >= 0 ? "ON_TRACK" : "WATCH");
  const decision = health === "ON_TRACK" ? "PROPOSE_REVIEW (indicators green; human validation still required before any accounting write)" : "HOLD_FOR_HUMAN_REVIEW (anomalies/alerts present; nothing booked/paid/emitted)";

  return Object.freeze({
    ok: true, chantierId, view, sources: Object.freeze(sources),
    health, decision, alerts: ch.alerts,
    financialDistinctions: Object.freeze(["achat de stock ≠ consommation", "commande ≠ facture", "facture ≠ paiement", "estimation ≠ coût réel", "marge brute ≠ bénéfice net"]),
    upstream: Object.freeze({ chantier: ch }),
    note: "COMPOSED cockpit over existing engines (no engine duplicated, no new primitive). READ+CALCULATE only: books/pays/orders/emits nothing. Every indicator carries its origin; confidence blockers are surfaced. SYNTHETIC ≠ real chantier.",
  });
}

const CHANTIER_COCKPIT_CONTRACT = Object.freeze({
  id: "V151-CHANTIER-COCKPIT",
  metier: "M2 BTP/TP — unified per-chantier cockpit composed over existing engines",
  reuses: ["parc-stock-engine.imputeToChantier", "workforce-labour-engine.imputeLabourToChantier", "chantier-profitability.computeChantier", "document-intelligence (via dossiers)"],
  invariants: Object.freeze([
    "COMPOSES existing engines — duplicates no engine, adds no finance/stock/labour maths, no new primitive",
    "chantier-profitability.computeChantier is the SINGLE maths source; cockpit only assembles + tags origins",
    "preserves validated distinctions: achat≠consommation, commande≠facture, facture≠paiement, estimation≠coût réel, marge brute≠bénéfice net",
    "every indicator carries its origin; confidence blockers (missing data / no estimate / no budget) are surfaced",
    "READ+CALCULATE only: books/pays/orders/emits nothing; anti-double-count inherited from the composed engines; fail-closed",
  ]),
});
module.exports = { buildCockpit, CHANTIER_COCKPIT_CONTRACT };
export {};
