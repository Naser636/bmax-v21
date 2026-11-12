#!/usr/bin/env node
"use strict";
/*
 * V150 MÉTIER 2 (BTP/TP) — WORKFORCE / LABOUR HOURS / CHANTIER LABOUR COST engine. PURE, deterministic, fail-closed,
 * integer-MINOR, single-currency guard. READ+CALCULATE only: it runs NO payroll, writes no real hours/planning, pays nothing.
 * It FEEDS the existing chantier-profitability.computeChantier via its `expenses` shape (no parallel finance system).
 *
 * LABOUR COST MODEL (radar V150_RADAR_LABOUR): DS(MO) = heures × TAUX HORAIRE CHARGÉ. The loaded rate is a SUPPLIED,
 * VERSIONED PARAMETER — it is NEVER derived from a brut/net salary, no cotisation/convention is invented. If no loaded rate
 * is available ⇒ COST_NOT_MEASURED (never a fabricated cost). Rates/majorations come from explicit `rateParams`.
 *
 * ANTI-DOUBLE-COUNT (directive §5): ONLY APPROVED hours of OWN/INTERIM staff whose cost source is HOURS become LABOR cost.
 * Subcontractor (and invoice-billed interim) work arrives via its INVOICE (SUBCONTRACT) — never re-counted as hourly cost.
 *
 * buildWorkforce · processTimesheets · computeLabourCost · imputeLabourToChantier · labourAnalytics
 */
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isInt(v: any): boolean { return typeof v === "number" && Number.isSafeInteger(v); }
function isNum(v: any): boolean { return typeof v === "number" && Number.isFinite(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function arr(v: any): any[] { return Array.isArray(v) ? v.filter(isObj) : []; }

const ROLES = Object.freeze(["SALARIE", "CHEF_EQUIPE", "CHEF_CHANTIER", "INTERIMAIRE", "SOUS_TRAITANT", "EQUIPE"]);
const TS_STATES = Object.freeze(["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "CORRECTED"]);
// cost source: HOURS = imputed as hours×rate (own/interim staff); INVOICE = cost arrives via a subcontract/agency invoice.
const COST_SOURCES = Object.freeze(["HOURS", "INVOICE"]);

// ---------- §2 registre RH / équipes ----------
function buildWorkforce(resources: any): any {
  const list = arr(resources); const items: any[] = []; const rejected: any[] = []; const seen = new Set<string>();
  for (const r of list) {
    if (!isStr(r.id)) { rejected.push({ reason: "NO_ID" }); continue; }
    if (seen.has(r.id)) { rejected.push({ id: r.id, reason: "DUPLICATE_ID" }); continue; }
    seen.add(r.id);
    const role = isStr(r.role) && ROLES.indexOf(r.role) >= 0 ? r.role : "SALARIE";
    const costSource = isStr(r.costSource) && COST_SOURCES.indexOf(r.costSource) >= 0 ? r.costSource : (role === "SOUS_TRAITANT" ? "INVOICE" : "HOURS");
    // qualifications: documented WITH provenance + validity + verification status; NEVER "qualified" without proof.
    const quals = (Array.isArray(r.qualifications) ? r.qualifications.filter(isObj) : []).map((q: any) => Object.freeze({
      label: isStr(q.label) ? q.label : null,
      provenance: isStr(q.provenance) ? q.provenance : null,
      validUntilMs: isInt(q.validUntilMs) ? q.validUntilMs : null,
      verified: q.verified === true && isStr(q.provenance),          // verified only with a provenance proof
      status: q.verified === true && isStr(q.provenance) ? "VERIFIED" : (isStr(q.provenance) ? "DOCUMENTED_UNVERIFIED" : "DECLARED_NO_PROOF"),
    }));
    items.push(Object.freeze({
      id: r.id, role, costSource,
      specialty: isStr(r.specialty) ? r.specialty : null,
      org: isStr(r.org) ? r.org : null,
      loadedRateMinorPerHour: isInt(r.loadedRateMinorPerHour) ? r.loadedRateMinorPerHour : null,   // taux horaire chargé FOURNI (never derived)
      currency: isStr(r.currency) ? r.currency : null,
      qualifications: Object.freeze(quals),
      note: "technical id only (no PII); qualifications carry provenance+validity+verification — never 'qualified' without proof.",
    }));
  }
  return Object.freeze({ ok: true, items: Object.freeze(items), count: items.length, rejected: Object.freeze(rejected), note: "extensible workforce registry; unknown role ⇒ SALARIE; costSource HOURS (own/interim) vs INVOICE (subcontract/billed) drives anti-double-count." });
}

// ---------- §3 saisie / suivi des heures ----------
function minutesOf(e: any): number | null {
  if (isInt(e.durationMin)) return e.durationMin;
  if (isInt(e.startMin) && isInt(e.endMin)) return e.endMin - e.startMin - (isInt(e.breakMin) ? e.breakMin : 0);
  return null;
}
function processTimesheets(entries: any, opts?: any): any {
  const list = arr(entries);
  const o = isObj(opts) ? opts : {};
  const anomalies: any[] = []; const add = (code: string, detail: string, evidence: string, confidence: string) => anomalies.push({ code, detail, evidence, confidence });
  const normalized: any[] = []; const seen = new Set<string>();
  for (const e of list) {
    const id = isStr(e.id) ? e.id : null;
    const who = isStr(e.resourceId) ? e.resourceId : (isStr(e.teamId) ? e.teamId : null);
    const state = isStr(e.status) && TS_STATES.indexOf(e.status) >= 0 ? e.status : "DRAFT";
    const mins = minutesOf(e);
    if (!who) add("TEMPS_NON_RATTACHE", `entry '${id}' has no resource/team`, `id=${id}`, "HIGH");
    if (!isStr(e.chantierId)) add("TEMPS_NON_RATTACHE", `entry '${id}' has no chantier`, `id=${id}`, "HIGH");
    if (mins === null) add("POINTAGE_INCOMPLET", `entry '${id}' has no computable duration`, `id=${id}`, "MEDIUM");
    else if (mins <= 0) add("DUREE_IMPOSSIBLE", `entry '${id}' duration ${mins} min ≤ 0`, `id=${id} mins=${mins}`, "HIGH");
    else if (mins > 24 * 60) add("DUREE_IMPOSSIBLE", `entry '${id}' duration ${mins} min exceeds a day`, `id=${id} mins=${mins}`, "HIGH");
    // duplicate: same who+chantier+date+start+end
    const key = `${who}|${e.chantierId}|${isInt(e.dateMs) ? e.dateMs : "?"}|${isInt(e.startMin) ? e.startMin : "?"}|${isInt(e.endMin) ? e.endMin : "?"}`;
    if (seen.has(key)) add("POINTAGE_DUPLIQUE", `entry '${id}' duplicates another (same person/chantier/date/time)`, key, "MEDIUM"); else seen.add(key);
    // modification of an approved entry without correction history
    if (state === "APPROVED" && e.modified === true && !Array.isArray(e.history)) add("MODIFICATION_SANS_HISTORIQUE", `approved entry '${id}' modified without a correction history`, `id=${id}`, "HIGH");
    normalized.push(Object.freeze({ id, who, chantierId: isStr(e.chantierId) ? e.chantierId : null, dateMs: isInt(e.dateMs) ? e.dateMs : null, startMin: isInt(e.startMin) ? e.startMin : null, endMin: isInt(e.endMin) ? e.endMin : null, minutes: mins, activity: isStr(e.activity) ? e.activity : null, category: isStr(e.category) ? e.category : null, status: state, source: isStr(e.source) ? e.source : null, history: Array.isArray(e.history) ? e.history.length : 0 }));
  }
  // overlaps + simultaneous multi-chantier, per person per day
  const byWhoDay = new Map<string, any[]>();
  for (const n of normalized) if (n.who && isInt(n.dateMs) && isInt(n.startMin) && isInt(n.endMin)) { const k = `${n.who}|${n.dateMs}`; if (!byWhoDay.has(k)) byWhoDay.set(k, []); byWhoDay.get(k)!.push(n); }
  for (const [k, ns] of byWhoDay) {
    const sorted = ns.slice().sort((a: any, b: any) => a.startMin - b.startMin);
    for (let i = 1; i < sorted.length; i++) if (sorted[i].startMin < sorted[i - 1].endMin) {
      add("CHEVAUCHEMENT", `overlapping entries for ${sorted[i].who}`, `${sorted[i - 1].id}&${sorted[i].id}`, "HIGH");
      if (sorted[i].chantierId && sorted[i - 1].chantierId && sorted[i].chantierId !== sorted[i - 1].chantierId) add("AFFECTATION_SIMULTANEE", `${sorted[i].who} on two chantiers at once`, `${sorted[i - 1].chantierId}&${sorted[i].chantierId}`, "HIGH");
    }
  }
  // planning vs declared (optional): plannedMinutes per who+chantier+date supplied in opts.planned
  const planned = isObj(o.planned) ? o.planned : null;
  if (planned) for (const n of normalized) { const key = `${n.who}|${n.chantierId}|${n.dateMs}`; if (isInt(planned[key]) && isInt(n.minutes) && planned[key] !== n.minutes) add("ECART_PLANNING_POINTAGE", `declared ${n.minutes} ≠ planned ${planned[key]} min`, key, "LOW"); }
  const byStatus: Record<string, number> = {};
  for (const n of normalized) byStatus[n.status] = (byStatus[n.status] || 0) + 1;
  return Object.freeze({ ok: true, entries: Object.freeze(normalized), byStatus: Object.freeze(byStatus), anomalies: Object.freeze(anomalies), note: "statuses DRAFT/SUBMITTED/APPROVED/REJECTED/CORRECTED; approved hours never silently modified (history required); signals planning/pointage gaps — changes no real planning." });
}

// ---------- §4 modèle de coût de main-d'œuvre ----------
function computeLabourCost(entries: any, workforce: any, rateParams?: any): any {
  const list = arr(entries).filter((e: any) => e.status === "APPROVED");   // only approved hours cost real money
  const wf = new Map<string, any>(); for (const r of (isObj(workforce) && Array.isArray(workforce.items) ? workforce.items : [])) wf.set(r.id, r);
  const rp = isObj(rateParams) ? rateParams : {};
  const currency = isStr(rp.currency) ? rp.currency : "EUR";
  const overtimeBps = isInt(rp.overtimeMajorationBps) ? rp.overtimeMajorationBps : null;   // majoration ONLY if explicitly supplied
  const lines: any[] = []; let totalMinor = 0; let notMeasured = 0; let skippedDup = 0;
  const costed = new Set<string>();   // dedup: an exact-duplicate approved entry must not double-count labour cost
  for (const e of list) {
    const dupKey = `${e.who}|${e.chantierId}|${isInt(e.dateMs) ? e.dateMs : "?"}|${isInt(e.startMin) ? e.startMin : "?"}|${isInt(e.endMin) ? e.endMin : "?"}`;
    if (e.who && isInt(e.dateMs) && isInt(e.startMin) && isInt(e.endMin)) { if (costed.has(dupKey)) { lines.push(Object.freeze({ id: e.id, status: "SKIPPED_DUPLICATE", reason: "exact duplicate of an already-costed approved entry (not double-counted)" })); skippedDup++; continue; } costed.add(dupKey); }
    const r = e.who ? wf.get(e.who) : null;
    // the loaded rate: entry override, else resource param, else rateParams.byResource — NEVER derived from a salary.
    const rate = isInt(e.loadedRateMinorPerHour) ? e.loadedRateMinorPerHour : (r && isInt(r.loadedRateMinorPerHour) ? r.loadedRateMinorPerHour : (isObj(rp.byResource) && isInt(rp.byResource[e.who]) ? rp.byResource[e.who] : null));
    if (rate === null || !isInt(e.minutes) || e.minutes <= 0) { lines.push(Object.freeze({ id: e.id, status: "COST_NOT_MEASURED", reason: rate === null ? "no supplied loaded hourly rate (never derived from salary)" : "no positive duration" })); notMeasured++; continue; }
    const normalMin = isInt(e.overtimeMin) && e.overtimeMin > 0 ? Math.max(0, e.minutes - e.overtimeMin) : e.minutes;
    const otMin = isInt(e.overtimeMin) && e.overtimeMin > 0 ? e.overtimeMin : 0;
    const base = Math.round((normalMin / 60) * rate);
    // overtime majoration applied ONLY when a majoration param is explicitly supplied + the entry flags overtime.
    const otCost = otMin > 0 ? (overtimeBps !== null ? Math.round((otMin / 60) * rate * (10000 + overtimeBps) / 10000) : Math.round((otMin / 60) * rate)) : 0;
    const otApplied = otMin > 0 && overtimeBps !== null;
    const amount = base + otCost;
    totalMinor += amount;
    lines.push(Object.freeze({ id: e.id, who: e.who, chantierId: e.chantierId, minutes: e.minutes, normalMin, overtimeMin: otMin, loadedRateMinorPerHour: rate, overtimeMajorationApplied: otApplied, amountMinor: amount, periodMonth: isStr(e.periodMonth) ? e.periodMonth : null, basis: "APPROVED hours × supplied loaded hourly rate (integer-minor)" }));
  }
  return Object.freeze({ ok: true, currency, lines: Object.freeze(lines), totalMinor, measuredCount: lines.length - notMeasured - skippedDup, notMeasuredCount: notMeasured, skippedDuplicateCount: skippedDup, note: "deterministic: approved hours × SUPPLIED loaded rate; employer cost NEVER derived from a salary; majoration only from an explicit versioned param; no rate ⇒ COST_NOT_MEASURED; exact-duplicate approved entries skipped (no double count)." });
}

// ---------- §5 imputation aux chantiers (anti-double-count) ----------
function imputeLabourToChantier(input: any): any {
  const i = isObj(input) ? input : {};
  const currency = isStr(i.currency) ? i.currency : "EUR";
  const wf = new Map<string, any>(); for (const r of (isObj(i.workforce) && Array.isArray(i.workforce.items) ? i.workforce.items : [])) wf.set(r.id, r);
  const costLines = (isObj(i.labourCost) && Array.isArray(i.labourCost.lines) ? i.labourCost.lines : []).filter((l: any) => isInt(l.amountMinor));
  const expenses: any[] = []; const skipped: any[] = []; let seq = 0; const anomalies: any[] = [];
  // index subcontract invoices by chantier+period to detect double-count with hours
  const subInvoices = arr(i.subcontractInvoices);
  const subKeys = new Set<string>(); for (const s of subInvoices) if (isStr(s.resourceId)) subKeys.add(`${s.resourceId}|${isStr(s.chantierId) ? s.chantierId : "?"}|${isStr(s.periodMonth) ? s.periodMonth : "?"}`);
  for (const l of costLines) {
    const r = l.who ? wf.get(l.who) : null;
    // ONLY HOURS-sourced staff get hour-imputed; INVOICE-sourced (subcontract/billed interim) do NOT (their invoice is the cost).
    if (r && r.costSource === "INVOICE") { skipped.push({ id: l.id, reason: `resource ${l.who} cost source is INVOICE ⇒ hours not imputed (anti-double-count; cost comes from its invoice)` }); continue; }
    // anti-double-count: hours for a resource that ALSO has a subcontract invoice for the same chantier+period
    const key = `${l.who}|${l.chantierId}|${l.periodMonth || "?"}`;
    if (subKeys.has(key)) { anomalies.push({ code: "DOUBLE_IMPUTATION", detail: `resource ${l.who} has BOTH approved hours and a subcontract/agency invoice for ${l.chantierId}/${l.periodMonth} — hours skipped to avoid double counting`, evidence: key, confidence: "HIGH" }); skipped.push({ id: l.id, reason: "double-count with subcontract invoice" }); continue; }
    expenses.push(Object.freeze({ id: `imp-lab-${++seq}`, category: "LABOR", amountMinor: l.amountMinor, chantierId: l.chantierId, justifRef: `timesheet:${l.id}`, periodMonth: l.periodMonth || undefined, supplier: l.who || undefined, currency }));
  }
  // subcontract invoices → SUBCONTRACT expenses (the cost of subcontracted work), from documents not hours
  for (const s of subInvoices) { if (!isStr(s.chantierId) || !isInt(s.amountMinor)) { skipped.push({ kind: "subInvoice", reason: "no chantierId or amount" }); continue; } expenses.push(Object.freeze({ id: `imp-sub-${++seq}`, category: "SUBCONTRACT", amountMinor: s.amountMinor, chantierId: s.chantierId, justifRef: isStr(s.invoiceId) ? s.invoiceId : `sub:${s.resourceId}`, periodMonth: isStr(s.periodMonth) ? s.periodMonth : undefined, currency })); }
  // travel / imputable frais → TRANSPORT / MISC
  for (const t of arr(i.travel)) { if (!isStr(t.chantierId) || !isInt(t.amountMinor)) { skipped.push({ kind: "travel", reason: "no chantierId or amount" }); continue; } expenses.push(Object.freeze({ id: `imp-trv-${++seq}`, category: "TRANSPORT", amountMinor: t.amountMinor, chantierId: t.chantierId, justifRef: isStr(t.justifRef) ? t.justifRef : "travel", periodMonth: isStr(t.periodMonth) ? t.periodMonth : undefined, currency })); }
  const totalImputedMinor = expenses.reduce((n: number, e: any) => n + e.amountMinor, 0);
  const byCategory: Record<string, number> = {}; for (const e of expenses) byCategory[e.category] = (byCategory[e.category] || 0) + e.amountMinor;
  return Object.freeze({ ok: true, expenses: Object.freeze(expenses), skipped: Object.freeze(skipped), anomalies: Object.freeze(anomalies), totalImputedMinor, byCategory: Object.freeze(byCategory), note: "imputes ONLY approved own/interim hours (LABOR) + subcontract invoices (SUBCONTRACT, from documents) + travel; INVOICE-sourced staff hours are NOT re-counted (anti-double-count). Feed `expenses` into chantier-profitability.computeChantier." });
}

// ---------- §6 productivité / analyse (sufficiency-guarded) ----------
function labourAnalytics(input: any): any {
  const i = isObj(input) ? input : {};
  const cost = (isObj(i.labourCost) && Array.isArray(i.labourCost.lines) ? i.labourCost.lines : []).filter((l: any) => isInt(l.amountMinor) && isInt(l.minutes));
  const byChantier: Record<string, any> = {}; const byActivity: Record<string, any> = {};
  const entries = (isObj(i.timesheets) && Array.isArray(i.timesheets.entries) ? i.timesheets.entries : []);
  const activityOf = new Map<string, string>(); for (const e of entries) if (isStr(e.id) && isStr(e.activity)) activityOf.set(e.id, e.activity);
  for (const l of cost) {
    const ch = isStr(l.chantierId) ? l.chantierId : "(unknown)";
    byChantier[ch] = byChantier[ch] || { minutes: 0, costMinor: 0 };
    byChantier[ch].minutes += l.minutes; byChantier[ch].costMinor += l.amountMinor;
    const act = activityOf.get(l.id) || "(unspecified)";
    byActivity[act] = byActivity[act] || { minutes: 0, costMinor: 0 };
    byActivity[act].minutes += l.minutes; byActivity[act].costMinor += l.amountMinor;
  }
  // average documented hourly cost per chantier — ONLY when minutes>0 (else NOT_MEASURED).
  const chantiers = Object.keys(byChantier).map((ch: string) => { const d = byChantier[ch]; return Object.freeze({ chantierId: ch, hours: Math.round(d.minutes / 60 * 100) / 100, costMinor: d.costMinor, avgHourlyMinor: d.minutes > 0 ? Math.round(d.costMinor / (d.minutes / 60)) : null, avgStatus: d.minutes > 0 ? "MEASURED" : "NOT_MEASURED" }); });
  const activities = Object.keys(byActivity).map((a: string) => { const d = byActivity[a]; return Object.freeze({ activity: a, hours: Math.round(d.minutes / 60 * 100) / 100, costMinor: d.costMinor }); });
  // labour weight in déboursé sec, IF the total déboursé is supplied.
  const totalLabour = cost.reduce((n: number, l: any) => n + l.amountMinor, 0);
  const debourseSecMinor = isInt(i.debourseSecMinor) ? i.debourseSecMinor : null;
  const labourWeightPct = debourseSecMinor !== null && debourseSecMinor > 0 ? Math.round((totalLabour / debourseSecMinor) * 1000) / 10 : null;
  return Object.freeze({ ok: true, byChantier: Object.freeze(chantiers), byActivity: Object.freeze(activities), totalLabourMinor: totalLabour, labourWeightInDebourseSecPct: labourWeightPct, note: "indicators only when the denominator is valid (else NOT_MEASURED / null); activities NOT compared across different scopes/units; apparent productivity is NOT an individual performance ranking." });
}

const WORKFORCE_LABOUR_CONTRACT = Object.freeze({
  id: "V150-WORKFORCE-LABOUR-ENGINE",
  metier: "M2 BTP/TP — workforce registry + timesheets + labour cost + chantier imputation (feeds chantier-profitability)",
  reuses: ["chantier-profitability expenses shape (cost integration)", "integer minor-unit arithmetic", "single-currency guard"],
  roles: ROLES, timesheetStates: TS_STATES,
  invariants: Object.freeze([
    "READ+CALCULATE only: runs no payroll, writes no real hours/planning, pays nothing; validations of payroll/real hours/employer cost stay human",
    "loaded hourly rate is a SUPPLIED versioned parameter — NEVER derived from a brut/net salary; no cotisation/convention invented; no rate ⇒ COST_NOT_MEASURED",
    "ONLY APPROVED hours cost real money; approved hours never silently modified (correction history required)",
    "ANTI-DOUBLE-COUNT: INVOICE-sourced staff (subcontract/billed interim) hours are NOT re-counted; a resource with both hours and a subcontract invoice ⇒ DOUBLE_IMPUTATION, hours skipped",
    "qualifications carry provenance+validity+verification — never 'qualified/habilité' without proof; technical ids only (no PII)",
    "indicators only when the denominator is valid; apparent productivity ≠ individual performance ranking; integer-minor + single-currency; feeds chantier-profitability (no parallel system, no 16th métier)",
  ]),
});
module.exports = { buildWorkforce, processTimesheets, computeLabourCost, imputeLabourToChantier, labourAnalytics, ROLES, TS_STATES, WORKFORCE_LABOUR_CONTRACT };
export {};
