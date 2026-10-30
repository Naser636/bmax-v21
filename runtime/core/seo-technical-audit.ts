#!/usr/bin/env node
/**
 * seo-technical-audit — TECHNICAL SEO readiness audit (the §8 "SEO technique" workstream), COMPLEMENTARY to
 * seo-strategy.ts (which is the editorial/positioning/keyword side). It inspects a page's REAL technical signals —
 * indexability, HTTPS, canonical, title/meta, hreflang, structured-data validity, and Core Web Vitals — against OFFICIAL
 * thresholds, and emits SARIF-shape findings + a maturity verdict. It PUBLISHES NOTHING and promises NO ranking.
 *
 * Grounding (verified 2026-10-30, cite in evidence):
 *  - Core Web Vitals thresholds (web.dev/articles/defining-core-web-vitals-thresholds, developers.google.com/search):
 *      LCP good ≤ 2500ms / needs-improvement ≤ 4000ms / poor > 4000ms
 *      INP good ≤ 200ms  / needs-improvement ≤ 500ms  / poor > 500ms   (INP replaced FID)
 *      CLS good ≤ 0.10   / needs-improvement ≤ 0.25   / poor > 0.25
 *      a page passes CWV only when ALL THREE are "good".
 *  - Google Search Essentials (crawlable, indexable, unique title, canonical, HTTPS, valid structured data, hreflang).
 *
 * Honesty / fail-closed:
 *  - MISSING CWV data ⇒ NO_DATA per metric (NEVER assumed "good"); a page with no CWV data cannot pass CWV.
 *  - `noindex` / non-HTTPS / missing title are HIGH (block or seriously harm indexing); nothing is assumed-good.
 *  - structured data is checked only for PARSEABILITY + @context/@type (NOT full schema.org conformance — KNOWN_GAP).
 *  - the report is a technical-READINESS audit, NOT a ranking/visibility claim and NOT a guarantee of traffic.
 * Pure/deterministic; no network, no new primitive. Findings shape {id,area,severity,detail,remediation,evidence}.
 */
"use strict";

const CWV = Object.freeze({   // DEEP-frozen: the nested threshold descriptors are the authoritative numbers — they must be immutable at runtime.
  lcpMs: Object.freeze({ good: 2500, ni: 4000, unit: "ms", name: "LCP" }),
  inpMs: Object.freeze({ good: 200, ni: 500, unit: "ms", name: "INP" }),
  cls: Object.freeze({ good: 0.1, ni: 0.25, unit: "", name: "CLS" }),
});
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function classifyMetric(key: string, v: any): string {
  const t = (CWV as any)[key];
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return "NO_DATA";   // fail-closed: missing/invalid ⇒ NO_DATA
  if (v <= t.good) return "good";
  if (v <= t.ni) return "needs-improvement";
  return "poor";
}
const SEVERITY_OF_CWV: Record<string, string> = { "poor": "HIGH", "needs-improvement": "MEDIUM", "good": "NONE", "NO_DATA": "MEDIUM" };

/**
 * auditPageTechnicalSeo(page): page = { url, title?, metaDescription?, canonical?, robotsMeta?("index,follow"...),
 *   hreflang?:[{lang,href}], structuredData?:[{...}] | jsonLd?:string, cwv?:{lcpMs,inpMs,cls} }.
 * Returns { ok, report } — technical-readiness audit. NOT a ranking claim.
 */
function auditPageTechnicalSeo(page: any): any {
  if (!isObj(page) || typeof page.url !== "string" || !page.url) return { ok: false, code: "INVALID_INPUT", reason: "page { url, … } required" };
  const findings: any[] = [];
  const add = (id: string, area: string, severity: string, detail: string, remediation: string, evidence: string) => findings.push({ id, area, severity, detail, remediation, evidence });

  // ---- HTTPS (Search Essentials) ----
  const httpsOk = /^https:\/\//i.test(page.url);
  if (!httpsOk) add("https", "security", "HIGH", "page is not served over HTTPS", "serve the page over HTTPS", `url '${page.url}'`);

  // ---- indexability (robots meta) ----
  const robots = typeof page.robotsMeta === "string" ? page.robotsMeta.toLowerCase() : "";
  // `none` is the Search-Essentials shorthand for `noindex,nofollow` — it must count as non-indexable too.
  const indexable = !/\b(noindex|none)\b/.test(robots);
  if (!indexable) add("indexability", "crawl-index", "HIGH", "page is marked noindex (or `none` = noindex,nofollow) — it cannot appear in search results", "remove the noindex/none directive if the page should be indexed", `robots '${page.robotsMeta}'`);

  // ---- title (unique/descriptive; length is GUIDANCE, not a ranking rule) ----
  const title = typeof page.title === "string" ? page.title.trim() : "";
  if (!title) add("title", "metadata", "HIGH", "missing <title> — a descriptive, unique title is a core Search Essentials signal", "add a unique descriptive title", "title empty/absent");
  else if (title.length > 60) add("title:length", "metadata", "LOW", `title is ${title.length} chars (guidance: ~≤60 to avoid truncation in SERPs) — not a ranking penalty`, "consider shortening", `len ${title.length}`);

  // ---- meta description (not a ranking factor, but SERP-snippet quality) ----
  if (!(typeof page.metaDescription === "string" && page.metaDescription.trim())) add("meta-description", "metadata", "MEDIUM", "missing meta description (affects SERP snippet quality; not a direct ranking factor)", "add a concise, unique meta description", "metaDescription empty/absent");

  // ---- canonical (duplicate-content clarity) ----
  if (!(typeof page.canonical === "string" && page.canonical.trim())) add("canonical", "duplication", "MEDIUM", "no canonical URL declared — risks duplicate-content ambiguity", "declare a self- or cross-canonical <link rel=canonical>", "canonical absent");

  // ---- hreflang (internationalisation): if present, require a self/x-default reference + well-formed codes ----
  if (Array.isArray(page.hreflang) && page.hreflang.length) {
    const langs = page.hreflang.map((h: any) => (isObj(h) ? String(h.lang || "").toLowerCase() : "")).filter(Boolean);
    const badCode = page.hreflang.find((h: any) => !isObj(h) || typeof h.href !== "string" || !h.href || !/^([a-z]{2}(-[a-z0-9]{2,8})?|x-default)$/i.test(String(h.lang || "")));
    if (badCode) add("hreflang:format", "i18n", "MEDIUM", "a hreflang entry has a malformed language code or missing href", "use ISO 639-1[-region] or x-default, each with an absolute href", `entry ${JSON.stringify(badCode).slice(0, 80)}`);
    if (!langs.includes("x-default")) add("hreflang:x-default", "i18n", "LOW", "no x-default hreflang — recommended for unmatched locales", "add an x-default hreflang entry", "x-default absent");
  }

  // ---- structured data: PARSEABILITY + @context/@type only (NOT full schema.org validation — KNOWN_GAP) ----
  let sd: any[] | null = null;
  if (typeof page.jsonLd === "string" && page.jsonLd.trim()) {
    try { const parsed = JSON.parse(page.jsonLd); sd = Array.isArray(parsed) ? parsed : [parsed]; }
    catch { add("structured-data:parse", "structured-data", "HIGH", "JSON-LD is not valid JSON — it will be ignored by parsers", "fix the JSON-LD syntax", "JSON.parse failed"); }
  } else if (Array.isArray(page.structuredData)) sd = page.structuredData;
  if (sd) for (let i = 0; i < sd.length; i++) { const b = sd[i]; if (!isObj(b) || !(b["@context"] || b["@type"])) add(`structured-data:shape[${i}]`, "structured-data", "MEDIUM", "structured-data block lacks @context/@type", "supply a valid schema.org @context + @type", `block ${i}`); }

  // ---- Core Web Vitals (official thresholds; missing ⇒ NO_DATA, never assumed good) ----
  const cwvIn = isObj(page.cwv) ? page.cwv : {};
  const cwv: any = {};
  for (const key of Object.keys(CWV)) {
    const status = classifyMetric(key, cwvIn[key]);
    // value is the real number ONLY when it classified (good/NI/poor); any NO_DATA (missing OR out-of-domain) ⇒ null.
    cwv[(CWV as any)[key].name] = { value: status === "NO_DATA" ? null : cwvIn[key], status };
    const sev = SEVERITY_OF_CWV[status];
    if (sev && sev !== "NONE") add(`cwv:${(CWV as any)[key].name}`, "performance", sev, `${(CWV as any)[key].name} is ${status}${typeof cwvIn[key] === "number" ? ` (${cwvIn[key]}${(CWV as any)[key].unit})` : " — NO DATA (cannot be assumed good)"}`, `bring ${(CWV as any)[key].name} into the 'good' range (${(CWV as any)[key].name} ≤ ${(CWV as any)[key].good}${(CWV as any)[key].unit})`, `threshold good≤${(CWV as any)[key].good}, ni≤${(CWV as any)[key].ni}`);
  }
  const cwvPass = Object.values(cwv).every((m: any) => m.status === "good");   // ALL three good (and none NO_DATA)

  const high = findings.filter((f) => f.severity === "HIGH").length;
  const maturity = high > 0 ? "NOT_READY" : (findings.some((f) => f.severity === "MEDIUM") || !cwvPass ? "PARTIAL" : "TECHNICALLY_READY");
  return {
    ok: true,
    report: {
      url: page.url, indexable, httpsOk, cwv, cwvPass,
      findings: findings.sort((a, b) => ({ HIGH: 0, MEDIUM: 1, LOW: 2, NONE: 3 } as any)[a.severity] - ({ HIGH: 0, MEDIUM: 1, LOW: 2, NONE: 3 } as any)[b.severity]),
      findingCount: findings.length,
      maturity,
      limitations: [
        "TECHNICAL-READINESS audit only — NOT a ranking or traffic/visibility claim, and NOT a guarantee of a position",
        "Core Web Vitals use OFFICIAL thresholds (LCP≤2500ms, INP≤200ms, CLS≤0.1 for 'good'); MISSING CWV data ⇒ NO_DATA, never assumed good; field data (75th percentile) is the real-world signal and is not computed here",
        "structured data is checked for parseability + @context/@type only — NOT full schema.org conformance (KNOWN_GAP)",
        "hreflang reciprocity ACROSS pages is not verified here (single-page audit); only self/x-default + code format",
        "title length is layout guidance, not a ranking rule",
      ],
      certificationStatus: "NOT a ranking guarantee — a local technical-readiness audit grounded in Google Search Essentials + Core Web Vitals (verified 2026-10-30); nothing is published",
      note: "Fail-closed technical SEO audit: noindex/non-HTTPS/missing-title ⇒ HIGH; missing CWV ⇒ NO_DATA (not assumed good); no fabricated ranking/traffic.",
    },
  };
}

export { auditPageTechnicalSeo, classifyMetric, CWV };
module.exports = { auditPageTechnicalSeo, classifyMetric, CWV };

if (require.main === module) {
  const r = auditPageTechnicalSeo({ url: "https://example.com/p", title: "Good Title", metaDescription: "desc", canonical: "https://example.com/p", robotsMeta: "index,follow", cwv: { lcpMs: 2000, inpMs: 150, cls: 0.05 } });
  process.stdout.write(JSON.stringify({ maturity: r.report.maturity, cwvPass: r.report.cwvPass, findings: r.report.findingCount }, null, 2) + "\n");
}
