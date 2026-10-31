#!/usr/bin/env node
// @ts-nocheck — behavioural test (runs under tsx; suppresses tsc typecheck only).

/*
 * httpGetBounded — RESOLVE-ONCE contract (CI-reliability / latent-hang fix).
 *
 * The bounded read-only fetcher MUST always settle its Promise — on success, on byte-cap truncation, on
 * timeout, on connection error, and even if the socket closes with no other signal. The prior implementation
 * resolved the byte-cap path only via a LATER event after req.destroy(), which a bare destroy does not reliably
 * emit ⇒ the Promise could hang forever (the intermittent external-research-live gate hang). Every case here is
 * wrapped in a hard per-case deadline so a regression surfaces as a FAIL, never as a hung test run. Hermetic:
 * in-process http server, no external network.
 *
 * Run: node runtime/core/http-get-bounded.test.js
 */
"use strict";

const assert = require("assert");
const http = require("http");
const net = require("net");
const ce = require("./capability-executors");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

// Resolve the real fetch against a hard deadline: if httpGetBounded hangs, this rejects ⇒ the case FAILs
// (it never hangs the whole run). Returns the fetch result on time, throws "DEADLINE" otherwise.
function withDeadline(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => { const t = setTimeout(() => rej(new Error(`DEADLINE ${label} (${ms}ms) — httpGetBounded did not settle`)), ms); t.unref(); }),
  ]);
}

function closeServer(srv) {
  return new Promise((r) => {
    let done = false; const fin = () => { if (!done) { done = true; r(undefined); } };
    try { srv.closeAllConnections && srv.closeAllConnections(); } catch { /* older node */ }
    srv.close(fin);
    setTimeout(fin, 2000).unref();
  });
}

(async () => {
  console.log("httpGetBounded — resolve-once contract");

  // 1. NORMAL: full body under the cap ⇒ 200 + exact body, settles fast.
  {
    const body = "hello-bounded";
    const srv = http.createServer((req, res) => { res.writeHead(200, { "content-type": "text/plain" }); res.end(body); });
    await new Promise((r) => srv.listen(0, r));
    const port = srv.address().port;
    const r = await withDeadline(ce.httpGetBounded(`http://127.0.0.1:${port}/`, 1_000_000, 4000), 8000, "normal");
    ok("normal fetch ⇒ 200 + full body (settles)", r.status === 200 && r.body === body && r.truncated === false);
    await closeServer(srv);
  }

  // 2. BYTE-CAP (the latent hang): server streams FAR more than maxBytes and keeps the connection open (no quick
  //    'end'); httpGetBounded must RESOLVE AT THE CAP (truncated:true) without waiting for a post-destroy event.
  {
    const srv = http.createServer((req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      // write a large first chunk (exceeds the cap) then keep dribbling — never call res.end() so there is NO 'end'
      // event for the old code to fall back on. A correct resolve-at-cap settles immediately; a regression hangs.
      res.write("X".repeat(10000));
      const iv = setInterval(() => { try { res.write("Y".repeat(1000)); } catch { clearInterval(iv); } }, 50);
      res.on("close", () => clearInterval(iv));
    });
    await new Promise((r) => srv.listen(0, r));
    const port = srv.address().port;
    const r = await withDeadline(ce.httpGetBounded(`http://127.0.0.1:${port}/`, 100, 4000), 8000, "byte-cap");
    ok("byte-cap ⇒ resolves truncated:true at the cap (no wait-for-event hang)", r.truncated === true && r.body.length <= 100 && r.bytes <= 100 && r.status === 200);
    await closeServer(srv);
  }

  // 3. TIMEOUT: server accepts but never responds ⇒ req 'timeout' ⇒ settle status 0, bounded.
  {
    const srv = http.createServer(() => { /* never respond */ });
    await new Promise((r) => srv.listen(0, r));
    const port = srv.address().port;
    const r = await withDeadline(ce.httpGetBounded(`http://127.0.0.1:${port}/`, 1_000_000, 300), 8000, "timeout");
    ok("no-response server ⇒ settles status 0 (timeout), never hangs", r.status === 0 && /timeout/.test(r.error || ""));
    await closeServer(srv);
  }

  // 4. CONNECTION REFUSED: unreachable port ⇒ req 'error'/'close' ⇒ settle status 0, bounded (never hang).
  {
    // find a definitely-closed port by opening+closing a listener
    const probe = net.createServer();
    const freePort = await new Promise((r) => probe.listen(0, () => { const p = probe.address().port; probe.close(() => r(p)); }));
    const r = await withDeadline(ce.httpGetBounded(`http://127.0.0.1:${freePort}/`, 1000, 2000), 8000, "refused");
    ok("connection refused/closed ⇒ settles status 0 (never hangs)", r.status === 0 && typeof r.error === "string");
  }

  // 5. UNSUPPORTED PROTOCOL / INVALID URL: immediate settle (pre-request guard).
  {
    const bad = await withDeadline(ce.httpGetBounded("file:///etc/passwd", 1000, 1000), 4000, "proto");
    ok("non-http(s) protocol ⇒ status 0 unsupported protocol (no local retrieval)", bad.status === 0 && /unsupported protocol/.test(bad.error || ""));
    const inv = await withDeadline(ce.httpGetBounded("::::not a url", 1000, 1000), 4000, "invalidurl");
    ok("invalid url ⇒ status 0 invalid url", inv.status === 0 && /invalid url/.test(inv.error || ""));
  }

  // 6. SSRF GUARD (opt-in): with {rejectPrivateHosts:true} a private/link-local/loopback/cloud-metadata host is
  //    refused BEFORE any connection (status 0, SSRF error). WITHOUT the flag the same host is permitted (default
  //    permissive — so legitimate loopback callers like ollama/odg-probe/this suite are unaffected). The governed
  //    external-research client (governedHttpGet worker) always sets the flag.
  {
    for (const host of ["169.254.169.254", "metadata.google.internal", "10.0.0.5", "127.0.0.1", "192.168.1.1", "[::1]", "localhost"]) {
      const r = await withDeadline(ce.httpGetBounded(`http://${host}/`, 1000, 1000, { rejectPrivateHosts: true }), 4000, "ssrf-" + host);
      ok(`SSRF guard ON ⇒ ${host} blocked before connect (status 0, SSRF error)`, r.status === 0 && /SSRF guard/.test(r.error || ""));
    }
    // default (no flag): a metadata host is NOT pre-blocked — it is attempted (and fails to connect here), proving the
    // guard is opt-in and does not break loopback consumers.
    const permit = await withDeadline(ce.httpGetBounded("http://169.254.169.254/", 100, 500), 6000, "ssrf-default");
    ok("SSRF guard OFF (default) ⇒ host NOT pre-blocked (opt-in; loopback consumers unaffected)", !/SSRF guard/.test(permit.error || ""));
    // a PUBLIC host is allowed even with the guard on (not over-blocked) — attempted, no SSRF refusal.
    const pub = await withDeadline(ce.httpGetBounded("https://example.com/", 100, 500, { rejectPrivateHosts: true }), 6000, "ssrf-public");
    ok("SSRF guard ON ⇒ a public host is NOT refused by the guard (not over-blocked)", !/SSRF guard/.test(pub.error || ""));
    // IP-LITERAL-ONLY: public DOMAINS that merely START like a private range must NOT be over-blocked (the numeric
    // range rules apply only to IP literals). 10.example.com / fcbarcelona.com / fd-cdn.net are public ⇒ attempted.
    for (const host of ["10.example.com", "fcbarcelona.com", "fd-cdn.net", "169-fake.example.com"]) {
      const r = await withDeadline(ce.httpGetBounded(`https://${host}/`, 100, 500, { rejectPrivateHosts: true }), 6000, "ssrf-lookalike-" + host);
      ok(`SSRF guard ON ⇒ public lookalike ${host} NOT over-blocked (IP-literal-only)`, !/SSRF guard/.test(r.error || ""));
    }
    // but the corresponding IP LITERALS are still blocked.
    for (const host of ["10.0.0.5", "0.0.0.0", "[fc00::1]", "[fe80::1]", "[::1]"]) {
      const r = await withDeadline(ce.httpGetBounded(`http://${host}/`, 100, 500, { rejectPrivateHosts: true }), 4000, "ssrf-ipliteral-" + host);
      ok(`SSRF guard ON ⇒ IP literal ${host} still blocked`, r.status === 0 && /SSRF guard/.test(r.error || ""));
    }
  }

  console.log(`\nhttpGetBounded resolve-once — ${passed} assertions passed`);
})().catch((e) => { console.error(e && e.message ? e.message : e); process.exit(1); });
