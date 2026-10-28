#!/usr/bin/env node
// @ts-nocheck — runs under tsx, ZERO network (injected httpGet mock). Proves the connector's honest state machine:
// RESULTS / NO_RESULTS / SOURCE_UNAVAILABLE / AUTH_REQUIRED / MALFORMED; bounded retries; dedup; malformed records
// dropped (never fabricated); provenance recorded; errors never mislabeled NO_RESULTS.
"use strict";
const assert = require("assert");
const T = require("./tender-feed-connector.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const rec = (idweb, objet, extra = {}) => Object.assign({ idweb, nomacheteur: "Ville de Test", objet, url_avis: `https://www.boamp.fr/avis/detail/${idweb}`, dateparution: "2026-10-20", datelimitereponse: "2026-12-01" }, extra);
const feed = (records) => ({ statusCode: 200, body: JSON.stringify({ results: records }) });
const NOW = "2026-10-27T00:00:00Z";

// (1) AUTH_REQUIRED when no fetcher/egress available (the honest runtime default).
ok("no fetcher ⇒ AUTH_REQUIRED (not NO_RESULTS)", T.fetchFeed({ now: NOW }).status === "AUTH_REQUIRED");

// (2) RESULTS: a valid feed normalizes with provenance.
const r = T.fetchFeed({ now: NOW, httpGet: () => feed([rec("A1", "Audit sécurité applicative"), rec("A2", "Revue de dépendances logicielles")]) });
ok("valid feed ⇒ RESULTS, 2 kept, provenance (source+timestamps)", r.status === "RESULTS" && r.counts.kept === 2 && r.opportunities[0].provenance.source === "BOAMP" && r.opportunities[0].provenance.retrievalTimestamp === NOW && r.opportunities[0].provenance.sourceTimestamp === "2026-10-20");
ok("normalized fields mapped (buyer/subject/url/deadline); budget honestly null (no clean BOAMP scalar)", r.opportunities[0].subject && r.opportunities[0].url && r.opportunities[0].deadline === "2026-12-01" && r.opportunities[0].budgetEur === null);

// (3) NO_RESULTS only when the source was queried OK and returned zero.
ok("empty results array ⇒ NO_RESULTS", T.fetchFeed({ now: NOW, httpGet: () => feed([]) }).status === "NO_RESULTS");

// (4) duplicates deduped; malformed records dropped (never fabricated).
const dup = T.fetchFeed({ now: NOW, httpGet: () => feed([rec("D1", "x"), rec("D1", "x"), { idweb: "", nomacheteur: "Y" /* no objet, no url */ }]) });
ok("dedup + malformed drop (1 kept, 1 dup, 1 dropped)", dup.counts.kept === 1 && dup.counts.duplicates === 1 && dup.counts.dropped === 1);

// (5) MALFORMED: non-JSON body, and 2xx with wrong shape.
ok("non-JSON body ⇒ MALFORMED", T.fetchFeed({ now: NOW, httpGet: () => ({ statusCode: 200, body: "<<notjson" }) }).status === "MALFORMED");
ok("2xx wrong shape (no results array) ⇒ MALFORMED", T.fetchFeed({ now: NOW, httpGet: () => ({ statusCode: 200, body: JSON.stringify({ foo: 1 }) }) }).status === "MALFORMED");

// (6) SOURCE_UNAVAILABLE: throw/timeout after bounded retries; 5xx exhausted.
ok("fetcher throws (timeout) ⇒ SOURCE_UNAVAILABLE after retries", T.fetchFeed({ now: NOW, maxRetries: 2, httpGet: () => { throw new Error("ETIMEDOUT"); } }).status === "SOURCE_UNAVAILABLE");
ok("persistent 503 ⇒ SOURCE_UNAVAILABLE", T.fetchFeed({ now: NOW, httpGet: () => ({ statusCode: 503, body: "" }) }).status === "SOURCE_UNAVAILABLE");

// (7) bounded retry recovers: 503 then 200 ⇒ RESULTS.
let n = 0;
const flaky = () => { n++; return n < 2 ? { statusCode: 503, body: "" } : feed([rec("R1", "recovered")]); };
ok("503 then 200 ⇒ retry recovers to RESULTS", T.fetchFeed({ now: NOW, maxRetries: 2, httpGet: flaky }).status === "RESULTS");

// (8) 401/403 ⇒ AUTH_REQUIRED (not SOURCE_UNAVAILABLE, not NO_RESULTS).
ok("HTTP 401 ⇒ AUTH_REQUIRED", T.fetchFeed({ now: NOW, httpGet: () => ({ statusCode: 401, body: "" }) }).status === "AUTH_REQUIRED");

// (9) validateAndNormalize is pure + fabricates nothing (empty in ⇒ empty out).
ok("validateAndNormalize: empty ⇒ 0 kept; no fabrication", T.validateAndNormalize([], { sourceId: "BOAMP", now: NOW }).counts.kept === 0);

console.log(`\nTENDER-FEED-CONNECTOR suite — ${pass} assertions passed. (RESULTS/NO_RESULTS/SOURCE_UNAVAILABLE/AUTH_REQUIRED/MALFORMED; retries; dedup; provenance; no fabrication)`);
