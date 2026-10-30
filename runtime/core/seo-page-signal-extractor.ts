#!/usr/bin/env node
/**
 * seo-page-signal-extractor — extract the technical SEO signals from a page's ALREADY-FETCHED HTML + HTTP headers and
 * produce the exact input shape `seo-technical-audit.auditPageTechnicalSeo` consumes. It is PURE PARSING of caller-
 * supplied strings: it performs NO network I/O, NO fetching, NO external crawling, NO DNS — the caller provides `html`
 * and `headers` (e.g. captured out-of-band under separate authorization). Nothing is published.
 *
 * Signals: <title>, meta description, meta robots (+ X-Robots-Tag header), canonical (<link> + Link header), hreflang
 * alternates, JSON-LD, <html lang>, and internal/external link counts. INCONSISTENCIES (canonical html↔header mismatch,
 * robots meta↔header conflict, duplicate <title>/canonical) are detected and surfaced. Fail-closed/honest: a signal that
 * is absent/unparseable is reported as null/absent (NEVER fabricated); the downstream audit then flags it. No conclusion
 * is drawn beyond what the bytes contain. Pure/deterministic, dependency-free; NO new primitive.
 */
"use strict";

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function firstGroup(re: RegExp, s: string): string | null { const m = re.exec(s); return m && typeof m[1] === "string" ? m[1].trim() : null; }
/** parse an HTML tag's attributes into a lowercased-key map (tolerates order, single/double/unquoted values). */
function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*('([^']*)'|"([^"]*)"|([^\s"'>]+))/g;
  let m: any;
  while ((m = re.exec(tag)) !== null) out[m[1].toLowerCase()] = (m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : m[5] || "");
  return out;
}
function decode(s: string | null): string | null {
  if (s == null) return null;
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&").trim();
}
// host (not prefix) of an absolute OR protocol-relative URL — used for EXACT internal/external comparison.
function hostOf(u: string): string | null { const m = /^(?:https?:)?\/\/([^/?#]+)/i.exec(u || ""); return m ? m[1].toLowerCase() : null; }
const MAX_HTML = 5 * 1024 * 1024;   // bound caller-supplied bytes (ReDoS/DoS guard); each tag scan is additionally capped to [^>]{0,4000}

/**
 * extractPageSignals(input): input = { url, html, headers? }. Returns { ok, signals, provenance, inconsistencies }.
 * `signals` is directly consumable by seo-technical-audit.auditPageTechnicalSeo. NO network; pure parse of `html`/`headers`.
 */
function extractPageSignals(input: any): any {
  if (!isObj(input) || typeof input.url !== "string" || !input.url) return { ok: false, code: "INVALID_INPUT", reason: "input { url, html, headers? } required" };
  const html = typeof input.html === "string" ? input.html : "";
  if (html.length > MAX_HTML) return { ok: false, code: "TOO_LARGE", reason: `html exceeds ${MAX_HTML} bytes — refusing to parse unbounded caller input (DoS guard)` };
  const hdr: Record<string, string> = {};
  if (isObj(input.headers)) for (const k of Object.keys(input.headers)) hdr[k.toLowerCase()] = String(input.headers[k]);
  const inconsistencies: string[] = [];

  // Parse ONLY live markup. Strip comments first; JSON-LD is read from the comment-stripped text (it lives in a
  // <script type=ld+json>). ALL OTHER signals are read from text with <script>/<style> bodies ALSO removed, so a
  // commented-out tag OR a JS-string look-alike can NEVER shadow the real directive (fail-closed, no fabrication).
  const noComments = html.replace(/<!--[\s\S]*?-->/g, " ");
  const live = noComments.replace(/<script\b[^>]{0,4000}>[\s\S]*?<\/script\s*>/gi, " ").replace(/<style\b[^>]{0,4000}>[\s\S]*?<\/style\s*>/gi, " ");

  // ---- <title> (first; flag duplicates) — bounded quantifiers avoid O(n^2) on unterminated tags ----
  const titleMatches = live.match(/<title[^>]{0,4000}>[\s\S]*?<\/title\s*>/gi) || [];
  if (titleMatches.length > 1) inconsistencies.push(`${titleMatches.length} <title> elements (only the first is used)`);
  const title = decode(firstGroup(/<title[^>]{0,4000}>([\s\S]*?)<\/title\s*>/i, live));

  // ---- meta tags (description, robots) ----
  const metaTags = live.match(/<meta\b[^>]{0,4000}>/gi) || [];
  let metaDescription: string | null = null, metaRobots: string | null = null;
  for (const t of metaTags) {
    const a = attrs(t);
    const name = (a.name || a.property || "").toLowerCase();
    if (name === "description" && metaDescription == null) metaDescription = decode(a.content || "");
    if (name === "robots" && metaRobots == null) metaRobots = (a.content || "").toLowerCase();
  }

  // ---- robots: combine meta + X-Robots-Tag header (either noindex/none ⇒ non-indexable downstream) ----
  const headerRobots = hdr["x-robots-tag"] ? hdr["x-robots-tag"].toLowerCase() : null;
  if (metaRobots && headerRobots) {
    const mNo = /\b(noindex|none)\b/.test(metaRobots), hNo = /\b(noindex|none)\b/.test(headerRobots);
    if (mNo !== hNo) inconsistencies.push(`robots meta ('${metaRobots}') conflicts with X-Robots-Tag ('${headerRobots}')`);
  }
  const robotsMeta = [metaRobots, headerRobots].filter(Boolean).join(",") || null;

  // ---- canonical: <link rel=canonical> + Link header rel="canonical" ----
  const linkTags = live.match(/<link\b[^>]{0,4000}>/gi) || [];
  let canonical: string | null = null; const hreflang: any[] = []; const canonicals: string[] = [];
  for (const t of linkTags) {
    const a = attrs(t);
    const rel = (a.rel || "").toLowerCase();
    if (rel === "canonical" && a.href) canonicals.push(a.href);
    if (rel === "alternate" && a.hreflang) hreflang.push({ lang: a.hreflang, href: a.href || "" });
  }
  if (canonicals.length) canonical = canonicals[0];
  if (canonicals.length > 1) inconsistencies.push(`${canonicals.length} canonical <link> elements (only the first is used)`);
  const headerCanonical = /<([^>]{0,4000})>\s*;\s*rel\s*=\s*"?canonical"?/i.exec(hdr["link"] || "");
  if (headerCanonical) {
    if (canonical && canonical !== headerCanonical[1]) inconsistencies.push(`canonical mismatch: <link> '${canonical}' vs Link header '${headerCanonical[1]}'`);
    if (!canonical) canonical = headerCanonical[1];
  }

  // ---- JSON-LD (first live ld+json block; from comment-stripped text, NOT the script-stripped `live`) ----
  const jsonLd = (/<script\b[^>]{0,4000}type\s*=\s*['"]application\/ld\+json['"][^>]{0,4000}>([\s\S]*?)<\/script\s*>/i.exec(noComments) || [])[1] || null;

  // ---- <html lang> + link structure (EXACT host compare; protocol-relative treated as absolute) ----
  const lang = (/<html\b[^>]{0,4000}\blang\s*=\s*['"]([^'"]+)['"]/i.exec(live) || [])[1] || null;
  const pageHost = hostOf(input.url);
  let internal = 0, external = 0;
  const hrefRe = /<a\b[^>]{0,4000}?\bhref\s*=\s*('([^']*)'|"([^"]*)"|([^\s"'>]+))/gi; let lm: any;
  while ((lm = hrefRe.exec(live)) !== null) {
    const href = (lm[2] !== undefined ? lm[2] : lm[3] !== undefined ? lm[3] : lm[4] || "").trim();
    if (!href || href.startsWith("#") || /^(mailto:|tel:|javascript:)/i.test(href)) continue;
    const absolute = /^(https?:)?\/\//i.test(href);   // absolute OR protocol-relative ⇒ compare host exactly
    if (absolute) { const h = hostOf(href); (h && pageHost && h === pageHost) ? internal++ : external++; } else internal++;   // relative path ⇒ internal
  }

  const signals = { url: input.url, title, metaDescription, canonical, robotsMeta, hreflang, jsonLd, lang, links: { internal, external } };
  const found = Object.entries({ title, metaDescription, canonical, robotsMeta, jsonLd, lang }).filter(([, v]) => v != null).map(([k]) => k);
  return {
    ok: true,
    signals,
    inconsistencies,
    provenance: {
      source: "caller-supplied html+headers (NO network/fetch/crawl performed by this extractor)",
      htmlBytes: html.length, headerKeys: Object.keys(hdr),
      signalsFound: found, signalsAbsent: ["title", "metaDescription", "canonical", "robotsMeta", "jsonLd", "lang"].filter((k) => !found.includes(k)),
      hreflangCount: hreflang.length,
    },
    note: "Pure parse of provided bytes; absent signals are null (not fabricated); downstream seo-technical-audit draws the fail-closed conclusions. No conclusion beyond the extracted data.",
  };
}

/** extractAndAudit(input, auditFn): convenience round-trip — extract signals then run the technical audit over them. */
function extractAndAudit(input: any, auditFn?: any): any {
  const ex = extractPageSignals(input);
  if (!ex.ok) return ex;
  const audit = (auditFn || require("./seo-technical-audit.js").auditPageTechnicalSeo)(ex.signals);
  return { ok: true, signals: ex.signals, inconsistencies: ex.inconsistencies, provenance: ex.provenance, audit: audit.ok ? audit.report : audit };
}

export { extractPageSignals, extractAndAudit, attrs };
module.exports = { extractPageSignals, extractAndAudit, attrs };

if (require.main === module) {
  const html = `<html lang="en"><head><title>Demo</title><meta name="description" content="d"><link rel="canonical" href="https://e.com/p"><meta name="robots" content="index,follow"></head><body><a href="/x">i</a></body></html>`;
  const r = extractAndAudit({ url: "https://e.com/p", html });
  process.stdout.write(JSON.stringify({ title: r.signals.title, maturity: r.audit.maturity, inconsistencies: r.inconsistencies }, null, 2) + "\n");
}
