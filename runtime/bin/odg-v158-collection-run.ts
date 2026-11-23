#!/usr/bin/env node
"use strict";
/* V15.9 §10 — V158 Radar COLLECTION: turn governed Radar fetches into recorded, verbatim, pinnable page quotes.
 * Same precedent as docs/odg/evidence/CM-RADAR-GATE-CHAIN_STEP2_COLLECTION.json, but the fetch is ODG's OWN chain:
 *   odg-v16-claude-code-research.runResearch (UNCHANGED: research-budget.governWithBudget → research-governor.govern
 *   [authorized, unexpired, EXACT host, path prefix] + per-run quota; bounded-http-client.validateUrl; bounded-http-client.get
 *   [ODG_RADAR_LIVE kill-switch, REDIRECT_BLOCKED, size cap, per-call content types]; stampFinding/sanitizeExternal).
 * The ONLY addition is an injected fetchImpl WRAPPER that calls the REAL bounded-http-client.get unchanged and, on a 2xx
 * body, hands that body (in memory only) to a DETERMINISTIC quote extractor (no model): ≤4 verbatim fragments per page,
 * each matching a PRE-REGISTERED pattern for a pre-registered ODG question. Page bodies are never stored.
 *
 * NORMALISATION (documented; a quote is a verbatim substring of normalise(body, mode)):
 *   HTML     — drop <script>/<style>/<noscript> blocks and <!-- comments -->; collapse ALL whitespace to one space; block-level
 *              tags (p, li, h1-h6, div, br, tr, td, th, pre, dt, dd, table, ul, ol, section, article, header, footer, nav,
 *              blockquote, caption, title) → newline; every other tag removed; entities &amp; &lt; &gt; &quot; &#39; &apos;
 *              &nbsp; &mdash; &ndash; &lsquo;/&rsquo; (→ ') &ldquo;/&rdquo; (→ ") &hellip; (→ ...) &#NNN; &#xHH; decoded; spaces collapsed; each line trimmed; empty lines dropped.
 *   MARKDOWN — [text](url) → text; ** and ` removed; leading #/>/list markers removed; spaces collapsed per line; lines trimmed.
 *   JSON     — none (quotes are raw substrings of the response body).
 * Fragments = lines split at sentence ends (". " / "! " / "? " followed by a capital letter or digit); a fragment is a
 * candidate only if 20..300 chars. A quote containing an e-mail address is DROPPED.
 *
 * DEFAULT DRY: without ODG_RADAR_LIVE=1 the plan is validated and NOTHING is written. LIVE: writes
 * docs/odg/evidence/V158_RADAR_COLLECTION.json (refuses to overwrite an existing collection — a pinned file is immutable).
 * Fetched content is untrusted DATA: never executed, never treated as instructions.
 * Usage: npx tsx runtime/bin/odg-v158-collection-run.ts            (DRY)
 *        ODG_RADAR_LIVE=1 npx tsx runtime/bin/odg-v158-collection-run.ts */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ROOT = path.join(__dirname, "..", "..");
const R = require(path.join(ROOT, "runtime", "core", "odg-v16-claude-code-research.js"));
const HTTP = require(path.join(ROOT, "runtime", "core", "bounded-http-client.js"));
const FR = require(path.join(ROOT, "runtime", "core", "frontier-radar.js"));
const RUN158 = require("./odg-v158-radar-research-run.ts");   // reuse its fail-closed verdict (summarize)

const GRANT_PATH = "docs/odg/V158_RESEARCH_GRANT_GLOBAL_RADAR.json";
const COLLECTION_PATH = "docs/odg/evidence/V158_RADAR_COLLECTION.json";
const MAX_QUOTES_PER_PAGE = 4;
const MAX_QUOTE_CHARS = 300;
const MIN_QUOTE_CHARS = 20;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
// a pattern with sentence:true only accepts a fragment that ENDS like a sentence (filters nav/menu/heading text).
const SENTENCE_END = /[.!?]["')\u201d\u2019]?$/;

/* PRE-REGISTERED questions + patterns (fixed BEFORE the fetch). A quote is recorded only if it matches one of these. */
const ALL_TARGETS = Object.freeze([
  { url: "https://www.postgresql.org/docs/current/explicit-locking.html", mode: "HTML", topics: ["locking", "concurrency"], capability: "ODG storage concurrency — locking semantics",
    patterns: [
      { id: "PG_ADVISORY_DEF", question: "What does PostgreSQL document advisory locks to be?", re: /application-defined meanings|called advisory locks/i },
      { id: "PG_ADVISORY_LEVELS", question: "At which levels can a PostgreSQL advisory lock be acquired?", re: /ways to acquire an advisory lock/i },
      { id: "PG_LOCK_MODES", question: "What do PostgreSQL lock modes control?", re: /lock modes to control concurrent access/i },
      { id: "PG_DEADLOCK", question: "How does PostgreSQL handle deadlocks?", re: /automatically detects deadlock/i },
    ] },
  // RETIRED (V16.0): Anthropic terms forbid automated access unless explicitly permitted ⇒ the governed admission DEFERS
  // code.claude.com to an owner decision. Kept ONLY so the historical (pinned) collection's quotes stay verifiable against
  // their registered patterns; live runs skip retired targets.
  { retired: true, url: "https://code.claude.com/docs/en/sandboxing.md", mode: "MARKDOWN", topics: ["egress control", "agent isolation"], capability: "ODG provider isolation — sandbox / network egress",
    patterns: [
      { id: "CC_NET_PROXY", question: "How does Claude Code's sandbox restrict network egress?", re: /^(?=.*\bnetwork\b)(?=.*\bproxy\b)/i },
      { id: "CC_NET_DOMAINS", question: "Which network destinations does Claude Code's sandbox allow?", re: /^(?=.*\bnetwork\b)(?=.*\bdomains?\b)/i },
      { id: "CC_OS_PRIMITIVES", question: "Which OS primitives enforce Claude Code's sandbox?", re: /bubblewrap|seatbelt/i },
      { id: "CC_FS_WRITE", question: "How does Claude Code's sandbox restrict filesystem writes?", re: /^(?=.*\bfilesystem\b)(?=.*\bwrite\b)/i },
    ] },
  { url: "https://csrc.nist.gov/pubs/ai/100/2/e2025/final", mode: "HTML", topics: ["adversarial ML taxonomy", "prompt injection"], capability: "ODG Radar untrusted-content handling — prompt injection",
    patterns: [
      { id: "NIST_INDIRECT_PI", question: "How does NIST AI 100-2 define indirect prompt injection?", re: /indirect prompt injection/i },
      { id: "NIST_TAXONOMY", question: "What does NIST AI 100-2 provide?", re: /^(?=.*\btaxonomy\b)(?=.*adversarial machine learning)/i },
      { id: "NIST_TERMINOLOGY", question: "Does NIST AI 100-2 define AML terminology?", re: /\bterminology\b/i },
      { id: "NIST_ATTACK_CLASSES", question: "Which attack classes does NIST AI 100-2 cover?", re: /^(?=.*\bevasion\b)(?=.*\bpoisoning\b)/i },
    ] },
  { url: "https://www.sqlite.org/docs.html", mode: "HTML", topics: ["embedded storage", "documentation index"], capability: "ODG embedded storage — durability / concurrency",
    patterns: [
      { id: "SQLITE_WAL", question: "What does SQLite document about write-ahead logging?", re: /write-ahead log/i },
      { id: "SQLITE_ATOMIC", question: "What does SQLite document about atomic commit?", re: /atomic commit/i },
      { id: "SQLITE_LOCKING", question: "What does SQLite document about file locking and concurrency?", re: /^(?=.*\blocking\b)(?=.*\bconcurren)/i },
      { id: "SQLITE_ISOLATION", question: "What does SQLite document about isolation?", re: /\bisolation\b/i },
    ] },
  { url: "https://registry.npmjs.org/next/latest", mode: "JSON", topics: ["dependency intelligence", "Next.js release"], capability: "ODG dependency intelligence — Next.js current release",
    patterns: [
      { id: "NPM_NAME_VERSION", question: "What is the current `latest` version of next on npm?", re: /"name"\s*:\s*"next"\s*,\s*"version"\s*:\s*"[0-9][^"]{0,39}"/ },
      { id: "NPM_NAME_THEN_VERSION", question: "What is the current `latest` version of next on npm (name and version not adjacent)?", re: /"name"\s*:\s*"next"[^{}]{0,200}?"version"\s*:\s*"[0-9][^"]{0,39}"/ },
    ] },
  { url: "https://registry.npmjs.org/react/latest", mode: "JSON", topics: ["dependency intelligence", "React release"], capability: "ODG dependency intelligence — React current release",
    patterns: [
      { id: "NPM_NAME_VERSION", question: "What is the current `latest` version of react on npm?", re: /"name"\s*:\s*"react"\s*,\s*"version"\s*:\s*"[0-9][^"]{0,39}"/ },
      { id: "NPM_NAME_THEN_VERSION", question: "What is the current `latest` version of react on npm (name and version not adjacent)?", re: /"name"\s*:\s*"react"[^{}]{0,200}?"version"\s*:\s*"[0-9][^"]{0,39}"/ },
    ] },
]);
const TARGETS = Object.freeze(ALL_TARGETS.filter((t: any) => t.retired !== true));   // live targets only

const BLOCK_TAGS = "p|li|h[1-6]|div|br|tr|td|th|pre|dt|dd|table|ul|ol|section|article|header|footer|nav|blockquote|caption|title";
function decodeEntities(s: string): string {
  return s.replace(/&#x([0-9a-f]{1,6});/gi, (_m: string, h: string) => { const n = parseInt(h, 16); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : " "; })
    .replace(/&#([0-9]{1,7});/g, (_m: string, d: string) => { const n = parseInt(d, 10); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : " "; })
    .replace(/&nbsp;/g, " ").replace(/&mdash;/g, "\u2014").replace(/&ndash;/g, "\u2013").replace(/&rsquo;|&lsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, "\"").replace(/&hellip;/g, "...").replace(/&quot;/g, "\"").replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function tidyLines(s: string): string { return s.split("\n").map((l: string) => l.replace(/[ \t\r\f\v ]+/g, " ").trim()).filter(Boolean).join("\n"); }

/** normalise(body, mode): PURE, documented above. */
function normalise(body: any, mode: string): string {
  const b = String(body == null ? "" : body);
  if (mode === "JSON") return b;
  if (mode === "HTML") {
    let s = b.replace(/<!--[\s\S]*?-->/g, " ").replace(/<(script|style|noscript)\b[\s\S]*?<\/\1\s*>/gi, " ");
    s = s.replace(/\s+/g, " ");
    s = s.replace(new RegExp("<\\/?(?:" + BLOCK_TAGS + ")\\b[^>]*>", "gi"), "\n").replace(/<[^>]*>/g, "");
    return tidyLines(decodeEntities(s));
  }
  // MARKDOWN
  const s = b.replace(/\r/g, "").split("\n").map((l: string) => l.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\*\*|`/g, "").replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+\.\s+)/, "")).join("\n");
  return tidyLines(s);
}

/** fragments(text): sentence-level fragments; every fragment is a substring of text (split + trim only). */
function fragments(text: string): string[] {
  const out: string[] = [];
  for (const line of String(text).split("\n")) for (const f of line.split(/(?<=[.!?])\s+(?=[A-Z0-9])/)) { const t = f.trim(); if (t) out.push(t); }
  return out;
}

/** extractQuotes(target, body): PURE, deterministic. ≤ MAX_QUOTES_PER_PAGE quotes, one per pre-registered pattern (first match
 *  in document order), each a verbatim substring of normalise(body), 20..300 chars, no e-mail address. */
function extractQuotes(target: any, body: any): any[] {
  const t = target && typeof target === "object" ? target : {};
  const patterns: any[] = Array.isArray(t.patterns) ? t.patterns : [];
  const text = normalise(body, t.mode);
  const out: any[] = []; const used = new Set<string>();
  const ok = (q: string) => q.length >= MIN_QUOTE_CHARS && q.length <= MAX_QUOTE_CHARS && !EMAIL_RE.test(q) && !used.has(q) && text.includes(q);
  for (const p of patterns) {
    if (out.length >= MAX_QUOTES_PER_PAGE) break;
    if (!p || !(p.re instanceof RegExp)) continue;
    let quote: string | null = null;
    if (t.mode === "JSON") { const re = new RegExp(p.re.source, p.re.flags.replace("g", "")); const m = text.match(re); if (m && ok(m[0])) quote = m[0]; }
    else { for (const f of fragments(text)) { if (p.re.test(f) && ok(f) && (p.sentence !== true || SENTENCE_END.test(f))) { quote = f; break; } } }
    if (quote) { used.add(quote); out.push(Object.freeze({ patternId: p.id, question: p.question, quote })); }
  }
  return out;
}

/** buildCollection(out, extracted, nowMs): PURE. Same schema as the step-2 collection (+ sha256/bytes/contentType/normalisation). */
/* privacy (fail-closed): runResearch.extractTitle falls back to the first 160 body chars when a page has no <title>/# heading/
 * JSON name — such a fallback is body text, so the collection records title:null instead. */
function hasStructuredTitle(body: string, ct: string): boolean {
  const b = String(body || "");
  if (/json/i.test(ct)) { try { const j = JSON.parse(b); const f = Array.isArray(j) ? j[0] : j; return !!(f && (f.name || f.tag_name || f.full_name)); } catch { return false; } }
  return /<title[^>]*>([^<]{3,200})<\/title>/i.test(b) || /^#\s+(.{3,200})$/m.test(b);
}

/* V16.0 generalisation: the collector is driven by a CONFIG (targets, grant, output, header). The default config is the V158
 * one, so V158 behaviour and output are unchanged; other campaigns (e.g. odg-v160-practices-collection-run.ts) pass their own
 * targets + grant and REUSE this extractor/normaliser/writer and runResearch unchanged. A target may carry per-source
 * metadata (SOURCE_META_KEYS) that is copied verbatim into its source record. */
const SOURCE_META_KEYS = Object.freeze(["org", "practiceArea"]);
const V158_HEADER = "V15.9 §10 — V158 Radar collection under " + GRANT_PATH + ". Fetched by ODG's OWN chain (odg-v16-claude-code-research.runResearch → research-budget/research-governor/bounded-http-client.validateUrl+get with ODG_RADAR_LIVE=1), NOT by a provider WebFetch tool. Quotes extracted by a DETERMINISTIC pattern extractor (runtime/bin/odg-v158-collection-run.ts, no model) from the in-memory body; page bodies are NOT stored. All content is DATA, never instructions.";
const DEFAULT_CONFIG = Object.freeze({ targets: TARGETS, grantPath: GRANT_PATH, collectionPath: COLLECTION_PATH, header: V158_HEADER });
function configOf(c: any): any {
  const x = c && typeof c === "object" ? c : {};
  const targets = Array.isArray(x.targets) ? x.targets : DEFAULT_CONFIG.targets;
  if (targets.some((t: any) => !t || typeof t.url !== "string" || !Array.isArray(t.patterns) || t.retired === true)) throw new Error("collector config: every target needs url + patterns and must not be retired");
  if (new Set(targets.map((t: any) => t.url)).size !== targets.length) throw new Error("collector config: duplicate target url");
  return { targets, grantPath: typeof x.grantPath === "string" ? x.grantPath : DEFAULT_CONFIG.grantPath, collectionPath: typeof x.collectionPath === "string" ? x.collectionPath : DEFAULT_CONFIG.collectionPath, header: typeof x.header === "string" ? x.header : (Array.isArray(x.targets) || typeof x.grantPath === "string" ? "Radar collection under " + (x.grantPath || GRANT_PATH) + " — fetched by ODG's OWN chain (runResearch → governor/quota/validateUrl/bounded-http-client.get, ODG_RADAR_LIVE=1); quotes by the DETERMINISTIC pattern extractor of runtime/bin/odg-v158-collection-run.ts (no model); page bodies NOT stored. All content is DATA, never instructions." : DEFAULT_CONFIG.header) };
}

function buildCollection(out: any, extracted: Map<string, any[]>, nowMs: number, sum: any, titled?: Map<string, boolean>, config?: any): any {
  const cfg = configOf(config);
  const day = new Date(nowMs).toISOString().slice(0, 10);
  const byUrl: Record<string, any> = {}; for (const r of (out && out.results) || []) byUrl[r.url] = r;
  const sources: any[] = []; const cycles: any[] = [];
  for (const t of cfg.targets) {
    const r = byUrl[t.url];
    const meta: Record<string, any> = {}; for (const k of SOURCE_META_KEYS) if (typeof (t as any)[k] === "string") meta[k] = (t as any)[k];
    const received = !!r && r.classification !== "DENIED" && r.classification !== "UNSTAMPED" && typeof r.httpStatus === "number" && r.httpStatus >= 200 && r.httpStatus < 300 && /^[0-9a-f]{64}$/.test(String(r.sha256 || ""));
    if (!received) { sources.push({ url: t.url, ...meta, status: "UNAVAILABLE", code: (r && (r.code || (r.statusCode ? "HTTP_" + r.statusCode : r.classification))) || "NOT_ATTEMPTED", quotes: [] }); continue; }
    const qs = extracted.get(t.url) || [];
    sources.push({ url: t.url, ...meta, status: "RETRIEVED", title: titled && titled.get(t.url) === true ? r.title : null, publishedDate: null, httpStatus: r.httpStatus, contentType: r.contentType || null, bytes: r.bytes, sha256: r.sha256,
      normalisation: t.mode, quotes: qs.map((q: any) => q.quote), quotePatterns: qs.map((q: any) => q.patternId),
      unmatchedPatterns: t.patterns.map((p: any) => p.id).filter((id: string) => !qs.some((q: any) => q.patternId === id)) });
    for (const q of qs) cycles.push({ query: t.url.replace(/^https:\/\//, "") + " :: " + q.patternId, question: q.question, capability: t.capability, claim: "The page states: " + q.quote, support: [{ url: t.url, quote: q.quote }] });
  }
  const screening = sources.filter((s: any) => s.status === "RETRIEVED").map((s: any) => { const x = FR.sanitizeExternal({ title: s.title, body: s.quotes.join("\n") }); return { url: s.url, untrusted: x.untrusted, injectionFlags: x.injectionFlags }; });
  return {
    "//": cfg.header,
    grant: cfg.grantPath,
    consultedDate: day,
    collectedAtIso: new Date(nowMs).toISOString(),
    callsUsed: out.attempted,
    budgetMaxCalls: null as any,
    verdict: sum.verdict,
    extraction: "deterministic pre-registered-pattern extractor (runtime/bin/odg-v158-collection-run.ts): each quote is a verbatim substring of the documented normalisation (HTML tag strip + entity decode / Markdown link+emphasis strip / JSON raw), 20..300 chars, ≤4 per page, e-mail-bearing quotes dropped; sha256 is of the RAW response body",
    sources,
    cycles,
    screening,
    egressGating: "govern()+per-run quota (research-budget.governWithBudget) and bounded-http-client.validateUrl ran IN THIS PROCESS immediately before each fetch (runResearch planRun + per-call re-check); bounded-http-client.get was the only egress (ODG_RADAR_LIVE=1, GET, redirects blocked, size cap). This live-time gating is recorded by the collector, not reproducible from the repo alone (the replay re-checks the plan).",
  };
}

/** collect({ live, nowMs, fetchImpl?, outPath?, overwrite?, config? }): live=false ⇒ plan only, NEVER writes, NEVER fetches.
 *  config = { targets, grantPath, collectionPath, header } (default: V158). */
async function collect(o: any): Promise<any> {
  const opts = o && typeof o === "object" ? o : {};
  const cfg = configOf(opts.config);
  const TARGETS = cfg.targets;
  const grant = JSON.parse(fs.readFileSync(path.join(ROOT, cfg.grantPath), "utf8")).grant;
  const live = opts.live === true;
  const nowMs = Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();
  const outPath = opts.outPath || path.join(ROOT, cfg.collectionPath);
  if (!live) { const plan = R.planRun(TARGETS, grant, nowMs); return { written: false, reason: "DRY (ODG_RADAR_LIVE!=1): nothing fetched, nothing written", plan: plan.plan.map((p: any) => [p.decision, p.url]) }; }
  if (fs.existsSync(outPath) && opts.overwrite !== true) return { written: false, reason: "REFUSED: " + outPath + " exists (a collection is immutable once recorded/pinned)" };
  const inner = typeof opts.fetchImpl === "function" ? opts.fetchImpl : HTTP.get;
  const byTarget: Record<string, any> = {}; for (const t of TARGETS) byTarget[t.url] = t;   // live targets only
  const extracted = new Map<string, any[]>();
  const titled = new Map<string, boolean>();
  // WRAPPER: passes the REAL call through unchanged; additionally extracts quotes from the in-memory body (never stored).
  const wrapper = async (url: string, fo: any) => {
    const res = await inner(url, fo);
    if (res && res.ok && typeof res.body === "string" && res.statusCode >= 200 && res.statusCode < 300 && byTarget[url]) { extracted.set(url, extractQuotes(byTarget[url], res.body)); titled.set(url, hasStructuredTitle(res.body, res.contentType || "")); }
    return res;
  };
  const out = await R.runResearch(TARGETS, grant, nowMs, true, wrapper);
  const sum = RUN158.summarize(out, true);
  if (sum.verdict === "DENIED" || sum.verdict === "LIVE_NO_RESPONSE") return { written: false, reason: "REFUSED: verdict " + sum.verdict, verdict: sum };
  const col = buildCollection(out, extracted, nowMs, sum, titled, cfg);
  col.budgetMaxCalls = grant.budget && grant.budget.maxCalls;
  fs.writeFileSync(outPath, JSON.stringify(col, null, 2) + "\n");
  return { written: true, path: outPath, verdict: sum, sha256OfFile: crypto.createHash("sha256").update(fs.readFileSync(outPath)).digest("hex"), quotes: col.sources.reduce((a: number, s: any) => a + s.quotes.length, 0), cycles: col.cycles.length };
}

async function main(): Promise<void> {
  const r = await collect({ live: process.env.ODG_RADAR_LIVE === "1" });
  process.stdout.write(JSON.stringify(r, null, 2) + "\n");
  if (process.env.ODG_RADAR_LIVE === "1" && !r.written) process.exit(2);
}
if (require.main === module) main().catch((e) => { process.stderr.write("v158 collection error: " + ((e && e.message) || e) + "\n"); process.exit(1); });
module.exports = { configOf, DEFAULT_CONFIG, SOURCE_META_KEYS, SENTENCE_END, hasStructuredTitle, TARGETS, ALL_TARGETS, GRANT_PATH, COLLECTION_PATH, MAX_QUOTES_PER_PAGE, MAX_QUOTE_CHARS, EMAIL_RE, normalise, fragments, extractQuotes, buildCollection, collect };
export {};
