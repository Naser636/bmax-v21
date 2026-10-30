#!/usr/bin/env node
/**
 * seo-hreflang-reciprocity — a MULTI-PAGE §8 SEO check that hreflang annotations across a set of already-extracted pages
 * are mutually consistent. Google requires hreflang to be BIDIRECTIONAL: if page A links to B with hreflang, B must link
 * back to A, or the annotation is ignored. It also recommends a SELF-REFERENTIAL hreflang and well-formed language codes.
 * This module consumes the `hreflang` arrays produced by seo-page-signal-extractor and reports the provable defects.
 *
 * It is PURE / deterministic: NO network, NO fetch, NO crawl — every page's signals are caller-supplied. Fail-closed and
 * HONEST: a reciprocity defect is reported ONLY when the target page IS in the supplied set and demonstrably fails to link
 * back; a target NOT in the set is "unverifiable" (reported as such, NEVER assumed broken AND never assumed reciprocal).
 * It PUBLISHES NOTHING and makes NO ranking claim. Findings shape {id,area,severity,detail,remediation,evidence}.
 *
 * Grounding (Google Search Central, "Tell Google about localized versions"): return links required (bidirectional);
 * self-referential hreflang recommended; language in ISO 639-1 with optional ISO 3166-1 Alpha-2 region, or `x-default`.
 * NO new primitive.
 */
"use strict";

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function normUrl(u: string): string {
  try {
    const x = new URL(u);
    const ps = [...x.searchParams.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
    // normalise a trailing slash (except the root) so /fr and /fr/ match in the reciprocity graph — servers add/strip it
    // freely and it must not mask a real non-reciprocal defect NOR fabricate one. (Local to this hreflang graph only.)
    let path = x.pathname; if (path.length > 1) path = path.replace(/\/+$/, "") || "/";
    return x.origin.toLowerCase() + path + (ps.length ? "?" + ps.map(([k, v]) => `${k}=${v}`).join("&") : "");
  } catch { return (u || "").trim(); }
}
// ISO 639-1[-region] or x-default; region may be ISO 3166-1 Alpha-2 (letters) OR UN M49 numeric (3 digits, e.g. es-419).
const LANG_RE = /^([a-z]{2,3}(-([a-z]{2,8}|[0-9]{3}))?|x-default)$/i;

/**
 * auditHreflangReciprocity(input): input = { pages: Array<{ url, hreflang?: [{lang, href}] }> }.
 * Returns { ok, verdict, summary, findings }. Each page's hreflang array is the extractor's output (href may be ""/absent).
 */
function auditHreflangReciprocity(input: any): any {
  if (!isObj(input) || !Array.isArray(input.pages) || !input.pages.length) return { ok: false, code: "INVALID_INPUT", reason: "input { pages: [{url, hreflang}] } with >=1 page required" };
  const pages = input.pages.filter((p: any) => isObj(p) && typeof p.url === "string" && p.url);
  if (!pages.length) return { ok: false, code: "INVALID_INPUT", reason: "no page with a valid url" };

  const byUrl: Record<string, any> = {};
  for (const p of pages) byUrl[normUrl(p.url)] = p;

  const findings: any[] = [];
  const add = (id: string, severity: string, detail: string, remediation: string, evidence: string) => findings.push({ id, area: "hreflang", severity, detail, remediation, evidence });

  let brokenReciprocal = 0, unverifiable = 0, missingSelf = 0, badCodes = 0, conflicts = 0;
  const entriesOf = (p: any) => (Array.isArray(p.hreflang) ? p.hreflang : []).filter((h: any) => isObj(h) && typeof h.lang === "string");

  for (const p of pages) {
    const pNorm = normUrl(p.url);
    const entries = entriesOf(p);
    if (!entries.length) continue;                 // a page with NO hreflang is simply not internationalised — not a defect
    // ---- self-reference (recommended): some entry points to the page itself ----
    const hasSelf = entries.some((h: any) => typeof h.href === "string" && h.href && normUrl(h.href) === pNorm);
    if (!hasSelf) { missingSelf++; add("hreflang:self-reference", "MEDIUM", "page declares hreflang but has no self-referential entry (recommended: a page should list itself)", "add an hreflang entry for this page's own language pointing to its own URL", `page '${p.url}'`); }

    // ---- per-entry: code format, conflicts, reciprocity ----
    const seenLang: Record<string, string> = {};
    for (const h of entries) {
      const lang = String(h.lang);
      const langKey = lang.toLowerCase();   // dedup/conflict key is case-insensitive (EN == en)
      if (!LANG_RE.test(lang)) { badCodes++; add("hreflang:format", "MEDIUM", `malformed hreflang language code '${lang}'`, "use ISO 639-1[-ISO 3166-1] (e.g. 'en', 'en-GB') or 'x-default'", `page '${p.url}' lang '${lang}'`); }
      const href = typeof h.href === "string" ? h.href : "";
      if (!href) { add("hreflang:href", "MEDIUM", `hreflang entry '${lang}' has no href`, "every hreflang entry needs an absolute href", `page '${p.url}' lang '${lang}'`); continue; }
      const tNorm = normUrl(href);
      // conflict: same lang declared twice pointing to DIFFERENT URLs within this page (case-insensitive key)
      if (seenLang[langKey] && seenLang[langKey] !== tNorm) { conflicts++; add("hreflang:conflict", "MEDIUM", `language '${lang}' is declared more than once on this page pointing to different URLs`, "declare each language once per page", `page '${p.url}' lang '${lang}'`); }
      seenLang[langKey] = tNorm;

      if (langKey === "x-default") continue;    // x-default is not subject to the same strict return-link rule
      if (tNorm === pNorm) continue;                        // self-reference, handled above

      // ---- reciprocity: target must link BACK to this page (only verifiable if the target is in the supplied set) ----
      const target = byUrl[tNorm];
      if (!target) { unverifiable++; add("hreflang:unverifiable-target", "LOW", "hreflang points to a page NOT in the supplied set — reciprocity cannot be verified here (NOT assumed broken or reciprocal)", "include the target page's signals to verify the return link", `page '${p.url}' -> '${href}' [${lang}]`); continue; }
      const back = entriesOf(target).some((h2: any) => typeof h2.href === "string" && h2.href && normUrl(h2.href) === pNorm);
      if (!back) { brokenReciprocal++; add("hreflang:non-reciprocal", "HIGH", "hreflang is NOT bidirectional — the target page does not link back to this page, so Google will IGNORE the annotation", "add a return hreflang entry on the target page pointing back to this URL", `page '${p.url}' -> '${href}' [${lang}] has no return link`); }
    }
  }

  const pagesWithHreflang = pages.filter((p: any) => entriesOf(p).length).length;
  const summary = {
    pageCount: pages.length,
    pagesWithHreflang,
    brokenReciprocal,          // provable (target in set, no return link)
    unverifiableTargets: unverifiable,
    missingSelfReference: missingSelf,
    malformedCodes: badCodes,
    conflicts,
  };
  const high = findings.filter((f) => f.severity === "HIGH").length;
  const verdict = high > 0 ? "RECIPROCITY_BROKEN" : (findings.length ? "ISSUES_FOUND" : (pagesWithHreflang ? "RECIPROCAL" : "NO_HREFLANG"));
  return {
    ok: true, verdict, summary,
    findings: findings.sort((a, b) => ({ HIGH: 0, MEDIUM: 1, LOW: 2 } as any)[a.severity] - ({ HIGH: 0, MEDIUM: 1, LOW: 2 } as any)[b.severity]),
    limitations: [
      "MULTI-PAGE cross-check of SUPPLIED page signals ONLY — NOT a crawl/liveness/ranking check; nothing is fetched",
      "a non-reciprocal defect (HIGH) is reported ONLY when the target page is in the supplied set and demonstrably lacks a return link; a target NOT in the set is 'unverifiable' (LOW) — never assumed broken AND never assumed reciprocal",
      "'RECIPROCAL' means no defect was found among SUPPLIED pages; it does not certify targets outside the set",
      "self-referential hreflang is Google-recommended (MEDIUM when absent), not strictly required; x-default is exempt from the strict return-link rule",
    ],
    note: "Fail-closed hreflang reciprocity audit: HIGH only on a PROVABLE missing return link; unresolved targets are unverifiable (not assumed); no ranking claim; nothing published.",
  };
}

export { auditHreflangReciprocity };
module.exports = { auditHreflangReciprocity };

if (require.main === module) {
  const pages = [
    { url: "https://e.com/en", hreflang: [{ lang: "en", href: "https://e.com/en" }, { lang: "fr", href: "https://e.com/fr" }] },
    { url: "https://e.com/fr", hreflang: [{ lang: "fr", href: "https://e.com/fr" }] },   // missing return link to /en
  ];
  const r = auditHreflangReciprocity({ pages });
  process.stdout.write(JSON.stringify({ verdict: r.verdict, summary: r.summary, findings: r.findings.map((f: any) => f.id) }, null, 2) + "\n");
}
