#!/usr/bin/env node
"use strict";
/*
 * V148 MÉTIER 2 (BTP/TP) — CHANTIER PROFITABILITY ENGINE. PURE, deterministic, fail-closed, integer-MINOR (no float drift),
 * single-currency guard. READ + CALCULATE only: it books nothing, pays nothing, orders nothing, emits no invoice, writes no
 * accounting entry, and makes NO legal/accounting validation. It reuses existing engines (no parallel architecture):
 *   - finops-analyzer.ts          → expense duplicate / spike (abnormal-expense) detection
 *   - document-intelligence.ts    → optional dossier reconciliation (devis→cmd→facture→BL) folded into anomalies
 *
 * It separates, and never confuses (directive §2.2): SELLING price (devis / budget révisé / CA facturé) vs COST (déboursé
 * constaté / engagements / reste à engager) vs ESTIMATE (reste à engager, prévision à terminaison) vs ENCAISSEMENT (payments)
 * vs NET profit (gross margin here EXCLUDES frais de structure ⇒ it is NOT net company profit). Cost model = DÉBOURSÉ SEC
 * (radar V148_RADAR_CHANTIER): MO + matériaux + matériel/engins + sous-traitance + transport, before frais de structure.
 *
 * computeChantier(chantier) -> { ok, currency, finance{...}, timeline[], anomalies[], forecast{...}, alerts[], inputs{...} }
 */
const FIN = require("./finops-analyzer.js");
const DOC = require("./document-intelligence.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isInt(v: any): boolean { return typeof v === "number" && Number.isSafeInteger(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function arr(v: any): any[] { return Array.isArray(v) ? v.filter(isObj) : []; }
const COST_CATS = Object.freeze(["LABOR", "MATERIAL", "SUBCONTRACT", "EQUIPMENT", "TRANSPORT", "MISC"]);

function computeChantier(chantier: any): any {
  const c = isObj(chantier) ? chantier : {};
  const currency = isStr(c.currency) ? c.currency : "EUR";
  const chantierId = isStr(c.id) ? c.id : null;
  if (!chantierId) return Object.freeze({ ok: false, code: "NO_CHANTIER_ID", detail: "a chantier id is required (every datum must attach to a chantier)" });

  // --- single-currency guard: any amount carrying a different currency ⇒ fail-closed (no implicit FX) ---
  const foreign: string[] = [];
  const scan = (list: any[], where: string) => { for (const x of list) if (isStr(x.currency) && x.currency !== currency) foreign.push(`${where}:${x.currency}`); };
  const expenses = arr(c.expenses), commitments = arr(c.commitments), clientInvoices = arr(c.clientInvoices), versions = arr(c.quote && c.quote.versions);
  scan(expenses, "expense"); scan(commitments, "commitment"); scan(clientInvoices, "clientInvoice");
  if (foreign.length) return Object.freeze({ ok: false, code: "MIXED_CURRENCY", detail: `amounts in a currency other than ${currency} (no implicit FX): ${foreign.slice(0, 10).join(", ")}` });

  const nowMs = isInt(c.nowMs) ? c.nowMs : null;
  const staleMs = isInt(c.staleMs) ? c.staleMs : null;
  const anomalies: any[] = [];
  const addA = (code: string, detail: string, impactMinor: number | null, confidence: string, evidence: string) => anomalies.push({ code, detail, impactMinor, confidence, evidence });

  // ===================== §2.2 DETERMINISTIC FINANCE (integer minor) =====================
  const devisInitialMinor = isObj(c.quote) && isInt(c.quote.devisInitialMinor) ? c.quote.devisInitialMinor : 0;
  const approvedMods = versions.filter((v: any) => v.approved === true && isInt(v.deltaMinor));
  const modificationsApprouveesMinor = approvedMods.reduce((n: number, v: any) => n + v.deltaMinor, 0);
  const budgetReviseMinor = devisInitialMinor + modificationsApprouveesMinor;                  // revised SELLING/contract value

  // cost side (déboursé). justified = carries a justifRef; by category too.
  const validExp = expenses.filter((e: any) => isInt(e.amountMinor) && e.amountMinor >= 0);
  const coutTotalConstateMinor = validExp.reduce((n: number, e: any) => n + e.amountMinor, 0);   // déboursé constaté (real incurred)
  const justifiedCostMinor = validExp.filter((e: any) => isStr(e.justifRef)).reduce((n: number, e: any) => n + e.amountMinor, 0);
  const unjustifiedCostMinor = coutTotalConstateMinor - justifiedCostMinor;
  const costByCategory: Record<string, number> = {};
  for (const cat of COST_CATS) costByCategory[cat] = 0;
  for (const e of validExp) { const cat = isStr(e.category) && COST_CATS.indexOf(e.category) >= 0 ? e.category : "MISC"; costByCategory[cat] += e.amountMinor; }

  // engagements not yet invoiced (commitment with invoiced !== true)
  const validCommit = commitments.filter((x: any) => isInt(x.amountMinor) && x.amountMinor >= 0);
  const engagementsNonFacturesMinor = validCommit.filter((x: any) => x.invoiced !== true).reduce((n: number, x: any) => n + x.amountMinor, 0);

  // reste à engager = ESTIMATE/hypothesis (explicitly flagged). If absent ⇒ null + forecast caveat.
  const resteAEngagerMinor = isObj(c.forecast) && isInt(c.forecast.resteAEngagerMinor) ? c.forecast.resteAEngagerMinor : null;
  const resteAEngagerIsEstimate = true;

  // cost budget (déboursé prévu) — OPTIONAL and DISTINCT from the selling budget révisé.
  const costBudgetMinor = isInt(c.costBudgetMinor) ? c.costBudgetMinor : null;

  // revenue realised
  const validInv = clientInvoices.filter((i: any) => isInt(i.amountMinor) && i.amountMinor >= 0);
  const caFactureMinor = validInv.reduce((n: number, i: any) => n + i.amountMinor, 0);           // CA facturé (billed ≠ devis, ≠ paid)
  const encaissementsMinor = validInv.reduce((n: number, i: any) => n + (isInt(i.paidMinor) ? i.paidMinor : 0), 0); // payments actually received

  // margins — EXPLICIT definitions (never conflated)
  const margeBruteConstateeMinor = caFactureMinor - coutTotalConstateMinor;                      // on billed vs incurred; EXCLUDES frais de structure ⇒ NOT net profit
  const projectedCostAtCompletionMinor = coutTotalConstateMinor + engagementsNonFacturesMinor + (resteAEngagerMinor || 0);
  const margePrevisionnelleATerminaisonMinor = budgetReviseMinor - projectedCostAtCompletionMinor; // EAC margin: revised contract value − projected cost (FORECAST)
  const ecartBudgetReelMinor = costBudgetMinor !== null ? costBudgetMinor - projectedCostAtCompletionMinor : null; // cost budget vs projected (null ⇒ no cost budget supplied)

  // ===================== §2.3 RECONCILIATION + TRACEABILITY =====================
  // dépense sans justificatif
  for (const e of validExp) if (!isStr(e.justifRef)) addA("DEPENSE_SANS_JUSTIFICATIF", `expense '${e.id || "?"}' (${e.amountMinor} ${currency}) has no supporting document (justifRef)`, e.amountMinor, "HIGH", `expense=${e.id}`);
  // dépense non rattachée au chantier
  for (const e of validExp) if (isStr(e.chantierId) && e.chantierId !== chantierId) addA("DEPENSE_NON_RATTACHEE", `expense '${e.id || "?"}' is attached to chantier '${e.chantierId}', not '${chantierId}'`, e.amountMinor, "HIGH", `expense=${e.id} chantier=${e.chantierId}`);
  // commande dépassée: expenses linked to a commitment exceed the commitment amount
  const commitById = new Map<string, any>(); for (const x of validCommit) if (isStr(x.id)) commitById.set(x.id, x);
  const spentByCommit = new Map<string, number>(); for (const e of validExp) if (isStr(e.commitmentId)) spentByCommit.set(e.commitmentId, (spentByCommit.get(e.commitmentId) || 0) + e.amountMinor);
  for (const [cid, spent] of spentByCommit) { const cm = commitById.get(cid); if (cm && spent > cm.amountMinor) addA("COMMANDE_DEPASSEE", `spend on commitment '${cid}' (${spent}) exceeds the committed amount (${cm.amountMinor})`, spent - cm.amountMinor, "HIGH", `commitment=${cid} Δ=${spent - cm.amountMinor}`); }
  // facture fournisseur non rapprochée: an expense invoice not linked to any commitment
  for (const e of validExp) if (isStr(e.invoiceId) && !isStr(e.commitmentId)) addA("FACTURE_FOURNISSEUR_NON_RAPPROCHEE", `supplier invoice '${e.invoiceId}' is not reconciled to any commitment/order`, e.amountMinor, "MEDIUM", `invoice=${e.invoiceId}`);
  // coût dépassant le budget (cost)
  if (costBudgetMinor !== null && projectedCostAtCompletionMinor > costBudgetMinor) addA("COUT_DEPASSE_BUDGET", `projected cost at completion (${projectedCostAtCompletionMinor}) exceeds the cost budget (${costBudgetMinor})`, projectedCostAtCompletionMinor - costBudgetMinor, "HIGH", `Δ=${projectedCostAtCompletionMinor - costBudgetMinor}`);
  // facture client non prévue: CA facturé exceeds the revised contract value (over-billing vs devis)
  if (caFactureMinor > budgetReviseMinor && budgetReviseMinor > 0) addA("FACTURE_CLIENT_NON_PREVUE", `billed CA (${caFactureMinor}) exceeds the revised contract value (${budgetReviseMinor}) — billed beyond devis+avenants`, caFactureMinor - budgetReviseMinor, "MEDIUM", `Δ=${caFactureMinor - budgetReviseMinor}`);
  // stale / incoherent data
  if (nowMs !== null && staleMs !== null) for (const e of validExp) if (isInt(e.dateMs) && nowMs - e.dateMs > staleMs) addA("DONNEE_TROP_ANCIENNE", `expense '${e.id || "?"}' is older than the freshness window`, null, "LOW", `ageMs=${nowMs - e.dateMs}`);

  // reuse finops-analyzer for duplicate-charge + abnormal-expense (spike) detection over the expense records.
  const finopsRecords = validExp.map((e: any) => ({ vendor: isStr(e.supplier) ? e.supplier : "(unknown)", service: isStr(e.category) ? e.category : "MISC", periodMonth: isStr(e.periodMonth) ? e.periodMonth : "(unknown)", amountMinor: e.amountMinor, usage: typeof e.usage === "number" ? e.usage : undefined }));
  const finops = FIN.analyzeCosts(finopsRecords);
  for (const d of finops.duplicates) addA("DEPENSE_DOUBLON", `possible duplicate expense: ${d.detail}`, d.amountMinor, "MEDIUM", `${d.vendor}|${d.service}|${d.period}`);

  // optional document dossiers (devis→cmd→facture→BL) reconciled via document-intelligence; fold their anomalies.
  const dossiers = arr(c.dossiers);
  const dossierResults: any[] = [];
  for (let k = 0; k < dossiers.length; k++) {
    const r = DOC.reconcileDossier(dossiers[k]);
    dossierResults.push({ index: k, status: r.status });
    for (const a of (r.anomalies || [])) {
      if (a.code === "DUPLICATE") addA("FACTURE_DOUBLON", `dossier ${k}: ${a.detail}`, null, "MEDIUM", a.evidence || "");
      else if (a.code === "PARTIAL") addA("LIVRAISON_NON_RAPPROCHEE", `dossier ${k}: ${a.detail}`, null, "MEDIUM", a.evidence || "");
      else if (a.code === "UNQUOTED_LINE" || (isStr(a.detail) && /billed-but-not-quoted/.test(a.detail))) addA("LIGNE_FACTUREE_NON_JUSTIFIEE", `dossier ${k}: ${a.detail}`, null, "MEDIUM", a.evidence || "");
      else if (a.code === "TOTAL_DRIFT" || a.code === "LINE_AMOUNT_DRIFT") addA("PRIX_ERRONE", `dossier ${k}: ${a.detail}`, null, "MEDIUM", a.evidence || "");
    }
  }

  // ===================== timeline: cumulative margin by month (évolution de marge) =====================
  const months = new Set<string>();
  for (const i of validInv) if (isStr(i.periodMonth)) months.add(i.periodMonth);
  for (const e of validExp) if (isStr(e.periodMonth)) months.add(e.periodMonth);
  const sortedMonths = Array.from(months).sort();
  let cumCA = 0, cumCost = 0;
  const timeline = sortedMonths.map((m: string) => {
    cumCA += validInv.filter((i: any) => i.periodMonth === m).reduce((n: number, i: any) => n + i.amountMinor, 0);
    cumCost += validExp.filter((e: any) => e.periodMonth === m).reduce((n: number, e: any) => n + e.amountMinor, 0);
    return Object.freeze({ month: m, cumulativeCaMinor: cumCA, cumulativeCostMinor: cumCost, cumulativeMarginMinor: cumCA - cumCost });
  });

  // ===================== §2.4 FORECAST + ALERTS =====================
  const hypotheses: string[] = [];
  if (resteAEngagerMinor === null) hypotheses.push("no 'reste à engager' estimate supplied ⇒ forecast assumes 0 remaining cost (projected cost is likely UNDERSTATED)");
  else hypotheses.push(`'reste à engager' = ${resteAEngagerMinor} is an ESTIMATE (simulation input), not a measured cost`);
  if (costBudgetMinor === null) hypotheses.push("no cost budget (déboursé prévu) supplied ⇒ budget/réel écart not computed");
  const missingData: string[] = [];
  if (validInv.length === 0) missingData.push("no client invoices ⇒ CA facturé = 0");
  if (validExp.length === 0) missingData.push("no expenses ⇒ coût constaté = 0");

  const alerts: any[] = [];
  const addAlert = (code: string, detail: string, basis: string, confidence: string) => alerts.push({ code, detail, basis, confidence, note: "an alert is a signal, not a certainty" });
  // margin degrading across the timeline
  if (timeline.length >= 2 && timeline[timeline.length - 1].cumulativeMarginMinor < timeline[0].cumulativeMarginMinor) addAlert("MARGE_EN_DEGRADATION", "cumulative margin is lower at the latest month than at the first", `first=${timeline[0].cumulativeMarginMinor} last=${timeline[timeline.length - 1].cumulativeMarginMinor}`, "MEDIUM");
  // budget exceeded / near (on cost)
  if (costBudgetMinor !== null) {
    if (projectedCostAtCompletionMinor > costBudgetMinor) addAlert("BUDGET_DEPASSE", "projected cost at completion exceeds the cost budget", `projected=${projectedCostAtCompletionMinor} budget=${costBudgetMinor}`, "HIGH");
    else if (projectedCostAtCompletionMinor >= Math.floor(costBudgetMinor * 0.9)) addAlert("BUDGET_PROCHE", "projected cost at completion is within 10% of the cost budget", `projected=${projectedCostAtCompletionMinor} budget=${costBudgetMinor}`, "MEDIUM");
  }
  // forecast margin negative ⇒ overrun risk
  if (margePrevisionnelleATerminaisonMinor < 0) addAlert("RISQUE_DEPASSEMENT", "forecast margin at completion is negative (projected cost exceeds revised contract value)", `eacMargin=${margePrevisionnelleATerminaisonMinor}`, "HIGH");
  // uncovered remaining cost: reste à engager not covered by remaining revenue (budget − CA billed)
  if (resteAEngagerMinor !== null) { const remainingRevenue = budgetReviseMinor - caFactureMinor; if (resteAEngagerMinor > remainingRevenue) addAlert("COUT_RESTANT_NON_COUVERT", "estimated remaining cost exceeds remaining billable revenue", `reste=${resteAEngagerMinor} remainingRevenue=${remainingRevenue}`, "MEDIUM"); }
  // abnormal expense (finops spike)
  for (const sp of finops.anomalies) addAlert("DEPENSE_ANORMALE", `expense spike: ${sp.detail}`, `service=${sp.service} ratio=${sp.ratio}`, "MEDIUM");
  // unreconciled supplier invoice already an anomaly ⇒ surface as alert too
  if (anomalies.some((a: any) => a.code === "FACTURE_FOURNISSEUR_NON_RAPPROCHEE")) addAlert("FACTURE_FOURNISSEUR_NON_RAPPROCHEE", "at least one supplier invoice is not reconciled to a commitment", "see anomalies", "MEDIUM");

  return Object.freeze({
    ok: true, chantierId, currency,
    finance: Object.freeze({
      // SELLING side
      devisInitialMinor, modificationsApprouveesMinor, budgetReviseMinor, caFactureMinor, encaissementsMinor,
      // COST side (déboursé sec)
      coutTotalConstateMinor, justifiedCostMinor, unjustifiedCostMinor, costByCategory: Object.freeze(costByCategory),
      engagementsNonFacturesMinor, resteAEngagerMinor, resteAEngagerIsEstimate, costBudgetMinor, projectedCostAtCompletionMinor,
      // MARGINS (explicit, never conflated)
      margeBruteConstateeMinor, margePrevisionnelleATerminaisonMinor, ecartBudgetReelMinor,
      marginDefinitions: Object.freeze({
        margeBruteConstatee: "CA facturé − coût déboursé constaté; EXCLUDES frais de structure ⇒ NOT net company profit",
        margePrevisionnelleATerminaison: "FORECAST: budget révisé (revised contract value) − projected cost at completion (includes an ESTIMATE)",
        ecartBudgetReel: "cost budget (déboursé prévu) − projected cost at completion; null if no cost budget supplied",
      }),
    }),
    timeline: Object.freeze(timeline),
    anomalies: Object.freeze(anomalies.map((a: any) => Object.freeze(a))),
    anomalyImpactMinor: anomalies.reduce((n: number, a: any) => n + (isInt(a.impactMinor) ? a.impactMinor : 0), 0),
    dossierReconciliations: Object.freeze(dossierResults),
    forecast: Object.freeze({ projectedCostAtCompletionMinor, margePrevisionnelleATerminaisonMinor, hypotheses: Object.freeze(hypotheses), missingData: Object.freeze(missingData), caveat: "forecast is a SIMULATION from available data; hypotheses are visible + modifiable only in simulation scope; not a commitment." }),
    alerts: Object.freeze(alerts.map((a: any) => Object.freeze(a))),
    note: "READ+CALCULATE only on SYNTHETIC/imported data: books/pays/orders/emits NOTHING, no accounting/legal validation. integer-minor, single-currency. SELLING vs COST vs ESTIMATE vs ENCAISSEMENT vs NET kept distinct; gross margin ≠ net profit. Every anomaly carries origin+proof+impact+confidence; every alert is a signal, not a certainty.",
  });
}

const CHANTIER_PROFITABILITY_CONTRACT = Object.freeze({
  id: "V148-CHANTIER-PROFITABILITY",
  metier: "M2 BTP/TP — chantier cost/margin + budget-vs-réel + anomalies + forecast (déboursé sec model)",
  reuses: ["finops-analyzer (duplicate/spike detection)", "document-intelligence (dossier reconciliation)", "integer minor-unit arithmetic", "single-currency guard"],
  invariants: Object.freeze([
    "READ+CALCULATE only: books/pays/orders/emits nothing; no accounting/legal validation; no real planning change",
    "integer minor units + single-currency guard (no float, no implicit FX)",
    "SELLING (devis/budget révisé/CA) ≠ COST (déboursé) ≠ ESTIMATE (reste à engager/EAC) ≠ ENCAISSEMENT ≠ NET profit; gross margin EXCLUDES frais de structure",
    "every anomaly explains origin + proof + calculable impact + confidence; every alert is a signal, not a certainty, with visible missing-data + hypotheses",
    "reuses existing engines (no parallel architecture, no new primitive); synthetic data is never a real chantier measurement",
  ]),
});
module.exports = { computeChantier, COST_CATS, CHANTIER_PROFITABILITY_CONTRACT };
export {};
