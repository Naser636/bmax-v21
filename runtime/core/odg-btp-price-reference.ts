#!/usr/bin/env node
"use strict";
/*
 * BTP SUPPLIER / PRICE REFERENCE CATALOG (bordereau de prix fournisseurs). PURE, deterministic, integer minor-unit
 * (centimes), fail-closed, deny-by-default.
 *
 * THE GAP (reconciled, D06 in odg-btp-capability-matrix: "stock present; supplier/price reference database ABSENT"):
 * parc-stock-engine tracks stock but takes unit prices as CALLER inputs; metre/devis engines likewise. There was no
 * reusable, provenance-bearing price reference to SOURCE those prices from. This builds it — and the output `priceLineItems`
 * emits exactly the sourced line-item shape odg-btp-supplier-commitment.buildCommitment consumes, closing the loop
 * catalog → sourced prices → engagement document → chantier-profitability.computeChantier.
 *
 * Governance:
 *  - every reference price carries a MANDATORY priceSource (provenance) — an entry without it is REJECTED; a price is
 *    NEVER stored without where it came from;
 *  - a reference price is INDICATIVE, NEVER a contractual commitment (REFERENCE ≠ ENGAGEMENT); supplier choice / order
 *    issuance stays owner-gated in the commitment brick;
 *  - validity windows exclude STALE prices: a reference out of its [validFrom, validUntil] window is NOT applicable ⇒
 *    NO_REFERENCE (fail-closed) rather than a stale/fabricated price;
 *  - the cheapest valid reference is a non-binding SUGGESTION, explicitly flagged;
 *  - no clock (asOfDate is a caller input → determinism); no network/randomness; integer-overflow guarded.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function isNonNegInt(v: any): boolean { return typeof v === "number" && Number.isSafeInteger(v) && v >= 0; }
function isISODate(v: any): boolean { // ISO YYYY-MM-DD (sorts lexicographically); range-checks month/day so a calendar-garbage date (e.g. 2026-13-99) can't extend validity
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const mo = +v.slice(5, 7), d = +v.slice(8, 10);
  return mo >= 1 && mo <= 12 && d >= 1 && d <= 31; // range check (not full per-month calendar validation)
}
function freeze(o: any): any { return Object.freeze(o); }

/**
 * buildCatalog(entries, opts?) -> { ok, currency, entries[], rejected[] }.
 * entry = { itemRef, label?, unit, supplier, unitPriceMinor, priceSource, validFrom, validUntil? }
 * Fail-closed: an entry missing itemRef/unit/supplier/unitPriceMinor/priceSource/validFrom, or with bad dates / overflow /
 * foreign currency, is REJECTED (with a reason) — never stored. Multiple suppliers per itemRef are allowed.
 */
function buildCatalog(entries: any, opts: any): any {
  const currency = isObj(opts) && isStr(opts.currency) ? opts.currency : "EUR";
  const list = Array.isArray(entries) ? entries : [];
  if (!list.length) return freeze({ ok: false, code: "NO_ENTRIES" });
  const accepted: any[] = [];
  const rejected: any[] = [];
  list.forEach((raw: any, idx: number) => {
    const e = isObj(raw) ? raw : {};
    const id = isStr(e.itemRef) ? e.itemRef : null;
    const reason = !id ? "itemRef missing" :
      !isStr(e.unit) ? "unit missing" :
      !isStr(e.supplier) ? "supplier missing" :
      !isNonNegInt(e.unitPriceMinor) ? "unitPriceMinor missing/invalid" :
      !isStr(e.priceSource) ? "priceSource missing (a price is NEVER stored without provenance)" :
      !isISODate(e.validFrom) ? "validFrom missing/not ISO (YYYY-MM-DD)" :
      (e.validUntil !== undefined && !isISODate(e.validUntil)) ? "validUntil not ISO" :
      (isISODate(e.validUntil) && e.validUntil < e.validFrom) ? "validUntil before validFrom" :
      (e.currency !== undefined && e.currency !== currency) ? `foreign currency (no implicit FX): ${e.currency}` : null;
    if (reason) { rejected.push(freeze({ index: idx, itemRef: id, reason })); return; }
    accepted.push(freeze({ itemRef: id, label: isStr(e.label) ? e.label : null, unit: e.unit, supplier: e.supplier,
      unitPriceMinor: e.unitPriceMinor, priceSource: e.priceSource, validFrom: e.validFrom,
      validUntil: isISODate(e.validUntil) ? e.validUntil : null, currency }));
  });
  return freeze({ ok: true, currency, entries: freeze(accepted), rejected: freeze(rejected) });
}

function applicable(e: any, asOfDate: string): boolean { return e.validFrom <= asOfDate && (e.validUntil === null || asOfDate <= e.validUntil); }

/**
 * lookup(catalog, query) -> applicable reference prices for an item at a date. query = { itemRef, asOfDate, supplier? }.
 * Returns candidates (valid at asOfDate, cheapest-first) + a non-binding cheapest SUGGESTION. No valid reference ⇒
 * NO_REFERENCE (fail-closed — downstream must NOT invent a price). Never a stale price.
 */
function lookup(catalog: any, query: any): any {
  if (!isObj(catalog) || catalog.ok !== true) return freeze({ ok: false, code: "BAD_CATALOG" });
  const q = isObj(query) ? query : {};
  if (!isStr(q.itemRef)) return freeze({ ok: false, code: "NO_ITEMREF" });
  if (!isISODate(q.asOfDate)) return freeze({ ok: false, code: "BAD_ASOF_DATE", detail: "asOfDate must be ISO YYYY-MM-DD" });
  let hits = catalog.entries.filter((e: any) => e.itemRef === q.itemRef && applicable(e, q.asOfDate));
  if (isStr(q.supplier)) hits = hits.filter((e: any) => e.supplier === q.supplier);
  if (!hits.length) return freeze({ ok: true, itemRef: q.itemRef, found: false, code: "NO_REFERENCE",
    note: "no reference price valid at asOfDate — fail-closed; do NOT invent a price" });
  const candidates = hits.slice().sort((a: any, b: any) => a.unitPriceMinor - b.unitPriceMinor || (a.supplier < b.supplier ? -1 : a.supplier > b.supplier ? 1 : 0));
  return freeze({ ok: true, itemRef: q.itemRef, found: true, candidates: freeze(candidates),
    cheapest: candidates[0], suggestion: freeze({ supplier: candidates[0].supplier, unitPriceMinor: candidates[0].unitPriceMinor,
      binding: false, note: "cheapest VALID reference — a non-binding suggestion; REFERENCE ≠ ENGAGEMENT (ordering stays owner-gated)" }) });
}

/**
 * priceLineItems(catalog, requestedLines, asOfDate, opts?) -> { ok, lineItems[], unresolved[], note }.
 * requestedLines: [{ itemRef, qty, supplier? }]. Resolves each to a SOURCED line of the shape
 * odg-btp-supplier-commitment.buildCommitment consumes ({ ref, label, qty, unit, unitPriceMinor, priceSource }).
 * A line with no valid reference ⇒ UNRESOLVED (flagged, NOT priced) — fail-closed, so the commitment is NOT_ENGAGEABLE.
 * opts.preferSupplier applies a default supplier; per-line supplier overrides it. Default selection = cheapest valid.
 */
function priceLineItems(catalog: any, requestedLines: any, asOfDate: string, opts: any): any {
  if (!isObj(catalog) || catalog.ok !== true) return freeze({ ok: false, code: "BAD_CATALOG" });
  if (!isISODate(asOfDate)) return freeze({ ok: false, code: "BAD_ASOF_DATE" });
  const lines = Array.isArray(requestedLines) ? requestedLines.filter(isObj) : [];
  if (!lines.length) return freeze({ ok: false, code: "NO_LINES" });
  const preferSupplier = isObj(opts) && isStr(opts.preferSupplier) ? opts.preferSupplier : null;
  const lineItems: any[] = [];
  const unresolved: any[] = [];
  lines.forEach((l: any, idx: number) => {
    const ref = isStr(l.ref) ? l.ref : "L" + (idx + 1);
    if (!isStr(l.itemRef) || !isNonNegInt(l.qty)) { unresolved.push(freeze({ ref, itemRef: isStr(l.itemRef) ? l.itemRef : null, reason: !isStr(l.itemRef) ? "itemRef missing" : "qty missing/invalid" })); return; }
    const supplier = isStr(l.supplier) ? l.supplier : preferSupplier;
    const res = lookup(catalog, supplier ? { itemRef: l.itemRef, asOfDate, supplier } : { itemRef: l.itemRef, asOfDate });
    if (!res.found) { unresolved.push(freeze({ ref, itemRef: l.itemRef, reason: res.code || "NO_REFERENCE" })); return; }
    const pick = res.cheapest; // cheapest valid (or the supplier-filtered cheapest)
    lineItems.push(freeze({ ref, label: pick.label, qty: l.qty, unit: pick.unit,
      unitPriceMinor: pick.unitPriceMinor, priceSource: pick.priceSource, supplier: pick.supplier }));
  });
  return freeze({ ok: true, asOfDate, lineItems: freeze(lineItems), unresolved: freeze(unresolved),
    note: "sourced from the reference catalog (each line carries its priceSource); unresolved lines are NOT priced (fail-closed ⇒ commitment NOT_ENGAGEABLE). A reference is INDICATIVE — ordering stays owner-gated." });
}

const PRICE_REFERENCE_CONTRACT = Object.freeze({
  id: "BTP-PRICE-REFERENCE",
  purpose: "supplier/price reference catalog (bordereau de prix) — the missing D06 provenance-bearing price source that feeds odg-btp-supplier-commitment",
  reuses: Object.freeze(["odg-btp-supplier-commitment.buildCommitment line-item shape (the consumer)", "single-currency integer minor-unit convention"]),
  invariants: Object.freeze([
    "every reference price carries a MANDATORY priceSource — an entry without provenance is REJECTED (never stored)",
    "a reference price is INDICATIVE, NEVER a contractual commitment (REFERENCE ≠ ENGAGEMENT) — ordering stays owner-gated",
    "validity window excludes STALE prices: out-of-window ⇒ NO_REFERENCE (fail-closed), never a stale/fabricated price",
    "cheapest valid reference is a non-binding SUGGESTION, explicitly flagged",
    "priceLineItems feeds the commitment brick's shape; unresolved lines are NOT priced ⇒ commitment NOT_ENGAGEABLE",
    "no clock (asOfDate is a caller input ⇒ deterministic); integer minor-unit, overflow-guarded; single-currency (no implicit FX)",
  ]),
});

module.exports = { buildCatalog, lookup, priceLineItems, PRICE_REFERENCE_CONTRACT };
export {};
