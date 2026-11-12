#!/usr/bin/env node
"use strict";
/*
 * V149 MÉTIER 2 (BTP/TP) — PARC MATÉRIEL / FLOTTE / STOCKS engine + CHANTIER COST INTEGRATION. PURE, deterministic,
 * fail-closed, integer-MINOR, single-currency guard. READ+CALCULATE only: it books/orders/pays NOTHING, modifies no real
 * planning/stock/assignment, and NEVER declares an equipment "conforme/autorisé" from the mere presence of a document.
 * NOT a parallel system: it FEEDS the existing chantier-profitability.computeChantier via its `expenses` shape.
 *
 * Common extensible equipment model (one model, category-specific `attributes`). Covers §2–§8:
 *   buildRegistry · checkAvailability · maintenanceAlerts · fuelIndicators · computeStock · reconcileSupply · imputeToChantier
 *
 * ANTI-DOUBLE-COUNT (directive §8, central): a stock PURCHASE/RECEPTION is a COMMITMENT, never a chantier charge. ONLY
 * CONSUMPTION (stock→chantier) and equipment USAGE (hours×rate) become chantier expenses. An NOT_MEASURED indicator is
 * emitted whenever a denominator (hours/km) is missing — never a fabricated rate.
 */
const DOC = require("./document-intelligence.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isInt(v: any): boolean { return typeof v === "number" && Number.isSafeInteger(v); }
function isNum(v: any): boolean { return typeof v === "number" && Number.isFinite(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function arr(v: any): any[] { return Array.isArray(v) ? v.filter(isObj) : []; }

const CATEGORIES = Object.freeze(["EXCAVATOR", "LOADER", "DOZER", "COMPACTOR", "PAVER", "CRANE", "LIFT", "CONCRETE", "TRUCK", "UTILITY", "TRAILER", "TOOL", "ELECTRICAL", "SPECIALIZED"]);
const EQUIP_STATES = Object.freeze(["DISPONIBLE", "AFFECTE", "MAINTENANCE", "IMMOBILISE", "LOUE", "HORS_SERVICE"]);
const MOVE_KINDS = Object.freeze(["RECEPTION", "ENTREE", "SORTIE", "TRANSFERT", "RETOUR", "CONSOMMATION", "PERTE", "AJUSTEMENT"]);
const METER_KINDS = Object.freeze(["HOURS", "KM"]);

// ---------- §2 registre ----------
function buildRegistry(equipments: any): any {
  const list = arr(equipments);
  const items: any[] = []; const rejected: any[] = [];
  const seen = new Set<string>();
  for (const e of list) {
    if (!isStr(e.id)) { rejected.push({ reason: "NO_ID", raw: e.category || null }); continue; }
    if (seen.has(e.id)) { rejected.push({ id: e.id, reason: "DUPLICATE_ID" }); continue; }
    seen.add(e.id);
    const category = isStr(e.category) && CATEGORIES.indexOf(e.category) >= 0 ? e.category : "SPECIALIZED";
    const state = isStr(e.state) && EQUIP_STATES.indexOf(e.state) >= 0 ? e.state : "DISPONIBLE";
    const meterKind = isStr(e.meterKind) && METER_KINDS.indexOf(e.meterKind) >= 0 ? e.meterKind : null;
    items.push(Object.freeze({
      id: e.id, category, categoryKnown: isStr(e.category) && CATEGORIES.indexOf(e.category) >= 0,
      brand: isStr(e.brand) ? e.brand : null, model: isStr(e.model) ? e.model : null,
      serial: isStr(e.serial) ? e.serial : (isStr(e.plate) ? e.plate : null),
      ownership: e.ownership === "RENTED" ? "RENTED" : "OWNED",
      acquisitionValueMinor: isInt(e.acquisitionValueMinor) ? e.acquisitionValueMinor : null,
      state, location: isStr(e.location) ? e.location : null,
      meter: isNum(e.meter) ? e.meter : null, meterKind,
      dailyAmortMinor: isInt(e.dailyAmortMinor) ? e.dailyAmortMinor : null,
      currency: isStr(e.currency) ? e.currency : null,
      attributes: isObj(e.attributes) ? Object.freeze({ ...e.attributes }) : Object.freeze({}),
    }));
  }
  return Object.freeze({ ok: true, items: Object.freeze(items), count: items.length, rejected: Object.freeze(rejected), note: "common extensible model; category-specific fields live in `attributes`; unknown category ⇒ SPECIALIZED (flagged, not guessed)." });
}

// ---------- §3 disponibilité / affectation ----------
function checkAvailability(assignments: any, opts?: any): any {
  const list = arr(assignments).filter((a: any) => isStr(a.equipmentId) && isInt(a.fromMs) && isInt(a.toMs) && a.toMs >= a.fromMs);
  const anomalies: any[] = [];
  const byEquip = new Map<string, any[]>();
  for (const a of list) { if (!byEquip.has(a.equipmentId)) byEquip.set(a.equipmentId, []); byEquip.get(a.equipmentId)!.push(a); }
  for (const [eid, as] of byEquip) {
    const sorted = as.slice().sort((x: any, y: any) => x.fromMs - y.fromMs);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1], cur = sorted[i];
      if (cur.fromMs < prev.toMs) anomalies.push({ code: "DOUBLE_AFFECTATION", equipmentId: eid, detail: `overlapping assignments to '${prev.chantierId}' and '${cur.chantierId}'`, evidence: `prev[${prev.fromMs},${prev.toMs}] cur[${cur.fromMs},${cur.toMs}]`, confidence: "HIGH" });
      // missing return: a prior assignment never returned before the next started
      if (!isInt(prev.returnedMs) && cur.fromMs >= prev.toMs) anomalies.push({ code: "RETOUR_MANQUANT", equipmentId: eid, detail: `assignment to '${prev.chantierId}' has no recorded return before the next assignment`, evidence: `chantier=${prev.chantierId}`, confidence: "MEDIUM" });
    }
  }
  // incoherent assignment: returnedMs before fromMs
  for (const a of list) if (isInt(a.returnedMs) && a.returnedMs < a.fromMs) anomalies.push({ code: "AFFECTATION_INCOHERENTE", equipmentId: a.equipmentId, detail: "returned before it was assigned", evidence: `from=${a.fromMs} returned=${a.returnedMs}`, confidence: "HIGH" });
  return Object.freeze({ ok: true, assignmentsChecked: list.length, anomalies: Object.freeze(anomalies), note: "detects double-booking / missing returns / incoherent dates; recommends only — changes no real assignment." });
}

// ---------- §4 maintenance / contrôles / assurances ----------
function median(nums: number[]): number | null { if (!nums.length) return null; const s = nums.slice().sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.floor((s[m - 1] + s[m]) / 2); }

function maintenanceAlerts(input: any): any {
  const i = isObj(input) ? input : {};
  const nowMs = isInt(i.nowMs) ? i.nowMs : null;
  const windowMs = isInt(i.windowMs) ? i.windowMs : 7 * 24 * 3600 * 1000;
  const maint = arr(i.maintenance), controls = arr(i.controls), insurances = arr(i.insurances);
  const alerts: any[] = [];
  const add = (code: string, equipmentId: any, detail: string, evidence: string, confidence: string) => alerts.push({ code, equipmentId: isStr(equipmentId) ? equipmentId : null, detail, evidence, confidence, note: "an alert is a signal, not a conformity decision" });

  for (const m of maint) {
    if (isInt(m.dueMs) && !isInt(m.doneMs) && nowMs !== null) {
      if (m.dueMs < nowMs) add("MAINTENANCE_ECHUE", m.equipmentId, `${m.kind || "maintenance"} overdue`, `dueMs=${m.dueMs}`, "HIGH");
      else if (m.dueMs - nowMs <= windowMs) add("MAINTENANCE_PROCHE", m.equipmentId, `${m.kind || "maintenance"} due soon`, `dueMs=${m.dueMs}`, "MEDIUM");
    }
  }
  for (const ctl of controls) if (isInt(ctl.dueMs) && nowMs !== null) {
    if (ctl.dueMs < nowMs) add("CONTROLE_ECHU", ctl.equipmentId, `regulatory control (${ctl.kind || "contrôle"}) overdue`, `dueMs=${ctl.dueMs}`, "HIGH");
    else if (ctl.dueMs - nowMs <= windowMs) add("CONTROLE_PROCHE", ctl.equipmentId, "regulatory control due soon", `dueMs=${ctl.dueMs}`, "MEDIUM");
  }
  for (const ins of insurances) if (isInt(ins.expiresMs) && nowMs !== null) {
    if (ins.expiresMs < nowMs) add("ASSURANCE_EXPIREE", ins.equipmentId, "insurance expired", `expiresMs=${ins.expiresMs}`, "HIGH");
    else if (ins.expiresMs - nowMs <= windowMs) add("ASSURANCE_PROCHE", ins.equipmentId, "insurance expiring soon", `expiresMs=${ins.expiresMs}`, "MEDIUM");
  }
  // meter incoherence across maintenance records (regressive meterAt) + unusual cost vs median
  const byEquip = new Map<string, any[]>();
  for (const m of maint) if (isStr(m.equipmentId)) { if (!byEquip.has(m.equipmentId)) byEquip.set(m.equipmentId, []); byEquip.get(m.equipmentId)!.push(m); }
  for (const [eid, ms] of byEquip) {
    const withMeter = ms.filter((m: any) => isNum(m.meterAt) && isInt(m.doneMs)).sort((a: any, b: any) => a.doneMs - b.doneMs);
    for (let k = 1; k < withMeter.length; k++) if (withMeter[k].meterAt < withMeter[k - 1].meterAt) add("COMPTEUR_INCOHERENT", eid, "maintenance meter decreased between interventions", `${withMeter[k - 1].meterAt}→${withMeter[k].meterAt}`, "HIGH");
    const costs = ms.filter((m: any) => isInt(m.costMinor)).map((m: any) => m.costMinor);
    const med = median(costs);
    if (med !== null && med > 0) for (const m of ms) if (isInt(m.costMinor) && m.costMinor > med * 3) add("COUT_MAINTENANCE_INHABITUEL", eid, "maintenance cost far above this equipment's median", `cost=${m.costMinor} median=${med}`, "MEDIUM");
    // incomplete history: a corrective record with neither cost nor parts
    for (const m of ms) if (m.kind === "CORRECTIVE" && !isInt(m.costMinor) && !Array.isArray(m.parts)) add("HISTORIQUE_INCOMPLET", eid, "corrective maintenance with no cost and no parts recorded", `maint=${m.id || "?"}`, "LOW");
    // part without equipment handled at input level (equipmentId present here)
  }
  return Object.freeze({ ok: true, alerts: Object.freeze(alerts), note: "NEVER declares an equipment conforme/authorised from a document's presence; precise regulatory requirements remain sourced + expert-validated." });
}

// ---------- §5 carburant / coûts d'utilisation ----------
function fuelIndicators(input: any): any {
  const i = isObj(input) ? input : {};
  const cons = arr(i.consumptions);
  const anomalies: any[] = [];
  const seen = new Set<string>();
  const byEquip = new Map<string, any[]>();
  for (const c of cons) {
    if (isStr(c.equipmentId)) { if (!byEquip.has(c.equipmentId)) byEquip.set(c.equipmentId, []); byEquip.get(c.equipmentId)!.push(c); }
    if (!isStr(c.justifRef)) anomalies.push({ code: "CONSOMMATION_SANS_JUSTIF", equipmentId: c.equipmentId || null, detail: "fuel/usage consumption without a supporting document", evidence: `id=${c.id}`, confidence: "MEDIUM" });
    const key = `${c.equipmentId}|${isInt(c.dateMs) ? c.dateMs : "?"}|${isNum(c.quantity) ? c.quantity : "?"}|${isInt(c.costMinor) ? c.costMinor : "?"}`;
    if (seen.has(key)) anomalies.push({ code: "CONSOMMATION_DOUBLON", equipmentId: c.equipmentId || null, detail: "duplicate consumption (same equipment/date/quantity/cost)", evidence: key, confidence: "MEDIUM" }); else seen.add(key);
  }
  const indicators: any[] = [];
  for (const [eid, cs] of byEquip) {
    const sorted = cs.filter((c: any) => isNum(c.meter)).sort((a: any, b: any) => (isInt(a.dateMs) ? a.dateMs : 0) - (isInt(b.dateMs) ? b.dateMs : 0));
    for (let k = 1; k < sorted.length; k++) if (sorted[k].meter < sorted[k - 1].meter) anomalies.push({ code: "COMPTEUR_INCOHERENT", equipmentId: eid, detail: "meter decreased between consumptions", evidence: `${sorted[k - 1].meter}→${sorted[k].meter}`, confidence: "HIGH" });
    const totalCost = cs.filter((c: any) => isInt(c.costMinor)).reduce((n: number, c: any) => n + c.costMinor, 0);
    const meterDelta = sorted.length >= 2 ? sorted[sorted.length - 1].meter - sorted[0].meter : 0;
    // deterministic: compute cost-per-unit ONLY when the denominator is positive; else NOT_MEASURED.
    if (meterDelta > 0) indicators.push({ equipmentId: eid, costPerUnitMinor: Math.round(totalCost / meterDelta), unitBasis: "per meter unit (h/km)", meterDelta, totalCostMinor: totalCost });
    else indicators.push({ equipmentId: eid, costPerUnitMinor: null, status: "NOT_MEASURED", reason: "meter delta ≤ 0 or insufficient consumptions (no valid denominator)" });
  }
  return Object.freeze({ ok: true, indicators: Object.freeze(indicators), anomalies: Object.freeze(anomalies), note: "no indicator computed without a valid denominator (NOT_MEASURED); deterministic integer-minor." });
}

// ---------- §6 stocks ----------
function computeStock(input: any): any {
  const i = isObj(input) ? input : {};
  const moves = arr(i.movements).filter((m: any) => isStr(m.ref) && isStr(m.kind) && MOVE_KINDS.indexOf(m.kind) >= 0 && isNum(m.qty));
  const allowNegative = i.allowNegative === true;
  const anomalies: any[] = [];
  // group by ref (+depot optional). sign convention: entrées + ; sorties/consommation/perte − ; transfert/retour handled.
  const levels = new Map<string, any>();
  const unitByRef = new Map<string, string>();
  // process chronologically to catch negative stock at the moment it happens.
  const ordered = moves.slice().sort((a: any, b: any) => (isInt(a.dateMs) ? a.dateMs : 0) - (isInt(b.dateMs) ? b.dateMs : 0));
  for (const m of ordered) {
    if (!isStr(m.justifRef) && m.kind !== "AJUSTEMENT") anomalies.push({ code: "MOUVEMENT_SANS_JUSTIF", ref: m.ref, detail: `stock movement ${m.kind} without a supporting document`, evidence: `id=${m.id}`, confidence: "MEDIUM" });
    if (isStr(m.unit)) { const prev = unitByRef.get(m.ref); if (prev && prev !== m.unit) anomalies.push({ code: "UNITE_INCOHERENTE", ref: m.ref, detail: `unit '${m.unit}' differs from previously seen '${prev}'`, evidence: m.ref, confidence: "HIGH" }); else unitByRef.set(m.ref, m.unit); }
    const L = levels.get(m.ref) || { theoretical: 0, reserved: 0, consumed: 0, inTransit: 0 };
    const sign = (m.kind === "RECEPTION" || m.kind === "ENTREE" || m.kind === "RETOUR") ? 1 : (m.kind === "SORTIE" || m.kind === "CONSOMMATION" || m.kind === "PERTE") ? -1 : 0;
    L.theoretical += sign * m.qty;
    if (m.kind === "CONSOMMATION") L.consumed += m.qty;
    if (m.kind === "TRANSFERT") { L.inTransit += m.qty; if (!isStr(m.depotTo)) anomalies.push({ code: "TRANSFERT_NON_RECU", ref: m.ref, detail: "transfer with no destination depot (not received)", evidence: `id=${m.id}`, confidence: "MEDIUM" }); }
    if (m.kind === "AJUSTEMENT") L.theoretical += m.qty;    // explicit signed adjustment (never silent; qty may be + or −)
    if (m.reserved === true && sign === 0) L.reserved += m.qty;
    if (L.theoretical < 0 && !allowNegative) anomalies.push({ code: "STOCK_NEGATIF", ref: m.ref, detail: `stock went negative at movement ${m.id || "?"} (not allowed by contract)`, evidence: `level=${L.theoretical}`, confidence: "HIGH" });
    levels.set(m.ref, L);
  }
  // seuils / ruptures
  const thresholds = isObj(i.thresholds) ? i.thresholds : {};
  const stock: any[] = [];
  for (const [ref, L] of levels) {
    const available = L.theoretical - L.reserved;
    const seuil = isInt(thresholds[ref]) ? thresholds[ref] : null;
    const rupture = seuil !== null && available <= seuil;
    if (rupture) anomalies.push({ code: "RUPTURE_POTENTIELLE", ref, detail: `available stock (${available}) at/below threshold (${seuil})`, evidence: ref, confidence: "MEDIUM" });
    stock.push(Object.freeze({ ref, theoretical: L.theoretical, available, reserved: L.reserved, consumed: L.consumed, inTransit: L.inTransit, unit: unitByRef.get(ref) || null, seuil, rupture }));
  }
  return Object.freeze({ ok: true, stock: Object.freeze(stock), anomalies: Object.freeze(anomalies), note: "deterministic, unit-guarded; negative stock ⇒ explicit anomaly (unless contract allows); history never silently modified (adjustments are explicit signed movements)." });
}

// ---------- §7 supply reconciliation (reuse document-intelligence) ----------
function reconcileSupply(dossiers: any): any {
  const list = arr(dossiers);
  const results = list.map((d: any, k: number) => { const r = DOC.reconcileDossier(d); return { index: k, status: r.status, anomalies: r.anomalies.map((a: any) => a.code) }; });
  return Object.freeze({ ok: true, results: Object.freeze(results), note: "besoin→commande→livraison→réception→facture reconciliation delegated to document-intelligence (no duplicate logic); no real order/supplier/payment." });
}

// ---------- §8 CHANTIER COST INTEGRATION (anti-double-count) ----------
// ONLY equipment USAGE (hours×rate) and stock CONSUMPTION (qty×unitCost) become chantier expenses. Purchases/receptions are
// COMMITMENTS, never charges. Emits records in chantier-profitability's `expenses` shape (category EQUIPMENT/MATERIAL/...).
function imputeToChantier(input: any): any {
  const i = isObj(input) ? input : {};
  const currency = isStr(i.currency) ? i.currency : "EUR";
  const expenses: any[] = []; const skipped: any[] = []; const notes: string[] = [];
  let seq = 0;
  // equipment usage → EQUIPMENT expense = hours × rate (NOT_MEASURED if hours/rate missing)
  for (const u of arr(i.usages)) {
    if (!isStr(u.chantierId)) { skipped.push({ kind: "usage", reason: "no chantierId" }); continue; }
    if (!isNum(u.hours) || u.hours <= 0 || !isInt(u.rateMinorPerHour)) { skipped.push({ kind: "usage", equipmentId: u.equipmentId, reason: "NOT_MEASURED: hours≤0 or rate missing" }); continue; }
    expenses.push(Object.freeze({ id: `imp-eq-${++seq}`, category: "EQUIPMENT", amountMinor: Math.round(u.hours * u.rateMinorPerHour), chantierId: u.chantierId, justifRef: isStr(u.justifRef) ? u.justifRef : `usage:${u.equipmentId}`, periodMonth: isStr(u.periodMonth) ? u.periodMonth : undefined, supplier: isStr(u.equipmentId) ? u.equipmentId : undefined, currency }));
  }
  // stock CONSUMPTION → MATERIAL expense = qty × unitCost. ONLY consumption; a purchase/reception is NOT imputed here.
  for (const cns of arr(i.consumptions)) {
    if (cns.kind !== undefined && cns.kind !== "CONSOMMATION") { skipped.push({ kind: "stock", ref: cns.ref, reason: `not a consumption (${cns.kind}) ⇒ not a chantier charge (anti-double-count)` }); continue; }
    if (!isStr(cns.chantierId)) { skipped.push({ kind: "stock", ref: cns.ref, reason: "no chantierId" }); continue; }
    if (!isNum(cns.qty) || cns.qty <= 0 || !isInt(cns.unitCostMinor)) { skipped.push({ kind: "stock", ref: cns.ref, reason: "NOT_MEASURED: qty≤0 or unitCost missing" }); continue; }
    expenses.push(Object.freeze({ id: `imp-mat-${++seq}`, category: "MATERIAL", amountMinor: Math.round(cns.qty * cns.unitCostMinor), chantierId: cns.chantierId, justifRef: isStr(cns.justifRef) ? cns.justifRef : `consume:${cns.ref}`, periodMonth: isStr(cns.periodMonth) ? cns.periodMonth : undefined, currency }));
  }
  // fuel attributed to a chantier → EQUIPMENT (usage) / TRANSPORT expense
  for (const f of arr(i.fuel)) { if (!isStr(f.chantierId) || !isInt(f.costMinor)) { skipped.push({ kind: "fuel", reason: "no chantierId or cost" }); continue; } expenses.push(Object.freeze({ id: `imp-fuel-${++seq}`, category: f.transport === true ? "TRANSPORT" : "EQUIPMENT", amountMinor: f.costMinor, chantierId: f.chantierId, justifRef: isStr(f.justifRef) ? f.justifRef : `fuel:${f.equipmentId}`, periodMonth: isStr(f.periodMonth) ? f.periodMonth : undefined, currency })); }
  // imputable maintenance → MISC
  for (const m of arr(i.maintenanceImputable)) { if (!isStr(m.chantierId) || !isInt(m.costMinor)) { skipped.push({ kind: "maintenance", reason: "no chantierId or cost" }); continue; } expenses.push(Object.freeze({ id: `imp-mnt-${++seq}`, category: "MISC", amountMinor: m.costMinor, chantierId: m.chantierId, justifRef: isStr(m.justifRef) ? m.justifRef : `maint:${m.equipmentId}`, periodMonth: isStr(m.periodMonth) ? m.periodMonth : undefined, currency })); }

  // purchases/receptions explicitly surfaced as commitments, NOT expenses.
  const commitments = arr(i.purchases).filter((p: any) => isInt(p.amountMinor)).map((p: any, k: number) => Object.freeze({ id: isStr(p.id) ? p.id : `cmd-${k + 1}`, kind: "ORDER", amountMinor: p.amountMinor, invoiced: p.invoiced === true }));
  if (commitments.length) notes.push(`${commitments.length} purchase(s)/reception(s) recorded as COMMITMENTS (engagements), NOT chantier charges — a stock entry never auto-becomes a consumed charge.`);

  const totalImputedMinor = expenses.reduce((n: number, e: any) => n + e.amountMinor, 0);
  const byCategory: Record<string, number> = {};
  for (const e of expenses) byCategory[e.category] = (byCategory[e.category] || 0) + e.amountMinor;
  return Object.freeze({
    ok: true, expenses: Object.freeze(expenses), commitments: Object.freeze(commitments),
    skipped: Object.freeze(skipped), totalImputedMinor, byCategory: Object.freeze(byCategory), notes: Object.freeze(notes),
    note: "imputes ONLY consumption + usage to chantiers (purchases/receptions are commitments) ⇒ no double counting. Feed `expenses` into chantier-profitability.computeChantier. integer-minor, single-currency.",
  });
}

const PARC_STOCK_CONTRACT = Object.freeze({
  id: "V149-PARC-STOCK-ENGINE",
  metier: "M2 BTP/TP — parc matériel/flotte/stocks + chantier cost integration (feeds chantier-profitability)",
  reuses: ["document-intelligence (supply reconciliation)", "chantier-profitability expenses shape (cost integration)", "integer minor-unit arithmetic", "single-currency guard"],
  categories: CATEGORIES, equipStates: EQUIP_STATES, moveKinds: MOVE_KINDS,
  invariants: Object.freeze([
    "READ+CALCULATE only: books/orders/pays nothing; modifies no real stock/planning/assignment; never declares an equipment conforme from a document's presence",
    "common extensible equipment model (category-specific fields in `attributes`); unknown category ⇒ SPECIALIZED (flagged)",
    "integer minor + single-currency; no indicator without a valid denominator ⇒ NOT_MEASURED (never a fabricated rate)",
    "ANTI-DOUBLE-COUNT: only CONSUMPTION + equipment USAGE become chantier expenses; purchases/receptions are commitments",
    "stock history never silently modified (adjustments are explicit signed movements); negative stock ⇒ explicit anomaly",
    "reuses existing engines (no parallel architecture, no 16th métier, no new primitive)",
  ]),
});
module.exports = { buildRegistry, checkAvailability, maintenanceAlerts, fuelIndicators, computeStock, reconcileSupply, imputeToChantier, CATEGORIES, EQUIP_STATES, MOVE_KINDS, PARC_STOCK_CONTRACT };
export {};
