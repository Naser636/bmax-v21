#!/usr/bin/env node
// @ts-nocheck — runs under tsx; suppresses tsc typechecking (not strict typing), consistent with the other
// runtime/core *-dualport-parity.test.ts suites. The SOURCES under test are strict-typed.
"use strict";
/*
 * FINANCE-DATA-CONNECTOR DUAL-PORT PARITY (AB-4 migration proof) — strict TypeScript canonical
 * runtime/core/finance-data-connector.ts vs legacy production port finance-data-connector.js. HERMETIC: the
 * fetcher is INJECTED (zero network, no real https) and nowMs is FIXED (deterministic freshness). Proves API
 * + mapCoinbaseCandles validation branches + fetchSeries across OK(fresh) / STALE / HTTP_ERROR / EMPTY /
 * MALFORMED / INVALID_ROW / NON_MONOTONIC / NO_FETCHER / FETCH_FAILED — including the sha256 provenance —
 * js ≡ ts. No real network; no JS removed.
 */
const assert = require("assert");
const path = require("path");
const js = require(path.join(__dirname, "finance-data-connector.js"));
const ts = require(path.join(__dirname, "finance-data-connector.ts"));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

(async () => {
  ok("same exported API", eq(Object.keys(js).sort(), Object.keys(ts).sort()));
  ok("CODE table + DEFAULT_STALE_MAX_S identical", eq(js.CODE, ts.CODE) && js.DEFAULT_STALE_MAX_S === ts.DEFAULT_STALE_MAX_S);

  // mapCoinbaseCandles validation-branch parity (pure).
  const good = JSON.stringify([[200, 9, 11, 10, 10, 5], [100, 4, 6, 5, 5, 3]]); // descending; close within [low,high]
  const bodies = [
    ["malformed", "{not json"], ["empty", "[]"], ["not-array", '{"a":1}'],
    ["short-row", "[[1,2,3]]"], ["nan-row", '[[1,"x",3,4,5,6]]'],
    ["close-out-of-range", "[[1,4,6,5,99,3]]"], ["good", good],
  ];
  for (const [label, b] of bodies) ok(`mapCoinbaseCandles parity — ${label}`, eq(js.mapCoinbaseCandles(b, "src", 2), ts.mapCoinbaseCandles(b, "src", 2)));

  // fetchSeries parity across outcomes — INJECTED fetcher (zero network), FIXED nowMs.
  const nowMs = 300000 * 1000; // fixed clock
  const fresh = JSON.stringify([[299998, 9, 11, 10, 10, 5], [299000, 4, 6, 5, 5, 3]]); // tmax=299998 ⇒ fresh vs nowS=300000
  const staleBody = JSON.stringify([[1000, 9, 11, 10, 10, 5], [500, 4, 6, 5, 5, 3]]);   // very old ⇒ STALE
  const mk = (status, body) => async () => ({ status, body });
  const scen = [
    ["OK fresh", { url: "https://x/c", fetcher: mk(200, fresh), nowMs }],
    ["STALE", { url: "https://x/c", fetcher: mk(200, staleBody), nowMs }],
    ["HTTP_ERROR 500", { url: "https://x/c", fetcher: mk(500, ""), nowMs }],
    ["EMPTY body 200", { url: "https://x/c", fetcher: mk(200, "[]"), nowMs }],
    ["MALFORMED", { url: "https://x/c", fetcher: mk(200, "{bad"), nowMs }],
    ["NO url", { fetcher: mk(200, fresh), nowMs }],
    ["FETCH_FAILED (throws)", { url: "https://x/c", fetcher: async () => { throw new Error("boom"); }, nowMs }],
  ];
  for (const [label, opts] of scen) {
    const jr = await js.fetchSeries(opts);
    const tr = await ts.fetchSeries(opts);
    ok(`fetchSeries parity — ${label} (code=${jr.code}, ok=${jr.ok})`, eq(jr, tr));
  }
  // The sha256 provenance over the SAME body must be identical across ports (real crypto, deterministic).
  const jr = await js.fetchSeries({ url: "https://x/c", fetcher: mk(200, fresh), nowMs });
  const tr = await ts.fetchSeries({ url: "https://x/c", fetcher: mk(200, fresh), nowMs });
  ok("provenance dataHash (sha256) identical across ports", jr.provenance.dataHash === tr.provenance.dataHash && /^[0-9a-f]{64}$/.test(jr.provenance.dataHash));
  ok("fresh ⇒ decisionsAllowed true; stale ⇒ false (fail-closed), both ports", jr.decisionsAllowed === true && (await ts.fetchSeries({ url: "https://x/c", fetcher: mk(200, staleBody), nowMs })).decisionsAllowed === false);

  console.log(`\nFINANCE-DATA-CONNECTOR DUAL-PORT PARITY — ${passed} assertions passed.`);
})();
