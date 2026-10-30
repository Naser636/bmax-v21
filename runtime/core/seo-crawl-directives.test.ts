#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the §8 crawl-directives parser: robots.txt per the OFFICIAL Google spec
// (most-specific UA group; longest-rule-path wins; Allow wins ties; *, $ wildcards; empty Disallow ⇒ allow all; sitemap
// global) + sitemap.xml/sitemapindex structural validation. PURE PARSE, NO network; fail-closed (bad input ⇒ structured
// error; absent ⇒ null); negative tests throughout. Synthetic fixtures only; publishes nothing.
"use strict";
const assert = require("assert");
const D = require("./seo-crawl-directives.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// ---- robots.txt parse ----
// (1) groups, rules, global sitemap, comments stripped.
{
  const txt = "# comment\nUser-agent: *\nDisallow: /tmp  # inline comment\nAllow: /tmp/ok\nCrawl-delay: 5\nSitemap: https://e.com/s.xml";
  const r = D.parseRobotsTxt(txt);
  ok("parses group/rules/crawl-delay + GLOBAL sitemap; comments stripped",
     r.ok && r.groups.length === 1 && r.groups[0].agents[0] === "*" && r.groups[0].rules.length === 2 && r.groups[0].crawlDelay === 5 && r.sitemaps[0] === "https://e.com/s.xml");
}
// (2) empty Disallow ⇒ allow all (imposes nothing).
{
  const r = D.isPathAllowed("User-agent: *\nDisallow:", { url: "https://e.com/anything" });
  ok("empty Disallow ⇒ allow all (rule imposes nothing)", r.allowed === true && r.matchedRule === null);
}
// (3) PRECEDENCE: longest rule path wins ⇒ Allow of a deeper path overrides a shorter Disallow.
{
  const txt = "User-agent: *\nDisallow: /private\nAllow: /private/public";
  const blocked = D.isPathAllowed(txt, { url: "https://e.com/private/secret" });
  const allowed = D.isPathAllowed(txt, { url: "https://e.com/private/public/page" });
  ok("longest-path precedence: /private/secret disallowed; /private/public/page allowed (deeper Allow wins)",
     blocked.allowed === false && allowed.allowed === true && allowed.matchedRule.path === "/private/public");
}
// (4) PRECEDENCE tie ⇒ Allow wins (least restrictive) on EQUAL-length conflicting rules.
{
  const txt = "User-agent: *\nDisallow: /p\nAllow: /p";
  const r = D.isPathAllowed(txt, { url: "https://e.com/p" });
  ok("equal-length Allow vs Disallow ⇒ Allow wins (least restrictive)", r.allowed === true && r.matchedRule.type === "allow");
}
// (5) GROUP SELECTION: the most-specific (longer) user-agent group wins; `*` ignored when a specific matches.
{
  const txt = "User-agent: *\nDisallow: /\nUser-agent: Googlebot\nDisallow: /no\nAllow: /";
  const g = D.isPathAllowed(txt, { url: "https://e.com/yes", userAgent: "Googlebot/2.1" });
  const other = D.isPathAllowed(txt, { url: "https://e.com/yes", userAgent: "BingBot" });
  ok("specific Googlebot group used (not *); unrelated UA falls to * (disallow /)",
     g.allowed === true && g.group === "specific" && other.allowed === false && other.group === "wildcard");
}
// (6) WILDCARD `*` and END-ANCHOR `$`.
{
  const star = D.isPathAllowed("User-agent: *\nDisallow: /*.pdf", { url: "https://e.com/docs/a.pdf" });
  const anchor = D.isPathAllowed("User-agent: *\nDisallow: /*.php$", { url: "https://e.com/x.php" });
  const anchorMiss = D.isPathAllowed("User-agent: *\nDisallow: /*.php$", { url: "https://e.com/x.php?q=1" });
  ok("`*` matches /docs/a.pdf; `$` anchors /x.php but NOT /x.php?q=1",
     star.allowed === false && anchor.allowed === false && anchorMiss.allowed === true);
}
// (7) path matching uses path+QUERY; two consecutive User-agent lines share one ruleset.
{
  const txt = "User-agent: foo\nUser-agent: bar\nDisallow: /x";
  const r = D.parseRobotsTxt(txt);
  const both = r.groups.length === 1 && r.groups[0].agents.length === 2;
  const q = D.isPathAllowed("User-agent: *\nDisallow: /search?q=", { url: "https://e.com/search?q=secret" });
  ok("consecutive user-agent lines ⇒ one combined group; Disallow matches path+query", both && q.allowed === false);
}
// (8) ReDoS bound: collapsed wildcards + a pathological pattern resolve fast; multi-`*` collapses to one `.*`.
{
  const txt = "User-agent: *\nDisallow: /" + "*".repeat(5000) + "a";
  const t0 = Date.now(); const r = D.isPathAllowed(txt, { url: "https://e.com/" + "b".repeat(5000) }); const ms = Date.now() - t0;
  ok("pathological `*` run collapses (no quadratic hang, <1s) + still a valid decision", typeof r.allowed === "boolean" && ms < 1000);
}

// ---- sitemap.xml ----
// (9) urlset parse: loc/lastmod/changefreq/priority extracted + validated.
{
  const xml = '<?xml version="1.0"?><urlset><url><loc>https://e.com/</loc><lastmod>2026-10-30</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url><url><loc>https://e.com/b</loc></url></urlset>';
  const r = D.parseSitemap(xml);
  ok("urlset ⇒ 2 urls; first fully parsed + valid (no findings); absent fields ⇒ null",
     r.ok && r.type === "urlset" && r.urls.length === 2 && r.urls[0].priority === 0.8 && r.urls[0].changefreq === "daily" && r.urls[1].lastmod === null && r.findings.length === 0);
}
// (10) NEGATIVE: invalid priority / changefreq / non-absolute loc ⇒ findings (no fabricated validity).
{
  const xml = '<urlset><url><loc>/relative</loc><changefreq>often</changefreq><priority>5</priority></url></urlset>';
  const r = D.parseSitemap(xml);
  ok("relative loc ⇒ HIGH; bad changefreq + priority>1 ⇒ findings; priority not fabricated (stays null)",
     r.findings.some((f) => f.id === "sitemap:loc" && f.severity === "HIGH") && r.findings.some((f) => f.id === "sitemap:changefreq") && r.findings.some((f) => f.id === "sitemap:priority") && r.urls[0].priority === null);
}
// (11) sitemapindex ⇒ nested sitemaps LISTED, not fetched.
{
  const xml = '<sitemapindex><sitemap><loc>https://e.com/s1.xml</loc><lastmod>2026-10-30</lastmod></sitemap><sitemap><loc>https://e.com/s2.xml</loc></sitemap></sitemapindex>';
  const r = D.parseSitemap(xml);
  ok("sitemapindex ⇒ type sitemapindex, 2 child sitemaps listed, urls empty", r.type === "sitemapindex" && r.sitemaps.length === 2 && r.sitemaps[0].loc === "https://e.com/s1.xml" && r.urls.length === 0);
}
// (12) CDATA + entity decoding in <loc>.
{
  const xml = '<urlset><url><loc><![CDATA[https://e.com/a?x=1&amp;y=2]]></loc></url></urlset>';
  const r = D.parseSitemap(xml);
  ok("CDATA + &amp; decoded in loc", r.urls[0].loc === "https://e.com/a?x=1&y=2");
}
// (13) FAIL-CLOSED: non-sitemap / non-string / oversize ⇒ structured error, no crash, no fabrication.
{
  const notSm = D.parseSitemap("<html><body>not a sitemap</body></html>");
  const bad = D.parseSitemap(42);
  const bigRobots = D.parseRobotsTxt("x".repeat(9 * 1024 * 1024));
  ok("non-sitemap ⇒ NOT_A_SITEMAP; non-string ⇒ INVALID_INPUT; >8MB ⇒ TOO_LARGE",
     notSm.ok === false && notSm.code === "NOT_A_SITEMAP" && bad.code === "INVALID_INPUT" && bigRobots.code === "TOO_LARGE");
}
// (14) malformed robots lines recorded (not crashed); directive-before-UA ignored with an issue.
{
  const r = D.parseRobotsTxt("garbage-no-colon\nDisallow: /early\nUser-agent: *\nDisallow: /ok");
  ok("no-colon line + rule-before-user-agent ⇒ parseIssues recorded; valid group still parsed",
     r.ok && r.parseIssues.some((i) => /no directive separator/.test(i)) && r.parseIssues.some((i) => /before any user-agent/.test(i)) && r.groups.length === 1 && r.groups[0].rules.length === 1);
}
// (15) NO NETWORK: structural check of the module source.
{
  const src = require("fs").readFileSync(require("path").join(process.cwd(), "runtime/core/seo-crawl-directives.ts"), "utf8");
  ok("source has NO network/fetch/http import (pure parse of provided bytes)",
     !/\brequire\(['"](https?|node:https?|node-fetch|undici)['"]\)/.test(src) && !/\bfetch\s*\(/.test(src) && !/\bhttps?\.(get|request)\b/.test(src));
}
// (16) default allow when no group matches at all (no `*` group, unrelated specific group).
{
  const r = D.isPathAllowed("User-agent: SomeBot\nDisallow: /", { url: "https://e.com/x", userAgent: "OtherBot" });
  ok("no applicable group (no * and specific doesn't match) ⇒ allow all (honest default)", r.allowed === true && r.group === "none");
}

// (17) AUDIT regression (Finding 1) — a LESS-specific sibling UA group must NOT contribute rules to a more-specific
// crawler. `Bot`(Allow deep) + `Botxyz`(Disallow /secret), crawler Botxyz ⇒ ONLY the Botxyz group applies ⇒ disallowed
// (previously the shorter `Bot` Allow was wrongly merged ⇒ false "allowed" = false-readiness).
{
  const txt = "User-agent: Bot\nAllow: /secret/longer-path-xyz\n\nUser-agent: Botxyz\nDisallow: /secret";
  const r = D.isPathAllowed(txt, { url: "https://e.com/secret/longer-path-xyz", userAgent: "Botxyz" });
  ok("most-specific UA group ONLY: Botxyz's Disallow applies, Bot's deeper Allow is NOT merged ⇒ disallowed",
     r.allowed === false && r.matchedRule && r.matchedRule.type === "disallow" && r.matchedRule.path === "/secret");
}
// (18) AUDIT regression (Finding 2) — a many-opens/no-close sitemap (quadratic-DoS payload) parses in LINEAR time
// (<2s at ~1MB) and returns an honest empty result — no hang, no crash, no fabricated urls.
{
  const payload = "<urlset>" + "<url>".repeat(200000);   // ~1MB of opening tags, NO closing tags
  const t0 = Date.now(); const r = D.parseSitemap(payload); const ms = Date.now() - t0;
  ok("200k unterminated <url> opens parse in linear time (<2s) ⇒ ok, 0 urls (no quadratic hang, no fabrication)",
     r.ok === true && r.type === "urlset" && r.urls.length === 0 && ms < 2000);
}

console.log(`\nSEO-CRAWL-DIRECTIVES suite — ${pass} assertions passed. (robots.txt official precedence: most-specific UA, longest-path, Allow-wins-tie, *,$ wildcards, empty-Disallow⇒allow; sitemap urlset/index structural validation; pure parse NO network; fail-closed)`);
