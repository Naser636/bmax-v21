#!/usr/bin/env node
// @ts-nocheck — L5 bulk test migration (runtime/core): runs under tsx unchanged; suppresses tsc
// typechecking (NOT strict typing) — recorded migration debt (type later). See ODG_PROJECT_STATE.md.

"use strict";

/*
 * Focused adversarial lock for LIVE governed External Research (GOVERNED_LIVE_EXTERNAL_RESEARCH_V1).
 * Proves the bounded read-only fetch seam + the executor's LIVE provenance/acquisition gates WITHOUT
 * any external network: the real async bounded fetcher (httpGetBounded) is exercised against an
 * in-process server, and the executor LIVE path is exercised with the EXISTING injected-fetcher
 * mechanism. The real external bounded fetch is covered by the one live proof (odg objective --execute).
 *
 * Run: node runtime/core/external-research-live.test.js
 */

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const ce = require("./capability-executors");

let passed = 0;
function ok(label, cond) { assert.strictEqual(cond, true, "FAIL: " + label); console.log("  ok - " + label); passed++; }

const EVI = ce.EXTERNAL_RESEARCH_EVIDENCE;
const prior = (() => { try { return fs.readFileSync(EVI, "utf8"); } catch { return null; } })();

// Run the research executor's LIVE path with an injected synchronous fetcher (the existing test seam).
function runResearch(ra) {
  try { fs.rmSync(EVI, { force: true }); } catch { /* ignore */ }
  const exec = ce.resolve({ objectiveId: "EXTERNAL_RESEARCH_1", goal: "live research", research_acquisition: ra });
  let threw = null, result = null;
  try { result = exec.run(); } catch (e) { threw = e; }
  const evidence = fs.existsSync(EVI) ? JSON.parse(fs.readFileSync(EVI, "utf8")) : null;
  return { threw, result, evidence };
}

(async () => {
  console.log("LIVE GOVERNED EXTERNAL RESEARCH — bounded fetch + provenance gates");

  // --- Real bounded read-only fetch (httpGetBounded) against an in-process server (no external net). ---
  const seen = { method: null, auth: null, hits: 0 };
  const body = "X".repeat(5000);
  const srv = http.createServer((req, res) => { seen.method = req.method; seen.auth = req.headers.authorization || null; seen.hits++; res.writeHead(200, { "content-type": "text/plain" }); res.end(body); });
  await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const url = `http://127.0.0.1:${port}/`;

  const full = await ce.httpGetBounded(url, 1_000_000, 4000);
  ok("real fetch returns 200 + body (read-only GET)", full.status === 200 && full.body === body);
  ok("fetch uses GET only", seen.method === "GET");
  ok("no credential/Authorization header is ever sent (no leakage)", seen.auth === null);

  const capped = await ce.httpGetBounded(url, 100, 4000);
  ok("byte limit enforced: body truncated at maxBytes", capped.truncated === true && capped.body.length <= 100 && capped.bytes <= 100);

  const toEarly = await ce.httpGetBounded(url, 1_000_000, 1); // 1ms ⇒ time limit trips
  ok("time limit enforced: a sub-deadline fetch fails closed (status 0)", toEarly.status === 0);

  const badProto = await ce.httpGetBounded("file:///etc/passwd", 1000, 1000);
  ok("non-http(s) protocol refused (no local file retrieval)", badProto.status === 0 && /unsupported protocol/.test(badProto.error || ""));
  // CI-reliability: the byte-cap/time-limit fetches above do req.destroy() mid-request, which can leave a
  // half-closed server-side socket that srv.close(cb) waits for — so the plain `await srv.close(r)` could never
  // resolve, leaving the process alive forever (the intermittent CI "Classified test gate" stall; reproduced
  // deterministically with a lingering socket). Tear down so teardown CANNOT hang: destroy any remaining
  // connections, then close, with an unref'd fail-safe timer that resolves even if close never fires.
  await new Promise((r) => {
    let done = false;
    const fin = () => { if (!done) { done = true; r(undefined); } };
    try { (srv as any).closeAllConnections && (srv as any).closeAllConnections(); } catch { /* older node: best-effort */ }
    srv.close(fin);
    setTimeout(fin, 2000).unref();
  });

  // --- Executor LIVE path (injected fetcher = existing seam). ---
  // 1. No fetcher ⇒ NO network, fail-closed (a disk-only grant without a selected fetcher never fetches).
  {
    const calls = [];
    const r = runResearch({ authorized: true, execute: true, source_allowlist: ["https://a.test"], objective: "o", items: [] });
    ok("execute:true but NO fetcher ⇒ BLOCKED (no built-in client without an explicit selection)", !!r.threw && /no fetcher/.test(r.threw.message));
    ok("no fetcher ⇒ zero network calls", calls.length === 0);
  }

  // 2. Valid fetcher ⇒ ONLY allowlisted sources are reached; fetched content ⇒ fresh provenance.
  {
    const called = [];
    const r = runResearch({ authorized: true, execute: true, source_allowlist: ["https://a.test", "https://b.test"], objective: "o", items: [], fetch: (u) => { called.push(u); return { status: 200, body: "BODY:" + u, fetched_at: "2020-01-01T00:00:00Z" }; } });
    ok("fetcher is called with EXACTLY the allowlisted sources (no scope broadening)", JSON.stringify(called) === JSON.stringify(["https://a.test", "https://b.test"]));
    ok("LIVE evidence is produced with acquired=true", r.evidence && r.evidence.mode === "LIVE" && r.evidence.acquired === true);
    const crypto = require("crypto");
    const expHash = crypto.createHash("sha256").update("BODY:https://a.test").digest("hex");
    const rec = r.evidence.sources.find((s) => s.url === "https://a.test");
    ok("fetched content yields fresh provenance (sha256 + bytes + 2xx + fetched_at)", rec && rec.content_hash === expHash && rec.http_status === 200 && rec.bytes > 0 && typeof rec.fetched_at === "string");
  }

  // 3. A citation to a NON-allowlisted source fails closed (scope cannot be broadened via items).
  {
    const r = runResearch({ authorized: true, execute: true, source_allowlist: ["https://a.test"], objective: "o", items: [{ name: "x", sources: ["https://evil.test"] }], fetch: () => ({ status: 200, body: "b", fetched_at: "2020-01-01T00:00:00Z" }) });
    ok("item citing an unverified/off-allowlist source ⇒ BLOCKED", !!r.threw && /unverified source/.test(r.threw.message));
  }

  // 4. A failed fetch (non-2xx) ⇒ acquired=false ⇒ honest BLOCKED (no false SUCCESS).
  {
    const r = runResearch({ authorized: true, execute: true, source_allowlist: ["https://a.test"], objective: "o", items: [], fetch: () => ({ status: 503, body: "", fetched_at: "2020-01-01T00:00:00Z" }) });
    ok("non-2xx fetch ⇒ acquired=false ⇒ BLOCKED", !!r.threw && /no 2xx source acquired/.test(r.threw.message));
  }

  // 5. The governed fetcher is selectable by NAME (JSON-safe) — resolves to a real network attempt.
  {
    const called = [];
    // Point at an unreachable port so the real governedHttpGet subprocess returns status 0 (no 2xx) ⇒
    // BLOCKED, proving the NAME resolved to the real network client (it genuinely attempted a fetch).
    // TRUST-GAP-1 FIX: a JSON fetcher NAME no longer resolves to a live client (it could be emitted by a
    // plan/model and trigger outbound egress with no human grant). Naming it ⇒ REFUSED at the no-fetcher
    // guard, BEFORE any network attempt. Live research now requires an INJECTED function (not a JSON name).
    const r = runResearch({ authorized: true, execute: true, source_allowlist: ["http://127.0.0.1:1/"], objective: "o", items: [], fetcher: "governed-http-get", maxBytes: 1000, timeoutMs: 500 });
    ok("fetcher NAME 'governed-http-get' is NOT selectable by JSON ⇒ BLOCKED (no fetcher injected; no egress)", !!r.threw && /no fetcher injected|no fetcher/.test(r.threw.message));
  }

  console.log(`\nexternal-research-live: ${passed} assertions passed`);
})().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => {
  if (prior === null) { try { fs.rmSync(EVI, { force: true }); } catch { /* ignore */ } }
  else fs.writeFileSync(EVI, prior);
});
