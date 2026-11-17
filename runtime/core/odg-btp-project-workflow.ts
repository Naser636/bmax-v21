#!/usr/bin/env node
"use strict";

/*
 * V266 §3-§9 — ODG BTP PROJECT-TO-CHANTIER EXECUTION WORKFLOW (deterministic).
 * The executable lifecycle that CONNECTS the existing engines — it adds the state-machine, work-package, planning,
 * materials-reconciliation, site-report, change-order, actual-cost and closure logic that no single module covers.
 *
 * Lifecycle: PROJECT → CUSTOMER CONTEXT → VALIDATED QUOTATION → APPROVED WORK PACKAGE → PLANNING → MATERIALS/LABOR
 *            → SITE PROGRESS → CHANGE ORDERS → ACTUAL COSTS → REALIZED MARGIN → PROJECT CLOSURE.
 *
 * REUSE (no duplicate engines, no 2nd money formula):
 *   - odg-btp-devis-engine (V260): computeDevis / compareToActual — ALL quotation + forecast-vs-actual arithmetic.
 *   - odg-btp-metre-engine  (V262): metreToDevisLines — validated quantities → devis lines.
 *   - odg-btp-normative-registry (V264): resolveApplicability — normative references (match ≠ compliance).
 *   - chantier-profitability (computeChantier): chantier P&L when a full chantier object is supplied.
 *
 * HONESTY (directive §3/§4/§7/§8/§9/§14): a generated quotation is NOT approved; an ESTIMATED quantity stays ESTIMATED;
 * a normative match NEVER certifies compliance; prices/rates/stock/orders/supplier availability are NEVER invented;
 * integer-cents money only (MARGIN≠MARKUP, VAT supplied never invented, delegated to V260); estimated/committed/invoiced
 * amounts are NEVER labelled paid/realized without evidence; a project is NOT CLOSED merely because all tasks are complete.
 * Deterministic + read-only (asOf injected; no Date.now/Math.random/I/O). Nothing OPERATIONAL / world-class claimed.
 */

const DEVIS = require("./odg-btp-devis-engine.js");         // V260 — computeDevis / compareToActual (money SSOT)
const METRE = require("./odg-btp-metre-engine.js");         // V262 — metreToDevisLines (quantities)
const NORM = require("./odg-btp-normative-registry.js");    // V264 — resolveApplicability (match ≠ compliance)

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function intMinor(v: any): number | null { return typeof v === "number" && isFinite(v) && Math.floor(v) === v ? v : null; }
function nonNegInt(v: any): number | null { const n = intMinor(v); return n !== null && n >= 0 ? n : null; }
function num(v: any): number | null { return typeof v === "number" && isFinite(v) ? v : null; }

// ===================== §3 project dossier + state machine =====================
const PROJECT_STATES = Object.freeze(["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "SUSPENDED", "CLOSED"]);
// deny-by-default transition graph (a generated quotation does NOT self-approve; closure is gated separately).
const TRANSITIONS: Record<string, string[]> = Object.freeze({
  DRAFT: ["SUBMITTED", "REJECTED"],
  SUBMITTED: ["APPROVED", "REJECTED", "DRAFT"],
  APPROVED: ["SUSPENDED", "CLOSED"],
  SUSPENDED: ["APPROVED", "REJECTED"],
  REJECTED: [],
  CLOSED: [],
});

/** openDossier(input) -> a typed project dossier in DRAFT (never auto-approved). */
function openDossier(input: any): any {
  const i = isObj(input) ? input : {};
  if (!isStr(i.projectId)) return Object.freeze({ ok: false, code: "NO_PROJECT_ID", detail: "a project id is required (fail-closed)" });
  const dossier = {
    ok: true, projectId: i.projectId, version: nonNegInt(i.version) !== null ? i.version : 1,
    customer: isObj(i.customer) ? Object.freeze({ id: i.customer.id || null, name: i.customer.name || null, context: i.customer.context || null }) : null,
    site: isObj(i.site) ? Object.freeze({ address: i.site.address || null, references: Object.freeze(arr(i.site.references)) }) : null,  // only when explicitly supplied
    scope: Object.freeze(arr(i.scope).filter(isStr)), exclusions: Object.freeze(arr(i.exclusions).filter(isStr)),
    quotationRefs: Object.freeze(arr(i.quotationRefs).filter(isStr)),
    quantities: Object.freeze(arr(i.quantities).filter(isObj)),                 // validated quantities + measurement provenance (from métré)
    normativeRefs: Object.freeze(arr(i.normativeRefs).filter(isObj)), unresolvedApplicability: Object.freeze(arr(i.unresolvedApplicability).filter(isStr)),
    assumptions: Object.freeze(arr(i.assumptions).filter(isStr)), reservations: Object.freeze(arr(i.reservations).filter(isStr)),
    approvalStatus: "DRAFT",
    evidence: Object.freeze(arr(i.evidence).filter(isObj)),
    changeHistory: Object.freeze([Object.freeze({ seq: 0, from: null, to: "DRAFT", asOf: isStr(i.asOf) ? i.asOf : null, reason: "dossier opened" })]),
  };
  return Object.freeze(dossier);
}

/** transition(dossier, to, opts) -> new dossier in `to`, fail-closed on illegal moves / missing evidence. */
function transition(dossier: any, to: string, opts?: any): any {
  const d = isObj(dossier) ? dossier : {}; const o = isObj(opts) ? opts : {};
  if (d.ok !== true || PROJECT_STATES.indexOf(d.approvalStatus) < 0) return Object.freeze({ ok: false, code: "INVALID_DOSSIER" });
  const from = d.approvalStatus;
  if (PROJECT_STATES.indexOf(to) < 0) return Object.freeze({ ok: false, code: "UNKNOWN_STATE", detail: to });
  if ((TRANSITIONS[from] || []).indexOf(to) < 0) return Object.freeze({ ok: false, code: "ILLEGAL_TRANSITION", detail: from + "→" + to + " not allowed" });
  // APPROVED requires an explicit human approval token + at least one quotation ref (a generated devis never self-approves).
  if (to === "APPROVED" && !isStr(o.approvedBy)) return Object.freeze({ ok: false, code: "APPROVAL_EVIDENCE_REQUIRED", detail: "APPROVED requires an explicit approvedBy (human); generation ≠ approval" });
  if (to === "APPROVED" && d.quotationRefs.length === 0) return Object.freeze({ ok: false, code: "NO_QUOTATION", detail: "cannot approve a project with no quotation reference" });
  const seq = d.changeHistory.length;
  const hist = d.changeHistory.concat([Object.freeze({ seq, from, to, asOf: isStr(o.asOf) ? o.asOf : null, reason: isStr(o.reason) ? o.reason : (to + " transition"), by: o.approvedBy || o.by || null })]);
  return Object.freeze({ ...d, approvalStatus: to, changeHistory: Object.freeze(hist) });
}

// ===================== §4 approved work package =====================
/** buildWorkPackage(dossier, quotation) -> executable work items. REFUSED unless the dossier is APPROVED. */
function buildWorkPackage(dossier: any, quotation: any): any {
  const d = isObj(dossier) ? dossier : {};
  if (d.approvalStatus !== "APPROVED") return Object.freeze({ ok: false, code: "NOT_APPROVED", detail: "a work package requires an APPROVED dossier (a generated/submitted quotation is not executable)" });
  const q = isObj(quotation) ? quotation : {};
  if (q.ok !== true || !Array.isArray(q.lines)) return Object.freeze({ ok: false, code: "NO_QUOTATION", detail: "an OK computeDevis result (V260) is required" });
  const items: any[] = [];
  for (let idx = 0; idx < q.lines.length; idx++) {
    const l = q.lines[idx];
    // an ESTIMATED/ASSUMED line stays estimated — the work item inherits the measurement state verbatim (never upgraded).
    items.push(Object.freeze({
      itemId: l.id, description: l.label || null, scope: l.metier || null,
      quantity: num(l.quantity), unit: l.unit || null,
      measurementState: l.measurementState,                                    // from V260 — never promoted
      materialRequirements: null, materialCoefficient: null,                   // explicit only; never invented here
      labourEstimate: num(l.labourCost) !== null ? Object.freeze({ costMinor: l.labourCost, source: "quotation-line (estimate)" }) : null,
      equipment: num(l.equipment) !== null && l.equipment > 0 ? Object.freeze({ costMinor: l.equipment }) : null,
      dependencies: Object.freeze([]), responsibleParty: null,                 // assigned only when explicitly supplied by planning
      directCostMinor: num(l.directCost), validationStatus: l.measurementState === "MEASURED" || l.measurementState === "HUMAN_VALIDATED" ? "VALIDATED" : "REQUIRES_VALIDATION",
    }));
  }
  const requiresValidation = items.some((it: any) => it.validationStatus === "REQUIRES_VALIDATION");
  return Object.freeze({
    ok: true, projectId: d.projectId, itemCount: items.length, items: Object.freeze(items),
    totalDirectCostMinor: q.subtotalDirectHT, sellingHT: q.sellingHT, totalTTC: q.totalTTC,
    requiresValidation,
    note: "work package built from the APPROVED quotation (V260 lines). Measurement states inherited verbatim (ESTIMATED stays ESTIMATED). Material prices/coefficients/labor rates/supplier availability are NEVER invented — only carried when explicitly supplied.",
  });
}

// ===================== §5 planning + progress (deterministic DAG) =====================
/** planSchedule(tasks) -> schedule with cycle detection + date-consistency + blocked/delayed flags. Fail-closed on cycles. */
function planSchedule(tasks: any): any {
  const list = arr(tasks).filter(isObj);
  if (list.length === 0) return Object.freeze({ ok: false, code: "NO_TASKS" });
  const ids = new Set<string>(); for (const t of list) { if (!isStr(t.id)) return Object.freeze({ ok: false, code: "NO_TASK_ID" }); if (ids.has(t.id)) return Object.freeze({ ok: false, code: "DUPLICATE_TASK_ID", detail: t.id }); ids.add(t.id); }
  // edges + missing-dependency detection.
  const dangling: string[] = [];
  const dep: Record<string, string[]> = {};
  for (const t of list) { dep[t.id] = arr(t.dependencies).filter(isStr); for (const dcy of dep[t.id]) if (!ids.has(dcy)) dangling.push(t.id + "→" + dcy); }
  if (dangling.length) return Object.freeze({ ok: false, code: "DANGLING_DEPENDENCY", detail: dangling.slice(0, 10).join(", ") });
  // Kahn topological sort — a leftover means a cycle (rejected).
  const indeg: Record<string, number> = {}; for (const t of list) indeg[t.id] = 0;
  for (const t of list) for (const dcy of dep[t.id]) indeg[t.id]++;             // edge dep→t ; t waits on its deps
  const queue = list.filter((t: any) => indeg[t.id] === 0).map((t: any) => t.id).sort();
  const order: string[] = []; const q2 = queue.slice();
  while (q2.length) { const n = q2.shift() as string; order.push(n); for (const t of list) if (dep[t.id].indexOf(n) >= 0) { indeg[t.id]--; if (indeg[t.id] === 0) q2.push(t.id); } q2.sort(); }
  if (order.length !== list.length) { const cyc = list.filter((t: any) => order.indexOf(t.id) < 0).map((t: any) => t.id); return Object.freeze({ ok: false, code: "DEPENDENCY_CYCLE", detail: "impossible cycle among: " + cyc.sort().join(", ") }); }
  // date consistency + blocked/delayed. dates are integer day-stamps (caller-supplied; no clock).
  const inconsistencies: string[] = []; const blocked: string[] = []; const delayed: string[] = []; const milestones: string[] = [];
  const rows = list.map((t: any) => {
    const ps = num(t.plannedStart), pf = num(t.plannedFinish), as = num(t.actualStart), af = num(t.actualFinish);
    if (ps !== null && pf !== null && pf < ps) inconsistencies.push(t.id + ": plannedFinish<plannedStart");
    if (as !== null && af !== null && af < as) inconsistencies.push(t.id + ": actualFinish<actualStart");
    const pct = num(t.percentComplete); const pctN = pct !== null ? Math.max(0, Math.min(100, pct)) : null;
    const unmetDeps = dep[t.id].filter((dcy: string) => { const dd = list.find((x: any) => x.id === dcy); return !dd || num(dd.percentComplete) === null || (num(dd.percentComplete) as number) < 100; });
    if ((pctN === null || pctN < 100) && unmetDeps.length) blocked.push(t.id);
    if (pf !== null && af === null && num(t.asOfDay) !== null && (num(t.asOfDay) as number) > pf && (pctN === null || pctN < 100)) delayed.push(t.id);
    if (t.milestone === true) milestones.push(t.id);
    return Object.freeze({ id: t.id, plannedStart: ps, plannedFinish: pf, actualStart: as, actualFinish: af, percentComplete: pctN, milestone: t.milestone === true, blockedBy: Object.freeze(unmetDeps) });
  });
  if (inconsistencies.length) return Object.freeze({ ok: false, code: "INCONSISTENT_DATES", detail: inconsistencies.slice(0, 10).join("; ") });
  const planned = rows.reduce((a: number, r: any) => a + (r.percentComplete === 100 ? 1 : 0), 0);
  return Object.freeze({
    ok: true, order: Object.freeze(order), tasks: Object.freeze(rows), taskCount: rows.length,
    completedCount: planned, blocked: Object.freeze(blocked.sort()), delayed: Object.freeze(delayed.sort()), milestones: Object.freeze(milestones.sort()),
    allComplete: planned === rows.length,
    note: "deterministic topological schedule; cycles and inconsistent dates are REJECTED fail-closed. 'blocked' = has an incomplete prerequisite; 'delayed' = past plannedFinish and not complete (relative to supplied asOfDay). No optimized-scheduling claim (no optimization method/benchmark).",
  });
}

// ===================== §6 materials / procurement reconciliation =====================
/** reconcileMaterials(materials) -> required/planned/ordered/delivered/consumed/returned/remaining + shortage/discrepancy. No fabricated stock/prices. */
function reconcileMaterials(materials: any): any {
  const list = arr(materials).filter(isObj);
  const rows: any[] = []; const shortages: any[] = []; const discrepancies: any[] = [];
  for (let i = 0; i < list.length; i++) {
    const m = list[i]; const id = isStr(m.id) ? m.id : "M" + (i + 1);
    const required = num(m.requiredQty), planned = num(m.plannedQty), ordered = num(m.orderedQty), delivered = num(m.deliveredQty), consumed = num(m.consumedQty), returned = num(m.returnedQty);
    const coeff = num(m.coefficient), waste = num(m.wasteRate);                 // explicit only — never invented
    // required may be derived from a base qty via EXPLICIT coefficient+waste (reuses the métré discipline); never fabricated.
    let requiredCalc = required;
    if (required === null && num(m.baseQty) !== null && coeff !== null) requiredCalc = (num(m.baseQty) as number) * coeff * (1 + (waste !== null ? waste : 0));
    const avail = (delivered !== null ? delivered : 0);
    const net = avail - (consumed !== null ? consumed : 0) + (returned !== null ? returned : 0);   // remaining on site
    const remaining = (delivered !== null || consumed !== null || returned !== null) ? net : null;
    if (requiredCalc !== null && ordered !== null && ordered < requiredCalc) shortages.push(Object.freeze({ id, code: "UNDER_ORDERED", requiredQty: requiredCalc, orderedQty: ordered }));
    if (ordered !== null && delivered !== null && delivered < ordered) discrepancies.push(Object.freeze({ id, code: "SHORT_DELIVERY", orderedQty: ordered, deliveredQty: delivered }));
    if (consumed !== null && delivered !== null && consumed > delivered + (returned !== null ? 0 : 0)) discrepancies.push(Object.freeze({ id, code: "OVER_CONSUMED", consumedQty: consumed, deliveredQty: delivered }));
    const purchaseCostMinor = nonNegInt(m.purchaseCostMinor);                   // supplied evidence only (integer cents)
    rows.push(Object.freeze({
      id, unit: m.unit || null, supplier: m.supplier || null,
      requiredQty: requiredCalc, plannedQty: planned, orderedQty: ordered, deliveredQty: delivered, consumedQty: consumed, returnedQty: returned, remainingQty: remaining,
      coefficient: coeff, wasteRate: waste, purchaseCostMinor: purchaseCostMinor,
      costEvidence: isStr(m.purchaseEvidence) ? m.purchaseEvidence : null,
    }));
  }
  return Object.freeze({
    ok: true, rows: Object.freeze(rows), materialCount: rows.length, shortages: Object.freeze(shortages), discrepancies: Object.freeze(discrepancies), clean: shortages.length === 0 && discrepancies.length === 0,
    note: "material reconciliation from SUPPLIED quantities and EXPLICIT coefficients/waste. Stock, orders, deliveries and supplier prices are NEVER fabricated — absent fields stay null; a clean result is not proof of completeness.",
  });
}

// ===================== §7 site reports + change orders =====================
const REPORT_STATES = Object.freeze(["DRAFT", "VALIDATED", "REJECTED"]);
/** siteReport(input) -> structured report from human-provided info (never fabricated). */
function siteReport(input: any): any {
  const i = isObj(input) ? input : {};
  if (!isStr(i.projectId) || !isStr(i.date)) return Object.freeze({ ok: false, code: "MISSING_HEADER", detail: "projectId + date required" });
  const status = REPORT_STATES.indexOf(i.validationStatus) >= 0 ? i.validationStatus : "DRAFT";
  return Object.freeze({
    ok: true, projectId: i.projectId, date: i.date, author: isStr(i.author) ? i.author : null,
    workPerformed: Object.freeze(arr(i.workPerformed).filter(isStr)),
    completedQuantities: Object.freeze(arr(i.completedQuantities).filter(isObj)),
    workforce: Object.freeze(arr(i.workforce).filter(isObj)), equipment: Object.freeze(arr(i.equipment).filter(isObj)),
    materialsConsumed: Object.freeze(arr(i.materialsConsumed).filter(isObj)),
    incidents: Object.freeze(arr(i.incidents).filter(isStr)), blockers: Object.freeze(arr(i.blockers).filter(isStr)),
    documentRefs: Object.freeze(arr(i.documentRefs).filter(isStr)),            // photos/docs only when available (refs, not recognized content)
    observations: Object.freeze(arr(i.observations).filter(isStr)), unresolved: Object.freeze(arr(i.unresolved).filter(isStr)),
    validationStatus: status,
    note: "site report captures ONLY human-provided information; no photo/OCR content is recognized here. A DRAFT report is not validated evidence.",
  });
}

/** requestChange(dossier, change, baseQuotationRequest) -> a change order with a re-priced quotation version (NOT applied). */
function requestChange(dossier: any, change: any, baseQuotationRequest: any): any {
  const d = isObj(dossier) ? dossier : {}; const c = isObj(change) ? change : {};
  if (d.ok !== true) return Object.freeze({ ok: false, code: "INVALID_DOSSIER" });
  if (!isStr(c.id) || !isStr(c.requestedChange)) return Object.freeze({ ok: false, code: "INVALID_CHANGE", detail: "change id + requestedChange required" });
  // re-price via V260 if the caller supplies the revised line set — no money math here.
  let revised = null;
  if (isObj(baseQuotationRequest) && Array.isArray((baseQuotationRequest as any).lines)) revised = DEVIS.computeDevis(baseQuotationRequest);
  // normative implications via V264 (match ≠ compliance).
  const norm = isObj(c.normativeContext) ? NORM.resolveApplicability(c.normativeContext) : null;
  return Object.freeze({
    ok: true, changeId: c.id, projectId: d.projectId,
    originalScope: Object.freeze(arr(c.originalScope).filter(isStr)), requestedChange: c.requestedChange,
    reason: isStr(c.reason) ? c.reason : null, source: isStr(c.source) ? c.source : null,
    costImpactMinor: intMinor(c.costImpactMinor),                              // supplied; or derive from `revised` − accepted at apply-time
    scheduleImpactDays: num(c.scheduleImpactDays),
    normativeImplications: norm ? Object.freeze({ matched: norm.matched.map((m: any) => m.id), note: "a matched normative reference does NOT certify compliance (V264)" }) : null,
    revisedQuotation: revised && revised.ok ? Object.freeze({ sellingHT: revised.sellingHT, totalTTC: revised.totalTTC, worstMeasurementState: revised.worstMeasurementState }) : null,
    approvalStatus: "PENDING", resultingQuotationVersion: null,
    note: "change order is PENDING — no financial or scope change is applied until explicitly approved (see applyChange).",
  });
}

/** applyChange(dossier, changeOrder, approval) -> dossier with a new version, ONLY when approved. Fail-closed otherwise. */
function applyChange(dossier: any, changeOrder: any, approval: any): any {
  const d = isObj(dossier) ? dossier : {}; const co = isObj(changeOrder) ? changeOrder : {}; const ap = isObj(approval) ? approval : {};
  if (d.ok !== true) return Object.freeze({ ok: false, code: "INVALID_DOSSIER" });
  if (co.ok !== true || !isStr(co.changeId)) return Object.freeze({ ok: false, code: "INVALID_CHANGE_ORDER" });
  if (ap.approved !== true || !isStr(ap.approvedBy)) return Object.freeze({ ok: false, code: "CHANGE_NOT_APPROVED", detail: "a change requires explicit approval (approved:true + approvedBy) before it affects scope/cost" });
  const newVersion = (num(d.version) !== null ? (d.version as number) : 1) + 1;
  const seq = d.changeHistory.length;
  const hist = d.changeHistory.concat([Object.freeze({ seq, from: "v" + d.version, to: "v" + newVersion, asOf: isStr(ap.asOf) ? ap.asOf : null, reason: "change " + co.changeId + " approved", by: ap.approvedBy })]);
  const newQuotRefs = co.revisedQuotation ? d.quotationRefs.concat(["change:" + co.changeId]) : d.quotationRefs.slice();
  return Object.freeze({ ...d, version: newVersion, quotationRefs: Object.freeze(newQuotRefs), changeHistory: Object.freeze(hist), appliedChange: Object.freeze({ changeId: co.changeId, version: newVersion, approvedBy: ap.approvedBy }) });
}

// ===================== §8 actual cost + realized margin =====================
const COST_PHASE = Object.freeze(["ESTIMATED", "COMMITTED", "INVOICED", "PAID"]);   // never conflated; only PAID with evidence is realized
/** actualCostLedger(entries) -> phase-classified ledger (integer cents). An amount is never promoted to PAID without evidence. */
function actualCostLedger(entries: any): any {
  const list = arr(entries).filter(isObj);
  const byPhase: Record<string, number> = { ESTIMATED: 0, COMMITTED: 0, INVOICED: 0, PAID: 0 };
  const byCategory: Record<string, number> = {};             // ALL phases (reporting only)
  const incurredByCategory: Record<string, number> = {};     // INVOICED+PAID only (evidence-backed incurred — feeds realized margin)
  const rows: any[] = []; const rejected: any[] = [];
  for (let i = 0; i < list.length; i++) {
    const e = list[i]; const amt = intMinor(e.amountMinor);
    const phase = COST_PHASE.indexOf(e.phase) >= 0 ? e.phase : null;
    if (amt === null || amt < 0 || phase === null) { rejected.push(Object.freeze({ idx: i, code: "INVALID_ENTRY", detail: "needs non-negative integer amountMinor + phase∈" + COST_PHASE.join("/") })); continue; }
    // PAID/INVOICED REQUIRE an evidence ref — an estimate/commitment can NEVER be reported as paid/invoiced without it.
    if ((phase === "PAID" || phase === "INVOICED") && !isStr(e.evidenceRef)) { rejected.push(Object.freeze({ idx: i, code: "EVIDENCE_REQUIRED", detail: phase + " requires an evidenceRef (no estimate silently counted as paid/invoiced)" })); continue; }
    byPhase[phase] += amt;
    const cat = isStr(e.category) ? e.category : "MISC"; byCategory[cat] = (byCategory[cat] || 0) + amt;
    if (phase === "INVOICED" || phase === "PAID") incurredByCategory[cat] = (incurredByCategory[cat] || 0) + amt;
    rows.push(Object.freeze({ id: e.id || "E" + (i + 1), phase, category: cat, amountMinor: amt, evidenceRef: isStr(e.evidenceRef) ? e.evidenceRef : null }));
  }
  return Object.freeze({
    ok: true, rows: Object.freeze(rows), byPhase: Object.freeze(byPhase), byCategory: Object.freeze(byCategory), incurredByCategory: Object.freeze(incurredByCategory), rejected: Object.freeze(rejected),
    estimatedMinor: byPhase.ESTIMATED, committedMinor: byPhase.COMMITTED, invoicedMinor: byPhase.INVOICED, paidMinor: byPhase.PAID,
    actualIncurredMinor: byPhase.INVOICED + byPhase.PAID,                       // evidence-backed incurred (committed is not yet incurred)
    note: "integer-cents ledger; ESTIMATED/COMMITTED/INVOICED/PAID kept distinct and never conflated. INVOICED/PAID require an evidenceRef. 'actualIncurred' = invoiced + paid (committed is a forecast obligation, not incurred). byCategory = all phases (reporting); incurredByCategory = invoiced+paid only (feeds realized margin).",
  });
}

/** realizedProfitability(quotation, ledger) -> realized margin via V260 compareToActual (NO new money formula). */
function realizedProfitability(quotation: any, ledger: any): any {
  const q = isObj(quotation) ? quotation : {}; const l = isObj(ledger) ? ledger : {};
  if (q.ok !== true) return Object.freeze({ ok: false, code: "INVALID_QUOTATION" });
  if (l.ok !== true) return Object.freeze({ ok: false, code: "INVALID_LEDGER" });
  // realized margin uses ONLY evidence-backed incurred cost (invoiced+paid); committed is excluded (forecast, not realized).
  const inc = isObj(l.incurredByCategory) ? l.incurredByCategory : {};
  const cmp = DEVIS.compareToActual(q, { materialMinor: inc.MATERIAL || 0, labourMinor: inc.LABOUR || 0, equipmentMinor: inc.EQUIPMENT || 0, transportMinor: inc.TRANSPORT || 0, overheadMinor: inc.OVERHEAD || 0 });
  return Object.freeze({
    ok: true, forecastCostHT: cmp.forecastCostHT, actualCostHT: cmp.actualCostHT, costVariance: cmp.costVariance, overrun: cmp.overrun,
    forecastMargin: cmp.forecastMargin, realizedMargin: cmp.realizedMargin, marginErosion: cmp.marginErosion,
    committedNotYetIncurredMinor: l.committedMinor,
    note: "realized margin delegated to V260 compareToActual (selling fixed by the accepted devis; realized uses evidence-backed incurred cost only). forecastMargin is NEVER reported as realized profit. Committed-but-not-incurred is shown separately as a forecast obligation.",
  });
}

// ===================== §9 closure (evidence-gated) =====================
/** attemptClosure(dossier, workPackage, schedule, ledger, evidence) -> CLOSED only with all mandatory evidence; else refused. */
function attemptClosure(dossier: any, workPackage: any, schedule: any, ledger: any, evidence: any): any {
  const d = isObj(dossier) ? dossier : {}; const ev = isObj(evidence) ? evidence : {};
  const missing: string[] = [];
  if (d.approvalStatus !== "APPROVED") missing.push("dossier not APPROVED (cannot close a non-approved project)");
  if (!(isObj(schedule) && schedule.ok === true && schedule.allComplete === true)) missing.push("not all tasks complete");
  if (!(isObj(workPackage) && workPackage.ok === true)) missing.push("no approved work package");
  if (!(isObj(ledger) && ledger.ok === true)) missing.push("no actual-cost ledger");
  // explicit mandatory evidence — task-completion alone is NOT sufficient (§9).
  if (!isStr(ev.finalScopeApprovedBy)) missing.push("final approved scope evidence (finalScopeApprovedBy)");
  if (ev.changeOrdersReconciled !== true) missing.push("change-order reconciliation");
  if (ev.actualCostReconciled !== true) missing.push("actual-cost reconciliation");
  if (!isStr(ev.customerAcceptance)) missing.push("customer acceptance");
  const unresolved = arr(d.reservations).filter(isStr).filter((r: string) => arr(ev.resolvedReservations).indexOf(r) < 0);
  if (unresolved.length) missing.push("unresolved reservations: " + unresolved.slice(0, 5).join(", "));
  const outstandingFinancials = isObj(ledger) && ledger.ok === true ? (ledger.committedMinor + (ledger.invoicedMinor - ledger.paidMinor)) : null;  // engagements + invoiced-unpaid
  if (missing.length) return Object.freeze({ ok: false, closed: false, code: "CLOSURE_REFUSED", missing: Object.freeze(missing), outstandingFinancialsMinor: outstandingFinancials, note: "a project is NOT CLOSED merely because tasks are complete; mandatory evidence is required (§9)." });
  const closedDossier = transition(d, "CLOSED", { approvedBy: ev.finalScopeApprovedBy, asOf: ev.asOf, reason: "closure: all evidence present" });
  return Object.freeze({ ok: true, closed: closedDossier.ok === true, dossier: closedDossier, outstandingFinancialsMinor: outstandingFinancials, note: "CLOSED with full evidence: approved scope, completed work, reconciled change-orders + actual-cost, customer acceptance, reservations resolved." });
}

// ===================== §10 synthetic end-to-end (labelled SYNTHETIC) =====================
/** runSyntheticProject(scenario) -> drive the whole lifecycle for a labelled synthetic fixture (for tests / demonstrate). */
function runSyntheticProject(scenario: any): any {
  const s = isObj(scenario) ? scenario : {};
  const label = isStr(s.label) ? s.label : "UNLABELLED";
  const quotation = DEVIS.computeDevis(s.quotationRequest);                     // V260
  let dossier = openDossier(s.dossier);
  if (dossier.ok) dossier = transition(dossier, "SUBMITTED", { asOf: s.asOf, reason: "submitted for approval" });
  if (dossier.ok && s.approve) dossier = transition(dossier, "APPROVED", { approvedBy: s.approve.by, asOf: s.asOf });
  const workPackage = dossier.ok ? buildWorkPackage(dossier, quotation) : Object.freeze({ ok: false, code: "DOSSIER_FAILED" });
  const schedule = planSchedule(s.tasks);
  const materials = reconcileMaterials(s.materials);
  const ledger = actualCostLedger(s.costEntries);
  const profitability = (quotation.ok && ledger.ok) ? realizedProfitability(quotation, ledger) : null;
  const closure = attemptClosure(dossier, workPackage, schedule, ledger, s.closureEvidence);
  return Object.freeze({ SYNTHETIC: true, label, quotation, dossier, workPackage, schedule, materials, ledger, profitability, closure });
}

const BTP_PROJECT_WORKFLOW_CONTRACT = Object.freeze({
  id: "V266-ODG-BTP-PROJECT-WORKFLOW",
  source: "V266 §3-§10 — deterministic BTP project-to-chantier execution workflow",
  states: PROJECT_STATES, costPhases: COST_PHASE,
  reuses: Object.freeze(["odg-btp-devis-engine (V260: computeDevis/compareToActual)", "odg-btp-metre-engine (V262: metreToDevisLines)", "odg-btp-normative-registry (V264: resolveApplicability)", "chantier-profitability (computeChantier)"]),
  invariants: Object.freeze([
    "a generated/submitted quotation is NEVER approved: APPROVED requires an explicit human approvedBy + a quotation ref; deny-by-default transition graph",
    "a work package is REFUSED unless the dossier is APPROVED; measurement states are inherited verbatim (ESTIMATED stays ESTIMATED, never promoted)",
    "planning rejects dependency cycles and inconsistent dates fail-closed; NO optimized-scheduling claim without a method+benchmark",
    "materials/prices/stock/orders/supplier availability are NEVER invented (absent ⇒ null); explicit coefficients/waste only",
    "no financial or scope change is applied without explicit approval; integer-cents money delegated to V260 (MARGIN≠MARKUP, VAT supplied); a normative match NEVER certifies compliance (V264)",
    "actual-cost phases ESTIMATED/COMMITTED/INVOICED/PAID never conflated; INVOICED/PAID require evidence; realized margin uses evidence-backed incurred cost only (V260 compareToActual) — forecast margin is never realized profit",
    "a project is NOT CLOSED merely because all tasks are complete: mandatory evidence (approved scope, reconciliations, customer acceptance, resolved reservations) is required",
    "deterministic/read-only (asOf injected; no Date.now/Math.random/I/O); REUSES existing engines — no 2nd money/metré/normative/chantier engine, no new primitive; nothing OPERATIONAL/world-class claimed",
  ]),
});

module.exports = {
  PROJECT_STATES, TRANSITIONS, REPORT_STATES, COST_PHASE,
  openDossier, transition, buildWorkPackage, planSchedule, reconcileMaterials, siteReport, requestChange, applyChange,
  actualCostLedger, realizedProfitability, attemptClosure, runSyntheticProject, BTP_PROJECT_WORKFLOW_CONTRACT,
};

export {};
