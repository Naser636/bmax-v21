#!/usr/bin/env node
"use strict";
/*
 * V360 §2 — RADAR TECH SOURCES (arXiv + GitHub). Owner-authorized tech sources, integrated into the EXISTING Radar
 * collection→qualification path (odg-radar-collect-to-signals → frontier-radar.runRadar) — NOT a second Radar/collector.
 * It defines PRECISE endpoints (exact host + path + method + format), a per-source parser (arXiv = Atom XML, GitHub = JSON),
 * and a field map that normalizes each record to a frontier-radar signal (title + claims[]). All §3 controls are inherited:
 * HTTPS-only + exact-host allowlist + SSRF + size/timeout cap (bounded-http-client); KILL-SWITCH deny-by-default (DRY unless
 * enabled — CI never egresses); injection ⇒ QUARANTINE (frontier-radar.sanitizeExternal); provenance recorded. Read-only GET;
 * no auth/token/secret, no paywall/private access, no purchase/signup, no deploy.
 */

const COLLECT = require("./odg-radar-collect-to-signals.js");

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/** Minimal, bounded Atom parser for arXiv: extract <entry> title/id/published/summary → records with a claims[] array. */
function parseArxivAtom(body: string): any {
  const entries: any[] = [];
  const tag = (s: string, t: string): string => { const m = new RegExp("<" + t + "[^>]*>([\\s\\S]*?)<\\/" + t + ">").exec(s); return m ? m[1].replace(/\s+/g, " ").trim() : ""; };
  const re = /<entry>([\s\S]*?)<\/entry>/g; let m: any; let guard = 0;
  while ((m = re.exec(String(body))) !== null && guard++ < 50) {
    const summary = tag(m[1], "summary").slice(0, 500);
    entries.push({ title: tag(m[1], "title"), id: tag(m[1], "id"), published: tag(m[1], "published"), claims: summary ? [summary] : [] });
  }
  return { entries };
}
/** GitHub search JSON → items normalized so `claims` is an array (the description). */
function parseGithubJson(body: string): any {
  const j = JSON.parse(String(body));
  const items = (Array.isArray(j.items) ? j.items : []).map((it: any) => ({ full_name: it && it.full_name, claims: it && typeof it.description === "string" && it.description ? [it.description] : [], categories: Array.isArray(it && it.topics) ? it.topics : [] }));
  return { items };
}

// EXACT endpoints + parsers (no blind sub-domain/URL). q is the caller's research topic (owner-selected, from V360 gaps).
const SOURCES: any = Object.freeze({
  arxiv: freeze({ host: "export.arxiv.org", reliability: 0.85, recordsPath: "entries", titleField: "title", claimsField: "claims",
    contentTypes: freeze(["application/atom+xml", "application/xml", "text/xml"]), headers: freeze({ accept: "application/atom+xml" }), parser: parseArxivAtom,
    buildUrl: (q: string) => `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(q)}&max_results=5&sortBy=submittedDate&sortOrder=descending` }),
  github: freeze({ host: "api.github.com", reliability: 0.8, recordsPath: "items", titleField: "full_name", claimsField: "claims", categoriesField: "categories",
    contentTypes: freeze(["application/json"]), headers: freeze({ accept: "application/vnd.github+json" }), parser: parseGithubJson,
    buildUrl: (q: string) => `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=updated&per_page=5` }),
});

/**
 * collectTechSource(sourceId, topic, opts?) -> collection→qualification result for arXiv|github. DRY (default) ⇒ no egress.
 *   opts: { enabled (kill-switch), fetcher?(seam), baseline?, odgBaseline?, now? }.
 */
async function collectTechSource(sourceId: any, topic: any, opts: any = {}): Promise<any> {
  const o = isObj(opts) ? opts : {};
  const src = SOURCES[sourceId];
  if (!src) return freeze({ ok: false, code: "UNKNOWN_SOURCE", detail: `source must be one of: ${Object.keys(SOURCES).join(", ")}` });
  if (typeof topic !== "string" || !topic.trim()) return freeze({ ok: false, code: "NO_TOPIC", detail: "a research topic string is required" });
  const url = src.buildUrl(topic);
  const r = await COLLECT.collectToProposals(
    { url, sourceId, reliability: src.reliability, recordsPath: src.recordsPath, titleField: src.titleField, claimsField: src.claimsField, categoriesField: src.categoriesField },
    { enabled: o.enabled === true, fetcher: o.fetcher, parser: src.parser, contentTypes: src.contentTypes, headers: src.headers, baseline: o.baseline, odgBaseline: o.odgBaseline, now: o.now },
  );
  return freeze({ ok: true, source: sourceId, host: src.host, topic, url, ...r });
}

const RADAR_TECH_SOURCES_CONTRACT = Object.freeze({
  id: "V360-RADAR-TECH-SOURCES",
  purpose: "§2 — integrate arXiv (Atom) + GitHub (JSON) into the EXISTING Radar collection→qualification path; precise endpoints + per-source parser; owner-authorized tech sources; no second Radar/collector",
  sources: Object.freeze(Object.keys(SOURCES)),
  reuses: Object.freeze(["odg-radar-collect-to-signals (collection→runRadar qualification)", "bounded-http-client (HTTPS+exact-host allowlist+SSRF+size/timeout)", "frontier-radar.sanitizeExternal (injection quarantine, via the bridge)"]),
  invariants: Object.freeze([
    "EXACT endpoints (host+path+format) — no blind sub-domain/URL; read-only GET; no auth/token/secret, no paywall/private access, no purchase/signup, no deploy",
    "KILL-SWITCH deny-by-default (DRY unless enabled — CI never egresses); allowlist/SSRF/size/timeout inherited from bounded-http-client",
    "external content is UNTRUSTED (injection ⇒ QUARANTINE via the bridge); provenance recorded; produces PROPOSALS only (mission creation owner-gated)",
    "parsers (arXiv Atom / GitHub JSON) normalize records to {title, claims[]}; no second Radar/collector/engine",
  ]),
});

module.exports = { collectTechSource, parseArxivAtom, parseGithubJson, SOURCES, RADAR_TECH_SOURCES_CONTRACT };
export {};
