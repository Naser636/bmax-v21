#!/usr/bin/env node
"use strict";
/*
 * V319 §7 — BTP client intake + multilingual estimate CORE (first product slice). PURE, deterministic, fail-closed,
 * in-memory. Composes EXISTING engines — builds NO parallel i18n or finance engine:
 *   - odg-language-management  → locale resolution + RTL (fr-FR / ar-AE RTL / en-GB / en-US / es-ES).
 *   - chantier-profitability   → canonical finance view (SELLING ≠ COST ≠ NET, single-currency, integer minor units).
 *
 * It turns a client's STRUCTURED chantier line items + chosen locale into a LOCALIZED pre-contractual estimate with
 * explicit units/assumptions/uncertainty. FAIL-CLOSED: any line missing a sourced price ⇒ the estimate is withheld
 * as INCOMPLETE (a price is NEVER invented). Every result requires human confirmation before any contractual
 * commitment. Only FIXED UI field labels are localized here — client free-text / technical terms are preserved
 * (no machine translation of content). No network, no clock, no randomness.
 */
const LANG = require("./odg-language-management.js");
const CHANTIER = require("./chantier-profitability.js");

// §7 mandatory product locales: French, Arabic (RTL), English, Spanish.
const PRODUCT_LOCALES = Object.freeze(["fr-FR", "ar-AE", "en-GB", "en-US", "es-ES"]);

// FIXED UI field labels only (NOT client content). Kept minimal + reviewable; technical BTP terms stay as-is.
const LABELS: Record<string, Record<string, string>> = Object.freeze({
  fr: Object.freeze({ estimate: "Devis estimatif", selling: "Prix de vente", cost: "Déboursé", total: "Total", qty: "Quantité", unit: "Unité", confirm: "À confirmer avant engagement", incomplete: "Estimation incomplète (prix manquant)" }),
  ar: Object.freeze({ estimate: "تقدير الأسعار", selling: "سعر البيع", cost: "التكلفة", total: "الإجمالي", qty: "الكمية", unit: "الوحدة", confirm: "يتطلب تأكيداً قبل الالتزام", incomplete: "تقدير غير مكتمل (سعر مفقود)" }),
  en: Object.freeze({ estimate: "Cost estimate", selling: "Selling price", cost: "Cost", total: "Total", qty: "Quantity", unit: "Unit", confirm: "Confirm before commitment", incomplete: "Incomplete estimate (missing price)" }),
  es: Object.freeze({ estimate: "Presupuesto estimado", selling: "Precio de venta", cost: "Coste", total: "Total", qty: "Cantidad", unit: "Unidad", confirm: "Confirmar antes del compromiso", incomplete: "Estimación incompleta (precio faltante)" }),
});

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function isNonNegInt(v: any): boolean { return typeof v === "number" && Number.isSafeInteger(v) && v >= 0; }
function freeze(o: any): any { return Object.freeze(o); }

/** Locale-aware money formatting (deterministic given the locale; ICU-based). Fail-safe fallback, never throws. */
function fmtMoney(minor: number, currency: string, localeCode: string): string {
  try { return new Intl.NumberFormat(localeCode, { style: "currency", currency }).format(minor / 100); }
  catch { return (minor / 100).toFixed(2) + " " + currency; }
}

/**
 * intakeEstimate(input) -> frozen localized estimate.
 * input = { chantierId, localeCode, currency?, lineItems:[{ ref?, label?, qty, unit?, sellUnitPriceMinor?, costUnitPriceMinor?, priceSource? }] }
 * Fail-closed: unsupported locale / no id / no lines ⇒ ok:false; any line lacking qty+sellUnitPriceMinor+priceSource ⇒ estimate INCOMPLETE (withheld).
 */
function intakeEstimate(input: any): any {
  const i = isObj(input) ? input : {};
  const sel = LANG.selectLocale(i.localeCode, PRODUCT_LOCALES as any);
  if (!sel.ok) return freeze({ ok: false, code: "UNSUPPORTED_LOCALE", requested: isStr(i.localeCode) ? i.localeCode : null, supported: PRODUCT_LOCALES });
  const loc = LANG.SUPPORTED_LOCALES.find((l: any) => l.code === sel.locale);
  const lang = loc.lang; const rtl = loc.rtl === true; const L = LABELS[lang] || LABELS.en;
  const currency = isStr(i.currency) ? i.currency : "EUR";
  const chantierId = isStr(i.chantierId) ? i.chantierId : null;
  if (!chantierId) return freeze({ ok: false, code: "NO_CHANTIER_ID" });
  const rawLines = Array.isArray(i.lineItems) ? i.lineItems.filter(isObj) : [];
  if (!rawLines.length) return freeze({ ok: false, code: "NO_LINE_ITEMS" });

  let sellingMinor = 0, costMinor = 0, anyIncomplete = false;
  const lines = rawLines.map((r: any, idx: number) => {
    const qty = isNonNegInt(r.qty) ? r.qty : null;
    const hasSourcedPrice = isNonNegInt(r.sellUnitPriceMinor) && isStr(r.priceSource); // fail-closed: price AND its source
    const complete = qty !== null && hasSourcedPrice;
    if (!complete) anyIncomplete = true;
    const lineSelling = complete ? qty * r.sellUnitPriceMinor : null;
    const lineCost = qty !== null && isNonNegInt(r.costUnitPriceMinor) ? qty * r.costUnitPriceMinor : null;
    if (lineSelling !== null) sellingMinor += lineSelling;
    if (lineCost !== null) costMinor += lineCost;
    const missing = complete ? null : qty === null ? "qty" : !isNonNegInt(r.sellUnitPriceMinor) ? "sellUnitPriceMinor" : "priceSource";
    return freeze({ ref: isStr(r.ref) ? r.ref : "L" + (idx + 1), label: isStr(r.label) ? r.label : null, qty, unit: isStr(r.unit) ? r.unit : null,
      priceSource: isStr(r.priceSource) ? r.priceSource : null, status: complete ? "PRICED" : "INCOMPLETE",
      sellingMinor: lineSelling, sellingDisplay: lineSelling !== null ? fmtMoney(lineSelling, currency, sel.locale) : null, missing });
  });

  const status = anyIncomplete ? "INCOMPLETE" : "COMPLETE";
  // Canonical finance view via the EXISTING engine — ONLY when complete (an incomplete estimate is never totalled as certain).
  // Pre-contractual: SELLING estimate ⇒ devisInitialMinor; summed cost ⇒ costBudgetMinor. The engine keeps SELLING≠COST≠NET.
  let finance: any = null;
  if (status === "COMPLETE") {
    const r = CHANTIER.computeChantier({ id: chantierId, currency, quote: { devisInitialMinor: sellingMinor }, costBudgetMinor: costMinor > 0 ? costMinor : null });
    finance = r && r.ok ? r.finance : null;
  }

  return freeze({
    ok: true,
    locale: freeze({ code: sel.locale, lang, rtl, dir: rtl ? "rtl" : "ltr", how: sel.how }),
    chantierId, currency,
    estimate: freeze({ status, label: L.estimate,
      sellingMinor: status === "COMPLETE" ? sellingMinor : null,
      sellingDisplay: status === "COMPLETE" ? fmtMoney(sellingMinor, currency, sel.locale) : null,
      costMinor: status === "COMPLETE" && costMinor > 0 ? costMinor : null,
      incompleteLabel: status === "INCOMPLETE" ? L.incomplete : null }),
    lines: freeze(lines),
    finance,                              // canonical SELLING≠COST≠NET view (null when incomplete)
    labels: L,
    requiresHumanConfirmation: true, confirmLabel: L.confirm,
    assumptions: freeze(["prices are caller-supplied WITH a priceSource; none are invented", "estimate is PRE-CONTRACTUAL", `single currency ${currency} (no implicit FX)`]),
    uncertainty: status === "INCOMPLETE" ? "estimate WITHHELD: one or more lines lack a sourced price" : "this is an ESTIMATE, not a measured or contracted amount",
    invariants: freeze({ sellingNeqCostNeqNet: true, noFabricatedPrice: true, humanConfirmBeforeCommit: true, technicalTermsPreserved: true }),
  });
}

const BTP_CLIENT_INTAKE_CONTRACT = Object.freeze({
  id: "V319-BTP-CLIENT-INTAKE",
  purpose: "§7 first product slice — multilingual (FR/AR-RTL/EN/ES) pre-contractual chantier estimate core, fail-closed on unsourced prices",
  reuses: Object.freeze(["odg-language-management (locale + RTL)", "chantier-profitability (SELLING≠COST≠NET finance)"]),
  invariants: Object.freeze([
    "PURE + deterministic + in-memory; no network/clock/randomness; builds no parallel i18n/finance engine",
    "FAIL-CLOSED: a line without qty + sellUnitPriceMinor + priceSource ⇒ estimate INCOMPLETE (withheld) — a price is NEVER invented",
    "SELLING ≠ COST ≠ NET (delegated to chantier-profitability); an incomplete estimate is never totalled as certain",
    "requiresHumanConfirmation is ALWAYS true — no auto-commitment to orders/quotes/payments",
    "only FIXED UI labels are localized; client free-text + technical BTP terms are preserved (no content machine-translation)",
    "unsupported locale / missing chantierId / no line items ⇒ fail-closed ok:false",
  ]),
});

module.exports = { PRODUCT_LOCALES, LABELS, intakeEstimate, BTP_CLIENT_INTAKE_CONTRACT };
export {};
