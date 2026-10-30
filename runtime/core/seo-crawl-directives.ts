#!/usr/bin/env node
/**
 * seo-crawl-directives — parse a site's CRAWL-CONTROL files from ALREADY-OBTAINED bytes: robots.txt and sitemap.xml
 * (incl. sitemap index). It is PURE PARSING of caller-supplied strings: NO network I/O, NO fetch, NO crawl, NO DNS —
 * the caller provides `robots.txt` / `sitemap.xml` content (captured out-of-band under separate authorization). It
 * PUBLISHES NOTHING and makes NO ranking/traffic claim. It complements the §8 SEO workstream (seo-page-signal-extractor
 * + seo-technical-audit) by answering "is this URL crawl-permitted by robots.txt?" and "what does the sitemap declare?".
 *
 * robots.txt — grounded on the OFFICIAL Google spec (developers.google.com/crawling/docs/robots-txt/robots-txt-spec,
 * verified 2026-10-30):
 *   - GROUP SELECTION: the group with the MOST SPECIFIC (longest) user-agent token that is a prefix of the crawler's
 *     product token (case-insensitive) wins; all groups matching that specific agent are COMBINED; user-agent-specific
 *     groups and the global `*` group are NEVER combined (specific beats `*`; `*` only when no specific group matches).
 *   - RULE PRECEDENCE: the most specific rule by LENGTH of the rule path wins; on conflict (incl. wildcards) the LEAST
 *     RESTRICTIVE rule wins ⇒ Allow beats Disallow on an equal-length tie. `*` = any sequence, `$` = end-of-URL anchor.
 *   - An EMPTY Disallow/Allow value imposes nothing (Disallow: <empty> ⇒ allow all). Missing/empty robots ⇒ allow all.
 *   - `Sitemap:` directives are GLOBAL (not tied to a user-agent group).
 *
 * sitemap.xml — grounded on the sitemaps.org 0.9 protocol: <urlset> of <url>(loc,lastmod,changefreq,priority) OR
 * <sitemapindex> of <sitemap>(loc,lastmod). Validates loc-absolute-http(s), priority in [0.0,1.0], changefreq enum,
 * lastmod shape; records violations as findings (never fabricates validity). Bounds bytes + URL count (DoS guard) and
 * reports truncation HONESTLY (no silent cap). NO nested-sitemap fetching (that would be network I/O).
 *
 * Fail-closed/honest: unparseable input ⇒ structured error (no crash, no fabricated data); an absent field ⇒ null.
 * Pure/deterministic, dependency-free; NO new primitive. Findings shape {id,area,severity,detail,remediation,evidence}.
 */
"use strict";

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
const MAX_BYTES = 8 * 1024 * 1024;     // bound caller-supplied bytes (ReDoS/DoS guard)
const MAX_URLS = 50000;                // sitemaps.org protocol cap: 50,000 URLs per sitemap

// ---------------------------------------------------------------------------------------------------------------------
// robots.txt
// ---------------------------------------------------------------------------------------------------------------------

/**
 * parseRobotsTxt(text): returns { ok, groups:[{agents,rules:[{type,path}],crawlDelay}], sitemaps:[string], parseIssues }.
 * Pure parse of the supplied text; NO network. Lines after a `#` are comments; directive keys are case-insensitive.
 */
function parseRobotsTxt(text: any): any {
  if (typeof text !== "string") return { ok: false, code: "INVALID_INPUT", reason: "robots.txt content (string) required" };
  if (text.length > MAX_BYTES) return { ok: false, code: "TOO_LARGE", reason: `robots.txt exceeds ${MAX_BYTES} bytes` };
  const groups: any[] = [];
  const sitemaps: string[] = [];
  const parseIssues: string[] = [];
  let current: any = null;          // the group being built
  let sawRuleInCurrent = false;     // once a rule appears, the next user-agent starts a NEW group

  const lines = text.split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const hash = line.indexOf("#");
    if (hash >= 0) line = line.slice(0, hash);     // strip comment
    line = line.trim();
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon < 0) { parseIssues.push(`line ${i + 1}: no directive separator ':' — ignored ('${line.slice(0, 40)}')`); continue; }
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (key === "user-agent" || key === "useragent") {
      // A user-agent line directly after a rule starts a NEW group; consecutive user-agent lines accrue to the same one.
      if (current === null || sawRuleInCurrent) { current = { agents: [], rules: [], crawlDelay: null }; groups.push(current); sawRuleInCurrent = false; }
      if (value) current.agents.push(value.toLowerCase());
      else parseIssues.push(`line ${i + 1}: empty user-agent value — ignored`);
    } else if (key === "disallow" || key === "allow") {
      if (current === null) { parseIssues.push(`line ${i + 1}: ${key} before any user-agent — ignored`); continue; }
      sawRuleInCurrent = true;
      if (value === "") { if (key === "disallow") { /* empty Disallow ⇒ allow all ⇒ impose nothing */ } continue; }   // empty path imposes nothing
      current.rules.push({ type: key, path: value });
    } else if (key === "crawl-delay") {
      if (current === null) { parseIssues.push(`line ${i + 1}: crawl-delay before any user-agent — ignored`); continue; }
      sawRuleInCurrent = true;
      const n = Number(value);
      if (Number.isFinite(n) && n >= 0) current.crawlDelay = n; else parseIssues.push(`line ${i + 1}: non-numeric crawl-delay '${value}' — ignored`);
    } else if (key === "sitemap") {
      if (value) sitemaps.push(value); else parseIssues.push(`line ${i + 1}: empty sitemap value — ignored`);   // GLOBAL, not tied to a group
    } else {
      parseIssues.push(`line ${i + 1}: unknown directive '${key}' — ignored`);
    }
  }
  return { ok: true, groups, sitemaps, parseIssues, note: "Pure parse of supplied bytes; NO network. Sitemap directives are global. Empty Disallow ⇒ allow all." };
}

/** build a RegExp from a robots path pattern (`*`=any sequence, trailing `$`=end anchor); collapse `*` runs (anti-ReDoS). */
function robotsPatternToRegExp(pattern: string): RegExp {
  let p = pattern.replace(/\*+/g, "*");                       // collapse consecutive wildcards (avoids `.*.*` backtracking)
  let anchorEnd = false;
  if (p.endsWith("$")) { anchorEnd = true; p = p.slice(0, -1); }
  // escape every regex metachar EXCEPT our `*`, then turn `*` into `.*`
  const esc = p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp("^" + esc + (anchorEnd ? "$" : ""));
}

/** does any non-`*` agent token in the group match the crawler product token (case-insensitive prefix)? returns the longest matching token length, or -1. */
function specificAgentMatch(group: any, crawler: string): number {
  let best = -1;
  for (const a of group.agents) {
    if (a === "*") continue;
    if (crawler.startsWith(a)) best = Math.max(best, a.length);   // Google: the UA value matches as a prefix of the crawler token
  }
  return best;
}

/**
 * isPathAllowed(robots, { userAgent, url }): decide crawl permission per the official precedence (longest rule wins;
 * Allow wins ties). `robots` is a parseRobotsTxt result OR raw text. Returns { ok, allowed, matchedRule, group, reason }.
 * NOTE: this is the robots.txt CRAWL decision — distinct from a page's meta-robots INDEX directive (seo-technical-audit).
 * CONTRACT: `userAgent` must be the bare PRODUCT TOKEN (e.g. "Googlebot"), not a full User-Agent header string; matching
 * is a case-insensitive prefix of that token. KNOWN LIMITATION: paths are compared as supplied — percent-encoding is NOT
 * normalised across the rule and the URL (well-formed robots.txt already percent-encodes; low real-world impact).
 */
function isPathAllowed(robots: any, opts: any): any {
  const parsed = isObj(robots) && Array.isArray(robots.groups) ? robots : parseRobotsTxt(typeof robots === "string" ? robots : "");
  if (!parsed.ok) return parsed;
  if (!isObj(opts) || typeof opts.url !== "string" || !opts.url) return { ok: false, code: "INVALID_INPUT", reason: "{ url, userAgent? } required" };
  const crawler = (typeof opts.userAgent === "string" ? opts.userAgent : "*").toLowerCase();

  // ---- resolve the applicable path: pathname + query (Google matches against path+query) ----
  let pathAndQuery: string;
  try { const u = new URL(opts.url); pathAndQuery = u.pathname + (u.search || ""); }
  catch { pathAndQuery = opts.url.startsWith("/") ? opts.url : "/" + opts.url; }   // tolerate a bare path

  // ---- GROUP SELECTION: specific (longest UA prefix) wins; combine all groups sharing that specific agent; else `*` ----
  let bestSpecific = -1;
  for (const g of parsed.groups) bestSpecific = Math.max(bestSpecific, specificAgentMatch(g, crawler));
  let applicable: any[];
  let groupKind: string;
  // ONLY the single most-specific user-agent applies: combine groups whose BEST matching token == bestSpecific (NOT any
  // group with a shorter prefix-match). A less-specific sibling token (e.g. `Bot` vs `Botxyz`) must NOT contribute rules.
  if (bestSpecific >= 0) { applicable = parsed.groups.filter((g: any) => specificAgentMatch(g, crawler) === bestSpecific); groupKind = "specific"; }
  else { applicable = parsed.groups.filter((g: any) => g.agents.includes("*")); groupKind = applicable.length ? "wildcard" : "none"; }

  if (!applicable.length) return { ok: true, allowed: true, matchedRule: null, group: groupKind, reason: "no applicable group (specific or *) ⇒ allow all" };

  // ---- RULE PRECEDENCE: longest rule path wins; Allow wins ties (least restrictive) ----
  const rules = applicable.flatMap((g: any) => g.rules);
  let winner: any = null;
  for (const r of rules) {
    let re: RegExp;
    try { re = robotsPatternToRegExp(r.path); } catch { continue; }
    if (!re.test(pathAndQuery)) continue;
    if (winner === null) { winner = r; continue; }
    if (r.path.length > winner.path.length) winner = r;
    else if (r.path.length === winner.path.length && r.type === "allow" && winner.type === "disallow") winner = r;   // tie ⇒ Allow wins
  }
  const allowed = winner === null ? true : winner.type === "allow";
  return {
    ok: true, allowed, matchedRule: winner, group: groupKind,
    reason: winner === null ? "no matching rule ⇒ allow (default)" : `most-specific rule ${winner.type} '${winner.path}' (len ${winner.path.length})${allowed ? "" : " ⇒ disallowed"}`,
    note: "robots.txt CRAWL permission (distinct from meta-robots INDEX). Longest-path wins; Allow wins ties.",
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// sitemap.xml
// ---------------------------------------------------------------------------------------------------------------------

const CHANGEFREQ = new Set(["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"]);
function tagText(block: string, tag: string): string | null {
  const m = new RegExp(`<${tag}\\b[^>]{0,2000}>([\\s\\S]{0,4096}?)</${tag}\\s*>`, "i").exec(block);
  return m ? decodeXml(m[1].trim()) : null;
}
function decodeXml(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&").trim();
}
// A real tag boundary: the char after a tag name must be whitespace, '>', or '/' (so "<url" does NOT match "<urlset").
function tagBoundaryOk(ch: string | undefined): boolean { return ch === undefined || ch === ">" || ch === "/" || /\s/.test(ch); }
/**
 * extractElementBlocks — LINEAR (indexOf-based) extraction of `<name>...</name>` blocks, capped at `maxCount`. This
 * replaces a global lazy-regex `.match()` whose unbounded `[\s\S]*?` was QUADRATIC on many-opens/no-close input (a real
 * DoS inside the byte bound). `indexOf` cursors advance monotonically; the moment no further closing tag exists we stop
 * (no complete block can follow), so the worst case is O(bytes). Boundary-checked so `<urlset>`/`</sitemapindex>` never
 * false-match `<url>`/`</sitemap>`. Returns { blocks, truncated } (truncated reported honestly, never silently dropped).
 */
function extractElementBlocks(body: string, name: string, maxCount: number): { blocks: string[]; truncated: boolean } {
  const lower = body.toLowerCase();
  const openNeedle = "<" + name, closeNeedle = "</" + name;
  const blocks: string[] = []; let truncated = false; let i = 0;
  while (i < body.length) {
    let start = -1, p = i;
    for (;;) { const idx = lower.indexOf(openNeedle, p); if (idx < 0) break; if (tagBoundaryOk(lower[idx + openNeedle.length])) { start = idx; break; } p = idx + openNeedle.length; }
    if (start < 0) break;
    const openEnd = body.indexOf(">", start); if (openEnd < 0) break;
    let close = -1; p = openEnd + 1;
    for (;;) { const idx = lower.indexOf(closeNeedle, p); if (idx < 0) break; if (tagBoundaryOk(lower[idx + closeNeedle.length])) { close = idx; break; } p = idx + closeNeedle.length; }
    if (close < 0) break;                                   // no further closing tag anywhere ⇒ no more complete blocks (keeps it linear)
    const closeEnd = body.indexOf(">", close); if (closeEnd < 0) break;
    if (blocks.length >= maxCount) { truncated = true; break; }
    blocks.push(body.slice(start, closeEnd + 1));
    i = closeEnd + 1;                                       // forward progress past the consumed block
  }
  return { blocks, truncated };
}

/**
 * parseSitemap(xml): returns { ok, type:'urlset'|'sitemapindex', urls:[{loc,lastmod,changefreq,priority}],
 * sitemaps:[{loc,lastmod}], findings, truncated }. Pure parse; NO network (nested sitemaps are listed, NOT fetched).
 */
function parseSitemap(xml: any): any {
  if (typeof xml !== "string") return { ok: false, code: "INVALID_INPUT", reason: "sitemap.xml content (string) required" };
  if (xml.length > MAX_BYTES) return { ok: false, code: "TOO_LARGE", reason: `sitemap exceeds ${MAX_BYTES} bytes` };
  const body = xml.replace(/<!--[\s\S]*?-->/g, " ");
  const isIndex = /<sitemapindex[\s>]/i.test(body);
  const isUrlset = /<urlset[\s>]/i.test(body);
  if (!isIndex && !isUrlset) return { ok: false, code: "NOT_A_SITEMAP", reason: "no <urlset> or <sitemapindex> root element found" };
  const findings: any[] = [];
  const add = (id: string, severity: string, detail: string, remediation: string, evidence: string) => findings.push({ id, area: "sitemap", severity, detail, remediation, evidence });
  const locOk = (loc: string | null) => typeof loc === "string" && /^https?:\/\/[^\s]+$/i.test(loc);
  const lastmodOk = (lm: string | null) => lm == null || /^\d{4}-\d{2}-\d{2}([Tt]\d{2}:\d{2}(:\d{2}(\.\d+)?)?([Zz]|[+-]\d{2}:\d{2})?)?$/.test(lm);

  let truncated = false;
  if (isIndex) {
    const ext = extractElementBlocks(body, "sitemap", MAX_URLS); truncated = ext.truncated;
    const sitemaps: any[] = [];
    for (const b of ext.blocks) {
      const loc = tagText(b, "loc"); const lastmod = tagText(b, "lastmod");
      if (!locOk(loc)) add("sitemapindex:loc", "HIGH", "a <sitemap> entry has a missing or non-absolute-http(s) <loc>", "each <loc> must be a full absolute http(s) URL", `loc '${loc}'`);
      if (!lastmodOk(lastmod)) add("sitemapindex:lastmod", "LOW", `malformed <lastmod> '${lastmod}'`, "use W3C Datetime (YYYY-MM-DD[THH:MM...])", `lastmod '${lastmod}'`);
      sitemaps.push({ loc, lastmod });
    }
    if (truncated) add("sitemapindex:count", "MEDIUM", `more than ${MAX_URLS} child sitemaps — parsing capped (NOT silently dropped)`, "split the index per the 50,000-entry protocol limit", `cap ${MAX_URLS}`);
    return { ok: true, type: "sitemapindex", urls: [], sitemaps, findings, truncated, note: "Nested sitemaps are LISTED, not fetched (no network). Validation is structural, not a liveness/crawl check." };
  }

  const ext = extractElementBlocks(body, "url", MAX_URLS); truncated = ext.truncated;
  const urls: any[] = [];
  for (const b of ext.blocks) {
    const loc = tagText(b, "loc");
    const lastmod = tagText(b, "lastmod");
    const changefreq = tagText(b, "changefreq");
    const priorityRaw = tagText(b, "priority");
    if (!locOk(loc)) add("sitemap:loc", "HIGH", "a <url> entry has a missing or non-absolute-http(s) <loc>", "each <loc> must be a full absolute http(s) URL", `loc '${loc}'`);
    if (!lastmodOk(lastmod)) add("sitemap:lastmod", "LOW", `malformed <lastmod> '${lastmod}'`, "use W3C Datetime (YYYY-MM-DD[THH:MM...])", `lastmod '${lastmod}'`);
    if (changefreq != null && !CHANGEFREQ.has(changefreq.toLowerCase())) add("sitemap:changefreq", "LOW", `invalid <changefreq> '${changefreq}'`, "use one of always/hourly/daily/weekly/monthly/yearly/never", `changefreq '${changefreq}'`);
    let priority: number | null = null;
    if (priorityRaw != null) {
      const n = Number(priorityRaw);
      if (!Number.isFinite(n) || n < 0 || n > 1) add("sitemap:priority", "LOW", `<priority> '${priorityRaw}' out of [0.0,1.0]`, "priority must be between 0.0 and 1.0", `priority '${priorityRaw}'`);
      else priority = n;
    }
    urls.push({ loc, lastmod, changefreq: changefreq ? changefreq.toLowerCase() : null, priority });
  }
  if (truncated) add("sitemap:count", "MEDIUM", `more than ${MAX_URLS} <url> entries — parsing capped (NOT silently dropped)`, "split into multiple sitemaps per the 50,000-URL protocol limit", `cap ${MAX_URLS}`);
  return { ok: true, type: "urlset", urls, sitemaps: [], findings, truncated, note: "Pure structural parse of supplied bytes; NO network, NO liveness/crawl check; absent fields ⇒ null." };
}

export { parseRobotsTxt, isPathAllowed, robotsPatternToRegExp, parseSitemap };
module.exports = { parseRobotsTxt, isPathAllowed, robotsPatternToRegExp, parseSitemap };

if (require.main === module) {
  const robots = "User-agent: *\nDisallow: /private\nAllow: /private/public\nSitemap: https://e.com/sitemap.xml";
  const a = isPathAllowed(robots, { url: "https://e.com/private/public/x", userAgent: "Googlebot" });
  const sm = parseSitemap('<urlset><url><loc>https://e.com/</loc><priority>0.8</priority></url></urlset>');
  process.stdout.write(JSON.stringify({ allowed: a.allowed, matched: a.matchedRule, urls: sm.urls.length }, null, 2) + "\n");
}
