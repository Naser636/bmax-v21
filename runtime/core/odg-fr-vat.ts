#!/usr/bin/env node
"use strict";
/*
 * FRENCH VAT (TVA) COMPUTATION — multi-rate net→VAT→gross, per-rate breakdown, and BTP subcontracting reverse-charge
 * (autoliquidation). PURE, deterministic, integer minor-unit (centimes), fail-closed.
 *
 * THE GAP (reconciled): the einvoice stack PARSES/consumes VAT amounts; the billing/devis/chantier engines compute none;
 * nothing computes VAT from a net base or applies the autoliquidation rule. Useful for the commercial stack (devis /
 * invoice / supplier-commitment).
 *
 * TWO HARD HONESTY BOUNDARIES (do not over-claim):
 *  1. This COMPUTES VAT given a DECLARED rate — it does NOT decide WHICH rate legally applies. 5.5% vs 10% vs 20% for
 *     BTP depends on the work type/building age/conditions (CGI) — a TAX/LEGAL judgment the caller's accountant makes.
 *     The RATES_FR_BTP catalog is a REFERENCE for convenience, NOT a classifier and NOT a claim of legal exhaustiveness.
 *  2. Autoliquidation (reverse-charge, BTP subcontracting, CGI art. 283-2 nonies) is NOT a VAT exemption: the subcontractor
 *     invoices HT only (invoice VAT = 0) with the mandatory legal mention, but the VAT is still DUE — self-assessed and
 *     declared by the CLIENT (preneur). Never present it as "no VAT". No network/clock/randomness.
 */

function isNonNegInt(v: any): boolean { return typeof v === "number" && Number.isSafeInteger(v) && v >= 0; }
function isRateBps(v: any): boolean { return isNonNegInt(v) && v <= 10000; } // 0–100%
function freeze(o: any): any { return Object.freeze(o); }

// FR VAT rates in basis points (10000 = 100%). REFERENCE ONLY — the module accepts any rateBps; this is not a classifier.
const RATES_FR_BTP = Object.freeze({
  STANDARD: 2000,           // 20% — default
  INTERMEDIATE: 1000,       // 10% — improvement/maintenance of ≥2-year dwellings (conditions apply)
  REDUCED: 550,             // 5.5% — energy-renovation works (conditions apply)
  SUPER_REDUCED: 210,       // 2.1%
  ZERO: 0,
});

/** round half-up to the nearest centime (standard commercial rounding). */
function roundCent(x: number): number { return Math.round(x); }

/** computeVat(netMinor, rateBps) -> { ok, netMinor, rateBps, vatMinor, grossMinor }. VAT = round(net·rate/10000). */
function computeVat(netMinor: any, rateBps: any): any {
  if (!isNonNegInt(netMinor)) return freeze({ ok: false, code: "BAD_NET", detail: "netMinor must be a non-negative safe integer (centimes)" });
  if (!isRateBps(rateBps)) return freeze({ ok: false, code: "BAD_RATE", detail: "rateBps must be an integer 0..10000 (10000 = 100%)" });
  const raw = netMinor * rateBps;
  if (!Number.isSafeInteger(raw)) return freeze({ ok: false, code: "OVERFLOW", detail: "net·rate exceeds safe-integer range" });
  const vatMinor = roundCent(raw / 10000);
  return freeze({ ok: true, netMinor, rateBps, vatMinor, grossMinor: netMinor + vatMinor,
    note: "VAT computed from net at the DECLARED rate (round to nearest centime); it does NOT decide which rate legally applies (a tax/legal judgment)." });
}

/**
 * vatBreakdown(lines) -> { ok, byRate[], totals }. lines: [{ netMinor, rateBps }]. VAT is computed PER RATE on the
 * AGGREGATED base (standard, avoids per-line rounding drift). Fail-closed on any bad line.
 */
function vatBreakdown(lines: any): any {
  if (!Array.isArray(lines) || lines.length === 0) return freeze({ ok: false, code: "NO_LINES" });
  const baseByRate = new Map<number, number>();
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l === null || typeof l !== "object") return freeze({ ok: false, code: "BAD_LINE", detail: `line ${i} not an object` });
    if (!isNonNegInt(l.netMinor)) return freeze({ ok: false, code: "BAD_NET", detail: `line ${i}: netMinor invalid` });
    if (!isRateBps(l.rateBps)) return freeze({ ok: false, code: "BAD_RATE", detail: `line ${i}: rateBps invalid` });
    baseByRate.set(l.rateBps, (baseByRate.get(l.rateBps) || 0) + l.netMinor);
  }
  const byRate: any[] = [];
  let totNet = 0, totVat = 0;
  for (const rate of [...baseByRate.keys()].sort((a, b) => a - b)) {
    const base = baseByRate.get(rate)!;
    const cv = computeVat(base, rate);
    if (cv.ok !== true) return cv;
    byRate.push(freeze({ rateBps: rate, baseMinor: base, vatMinor: cv.vatMinor }));
    totNet += base; totVat += cv.vatMinor;
  }
  return freeze({ ok: true, byRate: freeze(byRate), totals: freeze({ netMinor: totNet, vatMinor: totVat, grossMinor: totNet + totVat }),
    note: "VAT computed per rate on the aggregated base (avoids per-line rounding drift); the rate per line is caller-declared, not classified here." });
}

/**
 * reverseChargeInvoice(netMinor, rateBps) -> the BTP subcontracting autoliquidation case: the invoice carries HT only
 * (invoice VAT = 0) + the mandatory mention; the VAT is NOT waived — it is DUE and self-assessed by the CLIENT.
 */
function reverseChargeInvoice(netMinor: any, rateBps: any): any {
  const cv = computeVat(netMinor, rateBps);
  if (cv.ok !== true) return cv;
  return freeze({ ok: true, reverseCharge: true, netMinor, rateBps,
    invoiceVatMinor: 0, invoiceTotalMinor: netMinor,                 // subcontractor bills HT only
    vatDueByClientMinor: cv.vatMinor,                                // the client self-assesses & declares this
    mention: "Autoliquidation — TVA due par le preneur (art. 283-2 nonies du CGI)",
    note: "BTP subcontracting reverse-charge: the subcontractor invoices HT only (invoice VAT = 0) with the legal mention; this is NOT an exemption — the VAT (vatDueByClientMinor) is DUE and declared by the CLIENT. Whether reverse-charge APPLIES is a legal determination the caller makes, not this module." });
}

const FR_VAT_CONTRACT = Object.freeze({
  id: "FR-VAT",
  purpose: "French VAT (TVA) computation — multi-rate net→VAT→gross, per-rate breakdown, BTP subcontracting autoliquidation; the gap next to the einvoice VAT-amount parsing",
  reuses: Object.freeze(["integer minor-unit convention; composes with devis/invoice/supplier-commitment — does not re-parse e-invoices"]),
  invariants: Object.freeze([
    "COMPUTES VAT at a DECLARED rate — does NOT decide which rate legally applies (5.5/10/20% is a tax/legal judgment the caller makes); RATES_FR_BTP is a reference, not a classifier",
    "autoliquidation (reverse-charge) is NOT a VAT exemption: invoice VAT = 0 + mandatory mention, but the VAT is DUE and self-assessed by the CLIENT — never presented as 'no VAT'",
    "exact integer minor-unit (centimes); VAT = round(net·rate/10000) to the nearest centime; overflow-guarded",
    "breakdown computes VAT per rate on the aggregated base (avoids per-line rounding drift)",
    "fail-closed: negative/non-integer net / rate outside 0..10000 / overflow ⇒ typed refusal; PURE/deterministic; no network/clock/randomness",
  ]),
});

module.exports = { RATES_FR_BTP, computeVat, vatBreakdown, reverseChargeInvoice, FR_VAT_CONTRACT };
export {};
