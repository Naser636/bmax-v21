#!/usr/bin/env node
"use strict";

/*
 * FINANCE DATA CONNECTOR (P2) — bounded, READ-ONLY ingestion of PUBLIC market data into the finance-sim bar
 * shape, with provenance + temporal validation + freshness gating. SIMULATION-ONLY.
 *
 * Hard boundaries: GET only, NO auth/secret/API key, NO redirects followed, bounded bytes+timeout, NO broker,
 * NO order, NO execution, NO remote mutation. The HTTP fetcher is INJECTED (tests pass a deterministic mock);
 * the default is a bounded https GET. Reuses finance-sim bar shape; adds no new primitive/engine.
 *
 * Data nature is labelled honestly (e.g. "historical/delayed daily OHLC", NOT realtime). STALE data (latest
 * candle older than the freshness bound) sets decisionsAllowed=false ⇒ dependent decisions must be BLOCKED,
 * never run silently on stale data.
 */

const https = require("https");
const crypto = require("crypto");

const CODE = Object.freeze({
  HTTP_ERROR: "HTTP_ERROR", EMPTY: "EMPTY", MALFORMED: "MALFORMED", INVALID_ROW: "INVALID_ROW",
  NON_MONOTONIC_TIME: "NON_MONOTONIC_TIME", STALE: "STALE", NO_FETCHER: "NO_FETCHER", FETCH_FAILED: "FETCH_FAILED",
});

const DEFAULT_MAX_BYTES = 262144;
const DEFAULT_TIMEOUT_MS = 9000;
const DEFAULT_STALE_MAX_S = 3 * 86400; // daily candles: stale if newest candle > 3 days old

function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }

// Default bounded read-only GET. No redirects (3xx ⇒ non-2xx ⇒ HTTP_ERROR). No auth headers.
function defaultFetcher(url, opts = {}) {
  const maxBytes = opts.maxBytes || DEFAULT_MAX_BYTES, timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
  return new Promise((resolve) => {
    let body = "";
    const req = https.get(url, { timeout: timeoutMs, headers: { "user-agent": "odg-sim/1.0" } }, (res) => {
      if (res.statusCode < 200 || res.statusCode > 299) { res.destroy(); return resolve({ status: res.statusCode, body: "" }); }
      res.on("data", (d) => { body += d; if (body.length > maxBytes) { req.destroy(); resolve({ status: 0, body: "", error: "too_big" }); } });
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("timeout", () => { req.destroy(); resolve({ status: 0, body: "", error: "timeout" }); });
    req.on("error", (e) => resolve({ status: 0, body: "", error: e.code || String(e.message) }));
  });
}

// Map Coinbase Exchange candles JSON ([time,low,high,open,close,volume], descending) → ascending validated
// bars { t, price:{minor,scale}, source }. Pure. close price → integer minor at the given scale.
function mapCoinbaseCandles(body, source, scale) {
  const sc = Number.isInteger(scale) ? scale : 2;
  let rows; try { rows = JSON.parse(body); } catch { return { ok: false, code: CODE.MALFORMED }; }
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, code: CODE.EMPTY };
  for (const r of rows) {
    if (!Array.isArray(r) || r.length < 6 || !r.every(isNum)) return { ok: false, code: CODE.INVALID_ROW };
    const [, low, high, , close] = r;
    if (!(high >= low) || !(close >= low && close <= high)) return { ok: false, code: CODE.INVALID_ROW };
  }
  const asc = rows.slice().sort((a, b) => a[0] - b[0]);
  let prev = null;
  const series = [];
  for (const r of asc) {
    const t = r[0];
    if (!Number.isInteger(t)) return { ok: false, code: CODE.INVALID_ROW };
    if (prev !== null && !(t > prev)) return { ok: false, code: CODE.NON_MONOTONIC_TIME };
    prev = t;
    series.push({ t, price: { minor: Math.round(r[4] * Math.pow(10, sc)), scale: sc }, source });
  }
  return { ok: true, series };
}

/*
 * fetchSeries({url, instrument, fetcher, nowMs, staleMaxSeconds, scale}) → validated series + provenance, or
 * a fail-closed rejection. `fetcher(url)` is injected (tests); default = bounded https GET. `nowMs` injectable
 * for deterministic freshness tests. Non-2xx ⇒ HTTP_ERROR (BLOCKED). Stale ⇒ decisionsAllowed:false.
 */
async function fetchSeries(opts = {}) {
  const url = opts.url, instrument = opts.instrument || "UNKNOWN";
  const fetcher = typeof opts.fetcher === "function" ? opts.fetcher : defaultFetcher;
  if (!isNonEmptyString(url)) return Object.freeze({ ok: false, code: CODE.NO_FETCHER, detail: "url required" });
  let resp;
  try { resp = await fetcher(url); } catch (e) { return Object.freeze({ ok: false, code: CODE.FETCH_FAILED, detail: String(e && e.message || e) }); }
  if (!resp || resp.status < 200 || resp.status > 299 || !isNonEmptyString(resp.body)) {
    return Object.freeze({ ok: false, code: CODE.HTTP_ERROR, status: resp && resp.status });
  }
  const mapped = mapCoinbaseCandles(resp.body, url, opts.scale);
  if (!mapped.ok) return Object.freeze({ ok: false, code: mapped.code });
  const series = mapped.series;
  const tmin = series[0].t, tmax = series[series.length - 1].t;
  const nowMs = Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();
  const nowS = Math.floor(nowMs / 1000);
  const latestAgeSeconds = nowS - tmax;
  const staleMax = Number.isFinite(opts.staleMaxSeconds) ? opts.staleMaxSeconds : DEFAULT_STALE_MAX_S;
  const fresh = latestAgeSeconds >= 0 && latestAgeSeconds <= staleMax;
  const provenance = Object.freeze({
    source: url, instrument, nature: "historical/delayed daily OHLC (NOT realtime tick)",
    collectedAtMs: nowMs, dataHash: crypto.createHash("sha256").update(resp.body).digest("hex"),
    marketTsRange: Object.freeze([tmin, tmax]), bars: series.length,
    latestAgeSeconds, fresh, staleMaxSeconds: staleMax,
  });
  // Fail-closed on stale: decisions must NOT run on stale data.
  return Object.freeze({ ok: true, decisionsAllowed: fresh, code: fresh ? null : CODE.STALE, series: Object.freeze(series), provenance });
}

module.exports = { CODE, defaultFetcher, mapCoinbaseCandles, fetchSeries, DEFAULT_STALE_MAX_S };

if (require.main === module) { process.stdout.write("finance-data-connector: READ-ONLY public market data → simulation only\n"); }
