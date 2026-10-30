#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the §8 multi-page hreflang reciprocity audit: Google's bidirectional requirement
// (HIGH only when PROVABLY missing a return link among SUPPLIED pages), self-reference (MEDIUM), code format, conflicts,
// and fail-closed honesty (a target NOT in the set is 'unverifiable' — never assumed broken/reciprocal). PURE, NO network.
// Synthetic fixtures only; publishes nothing.
"use strict";
const assert = require("assert");
const H = require("./seo-hreflang-reciprocity.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// (1) fully reciprocal cluster (each self-refs + links the other) ⇒ RECIPROCAL, no finding.
{
  const pages = [
    { url: "https://e.com/en", hreflang: [{ lang: "en", href: "https://e.com/en" }, { lang: "fr", href: "https://e.com/fr" }] },
    { url: "https://e.com/fr", hreflang: [{ lang: "fr", href: "https://e.com/fr" }, { lang: "en", href: "https://e.com/en" }] },
  ];
  const r = H.auditHreflangReciprocity({ pages });
  ok("reciprocal cluster ⇒ RECIPROCAL, 0 findings, brokenReciprocal 0", r.verdict === "RECIPROCAL" && r.findings.length === 0 && r.summary.brokenReciprocal === 0);
}
// (2) PROVABLE non-reciprocity: /fr is in the set but does NOT link back to /en ⇒ HIGH.
{
  const pages = [
    { url: "https://e.com/en", hreflang: [{ lang: "en", href: "https://e.com/en" }, { lang: "fr", href: "https://e.com/fr" }] },
    { url: "https://e.com/fr", hreflang: [{ lang: "fr", href: "https://e.com/fr" }] },
  ];
  const r = H.auditHreflangReciprocity({ pages });
  ok("target in set lacks return link ⇒ HIGH non-reciprocal, RECIPROCITY_BROKEN, brokenReciprocal 1",
     r.verdict === "RECIPROCITY_BROKEN" && r.summary.brokenReciprocal === 1 && r.findings.some((f) => f.id === "hreflang:non-reciprocal" && f.severity === "HIGH"));
}
// (3) FAIL-CLOSED honesty: target NOT in the supplied set ⇒ unverifiable (LOW), NOT counted as broken.
{
  const pages = [{ url: "https://e.com/en", hreflang: [{ lang: "en", href: "https://e.com/en" }, { lang: "fr", href: "https://e.com/fr" }] }];
  const r = H.auditHreflangReciprocity({ pages });
  ok("target not supplied ⇒ unverifiable LOW, brokenReciprocal 0 (not assumed broken), unverifiableTargets 1",
     r.summary.brokenReciprocal === 0 && r.summary.unverifiableTargets === 1 && r.findings.some((f) => f.id === "hreflang:unverifiable-target" && f.severity === "LOW"));
}
// (4) missing self-reference ⇒ MEDIUM.
{
  const pages = [
    { url: "https://e.com/en", hreflang: [{ lang: "fr", href: "https://e.com/fr" }] },   // no self entry
    { url: "https://e.com/fr", hreflang: [{ lang: "en", href: "https://e.com/en" }, { lang: "fr", href: "https://e.com/fr" }] },
  ];
  const r = H.auditHreflangReciprocity({ pages });
  ok("page without a self-referential hreflang ⇒ MEDIUM self-reference finding", r.summary.missingSelfReference >= 1 && r.findings.some((f) => f.id === "hreflang:self-reference" && f.severity === "MEDIUM"));
}
// (5) malformed language code + missing href ⇒ MEDIUM each.
{
  const pages = [{ url: "https://e.com/a", hreflang: [{ lang: "english!!", href: "https://e.com/a" }, { lang: "de", href: "" }] }];
  const r = H.auditHreflangReciprocity({ pages });
  ok("malformed code ⇒ hreflang:format; empty href ⇒ hreflang:href", r.findings.some((f) => f.id === "hreflang:format") && r.findings.some((f) => f.id === "hreflang:href"));
}
// (6) same lang declared twice pointing to DIFFERENT urls ⇒ conflict MEDIUM.
{
  const pages = [{ url: "https://e.com/a", hreflang: [{ lang: "en", href: "https://e.com/a" }, { lang: "en", href: "https://e.com/b" }] }];
  const r = H.auditHreflangReciprocity({ pages });
  ok("duplicate lang to different URLs ⇒ MEDIUM conflict", r.summary.conflicts === 1 && r.findings.some((f) => f.id === "hreflang:conflict"));
}
// (7) x-default is exempt from the strict return-link rule (no HIGH from an x-default that isn't reciprocated).
{
  const pages = [
    { url: "https://e.com/en", hreflang: [{ lang: "en", href: "https://e.com/en" }, { lang: "x-default", href: "https://e.com/" }] },
    { url: "https://e.com/", hreflang: [{ lang: "en", href: "https://e.com/en" }] },   // does not list x-default back
  ];
  const r = H.auditHreflangReciprocity({ pages });
  ok("x-default not reciprocated ⇒ NO HIGH non-reciprocal from the x-default entry", !r.findings.some((f) => f.id === "hreflang:non-reciprocal" && /x-default/.test(f.evidence)));
}
// (8) query-order-insensitive URL matching: return link with reordered query params still counts as reciprocal.
{
  const pages = [
    { url: "https://e.com/p?a=1&b=2", hreflang: [{ lang: "en", href: "https://e.com/p?a=1&b=2" }, { lang: "fr", href: "https://e.com/q" }] },
    { url: "https://e.com/q", hreflang: [{ lang: "fr", href: "https://e.com/q" }, { lang: "en", href: "https://e.com/p?b=2&a=1" }] },
  ];
  const r = H.auditHreflangReciprocity({ pages });
  ok("reciprocity matches despite query-param reorder (no false non-reciprocal)", r.summary.brokenReciprocal === 0 && !r.findings.some((f) => f.id === "hreflang:non-reciprocal"));
}
// (9) input validation + NO_HREFLANG.
{
  const bad = H.auditHreflangReciprocity({});
  const none = H.auditHreflangReciprocity({ pages: [{ url: "https://e.com/a" }, { url: "https://e.com/b" }] });
  ok("missing pages ⇒ INVALID_INPUT; pages w/o hreflang ⇒ NO_HREFLANG (honest, not RECIPROCAL)",
     bad.ok === false && bad.code === "INVALID_INPUT" && none.ok === true && none.verdict === "NO_HREFLANG");
}
// (10) NO NETWORK structural check.
{
  const src = require("fs").readFileSync(require("path").join(process.cwd(), "runtime/core/seo-hreflang-reciprocity.ts"), "utf8");
  ok("source has NO network/fetch/http (pure cross-check of supplied signals)",
     !/\brequire\(['"](https?|node:https?|node-fetch|undici)['"]\)/.test(src) && !/\bfetch\s*\(/.test(src) && !/\bhttps?\.(get|request)\b/.test(src));
}

// (11) AUDIT regression (F1 trailing-slash) — false-negative: target /fr/ IS in the set and does NOT link back ⇒ HIGH
// (must NOT be downgraded to 'unverifiable' by a /fr vs /fr/ key mismatch).
{
  const pages = [
    { url: "https://e.com/en", hreflang: [{ lang: "en", href: "https://e.com/en" }, { lang: "fr", href: "https://e.com/fr" }] },
    { url: "https://e.com/fr/", hreflang: [{ lang: "fr", href: "https://e.com/fr/" }] },
  ];
  const r = H.auditHreflangReciprocity({ pages });
  ok("trailing-slash target in set, no return ⇒ HIGH non-reciprocal (NOT masked as unverifiable)",
     r.summary.brokenReciprocal === 1 && r.summary.unverifiableTargets === 0 && r.findings.some((f) => f.id === "hreflang:non-reciprocal" && f.severity === "HIGH"));
}
// (12) AUDIT regression (F1 trailing-slash) — false-positive: a genuinely reciprocal cluster using a slash variant on
// the return href is NOT flagged broken.
{
  const pages = [
    { url: "https://e.com/en", hreflang: [{ lang: "en", href: "https://e.com/en" }, { lang: "fr", href: "https://e.com/fr" }] },
    { url: "https://e.com/fr", hreflang: [{ lang: "fr", href: "https://e.com/fr" }, { lang: "en", href: "https://e.com/en/" }] },
  ];
  const r = H.auditHreflangReciprocity({ pages });
  ok("slash-variant return href ⇒ still reciprocal (no false non-reciprocal)", r.summary.brokenReciprocal === 0 && r.verdict === "RECIPROCAL");
}
// (13) AUDIT regression (F2 numeric region) — es-419 (UN M49) is a VALID code ⇒ no format finding.
{
  const valid = H.auditHreflangReciprocity({ pages: [{ url: "https://e.com/es-419", hreflang: [{ lang: "es-419", href: "https://e.com/es-419" }, { lang: "zh-Hant", href: "https://e.com/es-419" }] }] });
  const invalid = H.auditHreflangReciprocity({ pages: [{ url: "https://e.com/a", hreflang: [{ lang: "en--GB", href: "https://e.com/a" }] }] });
  ok("es-419 + zh-Hant accepted (no format finding); en--GB still rejected",
     !valid.findings.some((f) => f.id === "hreflang:format") && invalid.findings.some((f) => f.id === "hreflang:format"));
}
// (14) AUDIT regression (minor, case-insensitive conflict key) — 'EN' vs 'en' to different URLs ⇒ conflict detected.
{
  const r = H.auditHreflangReciprocity({ pages: [{ url: "https://e.com/a", hreflang: [{ lang: "EN", href: "https://e.com/a" }, { lang: "en", href: "https://e.com/b" }] }] });
  ok("case-differing same lang to different URLs ⇒ conflict (case-insensitive key)", r.summary.conflicts === 1 && r.findings.some((f) => f.id === "hreflang:conflict"));
}

console.log(`\nSEO-HREFLANG-RECIPROCITY suite — ${pass} assertions passed. (bidirectional return-link requirement: HIGH only on PROVABLE missing return among supplied pages; self-reference/format/conflict; x-default exempt; fail-closed unverifiable targets; pure, NO network)`);
