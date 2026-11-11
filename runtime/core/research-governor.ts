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
 *  - stampFinding(content, source) → { ok, finding|reason }. Refuses (ANTI-FABRICATION) unless source has a non-empty
 *      url/name AND a valid ISO date AND content; confidence = source credibility band (unknown ⇒ LOW, fail-closed).
 * LIVE ACTIVATION is an owner/EXT-AUTH frontier: a real grant is issued out-of-band; this module only enforces policy.
 */

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
  if (g.authorized === true && isNum(g.expiresMs) && isNum(nowMs) && nowMs > g.expiresMs) reasons.push("GRANT_EXPIRED");
  const allowed: string[] = Array.isArray(g.allowedDomains) ? g.allowedDomains.filter(isStr).map((d: string) => d.toLowerCase()) : [];
  const planDomains: string[] = [];
  for (const u of urls) {
    const h = hostOf(u);
    if (!h) { reasons.push("INVALID_URL:" + String(u)); continue; }
    // domain allowed if it equals or is a subdomain of an allowed domain
    const ok = allowed.some((d) => h === d || h.endsWith("." + d));
    if (!ok) reasons.push("DOMAIN_NOT_ALLOWED:" + h);
    else planDomains.push(h);
  }
  // fail-closed: with a grant but an empty allowlist, nothing is fetchable
  if (g.authorized === true && urls.length > 0 && allowed.length === 0) reasons.push("NO_ALLOWED_DOMAINS");
  const decision = reasons.length ? "DENY" : "ALLOW";
  return Object.freeze({ decision, reasons: Object.freeze(reasons.slice()), plan: Object.freeze({ domains: Object.freeze(Array.from(new Set(planDomains)).sort()), query: isStr(req.query) ? req.query : null }) });
}

function stampFinding(content: any, source: any): any {
  const s = source && typeof source === "object" ? source : {};
  const reasons: string[] = [];
  if (!isStr(content)) reasons.push("NO_CONTENT");
  if (!isStr(s.url) && !isStr(s.name)) reasons.push("NO_SOURCE");                 // anti-fabrication: a finding needs a source
  if (!isIsoDate(s.date)) reasons.push("NO_DATED_SOURCE");                        // and a real date
  if (reasons.length) return Object.freeze({ ok: false, reason: Object.freeze(reasons) });
  return Object.freeze({
    ok: true,
    finding: Object.freeze({
      content, source: isStr(s.url) ? s.url : s.name, date: s.date,
      confidence: credName(s.credibility),
      provenance: `${isStr(s.url) ? s.url : s.name} @ ${s.date} [${credName(s.credibility)}]`,
      liveFetched: s.liveFetched === true,                                        // only true if the caller actually fetched under an ALLOW grant
    }),
  });
}

module.exports = { govern, stampFinding, hostOf, isIsoDate, credName };
export {};
