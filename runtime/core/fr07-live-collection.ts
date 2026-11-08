#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 17 (FR-07 UNBLOCK) — RADAR LIVE COLLECTION. PURE given an injected fetcher. Executes a bounded, allowlisted,
 * READ-ONLY live fetch of a public open-data source and runs it through the canonical radar pipeline (treat as
 * UNTRUSTED ⇒ sanitizeExternal ⇒ QUARANTINE on injection) with evidence provenance. REUSES bounded-http-client
 * (HTTPS-only, host-allowlist, SSRF-guard, size cap) + frontier-radar.sanitizeExternal (no new engine, no second HTTP
 * client). The previously-DEFERRED blocker was "LIVE network egress OWNER-GATED"; network is now owner-authorized, so
 * the collection CAPABILITY is executable on-demand. (The *systemd automation* remains sudo-gated — a separate item.)
 * Fail-closed: a non-allowlisted URL, a failed fetch, or injected content is never processed as trusted. Dual export.
 */

const HTTP = require("./bounded-http-client");
const RADAR = require("./frontier-radar");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function sha256(s: string): string { try { return require("crypto").createHash("sha256").update(String(s)).digest("hex"); } catch { return ""; } }

/** collectLive({url, title, fetcher, allowlist, now}) -> { ok, decision, statusCode, bytes, untrusted, provenance }.
 * fetcher(url, opts) -> { ok, statusCode, body }. Default = bounded-http-client.get (real network). CI injects a seam. */
async function collectLive(input: any): Promise<any> {
  const o = isObj(input) ? input : {};
  const url = typeof o.url === "string" ? o.url : "";
  const allowlist = Array.isArray(o.allowlist) ? o.allowlist : HTTP.ALLOWLIST;
  const fetcher = typeof o.fetcher === "function" ? o.fetcher : HTTP.get;

  const v = HTTP.validateUrl(url, allowlist);
  if (!v.ok) return Object.freeze({ ok: false, decision: "REJECTED_URL", reason: v.code, statusCode: null, bytes: 0, untrusted: null });

  let res: any;
  try { res = await fetcher(url, { timeoutMs: o.timeoutMs || 20000, maxBytes: o.maxBytes || 50000, allowlist }); }
  catch (e: any) { return Object.freeze({ ok: false, decision: "FETCH_ERROR", reason: String(e && e.message || e), statusCode: null, bytes: 0, untrusted: null }); }
  if (!res || res.ok !== true) return Object.freeze({ ok: false, decision: "FETCH_FAILED", reason: (res && res.code) || "no response", statusCode: (res && res.statusCode) || null, bytes: 0, untrusted: null });

  const body = String(res.body || "");
  // external content is UNTRUSTED DATA (not instructions): run it through the radar sanitizer.
  const meta = RADAR.sanitizeExternal({ title: typeof o.title === "string" ? o.title : "live-source", body: body.slice(0, 4000) });
  const decision = meta.untrusted === true ? "QUARANTINE" : "COLLECTED";
  return Object.freeze({
    ok: true, decision, statusCode: res.statusCode || null, bytes: body.length,
    untrusted: meta.untrusted === true, injectionFlags: meta.injectionFlags,
    provenance: Object.freeze({ host: v.host, bytes: body.length, sha256: sha256(body), fetchedAt: o.now || null }),
    note: decision === "QUARANTINE" ? "external content flagged (injection) ⇒ quarantined, never processed as trusted" : "live collection: bounded + allowlisted + size-capped; content sanitized; provenance recorded",
  });
}

const FR07_LIVE_COLLECTION_CONTRACT = Object.freeze({
  id: "V124-FR07-LIVE-COLLECTION",
  source: "SÉRIE 17 — radar live collection (FR-07 unblocked: network owner-authorized)",
  reuses: Object.freeze(["bounded-http-client (HTTPS-only + allowlist + SSRF + size cap)", "frontier-radar.sanitizeExternal (injection quarantine)"]),
  allowlist: HTTP.ALLOWLIST,
  notAuthority: "a bounded read-only collection; it never crawls, exposes a service, spends, or processes untrusted content as trusted",
  invariants: Object.freeze([
    "HTTPS-only + host-allowlist + SSRF-guard + size cap (reuses bounded-http-client); a non-allowlisted URL ⇒ REJECTED_URL",
    "fetched content is UNTRUSTED data; injection ⇒ QUARANTINE (never processed as trusted) — fail-closed",
    "the live-collection CAPABILITY is executable (network owner-authorized); the systemd AUTOMATION stays sudo-gated (separate item)",
    "no second HTTP client / radar engine; provenance (host + bytes + sha256) recorded",
  ]),
});

module.exports = { collectLive, FR07_LIVE_COLLECTION_CONTRACT };

if (require.main === module) {
  collectLive({ url: "https://data.economie.gouv.fr/api/datasets/1.0/search/?rows=1", title: "DECP/OCDS", allowlist: ["data.economie.gouv.fr"], now: new Date().toISOString() })
    .then((r: any) => process.stdout.write(JSON.stringify({ ...FR07_LIVE_COLLECTION_CONTRACT, live: r }, null, 2) + "\n"));
}

export {};
