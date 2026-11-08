#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 23 / WAVE-9 (P14/P1 accessibility — world-research gap) — WCAG 2.2 SC 3.1.1 LANGUAGE-OF-PAGE. PURE,
 * deterministic. World reference: W3C WCAG 2.2 SC 3.1.1 "Language of Page" (Level A) — the default human language
 * must be programmatically determinable via a `lang` attribute on <html>, and its value must conform to BCP 47; W3C
 * ACT rules b5c3f8 (lang present) + bf051a (valid tag); EN 301 549 incorporates WCAG by reference (European
 * Accessibility Act in force 2025-06-28). ODG's seo-page-signal-extractor EXTRACTS the <html lang> signal but NOTHING
 * validates it for conformance (grep-verified: no wcag/3.1.1/bcp-47/language-of-page consumer; seo-technical-audit
 * drops the top-level page lang, auditing only per-hreflang entries). An absent/malformed <html lang> passes ODG's
 * audit silently. This consumes the existing extractor output and emits standard {id,area,severity,detail,remediation,
 * evidence} findings (the seo-technical-audit / sarif path). Fail-closed: absent/unparseable lang is NEVER conformant
 * and NEVER assumed-English. No network/clock/random. Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function isStr(v: any): boolean { return typeof v === "string" && v.length > 0; }
function finding(id: string, area: string, severity: string, detail: string, remediation: string, evidence: string): any {
  return Object.freeze({ id, area, severity, detail, remediation, evidence });
}
// mirrors seo-hreflang-reciprocity.LANG_RE (not exported there): BCP 47 primary subtag (+ optional region/script) or x-default.
const BCP47_RE = /^([a-z]{2,3}(-([a-z]{2,8}|[0-9]{3}))?|x-default)$/i;
function primarySubtag(tag: string): string { return String(tag).split("-")[0].toLowerCase(); }

const VERDICT = Object.freeze(["CONFORMANT", "PARTIAL", "NON_CONFORMANT"]);

/** auditPageLanguage(signals) -> { verdict, lang, findings }. signals = seo-page-signal-extractor output {url,lang,hreflang}. */
function auditPageLanguage(signals: any): any {
  const s = isObj(signals) ? signals : {};
  const lang = s.lang;
  const url = isStr(s.url) ? s.url : "";
  const hreflang = arr(s.hreflang).filter(isObj);
  const findings: any[] = [];

  if (!isStr(lang)) {
    findings.push(finding("wcag:3.1.1:language-of-page", "a11y", "HIGH", "no <html lang> attribute — the default human language is not programmatically determinable (WCAG 2.2 SC 3.1.1, Level A)", "add a valid BCP 47 lang attribute to the <html> element (e.g. lang=\"en\")", `page '${url}' lang absent`));
  } else if (!BCP47_RE.test(lang)) {
    findings.push(finding("wcag:3.1.1:invalid-lang", "a11y", "HIGH", `<html lang="${lang}"> is not a well-formed BCP 47 language tag (WCAG 2.2 SC 3.1.1)`, "use a valid BCP 47 tag (e.g. 'en', 'en-GB', 'fr')", `page '${url}' lang '${lang}'`));
  } else {
    // consistency: a self-referential hreflang entry's primary subtag should match the declared page language.
    const selfRef = hreflang.find((h) => isStr(h.href) && h.href === url && isStr(h.lang) && h.lang.toLowerCase() !== "x-default");
    if (selfRef && primarySubtag(selfRef.lang) !== primarySubtag(lang)) {
      findings.push(finding("lang:hreflang-mismatch", "i18n", "MEDIUM", `declared <html lang="${lang}"> disagrees with the self-referential hreflang '${selfRef.lang}'`, "align the <html lang> primary subtag with the self-referencing hreflang", `page '${url}' lang '${lang}' vs hreflang '${selfRef.lang}'`));
    }
  }

  const high = findings.some((f) => f.severity === "HIGH");
  const medium = findings.some((f) => f.severity === "MEDIUM");
  const verdict = high ? "NON_CONFORMANT" : medium ? "PARTIAL" : "CONFORMANT";
  return Object.freeze({ verdict, lang: isStr(lang) ? lang : null, findings: Object.freeze(findings), note: verdict === "CONFORMANT" ? "a present, BCP 47-valid <html lang> ⇒ SC 3.1.1 PASS" : "SC 3.1.1 not satisfied — absent/invalid lang is never assumed conformant (fail-closed)" });
}

const PAGE_LANGUAGE_DECLARATION_CONTRACT = Object.freeze({
  id: "V124-SEO-PAGE-LANGUAGE-DECLARATION",
  source: "SÉRIE 23/W9 P14/P1 — WCAG 2.2 SC 3.1.1 Language of Page (W3C ACT b5c3f8/bf051a; EN 301 549 / EAA)",
  verdicts: VERDICT,
  reuses: Object.freeze(["seo-page-signal-extractor (source of lang/hreflang)", "seo-hreflang-reciprocity BCP 47 tag shape (mirrored)", "seo-technical-audit {id,area,severity,...} finding shape → sarif path"]),
  notAuthority: "a conformance check over an already-extracted page signal; it fetches nothing and renders nothing",
  invariants: Object.freeze([
    "an absent <html lang> ⇒ HIGH wcag:3.1.1:language-of-page (not programmatically determinable) — never assumed English",
    "a present but non-BCP-47 lang ⇒ HIGH wcag:3.1.1:invalid-lang",
    "a self-referential hreflang disagreeing with the declared lang ⇒ MEDIUM i18n mismatch",
    "CONFORMANT only when lang is present AND BCP 47-valid (fail-closed; absent/unparseable never a silent pass)",
    "pure/deterministic: operates on supplied signals; no network, no clock, no render",
  ]),
});

module.exports = { auditPageLanguage, PAGE_LANGUAGE_DECLARATION_CONTRACT };

if (require.main === module) {
  process.stdout.write(JSON.stringify({ ...PAGE_LANGUAGE_DECLARATION_CONTRACT, demo: { absent: auditPageLanguage({ url: "https://e.com", lang: null }).verdict, ok: auditPageLanguage({ url: "https://e.com", lang: "en" }).verdict } }, null, 2) + "\n");
}

export {};
