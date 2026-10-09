#!/usr/bin/env node
"use strict";
/* FINANCE DATA CONNECTOR — OFFLINE test (injected mock fetcher). No network. Deterministic. */
const assert = require("assert");
const path = require("path");
const C = require(path.resolve(__dirname, "finance-data-connector.js"));
let passed = 0; function ok(n, c) { assert.ok(c, n); console.log("  ok -", n); passed += 1; }
// Coinbase shape [time,low,high,open,close,vol], descending. tmax=300.
const CANDLES = [[300, 10, 12, 11, 11, 5], [200, 9, 11, 10, 10, 4], [100, 8, 10, 9, 9, 3]];
const BODY = JSON.stringify(CANDLES);
const mock = (body, status = 200) => () => Promise.resolve({ status, body });
const URL = "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400";
const base = { url: URL, instrument: "BTC-USD", fetcher: mock(BODY), staleMaxSeconds: 1000, nowMs: (300 + 500) * 1000, scale: 2 };

(async () => {
  // 1 — valid ⇒ ascending series + provenance (hash, range, nature, fresh).
  { const r = await C.fetchSeries(base);
    ok("1 valid ⇒ ok, 3 bars ascending", r.ok && r.series.length === 3 && r.series[0].t === 100 && r.series[2].t === 300);
    ok("1 close→minor scale2 (9,10,11 → 900,1000,1100)", r.series.map(b => b.price.minor).join(",") === "900,1000,1100");
    ok("1 provenance: hash + range + nature + fresh + decisionsAllowed", /^[0-9a-f]{64}$/.test(r.provenance.dataHash) && JSON.stringify(r.provenance.marketTsRange) === "[100,300]" && /historical\/delayed/.test(r.provenance.nature) && r.provenance.fresh === true && r.decisionsAllowed === true); }
  // 2 — non-2xx ⇒ HTTP_ERROR (BLOCKED).
  ok("2 HTTP 404 ⇒ HTTP_ERROR", (await C.fetchSeries({ ...base, fetcher: mock("", 404) })).code === C.CODE.HTTP_ERROR);
  // 3 — malformed body ⇒ MALFORMED.
  ok("3 malformed JSON ⇒ MALFORMED", (await C.fetchSeries({ ...base, fetcher: mock("{not json") })).code === C.CODE.MALFORMED);
  // 4 — invalid row (close outside [low,high]) ⇒ INVALID_ROW.
  ok("4 close>high ⇒ INVALID_ROW", (await C.fetchSeries({ ...base, fetcher: mock(JSON.stringify([[100, 8, 10, 9, 99, 3]])) })).code === C.CODE.INVALID_ROW);
  // 5 — duplicate timestamp ⇒ NON_MONOTONIC_TIME.
  ok("5 duplicate t ⇒ NON_MONOTONIC_TIME", (await C.fetchSeries({ ...base, fetcher: mock(JSON.stringify([[100, 8, 10, 9, 9, 3], [100, 8, 10, 9, 10, 3]])) })).code === C.CODE.NON_MONOTONIC_TIME);
  // 6 — STALE ⇒ ok but decisionsAllowed:false (fail-closed for dependent decisions).
  { const r = await C.fetchSeries({ ...base, nowMs: (300 + 5000) * 1000 });
    ok("6 stale data ⇒ decisionsAllowed:false, STALE", r.ok && r.decisionsAllowed === false && r.code === C.CODE.STALE); }
  // 7 — fetcher throws ⇒ FETCH_FAILED (no crash).
  ok("7 fetcher error ⇒ FETCH_FAILED", (await C.fetchSeries({ ...base, fetcher: () => Promise.reject(new Error("net down")) })).code === C.CODE.FETCH_FAILED);
  // 8 — determinism + no mutation: same body ⇒ identical hash/series; input body string unchanged.
  { const snap = BODY; const a = await C.fetchSeries(base); const b = await C.fetchSeries(base);
    ok("8 deterministic + body not mutated", a.provenance.dataHash === b.provenance.dataHash && JSON.stringify(a.series) === JSON.stringify(b.series) && BODY === snap); }
  console.log(`\nFINANCE DATA CONNECTOR (offline) — ${passed} assertions passed.`);
})().catch((e) => { console.error("ERR", e && e.stack); process.exit(1); });
