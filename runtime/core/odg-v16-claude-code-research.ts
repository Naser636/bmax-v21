#!/usr/bin/env node
"use strict";
/* V16 §8 — Claude Code ecosystem research through the EXISTING Radar controls (no second radar, no new egress path).
 * Composes, bypasses nothing:
 *   research-budget.governWithBudget → research-governor.govern (grant: authorized, unexpired, EXACT host, path prefix)
 *     + per-run quota (requireBudget) ;
 *   bounded-http-client.validateUrl (transport: https, exact-host per-call allowlist = grant.allowedDomains, SSRF guard) ;
 *   bounded-http-client.get — the ONLY egress point (ODG_RADAR_LIVE kill-switch, REDIRECT_BLOCKED, per-call contentTypes) ;
 *   research-governor.stampFinding (dated provenance, sanitizeExternal injection quarantine).
 * planRun() is PURE (no I/O). runResearch() fetches only when live===true AND every gate ALLOWs; fetchImpl is injected
 * (tests never touch the network). Fetched content is untrusted DATA: it is hashed, a title is extracted, nothing is executed,
 * and no finding is integrated here (evaluation before integration is a later, separate step). */
const crypto = require("crypto");
const GOV = require("./research-governor.js");
const BUDGET = require("./research-budget.js");
const HTTP = require("./bounded-http-client.js");

const GRANT_PATH = "docs/odg/V16_RESEARCH_GRANT_CLAUDE_CODE.json";
const MAX_TARGETS = 10;

// Concrete pages (≤ 10). code.claude.com pages use the ".md" rendition (markdown text) where the docs site provides one.
const TARGETS = Object.freeze([
  { url: "https://code.claude.com/docs/en/sub-agents.md", topics: ["delegation", "agent capabilities", "parallel orchestration"] },
  { url: "https://code.claude.com/docs/en/hooks.md", topics: ["process / session management", "diagnostics"] },
  { url: "https://code.claude.com/docs/en/settings.md", topics: ["context / resource limits", "agent capabilities"] },
  { url: "https://code.claude.com/docs/en/iam.md", topics: ["agent capabilities", "delegation"] },
  { url: "https://code.claude.com/docs/en/common-workflows.md", topics: ["parallel orchestration", "resume after interruption"] },
  { url: "https://code.claude.com/docs/en/interactive-mode.md", topics: ["process / session management", "speed"] },
  { url: "https://code.claude.com/docs/en/headless.md", topics: ["process / session management", "delegation"] },
  { url: "https://code.claude.com/docs/en/troubleshooting.md", topics: ["diagnostics", "context / resource limits"] },
  { url: "https://www.anthropic.com/engineering/claude-code-best-practices", topics: ["parallel orchestration", "speed", "context / resource limits"] },
  { url: "https://api.github.com/repos/anthropics/claude-code/releases?per_page=5", topics: ["agent capabilities", "diagnostics"] },
]);

function hostOfUrl(u: string): string | null { try { return new URL(u).hostname; } catch { return null; } }

/** planRun(targets, grant, nowMs): PURE validation of every planned URL through the real governor+quota and the real
 * transport validateUrl — NO egress. usage counts the ALLOWed calls in plan order (per-run quota). */
function planRun(targets: readonly any[], grant: any, nowMs: number): any {
  const g = grant && typeof grant === "object" ? grant : {};
  const allowlist: string[] = Array.isArray(g.allowedDomains) ? g.allowedDomains.slice() : [];
  const ctMap = g.contentTypesPerCall && typeof g.contentTypesPerCall === "object" ? g.contentTypesPerCall : {};
  const list = Array.isArray(targets) ? targets : [];
  const overflow = list.length > MAX_TARGETS;
  let calls = 0;
  const plan = list.map((t: any, i: number) => {
    const url = String(t && t.url);
    const host = hostOfUrl(url);
    const reasons: string[] = [];
    if (i >= MAX_TARGETS) reasons.push("TARGET_LIMIT_EXCEEDED");
    const gov = BUDGET.governWithBudget({ urls: [url], method: "GET" }, g, nowMs, { calls, bytes: 0 }, {}, { requireBudget: true });
    if (gov.decision !== "ALLOW") reasons.push(...gov.reasons);
    const tr = HTTP.validateUrl(url, allowlist);
    if (!tr.ok) reasons.push("TRANSPORT:" + tr.code);
    const contentTypes: string[] = host && Array.isArray(ctMap[host]) ? ctMap[host].slice() : [];
    if (contentTypes.length === 0) reasons.push("NO_CONTENT_TYPES_DECLARED");
    const decision = reasons.length ? "DENY" : "ALLOW";
    if (decision === "ALLOW") calls++;
    return Object.freeze({ url, host, topics: Array.isArray(t && t.topics) ? t.topics.slice() : [], decision, reasons: Object.freeze(reasons), contentTypes: Object.freeze(contentTypes) });
  });
  return Object.freeze({ overflow, allowed: plan.filter((p: any) => p.decision === "ALLOW").length, denied: plan.filter((p: any) => p.decision !== "ALLOW").length, plan: Object.freeze(plan) });
}

function extractTitle(body: string, ct: string): string {
  const b = String(body || "");
  if (/json/i.test(ct)) { try { const j = JSON.parse(b); const first = Array.isArray(j) ? j[0] : j; const n = first && (first.name || first.tag_name || first.full_name); return String(n || "json").slice(0, 200); } catch { return "unparsable json"; } }
  const t = b.match(/<title[^>]*>([^<]{3,200})<\/title>/i); if (t) return t[1].trim().replace(/\s+/g, " ");
  const h = b.match(/^#\s+(.{3,200})$/m); if (h) return h[1].trim();
  return b.slice(0, 160).replace(/\s+/g, " ").trim() || "empty";
}

/** runResearch(targets, grant, nowMs, live, fetchImpl): DRY unless live===true. Live: fetch ONLY plan-ALLOWed URLs through
 * fetchImpl (default bounded-http-client.get; kill-switch inside), re-checking the quota with REAL bytes before each call. */
async function runResearch(targets: readonly any[], grant: any, nowMs: number, live: boolean, fetchImpl: any = HTTP.get): Promise<any> {
  const p = planRun(targets, grant, nowMs);
  if (!live) return Object.freeze({ mode: "DRY", egress: 0, ...p, results: Object.freeze([]) });
  const b = (grant && grant.budget) || {};
  const results: any[] = [];
  let calls = 0, bytes = 0;
  const day = new Date(nowMs).toISOString().slice(0, 10);
  for (const item of p.plan) {
    if (item.decision !== "ALLOW") { results.push({ url: item.url, classification: "DENIED", reasons: item.reasons }); continue; }
    const q = BUDGET.governWithBudget({ urls: [item.url] }, grant, nowMs, { calls, bytes }, {}, { requireBudget: true });
    if (q.decision !== "ALLOW") { results.push({ url: item.url, classification: "DENIED", reasons: q.reasons }); continue; }
    calls++;
    let res: any;
    try { res = await fetchImpl(item.url, { allowlist: grant.allowedDomains, timeoutMs: b.timeoutMs || 15000, maxBytes: b.perResponseMaxBytes || 300000, maxRedirects: 0, contentTypes: item.contentTypes, headers: { accept: item.contentTypes.join(",") } }); }
    catch (e: any) { res = { ok: false, code: "FETCH_THREW", detail: (e && e.message) || String(e) }; }
    if (!res || !res.ok) { results.push({ url: item.url, classification: "LIVE_UNAVAILABLE", code: res && res.code, statusCode: res && res.statusCode }); continue; }
    const body = String(res.body || ""); bytes += Buffer.byteLength(body);
    const sha256 = crypto.createHash("sha256").update(body).digest("hex");
    const stamp = GOV.stampFinding(extractTitle(body, res.contentType || ""), { url: item.url, date: day, credibility: "HIGH", liveFetched: true, httpStatus: res.statusCode, sourceClass: "LIVE_SOURCE" });
    results.push({ url: item.url, topics: item.topics, classification: stamp.ok ? stamp.finding.sourceClass : "UNSTAMPED", httpStatus: res.statusCode, contentType: res.contentType, bytes: Buffer.byteLength(body), sha256, title: stamp.ok ? stamp.finding.content : null, untrusted: stamp.ok ? stamp.finding.untrusted : null, integrated: false });
  }
  return Object.freeze({ mode: "LIVE", egress: calls, bytes, ...p, results: Object.freeze(results) });
}

module.exports = { TARGETS, MAX_TARGETS, GRANT_PATH, planRun, runResearch, extractTitle };
export {};
