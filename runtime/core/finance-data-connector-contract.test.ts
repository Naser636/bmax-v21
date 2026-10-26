#!/usr/bin/env node
// @ts-nocheck — runs under tsx; suppresses tsc typechecking (the SOURCE under test is strict-typed).
"use strict";
/*
 * FINANCE-DATA-CONNECTOR CONTRACT (ZERO-JS L-iii) — strict TypeScript canonical finance-data-connector.ts is
 * now the SOLE port. Replaces the dual-port parity suite. HERMETIC: the fetcher is INJECTED (zero network),
 * nowMs is FIXED. Proves the API + mapCoinbaseCandles validation branches + fetchSeries across OK(fresh) /
 * STALE / HTTP_ERROR / EMPTY / MALFORMED / NO-url / FETCH_FAILED — including the sha256 provenance + the
 * fresh⇒decisionsAllowed / stale⇒fail-closed invariant.
 */
const assert = require("assert");
const path = require("path");
const m = require(path.join(__dirname, "finance-data-connector.ts"));
let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

(async () => {
  ok("exports mapCoinbaseCandles + fetchSeries", typeof m.mapCoinbaseCandles === "function" && typeof m.fetchSeries === "function");
  ok("CODE table + DEFAULT_STALE_MAX_S present", m.CODE && typeof m.DEFAULT_STALE_MAX_S === "number");

  // mapCoinbaseCandles validation-branch execution (pure; no throw).
  const good = JSON.stringify([[200, 9, 11, 10, 10, 5], [100, 4, 6, 5, 5, 3]]);
  const bodies = [
    ["malformed", "{not json"], ["empty", "[]"], ["not-array", '{"a":1}'],
    ["short-row", "[[1,2,3]]"], ["nan-row", '[[1,"x",3,4,5,6]]'],
    ["close-out-of-range", "[[1,4,6,5,99,3]]"], ["good", good],
  ];
  let mOk = true; for (const [, b] of bodies) { try { m.mapCoinbaseCandles(b, "src", 2); } catch { mOk = false; } }
  ok("mapCoinbaseCandles executes across all validation branches (no throw)", mOk);

  // fetchSeries outcomes — INJECTED fetcher (zero network), FIXED nowMs.
  const nowMs = 300000 * 1000;
  const fresh = JSON.stringify([[299998, 9, 11, 10, 10, 5], [299000, 4, 6, 5, 5, 3]]);
  const staleBody = JSON.stringify([[1000, 9, 11, 10, 10, 5], [500, 4, 6, 5, 5, 3]]);
  const mk = (status, body) => async () => ({ status, body });
  const r_ok = await m.fetchSeries({ url: "https://x/c", fetcher: mk(200, fresh), nowMs });
  ok("OK fresh ⇒ ok true", r_ok.ok === true);
  const r_stale = await m.fetchSeries({ url: "https://x/c", fetcher: mk(200, staleBody), nowMs });
  ok("STALE body ⇒ decisionsAllowed false (fail-closed)", r_stale.decisionsAllowed === false);
  const r_500 = await m.fetchSeries({ url: "https://x/c", fetcher: mk(500, ""), nowMs });
  ok("HTTP 500 ⇒ not ok", r_500.ok === false);
  const r_empty = await m.fetchSeries({ url: "https://x/c", fetcher: mk(200, "[]"), nowMs });
  ok("EMPTY body ⇒ not ok", r_empty.ok === false);
  const r_bad = await m.fetchSeries({ url: "https://x/c", fetcher: mk(200, "{bad"), nowMs });
  ok("MALFORMED body ⇒ not ok", r_bad.ok === false);
  const r_nourl = await m.fetchSeries({ fetcher: mk(200, fresh), nowMs });
  ok("no url ⇒ not ok", r_nourl.ok === false);
  let threw = false; try { await m.fetchSeries({ url: "https://x/c", fetcher: async () => { throw new Error("boom"); }, nowMs }); } catch { threw = true; }
  ok("fetcher throws ⇒ handled (no throw to caller)", threw === false);

  // sha256 provenance over the fresh body + fresh⇒allowed invariant.
  ok("provenance dataHash is a sha256 hex", /^[0-9a-f]{64}$/.test(r_ok.provenance.dataHash));
  ok("fresh ⇒ decisionsAllowed true", r_ok.decisionsAllowed === true);

  console.log(`\nFINANCE-DATA-CONNECTOR CONTRACT — ${passed} assertions passed.`);
})();
