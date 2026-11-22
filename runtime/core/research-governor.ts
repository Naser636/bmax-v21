#!/usr/bin/env node
"use strict";

/*
 * research-governor (mission M4, Phase 10 — GOVERNANCE layer) — PURE, deterministic, FAIL-CLOSED gate that turns the
 * fixture-only radar into a REAL-internet-research capability WITHOUT performing egress itself. It decides whether an
 * egress request is authorized (an explicit grant with allowed domains + expiry), produces the fetch PLAN, and stamps
 * every finding with a DATED source, provenance, and a source-bounded confidence. It NEVER fetches: the actual network
 * call is an injected fetcher the CALLER may run ONLY when govern() returns ALLOW — so unauthorized or out-of-policy
 * egress is structurally impossible through this module. No I/O, no clock (nowMs injected), no randomness.
 *
 *  - govern(request, grant, nowMs) → { decision: ALLOW|DENY, reasons[], plan:{domains[]} }.
 *      DENY (deny-by-default) when: no/!authorized grant (EGRESS_NOT_AUTHORIZED); grant expired (GRANT_EXPIRED);
 *      a requested URL's host is not in grant.allowedDomains (DOMAIN_NOT_ALLOWED); malformed request/url (INVALID_*).
 *      V16 opt-ins: grant.hostMatch:"EXACT" (host must equal an allowed domain; https required) and grant.allowedPaths
 *      ({host:[prefix…]} ⇒ PATH_NOT_ALLOWED outside them). Absent ⇒ historical behaviour (suffix match, no path bound).
 *  - stampFinding(content, source) → { ok, finding|reason }. Refuses (ANTI-FABRICATION) unless source has a non-empty
 *      url/name AND a valid ISO date AND content; confidence = source credibility band (unknown ⇒ LOW, fail-closed).
 * LIVE ACTIVATION is an owner/EXT-AUTH frontier: a real grant is issued out-of-band; this module only enforces policy.
 */

const RADAR = require("./frontier-radar.js");   // D5: reuse the canonical injection-quarantine (sanitizeExternal)
const SOURCE_CLASSES = Object.freeze(["LIVE_SOURCE", "INTERNAL_EVIDENCE", "FIXTURE", "HYPOTHESIS"]);
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function isNum(v: any): boolean { return typeof v === "number" && Number.isFinite(v); }
function hostOf(u: any): string | null { if (!isStr(u)) return null; const m = String(u).match(/^https?:\/\/([^/:?#]+)/i); return m ? m[1].toLowerCase() : null; }
function isIsoDate(s: any): boolean {
  if (!isStr(s)) return false;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?Z?)?$/);
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));                                    // reject rolled-over calendar dates (Feb 30 → Mar 2)
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return false;
  return Number.isFinite(Date.parse(s));
}
const CRED = Object.freeze({ LOW: 0, MEDIUM: 1, HIGH: 2 });
function credName(s: any): string { const u = isStr(s) ? s.toUpperCase() : ""; return (u in CRED) ? u : "LOW"; }

function govern(request: any, grant: any, nowMs: any): any {
  const reasons: string[] = [];
  const req = request && typeof request === "object" ? request : {};
  const g = grant && typeof grant === "object" ? grant : {};
  const urls: string[] = Array.isArray(req.urls) ? req.urls : [];
  if (!isStr(req.query) && urls.length === 0) reasons.push("INVALID_REQUEST");
  if (!isNum(nowMs)) reasons.push("INVALID_TIME");
  if (g.authorized !== true) reasons.push("EGRESS_NOT_AUTHORIZED");
  // Expiry is MANDATORY: an authorized grant with no (or non-numeric) expiry is rejected — a grant must be time-bounded.
  if (g.authorized === true && !isNum(g.expiresMs)) reasons.push("GRANT_EXPIRED");
  if (g.authorized === true && isNum(g.expiresMs) && isNum(nowMs) && nowMs > g.expiresMs) reasons.push("GRANT_EXPIRED");
  const allowed: string[] = Array.isArray(g.allowedDomains) ? g.allowedDomains.filter(isStr).map((d: string) => d.toLowerCase()) : [];
  // V16 — opt-in EXACT host matching. The default (hostMatch absent) keeps the historical SUFFIX semantics (a sub-domain of an
  // allowed domain is allowed — V372 relies on it: nasa.gov ⇒ sma.nasa.gov), which is LOOSER than bounded-http-client's
  // exact-host allowlist. A grant declaring hostMatch:"EXACT" makes the governor agree with the transport (h === d only) and
  // additionally requires https. Any other declared value is fail-closed (INVALID_HOST_MATCH) — never silently suffix.
  const hostMatch = g.hostMatch === undefined ? "SUFFIX" : g.hostMatch;
  if (hostMatch !== "SUFFIX" && hostMatch !== "EXACT") reasons.push("INVALID_HOST_MATCH");
  const exact = hostMatch === "EXACT";
  // V16 — optional per-host PATH PREFIXES (allowedPaths: { host: [prefix…] }). When declared, every URL must sit under a
  // prefix of ITS host, at a path-segment boundary ("/repos/a/b" admits "/repos/a/b" and "/repos/a/b/…", never "/repos/a/bc").
  // The path is taken from the WHATWG-normalized URL ("/x/../y" ⇒ "/y"), so dot-segments cannot escape a prefix.
  const pathsDeclared = g.allowedPaths !== undefined;
  const pathMap: any = pathsDeclared && g.allowedPaths && typeof g.allowedPaths === "object" && !Array.isArray(g.allowedPaths) ? g.allowedPaths : null;
  if (pathsDeclared && !pathMap) reasons.push("INVALID_ALLOWED_PATHS");
  const planDomains: string[] = [];
  for (const u of urls) {
    const h = hostOf(u);
    if (!h) { reasons.push("INVALID_URL:" + String(u)); continue; }
    if (exact && !/^https:\/\//i.test(String(u))) { reasons.push("NOT_HTTPS:" + h); continue; }
    if (exact) { let wh: string | null = null; try { wh = new URL(String(u)).hostname.toLowerCase(); } catch { wh = null; }
      if (wh !== h) { reasons.push("HOST_PARSE_MISMATCH:" + h); continue; } }   // regex host must equal the WHATWG host the client will use
    // SUFFIX (default): equals or is a subdomain of an allowed domain. EXACT: equals only.
    const ok = allowed.some((d) => h === d || (!exact && h.endsWith("." + d)));
    if (!ok) { reasons.push("DOMAIN_NOT_ALLOWED:" + h); continue; }
    if (pathMap) {
      let p: string | null = null;
      try { p = new URL(String(u)).pathname; } catch { p = null; }
      const prefixes: string[] = Array.isArray(pathMap[h]) ? pathMap[h].filter(isStr) : [];
      const under = p !== null && prefixes.some((pre) => { const b = pre.endsWith("/") ? pre.slice(0, -1) : pre; return p === b || p!.startsWith(b + "/"); });
      if (!under) { reasons.push("PATH_NOT_ALLOWED:" + h + (p === null ? "" : p)); continue; }
    }
    planDomains.push(h);
  }
  // D1 FIX — the domain allowlist must bound EVERY authorized request, including a QUERY-ONLY one (the shape the radar emits).
  // Previously the allowlist was consulted only for url-bearing requests, so a query-only request with any authorized grant
  // was ALLOWed with an empty, unscoped plan (allowlist = dead code for the whole radar→govern path). Now: an authorized
  // request (query OR urls) with an empty allowlist is fail-closed; and a query-only ALLOW carries the grant's domains in the
  // plan so the downstream search is RESTRICTED to them (never an unbounded free-text search).
  if (g.authorized === true && allowed.length === 0 && (urls.length > 0 || isStr(req.query))) reasons.push("NO_ALLOWED_DOMAINS");
  if (urls.length === 0 && isStr(req.query) && allowed.length > 0) for (const d of allowed) planDomains.push(d);
  const decision = reasons.length ? "DENY" : "ALLOW";
  return Object.freeze({ decision, reasons: Object.freeze(reasons.slice()), plan: Object.freeze({ domains: Object.freeze(Array.from(new Set(planDomains)).sort()), query: isStr(req.query) ? req.query : null }) });
}

function stampFinding(content: any, source: any): any {
  const s = source && typeof source === "object" ? source : {};
  const reasons: string[] = [];
  if (!isStr(content)) reasons.push("NO_CONTENT");
  if (!isStr(s.url) && !isStr(s.name)) reasons.push("NO_SOURCE");                 // anti-fabrication: a finding needs a source
  if (!isIsoDate(s.date)) reasons.push("NO_DATED_SOURCE");                        // and a real date
  // D5 — external content is DATA. Best-effort injection screen via the canonical sanitizeExternal (a KNOWN-pattern denylist:
  // "ignore previous instructions", "system prompt", "<script", etc.) — NOT a universal guarantee. A matched payload is
  // quarantined (untrusted ⇒ HYPOTHESIS, confidence floored); novel phrasings may pass, so downstream consumers must still
  // treat finding.content as data, never as an instruction.
  const sanitized = RADAR.sanitizeExternal({ title: content, body: isStr(s.url) ? s.url : (isStr(s.name) ? s.name : "") });
  const untrusted = sanitized.untrusted === true;
  if (reasons.length) return Object.freeze({ ok: false, reason: Object.freeze(reasons) });
  // D2 — LIVE_SOURCE is gated on fetch EVIDENCE (liveFetched AND a 2xx httpStatus), not a bare boolean. NOTE: this is a pure
  // stamper — it cannot itself witness a fetch, so the evidence pair is still caller-supplied; the LOAD-BEARING guarantee
  // lives in the runner (odg-v138-live-research), which passes the REAL bounded-http-client statusCode and yields
  // LIVE_UNAVAILABLE on res.ok===false. Here: a bare sourceClass:"LIVE_SOURCE" (no evidence) ⇒ FIXTURE; httpStatus not 2xx
  // ⇒ FIXTURE; a quarantined (untrusted) finding ⇒ HYPOTHESIS. Default class is FIXTURE (never silently "live").
  const httpOk = isNum(s.httpStatus) && s.httpStatus >= 200 && s.httpStatus < 300;
  const declared = typeof s.sourceClass === "string" && SOURCE_CLASSES.includes(s.sourceClass) ? s.sourceClass : "FIXTURE";
  let sourceClass: string;
  if (untrusted) sourceClass = "HYPOTHESIS";
  else if (s.liveFetched === true && httpOk) sourceClass = "LIVE_SOURCE";
  else if (declared === "LIVE_SOURCE") sourceClass = "FIXTURE";                   // a LIVE claim without fetch proof is NOT honored
  else sourceClass = declared;
  return Object.freeze({
    ok: true,
    finding: Object.freeze({
      content, source: isStr(s.url) ? s.url : s.name, date: s.date,
      confidence: untrusted ? "LOW" : credName(s.credibility),                    // untrusted ⇒ confidence floored
      provenance: `${isStr(s.url) ? s.url : s.name} @ ${s.date} [${untrusted ? "LOW" : credName(s.credibility)}] {${sourceClass}}`,
      sourceClass, untrusted,
      liveFetched: sourceClass === "LIVE_SOURCE",                                  // now DERIVED (fetch-evidence-gated), not trusted
    }),
  });
}

module.exports = { govern, stampFinding, hostOf, isIsoDate, credName };
export {};
