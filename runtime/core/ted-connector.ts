#!/usr/bin/env node
/**
 * ted-connector — V39 Track A: EU TED (Tenders Electronic Daily) search connector. Reuses the hardened
 * bounded-http-client (POST) and the same honest state machine as tender-feed-connector. VERIFIED LIVE 2026-10-28:
 * POST https://api.ted.europa.eu/v3/notices/search (anonymous, no key), JSON {notices[], totalNoticeCount,
 * iterationNextToken}. Fields are LANGUAGE-KEYED maps (e.g. notice-title: {"fra":[...], "eng":[...]}); publication-
 * number is the canonical id; links carry per-language canonical URLs.
 *
 * HONEST STATE MACHINE: RESULTS | NO_RESULTS (query OK, 0) | SOURCE_UNAVAILABLE (throw/timeout/5xx) | AUTH_REQUIRED
 * (no POST client, or 401/403) | MALFORMED (2xx unparseable/wrong-shape). Normalizes into the existing opportunity
 * contract with provenance; never fabricates budget/deadline/eligibility; TED exposes no clean scalar value here ⇒
 * budgetEur=null. Pure parsing; the only I/O is the injected httpPost. Composes — no new orchestrator/primitive.
 */
"use strict";

const STATE = Object.freeze({ RESULTS: "RESULTS", NO_RESULTS: "NO_RESULTS", SOURCE_UNAVAILABLE: "SOURCE_UNAVAILABLE", AUTH_REQUIRED: "AUTH_REQUIRED", MALFORMED: "MALFORMED" });
const ENDPOINT = "https://api.ted.europa.eu/v3/notices/search";
const DEFAULT_FIELDS = Object.freeze(["publication-number", "notice-title", "buyer-name", "publication-date", "deadline-receipt-request", "links"]);
const PREFERRED_LANGS = Object.freeze(["fra", "eng", "fr", "en"]);

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function str(v: any): string { return typeof v === "string" ? v.trim() : ""; }

/** pickLang(v): TED fields are {lang:[values]} maps (or a plain string/array). Return the preferred-language scalar. */
function pickLang(v: any): string {
  if (typeof v === "string") return v.trim();
  if (Array.isArray(v)) return v.length ? str(v[0]) : "";
  if (isObj(v)) {
    for (const l of PREFERRED_LANGS) { if (v[l] !== undefined) { const x = v[l]; return Array.isArray(x) ? str(x[0]) : str(x); } }
    const keys = Object.keys(v); if (keys.length) { const x = v[keys[0]]; return Array.isArray(x) ? str(x[0]) : str(x); }
  }
  return "";
}

/** canonicalUrl(notice): prefer links.html (lang-keyed) else derive from publication-number. */
function canonicalUrl(n: any): string {
  const links = n && n.links;
  if (isObj(links) && links.html) { const u = pickLang(links.html); if (u) return u; }
  const pub = str(n && n["publication-number"]);
  return pub ? `https://ted.europa.eu/en/notice/-/detail/${pub}` : "";
}

/** mapNotice(n, retrievalTimestamp): TED notice → opportunity record (no fabrication). */
function mapNotice(n: any, retrievalTimestamp: string | null): any {
  const ref = str(n && n["publication-number"]);
  const subject = pickLang(n && n["notice-title"]);
  const deadlineRaw = n && n["deadline-receipt-request"];
  const deadline = Array.isArray(deadlineRaw) ? str(deadlineRaw[0]) : str(deadlineRaw);
  const publishedAt = Array.isArray(n && n["publication-date"]) ? str(n["publication-date"][0]) : str(n && n["publication-date"]);
  const url = canonicalUrl(n);
  if (!ref || !subject) return null;   // malformed ⇒ drop (never fabricate)
  return {
    id: ref, ref, buyer: pickLang(n && n["buyer-name"]), subject, url,
    publishedAt, deadline, budgetEur: null, source: "TED", sourceType: "public-tender",
    provenance: { source: "TED", sourceTimestamp: publishedAt || null, retrievalTimestamp },
  };
}

/** buildQuery({ since, buyerCountry }): a TED expert query string. Caller supplies the date window + country. */
function buildQuery(opts: any = {}): string {
  const since = str(opts.since) || "20260101";   // YYYYMMDD
  const parts = [`publication-date>=${since}`];
  if (str(opts.buyerCountry)) parts.push(`buyer-country=${str(opts.buyerCountry)}`);
  return parts.join(" AND ");
}

/**
 * fetchTed({ httpPost, since, buyerCountry, limit, fields, now }): httpPost(url, body, opts) → {ok,statusCode,body}.
 * Absent ⇒ AUTH_REQUIRED. Returns the honest state machine result + normalized opportunities. Async.
 */
async function fetchTed(opts: any = {}): Promise<any> {
  const provenanceBase = { source: "TED", endpoint: ENDPOINT, retrievalTimestamp: str(opts.now) || null };
  if (typeof opts.httpPost !== "function") return { status: STATE.AUTH_REQUIRED, reason: "no authorized POST client wired — live TED retrieval needs an authorized bounded client", provenance: provenanceBase, opportunities: [] };
  const limit = Number.isInteger(opts.limit) && opts.limit > 0 && opts.limit <= 250 ? opts.limit : 20;
  const body = { query: buildQuery(opts), fields: Array.isArray(opts.fields) && opts.fields.length ? opts.fields : DEFAULT_FIELDS, limit, paginationMode: "PAGE_NUMBER" };

  let resp: any;
  try { resp = await opts.httpPost(ENDPOINT, body, { timeoutMs: opts.timeoutMs || 12000, maxBytes: opts.maxBytes || 2_000_000 }); }
  catch (e: any) { return { status: STATE.SOURCE_UNAVAILABLE, reason: (e && e.message) || "post error", provenance: provenanceBase, opportunities: [] }; }
  if (!resp || resp.ok !== true) {
    const code = resp && resp.code;
    if (code === "AUTH_REQUIRED" || resp && (resp.statusCode === 401 || resp.statusCode === 403)) return { status: STATE.AUTH_REQUIRED, reason: code || `HTTP ${resp && resp.statusCode}`, provenance: provenanceBase, opportunities: [] };
    return { status: STATE.SOURCE_UNAVAILABLE, reason: code || `HTTP ${resp && resp.statusCode}`, provenance: provenanceBase, opportunities: [] };
  }
  let payload: any;
  try { payload = typeof resp.body === "string" ? JSON.parse(resp.body) : resp.body; } catch { return { status: STATE.MALFORMED, reason: "response body is not valid JSON", provenance: provenanceBase, opportunities: [] }; }
  const notices = payload && Array.isArray(payload.notices) ? payload.notices : null;
  if (notices === null) return { status: STATE.MALFORMED, reason: "expected an array at 'notices'", provenance: provenanceBase, opportunities: [] };

  const seen = new Set<string>(); const opportunities: any[] = []; let dropped = 0, duplicates = 0;
  for (const n of notices) {
    const m = mapNotice(n, str(opts.now) || null);
    if (!m) { dropped++; continue; }
    if (seen.has(m.id)) { duplicates++; continue; }
    seen.add(m.id); opportunities.push(m);
  }
  return {
    status: opportunities.length ? STATE.RESULTS : STATE.NO_RESULTS,
    opportunities, counts: { fetched: notices.length, dropped, duplicates, kept: opportunities.length, totalNoticeCount: payload.totalNoticeCount || null },
    provenance: provenanceBase,
    note: "TED notices normalized with provenance; lang-keyed fields reduced to a preferred-language scalar; budget null (no clean scalar in the search fields); errors never NO_RESULTS; malformed dropped+counted, never fabricated.",
  };
}

export { STATE, ENDPOINT, DEFAULT_FIELDS, pickLang, canonicalUrl, mapNotice, buildQuery, fetchTed };
module.exports = { STATE, ENDPOINT, DEFAULT_FIELDS, pickLang, canonicalUrl, mapNotice, buildQuery, fetchTed };

export {};
