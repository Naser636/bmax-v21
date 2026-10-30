#!/usr/bin/env node
/**
 * seo-crawl-consistency — CROSS-CHECK the §8 SEO signals that individually look fine but CONTRADICT each other across
 * files: robots.txt (crawl) vs sitemap.xml (declared-for-indexing) vs a page's extracted meta signals (index). These
 * are exactly the conflicts Google Search Console surfaces as coverage ERRORS:
 *   - "Submitted URL blocked by robots.txt"  — a sitemap lists a URL that robots.txt disallows (Google can't crawl it).
 *   - "Submitted URL marked 'noindex'"        — a sitemap lists a URL whose page is noindex (contradictory intent).
 *   - a sitemap URL that canonicalises to a DIFFERENT URL (the sitemap is advertising a non-canonical address).
 *
 * It composes seo-crawl-directives (isPathAllowed + parseSitemap) and seo-page-signal-extractor's output shape. It is
 * PURE / deterministic / dependency-light: NO network, NO fetch, NO crawl — every input is caller-supplied bytes/objects.
 * Fail-closed/honest: it reports ONLY contradictions provable from the supplied inputs; a page whose signals are NOT
 * supplied is reported as "not evaluated" (NEVER assumed clean). It PUBLISHES NOTHING and makes NO ranking claim.
 * Findings shape {id,area,severity,detail,remediation,evidence}. NO new primitive.
 */
"use strict";

const CD = require("./seo-crawl-directives.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function normUrl(u: string): string {
  try {
    const x = new URL(u);
    // sort query params for order-insensitive EQUALITY (both sides go through this) — collapses ?x=1&y=2 vs ?y=2&x=1,
    // a common CMS-generated difference that is NOT a real content contradiction; fragment dropped (irrelevant).
    const params = [...x.searchParams.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
    const search = params.length ? "?" + params.map(([k, v]) => `${k}=${v}`).join("&") : "";
    return x.origin.toLowerCase() + x.pathname + search;
  } catch { return (u || "").trim(); }
}

/**
 * auditCrawlConsistency(input): input = {
 *   robots?: string | parseRobotsTxt-result,   // optional; absent ⇒ crawl checks "not evaluated"
 *   sitemap: string | parseSitemap-result,      // REQUIRED (the set of declared URLs)
 *   pageSignals?: Array<{url,robotsMeta?,canonical?}> | Record<url,{robotsMeta?,canonical?}>,  // optional per-URL meta
 *   userAgent?: string,                          // product token for the robots decision (default "*")
 * }
 * Returns { ok, summary, findings }. Each finding is provable from the inputs; unknown ⇒ "not evaluated", never faked.
 */
function auditCrawlConsistency(input: any): any {
  if (!isObj(input)) return { ok: false, code: "INVALID_INPUT", reason: "input object required" };
  const sm = typeof input.sitemap === "string" ? CD.parseSitemap(input.sitemap) : input.sitemap;
  if (!isObj(sm) || sm.ok !== true) return { ok: false, code: "INVALID_SITEMAP", reason: (sm && sm.reason) || "sitemap required (string or parseSitemap result)" };
  if (sm.type !== "urlset") return { ok: false, code: "NOT_A_URLSET", reason: `cross-consistency needs a <urlset> sitemap; got '${sm.type}' (a sitemapindex lists child sitemaps, not page URLs)` };

  // robots is OPTIONAL — if absent, crawl checks are explicitly NOT evaluated (not assumed allowed).
  const robotsProvided = input.robots != null && input.robots !== "";
  const robots = robotsProvided ? (typeof input.robots === "string" ? CD.parseRobotsTxt(input.robots) : input.robots) : null;
  const robotsOk = robots && robots.ok === true;
  const ua = typeof input.userAgent === "string" && input.userAgent ? input.userAgent : "*";

  // page signals indexed by normalised URL (optional)
  const sigByUrl: Record<string, any> = {};
  if (Array.isArray(input.pageSignals)) for (const s of input.pageSignals) { if (isObj(s) && typeof s.url === "string") sigByUrl[normUrl(s.url)] = s; }
  else if (isObj(input.pageSignals)) for (const k of Object.keys(input.pageSignals)) sigByUrl[normUrl(k)] = Object.assign({ url: k }, input.pageSignals[k]);

  const findings: any[] = [];
  const add = (id: string, severity: string, detail: string, remediation: string, evidence: string) => findings.push({ id, area: "crawl-consistency", severity, detail, remediation, evidence });

  // Surface the composed parser's OWN structural findings (invalid/missing <loc>, truncation) — they MUST NOT be
  // silently dropped: a structurally broken or truncated sitemap cannot be reported "CONSISTENT". They feed the verdict.
  if (Array.isArray(sm.findings)) for (const f of sm.findings) findings.push(Object.assign({}, f, { area: f.area || "sitemap" }));
  if (sm.truncated) add("sitemap:truncated", "MEDIUM", "the sitemap was truncated at the 50,000-URL protocol cap — URLs beyond the cap were NOT evaluated by this cross-check", "split the sitemap into multiple files per the protocol limit", "truncated at cap");

  const allLocs: string[] = (sm.urls || []).map((u: any) => (u && typeof u.loc === "string" ? u.loc : null)).filter(Boolean);
  const validLocs = allLocs.filter((u: string) => /^https?:\/\//i.test(u));   // invalid locs are already surfaced via sm.findings above

  // ---- duplicate <loc> (by normalised URL); iterate DISTINCT URLs so counts mean distinct URLs, not submissions ----
  const seen = new Set<string>(); const dupes = new Set<string>(); const distinct: string[] = [];
  for (const u of validLocs) { const n = normUrl(u); if (seen.has(n)) dupes.add(u); else { seen.add(n); distinct.push(u); } }
  for (const d of dupes) add("sitemap:duplicate-loc", "MEDIUM", "the same URL appears more than once in the sitemap", "list each canonical URL exactly once", `loc '${d}'`);

  let blockedCount = 0, noindexCount = 0, canonMismatch = 0, notEvaluated = 0;
  for (const loc of distinct) {
    // ---- robots.txt: is this submitted URL crawl-blocked? ("Submitted URL blocked by robots.txt") ----
    if (robotsOk) {
      const dec = CD.isPathAllowed(robots, { url: loc, userAgent: ua });
      if (dec.ok && dec.allowed === false) { blockedCount++; add("sitemap-url:blocked-by-robots", "HIGH", "the sitemap submits a URL that robots.txt DISALLOWS — search engines cannot crawl it, so it will not be indexed from the sitemap", "either remove the URL from the sitemap or stop disallowing it in robots.txt (keep the two consistent)", `loc '${loc}' vs rule ${dec.matchedRule ? dec.matchedRule.type + " '" + dec.matchedRule.path + "'" : "(none)"} [ua ${ua}]`); }
    }
    // ---- page signals (optional): noindex + canonical mismatch ----
    const sig = sigByUrl[normUrl(loc)];
    if (isObj(sig)) {
      const robotsMeta = typeof sig.robotsMeta === "string" ? sig.robotsMeta.toLowerCase() : "";
      if (/\b(noindex|none)\b/.test(robotsMeta)) { noindexCount++; add("sitemap-url:noindex", "HIGH", "the sitemap submits a URL whose page is marked noindex (or `none`) — the sitemap says 'index me' while the page says 'do not index'", "resolve the contradiction: remove noindex if the page should be indexed, or drop it from the sitemap", `loc '${loc}' robots '${sig.robotsMeta}'`); }
      if (typeof sig.canonical === "string" && sig.canonical.trim() && normUrl(sig.canonical) !== normUrl(loc)) { canonMismatch++; add("sitemap-url:non-canonical", "MEDIUM", "the sitemap lists a URL whose page canonicalises to a DIFFERENT URL — submit the canonical URL instead", "list the canonical URL in the sitemap (the address you want indexed)", `loc '${loc}' canonical '${sig.canonical}'`); }
    } else {
      notEvaluated++;   // honest: no signals supplied for this URL ⇒ index/canonical NOT evaluated (not assumed clean)
    }
  }

  // COVERAGE (honest): CONSISTENT is reserved for FULL coverage with no findings. Partial ⇒ INCOMPLETE; zero ⇒
  // NOT_EVALUATED. "nothing contradicted" must never be confused with "nothing was checkable".
  const fullyEvaluated = !!robotsOk && notEvaluated === 0 && distinct.length > 0;
  const anyEvaluated = !!robotsOk || (distinct.length - notEvaluated) > 0;
  const summary = {
    sitemapUrlCount: allLocs.length,
    distinctUrlCount: distinct.length,
    invalidLocCount: allLocs.length - validLocs.length,
    truncated: !!sm.truncated,
    duplicateCount: dupes.size,
    robotsEvaluated: !!robotsOk,
    blockedByRobots: robotsOk ? blockedCount : null,     // null ⇒ not evaluated (robots not supplied/parseable); count is of DISTINCT URLs
    noindexConflicts: noindexCount,
    nonCanonical: canonMismatch,
    urlsWithoutSignals: notEvaluated,
    fullyEvaluated,
    userAgent: ua,
  };
  const high = findings.filter((f) => f.severity === "HIGH").length;
  let verdict: string;
  if (high > 0) verdict = "CONFLICTS_FOUND";
  else if (findings.length) verdict = "MINOR_ISSUES";
  else if (fullyEvaluated) verdict = "CONSISTENT";         // robots evaluated AND every distinct URL had signals AND no findings
  else if (anyEvaluated) verdict = "INCOMPLETE";           // partial coverage, no conflict in what WAS checked
  else verdict = "NOT_EVALUATED";                          // nothing was checkable (no robots, no signals, or no valid URLs)
  return {
    ok: true, verdict, summary,
    findings: findings.sort((a, b) => ({ HIGH: 0, MEDIUM: 1, LOW: 2 } as any)[a.severity] - ({ HIGH: 0, MEDIUM: 1, LOW: 2 } as any)[b.severity]),
    limitations: [
      "CROSS-CONSISTENCY of supplied inputs ONLY — NOT a crawl/liveness/ranking check; nothing is fetched",
      "VERDICT 'CONSISTENT' requires FULL coverage (robots supplied+parseable AND page signals for every distinct URL AND no findings); partial coverage ⇒ 'INCOMPLETE'; zero coverage ⇒ 'NOT_EVALUATED' — a clean verdict is NEVER fabricated from un-checked inputs",
      "robots.txt crawl check runs ONLY when robots is supplied+parseable (else blockedByRobots:null = not evaluated, never assumed allowed)",
      "index/canonical checks run ONLY for URLs whose page signals are supplied (urlsWithoutSignals are NOT evaluated, never assumed clean)",
      "the composed sitemap parser's own structural findings (invalid/missing <loc>, truncation) are surfaced here and count toward the verdict",
      "canonical/duplicate equality is query-order-insensitive (params sorted) but otherwise exact-string (rel=canonical collapses variants onto one literal URL); robots crawl permission uses the given userAgent product token (default '*')",
    ],
    note: "Fail-closed cross-check: reports only contradictions provable from the inputs; unknown ⇒ not evaluated; CONSISTENT only on full coverage (never fabricated); no ranking claim; nothing published.",
  };
}

export { auditCrawlConsistency };
module.exports = { auditCrawlConsistency };

if (require.main === module) {
  const robots = "User-agent: *\nDisallow: /private";
  const sitemap = '<urlset><url><loc>https://e.com/ok</loc></url><url><loc>https://e.com/private/x</loc></url></urlset>';
  const r = auditCrawlConsistency({ robots, sitemap, userAgent: "Googlebot" });
  process.stdout.write(JSON.stringify({ verdict: r.verdict, summary: r.summary, findings: r.findings.map((f: any) => f.id) }, null, 2) + "\n");
}
