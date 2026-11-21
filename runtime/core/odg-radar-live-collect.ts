#!/usr/bin/env node
"use strict";
/*
 * V360 §6 — GOVERNED RADAR LIVE COLLECTION. The owner authorized (§6) connecting the existing bounded-http-client to public
 * free sources for REAL radar collection, in the dev environment, under strict conditions. This is the thin governed wrapper
 * that enforces those conditions around the EXISTING fr07-live-collection.collectLive (which itself reuses bounded-http-client
 * HTTPS+allowlist+SSRF+size/timeout cap + frontier-radar.sanitizeExternal injection-quarantine). It adds:
 *   - KILL-SWITCH: egress happens ONLY when explicitly enabled (opts.enabled===true, mapped by the bin from ODG_RADAR_LIVE=1);
 *     default DRY ⇒ URLs are validated but NO network call is made (safe for CI/build — nothing egresses by default).
 *   - ALLOWLIST: only bounded-http-client.ALLOWLIST public free sources (no arbitrary-URL fetch).
 *   - QUOTA: at most maxRequests URLs per run (default 2).
 *   - TRACEABILITY: per-URL provenance (host, bytes, sha256, fetchedAt) from fr07.
 * No access-control bypass, no auth/secrets, no purchase/signup, no crawling, no deploy. PURE except the injected fetcher
 * (fr07's default is the real bounded-http-client.get; tests inject a seam ⇒ zero network in CI). It gives fr07-live-collection
 * a real consumer and moves §3.2 from seam to governed-and-demonstrated collection. No second HTTP client / radar engine.
 */

const FR07 = require("./fr07-live-collection.js");
const HTTP = require("./bounded-http-client.js");

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/**
 * governedLiveCollect(input, opts?) -> { enabled, quota, requested, allowlist, results[], note }.
 *   input: { urls:string[], title? }. opts: { enabled (kill-switch), maxRequests?, fetcher?(seam), timeoutMs?, maxBytes?, now? }.
 * Kill-switch OFF (default) ⇒ every URL is validated but returns DRY_RUN (no egress). A non-allowlisted URL ⇒ REJECTED_URL.
 */
async function governedLiveCollect(input: any, opts: any = {}): Promise<any> {
  const i = isObj(input) ? input : {};
  const o = isObj(opts) ? opts : {};
  const enabled = o.enabled === true;                                  // kill-switch: deny-by-default (no egress unless explicit)
  const maxRequests = Number.isInteger(o.maxRequests) && o.maxRequests > 0 ? o.maxRequests : 2; // quota
  const allowlist = HTTP.ALLOWLIST;
  const urls = (Array.isArray(i.urls) ? i.urls : []).filter((u: any) => typeof u === "string" && u).slice(0, maxRequests);
  const results: any[] = [];
  for (const url of urls) {
    const v = HTTP.validateUrl(url, allowlist);
    if (!v.ok) { results.push(freeze({ url, decision: "REJECTED_URL", reason: v.code })); continue; } // allowlist + HTTPS + SSRF
    if (!enabled) { results.push(freeze({ url, host: v.host, decision: "DRY_RUN", reason: "egress disabled (kill-switch OFF) — set ODG_RADAR_LIVE=1 to enable" })); continue; }
    const r = await FR07.collectLive({ url, title: typeof i.title === "string" ? i.title : "live-source", allowlist, fetcher: o.fetcher, timeoutMs: o.timeoutMs, maxBytes: o.maxBytes, now: o.now });
    results.push(freeze({ url, host: v.host, decision: r.decision, statusCode: r.statusCode, bytes: r.bytes, untrusted: r.untrusted, provenance: r.provenance || null }));
  }
  return freeze({
    enabled, quota: maxRequests, requested: urls.length, allowlist,
    results: freeze(results),
    note: enabled
      ? "LIVE bounded collection (kill-switch ON): allowlisted public sources only; read-only; size/timeout-capped; content sanitized; provenance recorded"
      : "DRY (kill-switch OFF): URLs validated against the allowlist, NO network egress — nothing fetched",
  });
}

const RADAR_LIVE_COLLECT_CONTRACT = Object.freeze({
  id: "V360-RADAR-LIVE-COLLECT",
  purpose: "§6 — governed connection of bounded-http-client → real radar collection from public free sources, under kill-switch + allowlist + quota + traceability; gives fr07-live-collection a real consumer; §3.2 seam → demonstrated",
  reuses: Object.freeze(["fr07-live-collection.collectLive (real bounded collection + sanitize + provenance)", "bounded-http-client (HTTPS-only + ALLOWLIST + SSRF + size/timeout cap)", "frontier-radar.sanitizeExternal (via fr07)"]),
  invariants: Object.freeze([
    "KILL-SWITCH deny-by-default: no network egress unless enabled===true (bin maps ODG_RADAR_LIVE=1); DRY otherwise (CI/build never egress)",
    "ALLOWLIST-only (bounded-http-client.ALLOWLIST): a non-allowlisted / non-HTTPS / private host ⇒ REJECTED_URL (no arbitrary fetch, SSRF-guarded)",
    "QUOTA: at most maxRequests URLs per run; TRACEABILITY: per-URL provenance (host/bytes/sha256/fetchedAt)",
    "fetched content is UNTRUSTED (fr07 sanitizes ⇒ injection QUARANTINE); no auth/secrets, no purchase/signup, no crawling, no deploy, no access-control bypass",
    "no second HTTP client / radar engine; the fetcher is injectable ⇒ deterministic + zero-network in tests",
  ]),
});

module.exports = { governedLiveCollect, RADAR_LIVE_COLLECT_CONTRACT };
export {};
