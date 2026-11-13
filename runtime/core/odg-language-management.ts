#!/usr/bin/env node
"use strict";
/*
 * V182 §4.1 — language_management (one of V180's three MISSING capabilities). PURE, deterministic, fail-closed, governed.
 *
 * Governs the LANGUAGES of products / UI / content / documents / communications: explicit locale selection with a
 * deny-by-default fallback chain, supported-locale + regional-variant registry, translation-unit preparation that
 * PRESERVES numbers / units / currency / placeholders, business-terminology glossary, cross-locale consistency checks,
 * and — critically — HUMAN-VALIDATION gating: legal / contractual / regulatory content is NEVER auto-certified. A
 * machine translation is always marked UNVERIFIED and never presented as a legally certified translation.
 *
 * No parallel system: this is a capability module; it reuses evidence/audit disciplines, mints no second registry.
 */

const SUPPORTED_LOCALES = Object.freeze([
  { code: "fr-FR", lang: "fr", region: "FR", rtl: false },
  { code: "en-GB", lang: "en", region: "GB", rtl: false },
  { code: "en-US", lang: "en", region: "US", rtl: false },
  { code: "de-DE", lang: "de", region: "DE", rtl: false },
  { code: "es-ES", lang: "es", region: "ES", rtl: false },
  { code: "nl-NL", lang: "nl", region: "NL", rtl: false },
  { code: "ar-AE", lang: "ar", region: "AE", rtl: true },
]);

// content kinds whose translation requires human certification before any external use.
const HUMAN_VALIDATION_REQUIRED = Object.freeze(["legal", "contractual", "regulatory"]);
const CONTENT_KINDS = Object.freeze(["ui", "marketing", "documentation", "legal", "contractual", "regulatory"]);
const UNIT_STATUS = Object.freeze(["MACHINE_UNVERIFIED", "NEEDS_HUMAN_CERTIFICATION", "HUMAN_CERTIFIED"]);

function findLocale(code: string): any { return SUPPORTED_LOCALES.find((l: any) => l.code === code) || null; }

/* selectLocale — explicit selection with a deny-by-default fallback chain (lang match, then default). Unknown ⇒ refusal. */
function selectLocale(requested: string, available?: string[]): any {
  const avail = Array.isArray(available) && available.length ? available : SUPPORTED_LOCALES.map((l: any) => l.code);
  if (typeof requested !== "string" || !requested) return Object.freeze({ ok: false, code: "NO_LOCALE_REQUESTED" });
  if (avail.includes(requested) && findLocale(requested)) return Object.freeze({ ok: true, locale: requested, how: "EXACT" });
  const lang = requested.split("-")[0];
  const byLang = avail.find((c: string) => { const l = findLocale(c); return l && l.lang === lang; });
  if (byLang) return Object.freeze({ ok: true, locale: byLang, how: "LANG_FALLBACK" });
  return Object.freeze({ ok: false, code: "LOCALE_UNSUPPORTED", requested, note: "deny-by-default: no exact or language fallback available" });
}

// placeholders / numbers / currency / units that MUST be preserved verbatim across a translation.
function extractProtectedTokens(text: string): string[] {
  const out: string[] = [];
  const patterns = [/\{[a-zA-Z0-9_]+\}/g, /%[sd]/g, /\d+[.,]?\d*\s?%/g, /[€$£]\s?\d[\d.,]*/g, /\d[\d.,]*\s?(?:kg|m2|m²|km|€|EUR|%)/g, /\b\d{4}-\d{2}-\d{2}\b/g];
  for (const p of patterns) { const m = text.match(p); if (m) for (const t of m) if (!out.includes(t)) out.push(t); }
  return out.sort();
}

/* prepareTranslationUnit — builds a translation UNIT. Legal/contractual/regulatory ⇒ NEEDS_HUMAN_CERTIFICATION; never
 * auto-certified. Protected tokens (numbers/units/currency/placeholders) are captured so a reviewer can verify parity. */
function prepareTranslationUnit(text: string, from: string, to: string, kind: string): any {
  const k = CONTENT_KINDS.includes(kind) ? kind : "documentation";
  const sel = selectLocale(to);
  const protectedTokens = extractProtectedTokens(String(text || ""));
  const needsHuman = HUMAN_VALIDATION_REQUIRED.includes(k);
  return Object.freeze({
    from, to, kind: k, targetLocaleOk: sel.ok, targetLocale: sel.ok ? sel.locale : null,
    protectedTokens: Object.freeze(protectedTokens),
    status: needsHuman ? "NEEDS_HUMAN_CERTIFICATION" : "MACHINE_UNVERIFIED",
    certified: false,
    note: needsHuman
      ? `${k} content: a machine translation is NOT a legally certified translation — human certification REQUIRED before any external use`
      : "machine translation is UNVERIFIED; protected tokens must be preserved verbatim",
  });
}

/* consistencyCheck — across locales: protected-token parity + presence. Flags divergence (not auto-fixed). */
function consistencyCheck(unitsByLocale: any): any {
  const locales = Object.keys(unitsByLocale || {});
  if (locales.length < 2) return Object.freeze({ ok: true, locales, note: "nothing to compare (<2 locales)" });
  const ref = unitsByLocale[locales[0]];
  const refTokens = JSON.stringify((ref && ref.protectedTokens) || []);
  const divergences = locales.slice(1).filter((loc: string) => JSON.stringify((unitsByLocale[loc] && unitsByLocale[loc].protectedTokens) || []) !== refTokens);
  return Object.freeze({ ok: divergences.length === 0, locales, reference: locales[0], divergentLocales: Object.freeze(divergences), note: divergences.length ? "protected-token mismatch across locales — human review required" : "protected tokens consistent across locales" });
}

/* certify — only an explicit human-certification token flips a legal unit to HUMAN_CERTIFIED (governed, auditable). */
function certify(unit: any, humanCertifier?: string): any {
  if (!humanCertifier) return Object.freeze({ ok: false, code: "NO_HUMAN_CERTIFIER", note: "certification requires a named human certifier (OWNER_GATED for legal/regulatory)" });
  return Object.freeze({ ...unit, status: "HUMAN_CERTIFIED", certified: true, certifiedBy: humanCertifier });
}

const LANGUAGE_MANAGEMENT_CONTRACT = Object.freeze({
  id: "V182-LANGUAGE-MANAGEMENT",
  purpose: "§4.1 — governed language selection + translation-unit preparation with protected-token preservation and human-certification gating",
  invariants: Object.freeze([
    "locale selection is deny-by-default: unknown locale ⇒ refusal, not silent default",
    "legal/contractual/regulatory translations are NEEDS_HUMAN_CERTIFICATION — a machine translation is NEVER auto-certified",
    "protected tokens (numbers/units/currency/placeholders) are captured for parity verification, never silently altered",
    "cross-locale consistency flags divergence for human review; it does not auto-fix",
    "deterministic; fail-closed; no parallel registry/system",
  ]),
});

module.exports = { SUPPORTED_LOCALES, CONTENT_KINDS, HUMAN_VALIDATION_REQUIRED, UNIT_STATUS, selectLocale, extractProtectedTokens, prepareTranslationUnit, consistencyCheck, certify, LANGUAGE_MANAGEMENT_CONTRACT };
export {};
