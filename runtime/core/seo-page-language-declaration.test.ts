#!/usr/bin/env node
"use strict";
const assert = require("assert");
const L = require("./seo-page-language-declaration");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 23/W9 — WCAG 3.1.1 PAGE LANGUAGE");
// absent lang ⇒ HIGH NON_CONFORMANT.
{
  const r = L.auditPageLanguage({ url: "https://e.com/p", lang: null });
  check(r.verdict === "NON_CONFORMANT" && r.findings.some((f: any) => f.id === "wcag:3.1.1:language-of-page"), "absent lang ⇒ NON_CONFORMANT (SC 3.1.1)");
}
// valid lang ⇒ CONFORMANT.
check(L.auditPageLanguage({ url: "https://e.com/p", lang: "en" }).verdict === "CONFORMANT", "valid 'en' ⇒ CONFORMANT");
check(L.auditPageLanguage({ url: "https://e.com/p", lang: "en-GB" }).verdict === "CONFORMANT", "valid 'en-GB' ⇒ CONFORMANT");
// malformed lang ⇒ HIGH invalid-lang.
{
  const r = L.auditPageLanguage({ url: "https://e.com/p", lang: "english!" });
  check(r.verdict === "NON_CONFORMANT" && r.findings.some((f: any) => f.id === "wcag:3.1.1:invalid-lang"), "malformed lang ⇒ invalid-lang");
}
// self-ref hreflang mismatch ⇒ MEDIUM PARTIAL.
{
  const r = L.auditPageLanguage({ url: "https://e.com/p", lang: "en", hreflang: [{ lang: "fr", href: "https://e.com/p" }] });
  check(r.verdict === "PARTIAL" && r.findings.some((f: any) => f.id === "lang:hreflang-mismatch"), "lang vs self-ref hreflang mismatch ⇒ PARTIAL");
}
// matching self-ref hreflang ⇒ CONFORMANT.
check(L.auditPageLanguage({ url: "https://e.com/p", lang: "en-GB", hreflang: [{ lang: "en", href: "https://e.com/p" }] }).verdict === "CONFORMANT", "matching primary subtag ⇒ CONFORMANT");
check(L.PAGE_LANGUAGE_DECLARATION_CONTRACT.invariants.some((i: any) => /never assumed English/.test(i)), "contract: never assumed English");
console.log(failures === 0 ? "ALL PASS — SÉRIE 23/W9 WCAG PAGE LANGUAGE" : "FAILURES: " + failures);
process.exit(failures === 0 ? 0 : 1);
export {};
