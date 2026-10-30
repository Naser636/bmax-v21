#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the §8 JSON-LD structured-data validator (closes seo-technical-audit's KNOWN_GAP):
// grounded REQUIRED-property checks for BreadcrumbList/FAQPage/Product (Google rich-results, verified 2026-10-30);
// Article = known-no-required (never invents a required finding); unknown @type = structural-only (not pass/fail-faked);
// @graph flattening; fail-closed on invalid JSON. PURE, NO network. Synthetic fixtures only; publishes nothing.
"use strict";
const assert = require("assert");
const V = require("./seo-structured-data-validator.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// (1) valid BreadcrumbList ⇒ VALID, no HIGH.
{
  const j = JSON.stringify({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: "https://e.com/" }, { "@type": "ListItem", position: 2, name: "Page" }] });
  const r = V.validateStructuredData(j);
  ok("valid BreadcrumbList ⇒ VALID, 0 HIGH, block validated", r.verdict === "VALID" && !r.findings.some((f) => f.severity === "HIGH") && r.blocks[0].validated === true);
}
// (2) BreadcrumbList missing position (integer) + missing name ⇒ HIGH required findings.
{
  const j = JSON.stringify({ "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", item: "https://e.com/a" }] });
  const r = V.validateStructuredData(j);
  ok("ListItem missing integer position + name ⇒ HIGH required + INVALID",
     r.verdict === "INVALID" && r.findings.some((f) => f.id === "breadcrumblist:required" && /position/.test(f.detail)) && r.findings.some((f) => /name/.test(f.detail)));
}
// (3) FAQPage: Question missing acceptedAnswer.text ⇒ HIGH.
{
  const j = JSON.stringify({ "@type": "FAQPage", mainEntity: [{ "@type": "Question", name: "Q?", acceptedAnswer: { "@type": "Answer" } }] });
  const r = V.validateStructuredData(j);
  ok("FAQPage Question with answer lacking text ⇒ HIGH required (acceptedAnswer.text)", r.verdict === "INVALID" && r.findings.some((f) => f.id === "faqpage:required" && /acceptedAnswer requires text/.test(f.detail)) && r.blocks[0].requiredMissing.includes("mainEntity[0].acceptedAnswer.text"));
}
// (4) valid FAQPage ⇒ VALID.
{
  const j = JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [{ "@type": "Question", name: "Q?", acceptedAnswer: { "@type": "Answer", text: "A." } }] });
  ok("valid FAQPage ⇒ VALID", V.validateStructuredData(j).verdict === "VALID");
}
// (5) Product: name but none of offers/review/aggregateRating ⇒ HIGH; with offers ⇒ VALID.
{
  const bad = V.validateStructuredData(JSON.stringify({ "@type": "Product", name: "Widget" }));
  const good = V.validateStructuredData(JSON.stringify({ "@type": "Product", name: "Widget", offers: { "@type": "Offer", price: "9.99" } }));
  ok("Product w/o offers|review|aggregateRating ⇒ HIGH; with offers ⇒ VALID",
     bad.verdict === "INVALID" && bad.findings.some((f) => f.id === "product:required") && bad.blocks[0].requiredMissing.includes("offers|review|aggregateRating") && good.verdict === "VALID");
}
// (6) HONESTY: Article is known-no-required ⇒ NEVER a HIGH required finding (only LOW recommended).
{
  const r = V.validateStructuredData(JSON.stringify({ "@context": "https://schema.org", "@type": "Article" }));
  ok("Article (no required props) ⇒ no HIGH required finding; recommended noted as LOW only",
     !r.findings.some((f) => f.severity === "HIGH") && r.findings.some((f) => f.id === "article:recommended" && f.severity === "LOW") && r.blocks[0].validated === true);
}
// (7) HONESTY: unknown @type ⇒ 'type-not-validated' INFO, NOT pass/fail-fabricated; verdict not INVALID from it.
{
  const r = V.validateStructuredData(JSON.stringify({ "@context": "https://schema.org", "@type": "SpecialThing", foo: 1 }));
  ok("unknown @type ⇒ INFO type-not-validated, not validated, no HIGH",
     r.findings.some((f) => f.id === "block[0]:type-not-validated" && f.severity === "INFO") && r.blocks[0].validated === false && !r.findings.some((f) => f.severity === "HIGH"));
}
// (8) @graph flattening: a wrapper with @graph is unwrapped and each node validated.
{
  const j = JSON.stringify({ "@context": "https://schema.org", "@graph": [{ "@type": "Product", name: "W", offers: {} }, { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "H", item: "https://e.com/" }] }] });
  const r = V.validateStructuredData(j);
  ok("@graph unwrapped ⇒ 2 blocks validated (Product + BreadcrumbList)", r.blocks.length === 2 && r.summary.validatedBlocks === 2);
}
// (9) array of blocks + @type as array (multi-type) ⇒ primary type used.
{
  const j = JSON.stringify([{ "@type": ["Product", "IndividualProduct"], name: "W", review: {} }]);
  const r = V.validateStructuredData(j);
  ok("array input + multi-@type ⇒ primary (Product) validated, VALID", r.blocks[0].type === "Product" && r.verdict === "VALID");
}
// (10) FAIL-CLOSED: invalid JSON / empty / oversize / block without @type.
{
  const badJson = V.validateStructuredData("{ not json");
  const empty = V.validateStructuredData("   ");
  const big = V.validateStructuredData("x".repeat(3 * 1024 * 1024));
  const noType = V.validateStructuredData(JSON.stringify({ name: "x" }));
  ok("invalid JSON ⇒ INVALID_JSON; empty ⇒ EMPTY; >2MB ⇒ TOO_LARGE; block w/o @type ⇒ MEDIUM type finding",
     badJson.code === "INVALID_JSON" && empty.code === "EMPTY" && big.code === "TOO_LARGE" && noType.ok === true && noType.findings.some((f) => f.id === "block[0]:type"));
}
// (11) @context not schema.org ⇒ LOW; NO ranking/rich-result guarantee claim.
{
  const r = V.validateStructuredData(JSON.stringify({ "@context": "https://example.org", "@type": "Product", name: "W", offers: {} }));
  const s = JSON.stringify(r);
  ok("non-schema.org @context ⇒ LOW; no rich-result/ranking guarantee wording",
     r.findings.some((f) => f.id === "block[0]:context" && f.severity === "LOW") && /NOT a guarantee of rich-result eligibility/.test(JSON.stringify(r.limitations)) && !/guaranteed (ranking|rich result)/i.test(s));
}
// (12) NO NETWORK structural check.
{
  const src = require("fs").readFileSync(require("path").join(process.cwd(), "runtime/core/seo-structured-data-validator.ts"), "utf8");
  ok("source has NO network/fetch/http (pure validation of supplied JSON-LD)",
     !/\brequire\(['"](https?|node:https?|node-fetch|undici)['"]\)/.test(src) && !/\bfetch\s*\(/.test(src) && !/\bhttps?\.(get|request)\b/.test(src));
}

// (13) AUDIT regression (F1 false-VALID): a grounded type listed SECOND in a multi-@type array is still validated.
{
  const data = [
    { "@context": "https://schema.org", "@type": "Article", headline: "H", image: "i.jpg", datePublished: "2026-01-01", author: "A" },
    { "@type": ["Thing", "Product"], name: "Widget" },   // Product missing offers|review|aggregateRating ⇒ invalid
  ];
  const r = V.validateStructuredData(JSON.stringify(data));
  const pBlock = r.blocks.find((b) => b.type === "Product");
  ok("Product listed 2nd in @type array ⇒ validated ⇒ HIGH product:required + overall INVALID (no false VALID)",
     r.verdict === "INVALID" && r.findings.some((f) => f.id === "product:required") && pBlock && pBlock.validated === true);
}
// (14) AUDIT regression (F2 crash) + (F3 bound): circular object input ⇒ structured error (no throw); oversize object ⇒ TOO_LARGE.
{
  const ctx = {}; ctx.self = ctx;
  let threw = false, circ;
  try { circ = V.validateStructuredData({ "@type": "Product", name: "W", offers: {}, "@context": ctx }); } catch { threw = true; }
  const big = V.validateStructuredData({ "@type": "Product", name: "x".repeat(3 * 1024 * 1024), offers: {} });
  ok("circular object input ⇒ INVALID_INPUT structured error (NOT a crash); >2MB object ⇒ TOO_LARGE",
     threw === false && circ.ok === false && circ.code === "INVALID_INPUT" && big.ok === false && big.code === "TOO_LARGE");
}
// (15) AUDIT regression (F4 nested @graph): a doubly-nested @graph is flattened and the inner Product validated.
{
  const j = JSON.stringify({ "@context": "https://schema.org", "@graph": [{ "@graph": [{ "@type": "Product", name: "W", offers: {} }] }] });
  const r = V.validateStructuredData(j);
  ok("nested @graph ⇒ inner Product found + validated (not the wrapper)", r.blocks.some((b) => b.type === "Product" && b.validated) && r.summary.validatedBlocks >= 1);
}

console.log(`\nSEO-STRUCTURED-DATA-VALIDATOR suite — ${pass} assertions passed. (grounded required-props for BreadcrumbList/FAQPage/Product; Article=no-required not-invented; unknown type=structural-only not-faked; @graph flatten; fail-closed; pure, NO network)`);
