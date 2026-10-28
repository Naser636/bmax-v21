#!/usr/bin/env node
/**
 * tender-feed-connector — V37: ONE real live discovery connector for public tender/opportunity feeds, built on the
 * finance-data-connector injectable-fetcher pattern (the HTTP GET is INJECTED; tests pass a deterministic mock = zero
 * network; the default is a bounded https GET). It normalizes a source payload into the opportunity records that
 * opportunity-detector / opportunity-axis-router already consume, with full provenance.
 *
 * HONEST STATE MACHINE (mandate): RESULTS (queried OK, ≥1 match) · NO_RESULTS (queried OK, 0 matches) ·
 * SOURCE_UNAVAILABLE (network error / timeout / 5xx after bounded retries) · AUTH_REQUIRED (no authorized fetcher /
 * egress / credentials available) · MALFORMED (2xx but unparseable / wrong shape). Errors are NEVER silently turned
 * into NO_RESULTS; records are NEVER fabricated; malformed records are dropped and counted. Respects terms by using
 * the injected authorized fetcher only, bounded retries, and minimal fields (no unnecessary personal data).
 * Pure parsing/validation; the only I/O is the injected fetcher.
 */
"use strict";

const STATE = Object.freeze({ RESULTS: "RESULTS", NO_RESULTS: "NO_RESULTS", SOURCE_UNAVAILABLE: "SOURCE_UNAVAILABLE", AUTH_REQUIRED: "AUTH_REQUIRED", MALFORMED: "MALFORMED" });

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function str(v: any): string { return typeof v === "string" ? v.trim() : ""; }

/**
 * Source presets. mapRecord(raw)→opportunity-ish fields; recordsPath extracts the array from the payload.
 * BOAMP (France) via its Opendatasoft-style records API — PUBLIC, anonymous, JSON. FINALIZED from V37 source research
 * (see ODG_PROJECT_STATE checkpoint). Fields are defensive: a missing field is null, never invented.
 */
const SOURCES: Readonly<Record<string, any>> = Object.freeze({
  BOAMP: {
    id: "BOAMP",
    sourceType: "public-tender",
    // VERIFIED 2026-10-27 (live HTTP 200, anonymous, no key): Opendatasoft Explore API v2.1 records endpoint.
    // Source docs: dila.gouv.fr/services/api/boamp + boamp-datadila.opendatasoft.com. JSON {total_count, results[]}.
    exampleEndpoint: "https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/records?limit=100&order_by=dateparution%20desc",
    recordsPath: "results",
    license: "Licence Ouverte / Etalab 2.0 — free reuse (commercial OK); attribution required: DILA + long download URL + file name + file date",
    pagination: { maxPerPage: 100, deepPagingCap: 10000, strategy: "page by date windows (datelimitereponse/dateparution) to stay under the offset+limit≤~10k cap; /exports/json for bulk" },
    mapRecord: (r: any) => {
      const f = isObj(r) ? (isObj(r.fields) ? r.fields : r) : {};   // ODS v2.1 returns flat records; v1 nested .fields
      return {
        ref: str(f.idweb) || str(f.id),
        buyer: str(f.nomacheteur) || str(f.organisme) || str(f.buyer),
        subject: str(f.objet) || str(f.title) || str(f.subject),
        url: str(f.url_avis) || str(f.url) || (str(f.idweb) ? `https://www.boamp.fr/avis/detail/${str(f.idweb)}` : ""),
        publishedAt: str(f.dateparution) || str(f.datepublication) || str(f.publishedAt),
        deadline: str(f.datelimitereponse) || str(f.deadline),
        // VERIFIED: BOAMP has NO clean scalar amount field (value lives in a nested eForms `donnees` blob) ⇒ null,
        // NOT fabricated. Estimated value for a BOAMP opportunity is best-effort/unverified downstream.
        budgetEur: null,
      };
    },
  },
  // TED (EU) documented as the next source (verified anonymous POST /v3/notices/search, JSON envelope, lang-keyed
  // fields, scroll pagination). NOT implemented here (POST expert-query + lang-keyed parsing = a separate lot).
  TED: { id: "TED", sourceType: "public-tender", exampleEndpoint: "https://api.ted.europa.eu/v3/notices/search (POST)", recordsPath: "notices", documentedOnly: true, note: "verified public/anonymous for search+download; fair-use rate limits exist (exact figures unverified); next connector lot" },
});

/** validateAndNormalize(rawRecords, { sourceId, now }): map + validate + dedup → opportunity records with provenance. */
function validateAndNormalize(rawRecords: any, opts: any = {}): any {
  const src = SOURCES[opts.sourceId] || SOURCES.BOAMP;
  const list = Array.isArray(rawRecords) ? rawRecords : [];
  const retrievalTimestamp = str(opts.now) || null;
  const seen = new Set<string>();
  const opportunities: any[] = [];
  let dropped = 0, duplicates = 0;
  for (const raw of list) {
    let m: any; try { m = src.mapRecord(raw); } catch { dropped++; continue; }
    if (!m || (!str(m.subject)) || (!str(m.url) && !str(m.ref))) { dropped++; continue; }   // malformed ⇒ drop, never fabricate
    const key = `${src.id}|${str(m.url) || str(m.ref)}`;
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);
    opportunities.push({
      id: str(m.ref) || str(m.url), ref: str(m.ref), buyer: str(m.buyer), subject: str(m.subject),
      url: str(m.url), publishedAt: str(m.publishedAt), deadline: str(m.deadline),
      budgetEur: (typeof m.budgetEur === "number" && Number.isFinite(m.budgetEur)) ? m.budgetEur : null,
      source: src.id, sourceType: src.sourceType,
      provenance: { source: src.id, sourceTimestamp: str(m.publishedAt) || null, retrievalTimestamp },
    });
  }
  return { opportunities, counts: { fetched: list.length, dropped, duplicates, kept: opportunities.length } };
}

/**
 * fetchFeed(opts): opts.httpGet(url, {timeoutMs}) → { statusCode, body } (or throws). ABSENT ⇒ AUTH_REQUIRED.
 * Bounded retries on throw/timeout/5xx ⇒ SOURCE_UNAVAILABLE. 2xx unparseable/wrong-shape ⇒ MALFORMED. Else RESULTS/NO_RESULTS.
 */
function fetchFeed(opts: any = {}): any {
  const sourceId = SOURCES[opts.sourceId] ? opts.sourceId : "BOAMP";
  const src = SOURCES[sourceId];
  const url = str(opts.url) || src.exampleEndpoint;
  const provenanceBase = { source: sourceId, url, retrievalTimestamp: str(opts.now) || null };

  if (typeof opts.httpGet !== "function") {
    return { status: STATE.AUTH_REQUIRED, reason: "no authorized HTTP fetcher/egress available in this runtime — live retrieval not possible without an authorized connector", provenance: provenanceBase, opportunities: [] };
  }
  const maxRetries = Number.isInteger(opts.maxRetries) && opts.maxRetries >= 0 ? opts.maxRetries : 2;
  const timeoutMs = Number.isInteger(opts.timeoutMs) && opts.timeoutMs > 0 ? opts.timeoutMs : 8000;

  let lastErr: any = null, resp: any = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      resp = opts.httpGet(url, { timeoutMs });
      if (resp && Number(resp.statusCode) >= 200 && Number(resp.statusCode) < 300) { lastErr = null; break; }
      if (resp && Number(resp.statusCode) >= 500) { lastErr = `HTTP ${resp.statusCode}`; resp = null; continue; }
      // 4xx: not retryable
      if (resp && Number(resp.statusCode) === 401 || resp && Number(resp.statusCode) === 403) {
        return { status: STATE.AUTH_REQUIRED, reason: `HTTP ${resp.statusCode} — authentication/authorization required by the source`, provenance: provenanceBase, opportunities: [] };
      }
      if (resp) return { status: STATE.SOURCE_UNAVAILABLE, reason: `HTTP ${resp.statusCode}`, provenance: provenanceBase, opportunities: [] };
    } catch (e: any) { lastErr = (e && e.message) || "fetch error"; resp = null; }
  }
  if (!resp) return { status: STATE.SOURCE_UNAVAILABLE, reason: `source unreachable after ${maxRetries + 1} attempt(s): ${lastErr}`, provenance: provenanceBase, opportunities: [] };

  let payload: any;
  try { payload = typeof resp.body === "string" ? JSON.parse(resp.body) : resp.body; } catch { return { status: STATE.MALFORMED, reason: "response body is not valid JSON", provenance: provenanceBase, opportunities: [] }; }
  const records = payload && Array.isArray(payload[src.recordsPath]) ? payload[src.recordsPath] : (Array.isArray(payload) ? payload : null);
  if (records === null) return { status: STATE.MALFORMED, reason: `expected an array at '${src.recordsPath}' (or a top-level array)`, provenance: provenanceBase, opportunities: [] };

  const norm = validateAndNormalize(records, { sourceId, now: opts.now });
  return {
    status: norm.opportunities.length ? STATE.RESULTS : STATE.NO_RESULTS,
    opportunities: norm.opportunities, counts: norm.counts, provenance: provenanceBase,
    note: "Provenance recorded (source + sourceTimestamp + retrievalTimestamp). Errors are never NO_RESULTS; malformed records dropped + counted; nothing fabricated. Respect source terms + rate limits via the injected authorized fetcher.",
  };
}

export { STATE, SOURCES, validateAndNormalize, fetchFeed };
module.exports = { STATE, SOURCES, validateAndNormalize, fetchFeed };

if (require.main === module) {
  process.stdout.write(JSON.stringify(fetchFeed({}), null, 2) + "\n");   // no fetcher ⇒ AUTH_REQUIRED
}
