#!/usr/bin/env node
// @ts-nocheck — runs under tsx, ZERO network (injected httpPost mock). Proves the TED connector: lang-keyed field
// handling, canonical URL, honest state machine (RESULTS/NO_RESULTS/SOURCE_UNAVAILABLE/AUTH_REQUIRED/MALFORMED),
// dedup, malformed-drop (no fabrication), provenance, and expert-query building.
"use strict";
const assert = require("assert");
const T = require("./ted-connector.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };
const NOW = "2026-10-28T00:00:00Z";

(async () => {
// (1) pickLang + canonicalUrl (pure, lang-keyed).
ok("pickLang prefers fra/eng then falls back", T.pickLang({ hun: ["x"], fra: ["Objet FR"] }) === "Objet FR" && T.pickLang({ hun: ["Only HU"] }) === "Only HU" && T.pickLang("plain") === "plain" && T.pickLang(["a"]) === "a");
ok("canonicalUrl from links.html else derived from publication-number", T.canonicalUrl({ links: { html: { fra: "https://ted.europa.eu/fr/notice/x" } } }) === "https://ted.europa.eu/fr/notice/x" && T.canonicalUrl({ "publication-number": "726450-2026" }) === "https://ted.europa.eu/en/notice/-/detail/726450-2026");

// (2) mapNotice normalizes; malformed (no title/ref) ⇒ null (dropped, never fabricated).
const n1 = { "publication-number": "111-2026", "notice-title": { fra: ["Audit de sécurité informatique"] }, "buyer-name": { fra: ["Ville X"] }, "publication-date": "2026-10-26", "deadline-receipt-request": ["2026-12-01Z"], links: { html: { fra: "https://ted/x" } } };
const m = T.mapNotice(n1, NOW);
ok("mapNotice ⇒ subject/buyer/url/deadline/provenance; budget null", m.subject === "Audit de sécurité informatique" && m.buyer === "Ville X" && m.url === "https://ted/x" && m.deadline === "2026-12-01Z" && m.budgetEur === null && m.provenance.source === "TED" && m.provenance.retrievalTimestamp === NOW);
ok("mapNotice malformed (no title) ⇒ null", T.mapNotice({ "publication-number": "x" }, NOW) === null);

// (3) buildQuery expert syntax.
ok("buildQuery includes date window + country", T.buildQuery({ since: "20261021", buyerCountry: "FRA" }) === "publication-date>=20261021 AND buyer-country=FRA");

// mock httpPost
const postOk = (payload) => async () => ({ ok: true, statusCode: 200, body: JSON.stringify(payload) });

// (4) AUTH_REQUIRED when no POST client.
ok("no httpPost ⇒ AUTH_REQUIRED", (await T.fetchTed({ now: NOW })).status === "AUTH_REQUIRED");

// (5) RESULTS + dedup + malformed drop.
const resp = { totalNoticeCount: 2142, notices: [n1, n1, { "publication-number": "", "notice-title": {} }] };
const r = await T.fetchTed({ httpPost: postOk(resp), now: NOW, since: "20261021", buyerCountry: "FRA" });
ok("RESULTS: 1 kept, 1 dup, 1 dropped; totalNoticeCount preserved", r.status === "RESULTS" && r.counts.kept === 1 && r.counts.duplicates === 1 && r.counts.dropped === 1 && r.counts.totalNoticeCount === 2142);

// (6) NO_RESULTS only on a successful empty query.
ok("empty notices ⇒ NO_RESULTS", (await T.fetchTed({ httpPost: postOk({ notices: [] }), now: NOW })).status === "NO_RESULTS");

// (7) MALFORMED: non-JSON, and wrong shape.
ok("non-JSON ⇒ MALFORMED", (await T.fetchTed({ httpPost: async () => ({ ok: true, statusCode: 200, body: "<<notjson" }), now: NOW })).status === "MALFORMED");
ok("wrong shape (no notices array) ⇒ MALFORMED", (await T.fetchTed({ httpPost: async () => ({ ok: true, statusCode: 200, body: JSON.stringify({ foo: 1 }) }), now: NOW })).status === "MALFORMED");

// (8) SOURCE_UNAVAILABLE on non-ok; AUTH_REQUIRED on 401.
ok("client not-ok (CONNECT_ERROR) ⇒ SOURCE_UNAVAILABLE", (await T.fetchTed({ httpPost: async () => ({ ok: false, code: "CONNECT_ERROR" }), now: NOW })).status === "SOURCE_UNAVAILABLE");
ok("401 ⇒ AUTH_REQUIRED", (await T.fetchTed({ httpPost: async () => ({ ok: false, statusCode: 401 }), now: NOW })).status === "AUTH_REQUIRED");
ok("httpPost throws ⇒ SOURCE_UNAVAILABLE (no crash)", (await T.fetchTed({ httpPost: async () => { throw new Error("boom"); }, now: NOW })).status === "SOURCE_UNAVAILABLE");

console.log(`\nTED-CONNECTOR suite — ${pass} assertions passed. (lang-keyed parse; state machine; dedup; malformed-drop; provenance; no fabrication)`);
if (pass < 13) process.exit(1);
})();
