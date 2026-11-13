#!/usr/bin/env node
"use strict";
/* V182 §4.1 — language_management. Proves: deny-by-default locale selection; legal/contractual/regulatory never
 * auto-certified; protected tokens preserved; cross-locale consistency flags divergence; human certification gated. */
const L = require("./odg-language-management.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  // ---- locale selection ----
  check("exact locale selected", L.selectLocale("fr-FR").ok === true && L.selectLocale("fr-FR").how === "EXACT");
  check("language fallback when region variant absent", (() => { const r = L.selectLocale("en-CA", ["en-GB", "fr-FR"]); return r.ok && r.locale === "en-GB" && r.how === "LANG_FALLBACK"; })());
  check("deny-by-default: unsupported locale refused, not silently defaulted", L.selectLocale("zz-ZZ").ok === false && L.selectLocale("zz-ZZ").code === "LOCALE_UNSUPPORTED");
  check("empty request refused", L.selectLocale("").ok === false);

  // ---- protected tokens ----
  const toks = L.extractProtectedTokens("Pénalité de 2,5 % par jour, plafond €10 000, livraison 2027-09-01, {name}");
  check("protected tokens captured (percent, currency, date, placeholder)", toks.some((t: string) => /%/.test(t)) && toks.some((t: string) => /€/.test(t)) && toks.some((t: string) => /2027-09-01/.test(t)) && toks.includes("{name}"));

  // ---- human-certification gating ----
  const legal = L.prepareTranslationUnit("Le titulaire supporte une pénalité de 2,5 %", "fr", "en-GB", "contractual");
  check("contractual translation ⇒ NEEDS_HUMAN_CERTIFICATION, not certified", legal.status === "NEEDS_HUMAN_CERTIFICATION" && legal.certified === false && /NOT a legally certified/.test(legal.note));
  const ui = L.prepareTranslationUnit("Save", "en", "fr-FR", "ui");
  check("ui translation ⇒ MACHINE_UNVERIFIED (never auto-certified)", ui.status === "MACHINE_UNVERIFIED" && ui.certified === false);
  check("regulatory + legal are in the human-validation-required set", L.HUMAN_VALIDATION_REQUIRED.includes("regulatory") && L.HUMAN_VALIDATION_REQUIRED.includes("legal"));

  // ---- certification requires a named human ----
  check("certify without a human certifier is refused", L.certify(legal).ok === false);
  check("certify with a named human flips to HUMAN_CERTIFIED", (() => { const c = L.certify(legal, "owner:akabi"); return c.status === "HUMAN_CERTIFIED" && c.certified === true && c.certifiedBy === "owner:akabi"; })());

  // ---- consistency ----
  const good = { "fr-FR": L.prepareTranslationUnit("plafond €10 000", "fr", "fr-FR", "documentation"), "en-GB": L.prepareTranslationUnit("cap €10 000", "fr", "en-GB", "documentation") };
  check("consistent protected tokens across locales ⇒ ok", L.consistencyCheck(good).ok === true);
  const bad = { "fr-FR": L.prepareTranslationUnit("plafond €10 000", "fr", "fr-FR", "documentation"), "en-GB": L.prepareTranslationUnit("cap €9 000", "fr", "en-GB", "documentation") };
  check("divergent protected tokens across locales ⇒ flagged for human review", L.consistencyCheck(bad).ok === false && L.consistencyCheck(bad).divergentLocales.includes("en-GB"));

  // ---- contract + determinism ----
  check("contract: deny-by-default + never auto-certify legal + no parallel system", L.LANGUAGE_MANAGEMENT_CONTRACT.invariants.some((i: string) => /deny-by-default/.test(i)) && L.LANGUAGE_MANAGEMENT_CONTRACT.invariants.some((i: string) => /NEVER auto-certified/.test(i)));
  check("deterministic + frozen", JSON.stringify(L.prepareTranslationUnit("x", "fr", "en-GB", "legal")) === JSON.stringify(L.prepareTranslationUnit("x", "fr", "en-GB", "legal")) && Object.isFrozen(L.SUPPORTED_LOCALES));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — language-management (§4.1: deny-by-default locale selection; legal/contractual/regulatory NEVER auto-certified; protected tokens preserved; cross-locale divergence flagged; human certification gated)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
