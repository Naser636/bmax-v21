#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the §8 TECHNICAL SEO audit: official Core Web Vitals thresholds
// (LCP≤2500/INP≤200/CLS≤0.1 good), Search Essentials signals (HTTPS/indexability/title/meta/canonical/hreflang/
// structured-data validity), fail-closed (missing CWV ⇒ NO_DATA, never assumed good), and NO ranking/traffic claim.
// Synthetic fixtures only; publishes nothing.
"use strict";
const assert = require("assert");
const S = require("./seo-technical-audit.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const clean = () => ({ url: "https://example.com/p", title: "Concise descriptive title", metaDescription: "A unique concise description.", canonical: "https://example.com/p", robotsMeta: "index,follow", jsonLd: JSON.stringify({ "@context": "https://schema.org", "@type": "Organization", name: "X" }), cwv: { lcpMs: 2000, inpMs: 150, cls: 0.05 } });

// (1) clean page ⇒ TECHNICALLY_READY, cwvPass, indexable, no HIGH.
{
  const r = S.auditPageTechnicalSeo(clean());
  ok("clean page ⇒ TECHNICALLY_READY, cwvPass, indexable, 0 HIGH", r.report.maturity === "TECHNICALLY_READY" && r.report.cwvPass === true && r.report.indexable === true && !r.report.findings.some((f) => f.severity === "HIGH"));
}
// (2) CWV threshold boundaries (official): good edge vs needs-improvement edge.
{
  const good = S.classifyMetric("lcpMs", 2500), ni = S.classifyMetric("lcpMs", 2501), poor = S.classifyMetric("lcpMs", 4001);
  const inpGood = S.classifyMetric("inpMs", 200), inpNi = S.classifyMetric("inpMs", 201);
  const clsGood = S.classifyMetric("cls", 0.1), clsNi = S.classifyMetric("cls", 0.11), clsPoor = S.classifyMetric("cls", 0.26);
  ok("CWV thresholds exact: LCP 2500 good/2501 NI/4001 poor; INP 200 good/201 NI; CLS 0.1 good/0.11 NI/0.26 poor",
     good === "good" && ni === "needs-improvement" && poor === "poor" && inpGood === "good" && inpNi === "needs-improvement" && clsGood === "good" && clsNi === "needs-improvement" && clsPoor === "poor");
}
// (3) poor CWV ⇒ HIGH findings, not cwvPass, NOT_READY.
{
  const r = S.auditPageTechnicalSeo(Object.assign(clean(), { cwv: { lcpMs: 5000, inpMs: 600, cls: 0.4 } }));
  ok("poor CWV (all three) ⇒ 3 HIGH perf findings, cwvPass false, NOT_READY",
     r.report.findings.filter((f) => f.area === "performance" && f.severity === "HIGH").length === 3 && r.report.cwvPass === false && r.report.maturity === "NOT_READY");
}
// (4) FAIL-CLOSED: missing CWV ⇒ NO_DATA (never assumed good), cwvPass false.
{
  const r = S.auditPageTechnicalSeo(Object.assign(clean(), { cwv: undefined }));
  ok("missing CWV ⇒ NO_DATA per metric, cwvPass false (not assumed good)",
     r.report.cwv.LCP.status === "NO_DATA" && r.report.cwv.INP.status === "NO_DATA" && r.report.cwv.CLS.status === "NO_DATA" && r.report.cwvPass === false);
}
// (5) noindex ⇒ HIGH indexability, not indexable.
{
  const r = S.auditPageTechnicalSeo(Object.assign(clean(), { robotsMeta: "noindex,follow" }));
  ok("noindex ⇒ HIGH indexability finding, indexable=false", r.report.indexable === false && r.report.findings.some((f) => f.id === "indexability" && f.severity === "HIGH"));
}
// (6) non-HTTPS ⇒ HIGH.
{
  const r = S.auditPageTechnicalSeo(Object.assign(clean(), { url: "http://example.com/p" }));
  ok("non-HTTPS ⇒ HIGH security finding, httpsOk=false", r.report.httpsOk === false && r.report.findings.some((f) => f.id === "https" && f.severity === "HIGH"));
}
// (7) missing title ⇒ HIGH; missing meta/canonical ⇒ MEDIUM.
{
  const r = S.auditPageTechnicalSeo({ url: "https://e.com/p", robotsMeta: "index", cwv: { lcpMs: 1, inpMs: 1, cls: 0 } });
  ok("missing title ⇒ HIGH; missing meta description + canonical ⇒ MEDIUM each",
     r.report.findings.some((f) => f.id === "title" && f.severity === "HIGH") && r.report.findings.some((f) => f.id === "meta-description" && f.severity === "MEDIUM") && r.report.findings.some((f) => f.id === "canonical" && f.severity === "MEDIUM"));
}
// (8) invalid JSON-LD ⇒ HIGH; valid ⇒ no parse finding.
{
  const bad = S.auditPageTechnicalSeo(Object.assign(clean(), { jsonLd: "{ not json" }));
  const good = S.auditPageTechnicalSeo(clean());
  ok("invalid JSON-LD ⇒ HIGH parse finding; valid JSON-LD ⇒ none", bad.report.findings.some((f) => f.id === "structured-data:parse" && f.severity === "HIGH") && !good.report.findings.some((f) => f.id === "structured-data:parse"));
}
// (9) hreflang without x-default / malformed code ⇒ findings.
{
  const r = S.auditPageTechnicalSeo(Object.assign(clean(), { hreflang: [{ lang: "en", href: "https://e.com/en" }, { lang: "BADCODE!!", href: "" }] }));
  ok("hreflang: malformed code ⇒ MEDIUM, no x-default ⇒ LOW", r.report.findings.some((f) => f.id === "hreflang:format") && r.report.findings.some((f) => f.id === "hreflang:x-default"));
}
// (10) HONEST: no ranking/traffic/visibility claim anywhere; certificationStatus disclaims a ranking guarantee.
{
  const r = S.auditPageTechnicalSeo(clean());
  const s = JSON.stringify(r.report);
  ok("report makes NO ranking/traffic/visibility-acquired claim; certificationStatus disclaims a ranking guarantee",
     /NOT a ranking guarantee/.test(r.report.certificationStatus) && !/\b(rank(ing)? #?\d|guaranteed position|traffic acquired|visibility acquired)\b/i.test(s) && r.report.cwv !== undefined);
}
// (11) fail-closed input.
{
  ok("missing url ⇒ INVALID_INPUT", S.auditPageTechnicalSeo({}).code === "INVALID_INPUT" && S.auditPageTechnicalSeo(null).ok === false);
}

// (12) AUDIT regression — robots `none` (= noindex,nofollow) is non-indexable (was a false-readiness miss).
{
  const none = S.auditPageTechnicalSeo(Object.assign(clean(), { robotsMeta: "none" }));
  const upper = S.auditPageTechnicalSeo(Object.assign(clean(), { robotsMeta: "NOINDEX" }));
  ok("robots 'none' AND 'NOINDEX' ⇒ indexable=false + HIGH + NOT TECHNICALLY_READY (no false readiness)",
     none.report.indexable === false && none.report.findings.some((f) => f.id === "indexability" && f.severity === "HIGH") && none.report.maturity !== "TECHNICALLY_READY" && upper.report.indexable === false);
}
// (13) AUDIT regression — CWV thresholds are deep-frozen (cannot be corrupted at runtime).
{
  "use strict";
  let mutated = false;
  try { S.CWV.lcpMs.good = 999999; } catch { /* frozen throws in strict */ }
  mutated = S.CWV.lcpMs.good === 999999;
  ok("CWV threshold descriptors are deep-frozen (LCP good stays 2500, not mutable)", mutated === false && S.CWV.lcpMs.good === 2500 && S.classifyMetric("lcpMs", 3000) === "needs-improvement");
}
// (14) AUDIT regression — out-of-domain numeric CWV (negative/NaN) ⇒ NO_DATA AND value null (consistent).
{
  const r = S.auditPageTechnicalSeo(Object.assign(clean(), { cwv: { lcpMs: -5, inpMs: NaN, cls: 0.05 } }));
  ok("negative/NaN CWV ⇒ NO_DATA with value null (not the raw bad number); valid CLS keeps its value",
     r.report.cwv.LCP.status === "NO_DATA" && r.report.cwv.LCP.value === null && r.report.cwv.INP.status === "NO_DATA" && r.report.cwv.INP.value === null && r.report.cwv.CLS.status === "good" && r.report.cwv.CLS.value === 0.05);
}

console.log(`\nSEO-TECHNICAL-AUDIT suite — ${pass} assertions passed. (official CWV thresholds; Search Essentials signals; missing CWV⇒NO_DATA not assumed-good; invalid JSON-LD⇒HIGH; no ranking/traffic claim; publishes nothing)`);
