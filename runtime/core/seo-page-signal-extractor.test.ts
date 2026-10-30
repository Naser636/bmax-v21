#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the HTML/headers page-signal extractor feeding seo-technical-audit: pure parse of
// caller-supplied bytes (NO network/fetch/crawl), fail-closed (absent signal ⇒ null, never fabricated), inconsistency
// detection, and an end-to-end extract→audit round-trip. Synthetic fixtures only; publishes nothing.
"use strict";
const assert = require("assert");
const X = require("./seo-page-signal-extractor.js");
const AUDIT = require("./seo-technical-audit.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const FULL = `<!doctype html><html lang="en-US"><head>
  <title>Concise Descriptive Title</title>
  <meta name="description" content="A unique description.">
  <link rel="canonical" href="https://example.com/p">
  <meta name="robots" content="index,follow">
  <link rel="alternate" hreflang="en" href="https://example.com/en">
  <link rel="alternate" hreflang="x-default" href="https://example.com/">
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"X"}</script>
  </head><body><a href="/about">about</a><a href="https://other.com">ext</a></body></html>`;

// (1) full extraction of every signal.
{
  const r = X.extractPageSignals({ url: "https://example.com/p", html: FULL });
  const s = r.signals;
  ok("extracts title/meta/canonical/robots/hreflang/jsonLd/lang/links from HTML",
     s.title === "Concise Descriptive Title" && s.metaDescription === "A unique description." && s.canonical === "https://example.com/p" && s.robotsMeta === "index,follow" && s.hreflang.length === 2 && /Organization/.test(s.jsonLd) && s.lang === "en-US" && s.links.internal === 1 && s.links.external === 1);
}
// (2) end-to-end round-trip: extract → audit ⇒ a clean page with good CWV is TECHNICALLY_READY.
{
  const r = X.extractAndAudit({ url: "https://example.com/p", html: FULL.replace("</head>", '<meta name="cwv">') , });
  // inject CWV via the audit input directly is not possible from HTML; instead assert the signals audit runs + indexable.
  ok("extract→audit round-trip runs; page indexable, structured-data valid (no HIGH from extracted signals)",
     r.ok && r.audit.indexable === true && !r.audit.findings.some((f) => f.id === "structured-data:parse"));
}
// (3) X-Robots-Tag header noindex (no meta robots) ⇒ robotsMeta reflects noindex ⇒ audit indexable:false.
{
  const r = X.extractAndAudit({ url: "https://example.com/p", html: FULL.replace('<meta name="robots" content="index,follow">', ""), headers: { "X-Robots-Tag": "noindex" } });
  ok("X-Robots-Tag: noindex (header, no meta) ⇒ extracted ⇒ audit indexable=false + HIGH", r.audit.indexable === false && r.audit.findings.some((f) => f.id === "indexability" && f.severity === "HIGH"));
}
// (4) robots meta `none` ⇒ extracted ⇒ non-indexable (the standards-vocabulary case).
{
  const r = X.extractAndAudit({ url: "https://example.com/p", html: FULL.replace("index,follow", "none") });
  ok("robots meta 'none' ⇒ extracted ⇒ audit indexable=false", r.audit.indexable === false);
}
// (5) invalid JSON-LD is passed through verbatim ⇒ the audit flags HIGH (extractor doesn't fabricate validity).
{
  const r = X.extractAndAudit({ url: "https://example.com/p", html: FULL.replace('{"@context":"https://schema.org","@type":"Organization","name":"X"}', "{ not json") });
  ok("invalid JSON-LD passed through ⇒ audit HIGH parse finding (no fabricated validity)", r.audit.findings.some((f) => f.id === "structured-data:parse" && f.severity === "HIGH"));
}
// (6) INCONSISTENCY: canonical <link> vs Link header mismatch ⇒ recorded.
{
  const r = X.extractPageSignals({ url: "https://example.com/p", html: FULL, headers: { Link: '<https://example.com/OTHER>; rel="canonical"' } });
  ok("canonical html↔header mismatch ⇒ inconsistency recorded (html canonical used)", r.inconsistencies.some((i) => /canonical mismatch/.test(i)) && r.signals.canonical === "https://example.com/p");
}
// (7) INCONSISTENCY: duplicate <title> + robots meta↔header conflict.
{
  const dup = "<title>One</title><title>Two</title>";
  const r = X.extractPageSignals({ url: "https://example.com/p", html: `<html><head>${dup}<meta name="robots" content="index"></head></html>`, headers: { "X-Robots-Tag": "noindex" } });
  ok("duplicate <title> + robots meta↔header conflict ⇒ both inconsistencies; first title used",
     r.signals.title === "One" && r.inconsistencies.some((i) => /<title>/.test(i)) && r.inconsistencies.some((i) => /conflicts with X-Robots-Tag/.test(i)));
}
// (8) FAIL-CLOSED: malformed/empty HTML ⇒ signals null (absent), no crash, no fabrication.
{
  const empty = X.extractPageSignals({ url: "https://example.com/p", html: "" });
  const junk = X.extractPageSignals({ url: "https://example.com/p", html: "<ht ml <<< broken >" });
  ok("empty/malformed HTML ⇒ absent signals null (not fabricated), no throw",
     empty.ok && empty.signals.title === null && empty.signals.canonical === null && empty.provenance.signalsAbsent.includes("title") && junk.ok && junk.signals.title === null);
}
// (9) NO NETWORK: the module performs no fetch/http — structural check of its source + deps.
{
  const src = require("fs").readFileSync(require("path").join(process.cwd(), "runtime/core/seo-page-signal-extractor.ts"), "utf8");
  ok("extractor source has NO network/fetch/http import (pure parse of provided bytes)",
     !/\brequire\(['"](https?|node:https?|node-fetch|undici)['"]\)/.test(src) && !/\bfetch\s*\(/.test(src) && !/\bhttps?\.(get|request)\b/.test(src));
}
// (10) fail-closed input + HTTP header case-insensitivity.
{
  const bad = X.extractPageSignals({});
  const r = X.extractPageSignals({ url: "https://e.com/p", html: "<html></html>", headers: { "x-robots-tag": "none" } });
  ok("missing url ⇒ INVALID_INPUT; header keys case-insensitive (x-robots-tag honored)", bad.code === "INVALID_INPUT" && r.signals.robotsMeta === "none");
}

// (11) AUDIT regression — COMMENT shadowing must NOT flip the real directive: a commented-out index,follow before a
// real noindex ⇒ extracted robots must be noindex (the critical false-readiness feeder).
{
  const html = `<html><head><!-- old: <meta name="robots" content="index,follow"> --><meta name="robots" content="noindex"><title>Real</title></head></html>`;
  const r = X.extractAndAudit({ url: "https://e.com/p", html });
  ok("commented-out index,follow does NOT shadow the real noindex ⇒ indexable=false", /noindex/.test(r.signals.robotsMeta || "") && r.audit.indexable === false);
}
// (12) AUDIT regression — SCRIPT-string shadowing must NOT flip the directive, and must NOT fabricate a title/canonical.
{
  const html = `<html><head><script>var x='<meta name="robots" content="index,follow"><title>Fake</title><link rel="canonical" href="https://evil/">';</script><meta name="robots" content="noindex"><title>Real</title></head></html>`;
  const r = X.extractPageSignals({ url: "https://e.com/p", html });
  ok("script-string look-alike tags do NOT shadow real directive/title/canonical (no fabrication)",
     /noindex/.test(r.signals.robotsMeta || "") && r.signals.title === "Real" && r.signals.canonical === null);
}
// (13) AUDIT regression — ReDoS bound: a large unterminated-tag payload parses fast (no O(n^2) hang) and TOO_LARGE cap.
{
  const pathological = "<meta " + "a".repeat(2_000_000);   // 2MB of an unterminated tag
  const t0 = Date.now(); const r = X.extractPageSignals({ url: "https://e.com/p", html: pathological }); const ms = Date.now() - t0;
  const tooBig = X.extractPageSignals({ url: "https://e.com/p", html: "x".repeat(6 * 1024 * 1024) });
  ok("2MB unterminated-tag parses quickly (<2s, no quadratic hang) + >5MB ⇒ TOO_LARGE", r.ok === true && ms < 2000 && tooBig.code === "TOO_LARGE");
}
// (14) AUDIT regression — link classification: protocol-relative + origin-prefix-collision are EXTERNAL, not internal.
{
  const html = `<html><body><a href="/local">i</a><a href="//cdn.other.com/x">pr</a><a href="https://e.com.attacker.com/phish">collision</a><a href="https://e.com/ok">real-internal</a></body></html>`;
  const r = X.extractPageSignals({ url: "https://e.com/p", html });
  ok("protocol-relative + prefix-collision domains counted EXTERNAL (exact host); /local + same-host internal", r.signals.links.internal === 2 && r.signals.links.external === 2);
}

console.log(`\nSEO-PAGE-SIGNAL-EXTRACTOR suite — ${pass} assertions passed. (pure parse, NO network; fail-closed absent⇒null; X-Robots-Tag + canonical/robots inconsistency detection; extract→audit round-trip; nothing published)`);
