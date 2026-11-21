#!/usr/bin/env node
"use strict";
/*
 * V360 §6/§1 — RADAR COLLECTION → SIGNAL → QUALIFICATION bridge. Closes the next Radar link after live collection (#817):
 * it turns a bounded, allowlisted live fetch into frontier-radar SIGNALS and runs the EXISTING qualification chain
 * (frontier-radar.runRadar: normalize → sanitizeExternal[injection quarantine] → qualify → candidate → mission PROPOSAL).
 * It creates NO mission (proposals only — real mission creation stays owner-gated / deny-by-default) and NO second radar
 * engine (runRadar does all the reasoning). Source-agnostic: the caller supplies the record path + field mapping, so the
 * same bridge works for any allowlisted source (today: FR open-data; tech sources like arXiv/GitHub need owner allowlist).
 *
 * Governance (inherits §6): KILL-SWITCH deny-by-default (no egress unless opts.enabled; DRY otherwise — CI/build never egress);
 * ALLOWLIST-only via bounded-http-client.validateUrl (non-allowlisted/non-HTTPS/private ⇒ REJECTED_URL, SSRF-guarded);
 * external content is UNTRUSTED (runRadar quarantines injection). Fetcher is injectable ⇒ zero network in tests.
 */

const HTTP = require("./bounded-http-client.js");
const RADAR = require("./frontier-radar.js");

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function atPath(obj: any, path: string): any { let cur = obj; for (const k of String(path || "").split(".").filter(Boolean)) { if (!isObj(cur) && !Array.isArray(cur)) return undefined; cur = cur[k]; } return cur; }

/**
 * collectToProposals(src, opts?) -> { enabled, decision|byDecision, signalCount, proposals, quarantined, provenance?, note }.
 *   src: { url, sourceId, reliability?, recordsPath, titleField, claimsField?, categoriesField? }.
 *   opts: { enabled (kill-switch), fetcher?(seam), timeoutMs?, maxBytes?, now?, odgBaseline?, baseline? }.
 * Fetches the allowlisted source (gated), extracts records → rawSignals, runs runRadar. DRY (default) ⇒ no fetch.
 */
async function collectToProposals(src: any, opts: any = {}): Promise<any> {
  const s = isObj(src) ? src : {};
  const o = isObj(opts) ? opts : {};
  const url = typeof s.url === "string" ? s.url : "";
  const v = HTTP.validateUrl(url, HTTP.ALLOWLIST);
  if (!v.ok) return freeze({ enabled: o.enabled === true, decision: "REJECTED_URL", reason: v.code, signalCount: 0, proposals: freeze([]), quarantined: 0, note: "URL not allowlisted / not HTTPS / private host (SSRF-guarded)" });
  if (o.enabled !== true) return freeze({ enabled: false, decision: "DRY_RUN", signalCount: 0, proposals: freeze([]), quarantined: 0, note: "DRY (kill-switch OFF): allowlisted URL validated, NO egress — set ODG_RADAR_LIVE=1 to enable" });

  const fetcher = typeof o.fetcher === "function" ? o.fetcher : HTTP.get;
  let res: any;
  // contentTypes/headers pass-through so non-JSON allowlisted sources (e.g. arXiv Atom XML) validate + are accepted.
  try { res = await fetcher(url, { timeoutMs: o.timeoutMs || 20000, maxBytes: o.maxBytes || 50000, allowlist: HTTP.ALLOWLIST, contentTypes: o.contentTypes, headers: o.headers }); }
  catch (e: any) { return freeze({ enabled: true, decision: "FETCH_ERROR", reason: String((e && e.message) || e), signalCount: 0, proposals: freeze([]), quarantined: 0 }); }
  if (!res || res.ok !== true) return freeze({ enabled: true, decision: "FETCH_FAILED", reason: (res && res.code) || "no response", signalCount: 0, proposals: freeze([]), quarantined: 0 });

  // parser seam (default JSON.parse) → a records container; a non-JSON source (arXiv Atom) supplies its own parser.
  let parsed: any = null;
  const parser = typeof o.parser === "function" ? o.parser : (b: string) => JSON.parse(b);
  try { parsed = parser(String(res.body || "")); } catch { return freeze({ enabled: true, decision: "PARSE_FAILED", reason: "response body did not parse with the supplied/default parser", signalCount: 0, proposals: freeze([]), quarantined: 0 }); }
  const records = arr(atPath(parsed, s.recordsPath));
  // map each record → an UNVERIFIED rawSignal (title/claims/categories by caller field map); sourceId = the host.
  const sourceId = typeof s.sourceId === "string" ? s.sourceId : v.host;
  const rawSignals = records.map((rec: any) => freeze({
    sourceId,
    title: String(atPath(rec, s.titleField) ?? "").slice(0, 300),
    claims: s.claimsField ? arr(atPath(rec, s.claimsField)).map(String).slice(0, 10) : [],
    categories: s.categoriesField ? arr(atPath(rec, s.categoriesField)).map(String).slice(0, 10) : [],
  })).filter((r: any) => r.title.length > 0);

  // the EXISTING qualification chain does normalize→sanitize(injection quarantine)→qualify→candidate→PROPOSAL. No new engine.
  const registry = { [sourceId]: { reliability: typeof s.reliability === "number" ? s.reliability : 0.6 } }; // declared reliability for the allowlisted public source
  const report = RADAR.runRadar({ rawSignals, registry, baseline: isObj(o.baseline) ? o.baseline : { crossChecked: true }, odgBaseline: isObj(o.odgBaseline) ? o.odgBaseline : { capabilities: [] }, now: o.now });
  const quarantined = arr(report.assessed).filter((a: any) => a.untrusted === true).length;
  return freeze({
    enabled: true, decision: "QUALIFIED", signalCount: rawSignals.length,
    byDecision: report.byDecision, quarantined,
    proposals: freeze(arr(report.proposals).map((p: any) => (p && p.title) ? p.title : p).slice(0, 20)),
    // V360 — the qualified, NON-quarantined signals (with qualification + provenance) for the Radar→Learning bridge.
    signals: freeze(arr(report.assessed).filter((a: any) => a.untrusted !== true && a.signal).map((a: any) => freeze({
      sourceId: a.signal.sourceId, title: a.signal.title, claims: a.signal.claims || [], categories: a.signal.categories || [],
      fingerprint: a.signal.fingerprint, decision: a.decision, reliability: (registry[a.signal.sourceId] || {}).reliability ?? null,
      provenance: freeze({ sourceId: a.signal.sourceId, host: v.host, fetchedAt: o.now || null }),
    })).slice(0, 20)),
    provenance: freeze({ host: v.host, records: records.length, sha256: res.sha256 || null, fetchedAt: o.now || null }),
    note: "collection → frontier-radar qualification (normalize/sanitize/qualify/candidate/PROPOSAL); proposals are PROPOSALS — real mission creation stays owner-gated (deny-by-default)",
  });
}

const RADAR_COLLECT_TO_SIGNALS_CONTRACT = Object.freeze({
  id: "V360-RADAR-COLLECT-TO-SIGNALS",
  purpose: "§6/§1 — bridge bounded live collection → frontier-radar qualification (signals → PROPOSALS); closes collection→qualification; no mission creation (owner-gated), no second radar engine",
  reuses: Object.freeze(["bounded-http-client.validateUrl/get (HTTPS+allowlist+SSRF+size/timeout)", "frontier-radar.runRadar (normalize→sanitize[quarantine]→qualify→candidate→proposal — the whole chain)"]),
  invariants: Object.freeze([
    "KILL-SWITCH deny-by-default: no egress unless enabled===true (DRY otherwise — CI never egress); ALLOWLIST-only (REJECTED_URL on non-allowlisted/non-HTTPS/private)",
    "external records are UNTRUSTED signals (UNVERIFIED); injection ⇒ quarantined by frontier-radar.sanitizeExternal (fail-closed)",
    "produces PROPOSALS only — real mission creation stays owner-gated / deny-by-default; the bridge creates no mission",
    "source-agnostic (caller field-map); an unknown source has reliability default; no second radar engine; fetcher injectable ⇒ zero-network tests",
  ]),
});

module.exports = { collectToProposals, RADAR_COLLECT_TO_SIGNALS_CONTRACT };
export {};
