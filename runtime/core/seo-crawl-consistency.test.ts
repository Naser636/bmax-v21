#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the §8 cross-consistency audit: the contradictions GSC reports as coverage errors
// (sitemap URL blocked by robots.txt; sitemap URL noindex; sitemap URL non-canonical; duplicate loc). Composes
// seo-crawl-directives. PURE, NO network; fail-closed/HONEST (robots absent ⇒ not-evaluated not assumed-allowed;
// URL without signals ⇒ not-evaluated not assumed-clean). Synthetic fixtures only; publishes nothing.
"use strict";
const assert = require("assert");
const A = require("./seo-crawl-consistency.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const SITEMAP = (locs) => "<urlset>" + locs.map((l) => `<url><loc>${l}</loc></url>`).join("") + "</urlset>";

// (1) GSC "Submitted URL blocked by robots.txt": a sitemap URL that robots disallows ⇒ HIGH.
{
  const r = A.auditCrawlConsistency({ robots: "User-agent: *\nDisallow: /private", sitemap: SITEMAP(["https://e.com/ok", "https://e.com/private/x"]), userAgent: "Googlebot" });
  ok("sitemap URL disallowed by robots.txt ⇒ HIGH blocked-by-robots; the allowed URL is clean",
     r.verdict === "CONFLICTS_FOUND" && r.summary.blockedByRobots === 1 && r.findings.some((f) => f.id === "sitemap-url:blocked-by-robots" && f.severity === "HIGH") && !r.findings.some((f) => /ok/.test(f.evidence) && f.id === "sitemap-url:blocked-by-robots"));
}
// (2) GSC "Submitted URL marked noindex": a sitemap URL whose page signals say noindex ⇒ HIGH.
{
  const r = A.auditCrawlConsistency({ sitemap: SITEMAP(["https://e.com/a"]), pageSignals: [{ url: "https://e.com/a", robotsMeta: "noindex,follow" }] });
  ok("sitemap URL with noindex page signals ⇒ HIGH noindex conflict", r.summary.noindexConflicts === 1 && r.findings.some((f) => f.id === "sitemap-url:noindex" && f.severity === "HIGH"));
}
// (3) non-canonical: a sitemap URL whose page canonicalises elsewhere ⇒ MEDIUM.
{
  const r = A.auditCrawlConsistency({ sitemap: SITEMAP(["https://e.com/a?utm=1"]), pageSignals: [{ url: "https://e.com/a?utm=1", canonical: "https://e.com/a" }] });
  ok("sitemap URL canonicalising to a different URL ⇒ MEDIUM non-canonical", r.summary.nonCanonical === 1 && r.findings.some((f) => f.id === "sitemap-url:non-canonical" && f.severity === "MEDIUM"));
}
// (4) FULL coverage (robots + signals for every URL), self-canonical + index ⇒ CONSISTENT, no finding.
{
  const r = A.auditCrawlConsistency({ robots: "User-agent: *\nAllow: /", sitemap: SITEMAP(["https://e.com/a"]), pageSignals: [{ url: "https://e.com/a", canonical: "https://e.com/a", robotsMeta: "index,follow" }] });
  ok("full coverage + self-canonical + index ⇒ CONSISTENT, no finding", r.verdict === "CONSISTENT" && r.findings.length === 0 && r.summary.fullyEvaluated === true);
}
// (5) duplicate <loc> ⇒ MEDIUM.
{
  const r = A.auditCrawlConsistency({ sitemap: SITEMAP(["https://e.com/a", "https://e.com/a"]) });
  ok("duplicate loc ⇒ MEDIUM duplicate-loc, duplicateCount 1", r.summary.duplicateCount === 1 && r.findings.some((f) => f.id === "sitemap:duplicate-loc"));
}
// (6) FAIL-CLOSED honesty: robots NOT supplied ⇒ blockedByRobots is null (NOT evaluated, not assumed allowed).
{
  const r = A.auditCrawlConsistency({ sitemap: SITEMAP(["https://e.com/private/x"]) });
  ok("robots absent ⇒ blockedByRobots null (not evaluated), robotsEvaluated false, no fabricated clean crawl verdict",
     r.summary.blockedByRobots === null && r.summary.robotsEvaluated === false && !r.findings.some((f) => f.id === "sitemap-url:blocked-by-robots"));
}
// (7) FAIL-CLOSED honesty: URL without page signals ⇒ counted urlsWithoutSignals, index/canonical NOT asserted clean.
{
  const r = A.auditCrawlConsistency({ sitemap: SITEMAP(["https://e.com/a", "https://e.com/b"]), pageSignals: [{ url: "https://e.com/a", robotsMeta: "index" }] });
  ok("URL with no signals ⇒ urlsWithoutSignals counted (not assumed clean); the signalled one evaluated",
     r.summary.urlsWithoutSignals === 1 && r.summary.sitemapUrlCount === 2);
}
// (8) user-agent specificity flows through: a URL disallowed ONLY for a specific bot is clean for '*'.
{
  const robots = "User-agent: *\nAllow: /\nUser-agent: BadBot\nDisallow: /x";
  const forBad = A.auditCrawlConsistency({ robots, sitemap: SITEMAP(["https://e.com/x"]), userAgent: "BadBot" });
  const forStar = A.auditCrawlConsistency({ robots, sitemap: SITEMAP(["https://e.com/x"]), userAgent: "Googlebot" });
  ok("per-UA: /x blocked for BadBot (HIGH) but allowed for Googlebot (clean)",
     forBad.summary.blockedByRobots === 1 && forStar.summary.blockedByRobots === 0);
}
// (9) input validation: missing sitemap ⇒ error; a sitemapindex is rejected (needs a urlset of page URLs).
{
  const noSm = A.auditCrawlConsistency({});
  const idx = A.auditCrawlConsistency({ sitemap: "<sitemapindex><sitemap><loc>https://e.com/s.xml</loc></sitemap></sitemapindex>" });
  ok("missing sitemap ⇒ INVALID_SITEMAP; sitemapindex ⇒ NOT_A_URLSET (honest, not silently empty)",
     noSm.ok === false && noSm.code === "INVALID_SITEMAP" && idx.ok === false && idx.code === "NOT_A_URLSET");
}
// (10) end-to-end multi-conflict: one blocked + one noindex + one dup + one clean.
{
  const robots = "User-agent: *\nDisallow: /blocked";
  const sitemap = SITEMAP(["https://e.com/clean", "https://e.com/blocked/p", "https://e.com/ni", "https://e.com/clean"]);
  const r = A.auditCrawlConsistency({ robots, sitemap, pageSignals: [{ url: "https://e.com/ni", robotsMeta: "none" }, { url: "https://e.com/clean", robotsMeta: "index", canonical: "https://e.com/clean" }] });
  ok("multi-conflict: 1 blocked (HIGH) + 1 noindex (HIGH) + 1 duplicate (MEDIUM); verdict CONFLICTS_FOUND",
     r.summary.blockedByRobots === 1 && r.summary.noindexConflicts === 1 && r.summary.duplicateCount === 1 && r.verdict === "CONFLICTS_FOUND" && r.findings.filter((f) => f.severity === "HIGH").length === 2);
}
// (11) NO NETWORK structural check.
{
  const src = require("fs").readFileSync(require("path").join(process.cwd(), "runtime/core/seo-crawl-consistency.ts"), "utf8");
  ok("source has NO network/fetch/http (pure cross-check of supplied inputs)",
     !/\brequire\(['"](https?|node:https?|node-fetch|undici)['"]\)/.test(src) && !/\bfetch\s*\(/.test(src) && !/\bhttps?\.(get|request)\b/.test(src));
}

// (12) AUDIT regression (F1 false-clean): ZERO coverage (no robots, no signals) ⇒ NOT_EVALUATED (never CONSISTENT);
// PARTIAL coverage ⇒ INCOMPLETE. "nothing contradicted" must not read as "nothing was checkable".
{
  const none = A.auditCrawlConsistency({ sitemap: SITEMAP(["https://e.com/private/secret", "https://e.com/other"]) });
  const partial = A.auditCrawlConsistency({ robots: "User-agent: *\nAllow: /", sitemap: SITEMAP(["https://e.com/a", "https://e.com/b"]) });  // robots yes, signals none
  ok("zero coverage ⇒ NOT_EVALUATED (not CONSISTENT); robots-only ⇒ INCOMPLETE (signals missing); fullyEvaluated false",
     none.verdict === "NOT_EVALUATED" && none.summary.fullyEvaluated === false && partial.verdict === "INCOMPLETE" && partial.summary.fullyEvaluated === false);
}
// (13) AUDIT regression (F2 discarded structural findings): a sitemap with an invalid <loc> ⇒ the parser's HIGH
// structural finding is SURFACED and the verdict is CONFLICTS_FOUND (NOT CONSISTENT); invalidLocCount reported.
{
  const r = A.auditCrawlConsistency({ sitemap: "<urlset><url><loc>not-a-valid-loc</loc></url></urlset>" });
  ok("invalid <loc> ⇒ composed parser's HIGH finding surfaced + CONFLICTS_FOUND (not silently CONSISTENT)",
     r.findings.some((f) => f.id === "sitemap:loc" && f.severity === "HIGH") && r.verdict === "CONFLICTS_FOUND" && r.summary.invalidLocCount === 1);
}
// (14) AUDIT regression (F3 double-count): a blocked URL listed TWICE ⇒ blockedByRobots counts DISTINCT URLs (1), plus
// a separate duplicate-loc finding. (F4) query-order-equivalent canonical ⇒ NOT flagged non-canonical (false-positive gone).
{
  const dup = A.auditCrawlConsistency({ robots: "User-agent: *\nDisallow: /private", sitemap: SITEMAP(["https://e.com/private/x", "https://e.com/private/x"]) });
  const qorder = A.auditCrawlConsistency({ robots: "User-agent: *\nAllow: /", sitemap: SITEMAP(["https://e.com/a?x=1&y=2"]), pageSignals: [{ url: "https://e.com/a?x=1&y=2", canonical: "https://e.com/a?y=2&x=1", robotsMeta: "index" }] });
  ok("duplicate blocked URL ⇒ blockedByRobots=1 (distinct) + duplicate-loc finding; query-order-equivalent canonical ⇒ no non-canonical finding",
     dup.summary.blockedByRobots === 1 && dup.summary.distinctUrlCount === 1 && dup.findings.some((f) => f.id === "sitemap:duplicate-loc") && qorder.summary.nonCanonical === 0 && qorder.verdict === "CONSISTENT");
}

console.log(`\nSEO-CRAWL-CONSISTENCY suite — ${pass} assertions passed. (GSC-style conflicts: sitemap-URL blocked-by-robots/noindex/non-canonical + duplicate loc; per-UA; fail-closed: robots-absent⇒not-evaluated, no-signals⇒not-evaluated; pure, NO network)`);
