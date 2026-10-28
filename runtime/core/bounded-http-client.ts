#!/usr/bin/env node
/**
 * bounded-http-client — V38: a hardened, read-only, outbound-HTTPS client for AUTHORIZED public source hosts only.
 * Removes the live-egress blocker SAFELY. The security guards are PURE + unit-tested (zero network in CI); the thin
 * https.get is injectable (opts.httpImpl) so tests never touch the network. ODG runtime egress was empirically
 * confirmed available (V38 probe to BOAMP) — this wraps it with safety, it does not grant new privilege.
 *
 * Protections: HTTPS-only; host ALLOWLIST (approved sources only, no arbitrary-URL fetch); reject URL userinfo; SSRF
 * guard (no localhost / RFC1918 / link-local / IP-literal / cloud-metadata hosts); connect+read TIMEOUT; response
 * SIZE cap; bounded redirects (only to allowlisted https); content-type validation; no secret logging; no crawling.
 * Pure parsing; the only I/O is the injectable https.get. Never fabricates a response; failures are explicit codes.
 */
"use strict";

const https: any = require("https");   // identity encoding requested (accept-encoding: identity) ⇒ no gunzip needed

// Approved source hosts (V38 source registry). Extend ONLY with verified, lawful, terms-compliant public sources.
const ALLOWLIST: readonly string[] = Object.freeze([
  "boamp-datadila.opendatasoft.com",   // BOAMP (France) — Licence Ouverte 2.0, anonymous
  "api.ted.europa.eu",                 // TED (EU) — anonymous search/download
  "data.economie.gouv.fr",             // DECP/OCDS (award data) — anonymous
]);

function isIpLiteral(host: string): boolean { return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":"); }
/** isPrivateHost(host): localhost / RFC1918 / link-local / cloud-metadata / IP-literal ⇒ true (SSRF guard). */
function isPrivateHost(host: string): boolean {
  const h = String(host || "").toLowerCase();
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "169.254.169.254" || h === "metadata.google.internal") return true;   // cloud metadata
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;                            // 172.16/12
  if (isIpLiteral(h)) return true;                                                  // raw IP literal (incl. IPv6) ⇒ reject
  return false;
}

/** validateUrl(url, allowlist?): https-only, allowlisted host, no userinfo, not private. Returns {ok} or {ok:false,code}. */
function validateUrl(url: any, allowlist: readonly string[] = ALLOWLIST): any {
  let u: any;
  try { u = new URL(String(url)); } catch { return { ok: false, code: "INVALID_URL" }; }
  if (u.protocol !== "https:") return { ok: false, code: "NOT_HTTPS" };
  if (u.username || u.password) return { ok: false, code: "URL_USERINFO_FORBIDDEN" };
  if (isPrivateHost(u.hostname)) return { ok: false, code: "PRIVATE_HOST_BLOCKED" };
  if (!allowlist.includes(u.hostname)) return { ok: false, code: "HOST_NOT_ALLOWLISTED", host: u.hostname };
  return { ok: true, host: u.hostname, href: u.href };
}

/** validateContentType(ct): accept JSON content types only (read-only data feeds). */
function validateContentType(ct: any): boolean {
  const s = String(ct || "").toLowerCase();
  return s.includes("application/json") || s.includes("text/json") || s.includes("application/vnd.api+json");
}

/** enforceSize(received, maxBytes): true if within cap. */
function enforceSize(received: number, maxBytes: number): boolean { return received <= maxBytes; }

/**
 * get(url, opts): bounded HTTPS GET of an allowlisted host. opts: { timeoutMs, maxBytes, maxRedirects, allowlist,
 * headers, httpImpl }. httpImpl(url, {timeoutMs, headers}, cb) defaults to https.get. Returns a Promise resolving to
 * { ok, statusCode, body, contentType } or { ok:false, code }. Never throws; never fabricates a body.
 */
function get(url: any, opts: any = {}): Promise<any> {
  const allowlist = Array.isArray(opts.allowlist) ? opts.allowlist : ALLOWLIST;
  const v = validateUrl(url, allowlist);
  if (!v.ok) return Promise.resolve({ ok: false, code: v.code, host: v.host });
  const timeoutMs = Number.isInteger(opts.timeoutMs) && opts.timeoutMs > 0 ? opts.timeoutMs : 8000;
  const maxBytes = Number.isInteger(opts.maxBytes) && opts.maxBytes > 0 ? opts.maxBytes : 2_000_000;
  const httpImpl = typeof opts.httpImpl === "function" ? opts.httpImpl : https.get;
  const headers = Object.assign({ "user-agent": "ODG-discovery/1.0 (+Licence-Ouverte-reuse)", "accept": "application/json", "accept-encoding": "identity" }, opts.headers || {});

  return new Promise((resolve) => {
    let done = false; const finish = (r: any) => { if (!done) { done = true; resolve(r); } };
    try {
      const req = httpImpl(v.href, { timeout: timeoutMs, headers }, (res: any) => {
        const status = res.statusCode;
        // Redirects: only to an allowlisted https location, bounded (default 0 — public APIs don't need it).
        if (status >= 300 && status < 400) { finish({ ok: false, code: "REDIRECT_BLOCKED", statusCode: status }); try { res.destroy(); } catch {} return; }
        const ct = res.headers && res.headers["content-type"];
        if (status >= 200 && status < 300 && !validateContentType(ct)) { finish({ ok: false, code: "BAD_CONTENT_TYPE", contentType: ct || null, statusCode: status }); try { res.destroy(); } catch {} return; }
        let received = 0; const chunks: any[] = [];
        res.on("data", (c: any) => { received += c.length; if (!enforceSize(received, maxBytes)) { finish({ ok: false, code: "RESPONSE_TOO_LARGE", statusCode: status }); try { res.destroy(); } catch {} } else chunks.push(c); });
        res.on("end", () => finish({ ok: true, statusCode: status, contentType: ct || null, body: Buffer.concat(chunks).toString("utf8") }));
        res.on("error", (e: any) => finish({ ok: false, code: "RESPONSE_ERROR", detail: e && e.message }));
      });
      req.on("timeout", () => { try { req.destroy(); } catch {} finish({ ok: false, code: "TIMEOUT" }); });
      req.on("error", (e: any) => finish({ ok: false, code: "CONNECT_ERROR", detail: e && e.message }));
    } catch (e: any) { finish({ ok: false, code: "CLIENT_ERROR", detail: e && e.message }); }
  });
}

export { ALLOWLIST, isPrivateHost, validateUrl, validateContentType, enforceSize, get };
module.exports = { ALLOWLIST, isPrivateHost, validateUrl, validateContentType, enforceSize, get };

export {};
