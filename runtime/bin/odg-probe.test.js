#!/usr/bin/env node
"use strict";

/*
 * odg-probe regression — FULLY OFFLINE. An injected fake fetcher (counts calls, returns fixtures) means
 * no real network request is ever made. Verifies opt-in gating, strict allowlist/URL rejection, bound
 * propagation, single-call/no-retry, redirect-no-second-request, honest classification, body/secret
 * sanitization, and that the audit artifact + package.json gates are untouched.
 * Run: node runtime/bin/odg-probe.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const P = require("./odg-probe.js");

let passed = 0;
const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); passed += 1; };
const REPO = path.resolve(__dirname, "..", "..");

// Fake fetcher: records calls + args; returns a fixture. NEVER touches the network.
function fakeFetcher(fixture) {
  const calls = [];
  const fn = (url, maxBytes, timeoutMs) => { calls.push({ url, maxBytes, timeoutMs }); return Promise.resolve(fixture); };
  fn.calls = calls;
  return fn;
}
const run = (argv, env, fetcher, classify) => P.run({ argv, env, fetcher, classify, now: (() => { let t = 0; return () => (t += 5); })() });

(async () => {
  // 1. default mode never calls the fetcher
  {
    const f = fakeFetcher({ status: 200 });
    const r = await run([], {}, f);
    ok("1 default ⇒ DRY, fetcher NOT called", r.report.mode === "DRY" && f.calls.length === 0 && r.exitCode === 0);
  }
  // 2. --live alone (no env) is insufficient
  {
    const f = fakeFetcher({ status: 200 });
    const r = await run(["--live"], {}, f);
    ok("2 --live without ODG_LIVE_PROBE=1 ⇒ DRY, no fetch", r.report.mode === "DRY" && f.calls.length === 0);
  }
  // 3. both opt-in conditions permit the live path
  {
    const f = fakeFetcher({ status: 200, bytes: 2048, truncated: true, fetched_at: "2026-10-10T00:00:00Z" });
    const r = await run(["--live"], { ODG_LIVE_PROBE: "1" }, f);
    ok("3 --live + env ⇒ LIVE path, fetcher called once", r.report.mode === "LIVE" && f.calls.length === 1);
  }
  // 4/5. only the exact approved URL; invalid hosts/schemes/creds/ports/query/fragment rejected pre-network
  const bad = [
    "https://evil.com", "http://github.com", "https://user:pass@github.com",
    "https://github.com:8443", "https://github.com/?q=1", "https://github.com/#x", "https://github.com/path",
    "https://api.github.com", "ftp://github.com",
  ];
  {
    let allRejected = true, anyFetch = 0;
    for (const u of bad) {
      const f = fakeFetcher({ status: 200 });
      const r = await run(["--live", "--url", u], { ODG_LIVE_PROBE: "1" }, f);
      if (r.report.valid !== false || r.exitCode !== 2 || f.calls.length !== 0) { allRejected = false; anyFetch += f.calls.length; }
    }
    ok("4/5 invalid url/host/scheme/creds/port/query/fragment/path rejected before networking", allRejected && anyFetch === 0);
    ok("5b exact https://github.com is accepted as valid", P.buildPlan(["--url", "https://github.com"], {}).valid === true);
  }
  // 6. exact 2048-byte and 2500-ms bounds reach the fetcher
  {
    const f = fakeFetcher({ status: 200 });
    await run(["--live"], { ODG_LIVE_PROBE: "1" }, f);
    ok("6 bounds 2048/2500 passed to fetcher", f.calls[0].maxBytes === 2048 && f.calls[0].timeoutMs === 2500);
    ok("6b requestedBounds disclose retries=0 + no redirect", P.BOUNDS.retries === 0 && P.BOUNDS.followRedirects === false);
  }
  // 7. fetcher called at most once (no retry) even on error
  {
    const f = fakeFetcher({ status: 0, error: "ECONNRESET" });
    await run(["--live"], { ODG_LIVE_PROBE: "1" }, f);
    ok("7 no retry: fetcher called exactly once on error", f.calls.length === 1);
  }
  // 8. a redirect response does not trigger a second request
  {
    const f = fakeFetcher({ status: 301 });
    const r = await run(["--live"], { ODG_LIVE_PROBE: "1" }, f);
    ok("8 redirect (301) ⇒ single request, no second call", f.calls.length === 1 && r.report.observed.status === 301);
  }
  // 9/10. classification via the real classifier, honest per evidence
  const cases = [
    [{ status: 200 }, "OK"], [{ status: 404 }, "OK"], [{ status: 503 }, "HTTP_ERROR"],
    [{ status: 0, error: "ENOTFOUND" }, "DNS_FAIL"], [{ status: 0, error: "CERT_HAS_EXPIRED" }, "TLS_FAIL"],
    [{ status: 0, error: "timeout" }, "TIMEOUT"], [{ status: 0, error: "ENETUNREACH" }, "BLOCKED_BY_NETWORK_POLICY"],
    [{ status: 0, error: "ECONNREFUSED" }, "FAIL"], [{ status: 0 }, "FAIL"],
  ];
  {
    let good = true; const seen = [];
    for (const [fx, want] of cases) {
      const r = await run(["--live"], { ODG_LIVE_PROBE: "1" }, fakeFetcher(fx));
      seen.push(`${fx.error || fx.status}→${r.report.classification.class}`);
      if (r.report.classification.class !== want) good = false;
    }
    ok("9/10 classifications honest: " + seen.join(", "), good);
    ok("10b 404 is OK-reachable with status preserved", (await run(["--live"], { ODG_LIVE_PROBE: "1" }, fakeFetcher({ status: 404 }))).report.classification.status === 404);
    ok("10c ENETUNREACH never becomes OK", (await run(["--live"], { ODG_LIVE_PROBE: "1" }, fakeFetcher({ status: 0, error: "ENETUNREACH" }))).report.classification.class !== "OK");
  }
  // 11. body + sensitive info never appear in output
  {
    const f = fakeFetcher({ status: 200, body: "SECRET-HTML-BODY-should-not-leak", bytes: 2048, truncated: true });
    const r = await run(["--live"], { ODG_LIVE_PROBE: "1" }, f);
    const dump = JSON.stringify(r.report);
    ok("11 body/secret absent from output; observed has no 'body' field", !dump.includes("SECRET-HTML-BODY") && r.report.observed.body === undefined);
  }
  // 12. the pre-existing audit artifact remains untouched (probe writes no file)
  {
    const audit = path.join(REPO, "runtime", "generated", "connectivity-audit.json");
    const before = fs.existsSync(audit) ? fs.statSync(audit).mtimeMs + ":" + fs.statSync(audit).size : "absent";
    await run(["--live"], { ODG_LIVE_PROBE: "1" }, fakeFetcher({ status: 200 }));
    const after = fs.existsSync(audit) ? fs.statSync(audit).mtimeMs + ":" + fs.statSync(audit).size : "absent";
    ok("12 connectivity-audit.json untouched by the probe", before === after);
  }
  // 13. package.json offline gates do not reference odg-probe
  {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO, "package.json"), "utf8"));
    const gates = (pkg.scripts.test || "") + " " + (pkg.scripts["test:report"] || "");
    ok("13 offline gates (test, test:report) do NOT reference odg-probe", !gates.includes("odg-probe"));
  }
  // adapter unit: documented mapping
  ok("adapter: {status:200} ⇒ http.ok=true/status=200", (() => { const a = P.adaptObservation({ status: 200 }); return a.http.ok === true && a.http.status === 200; })());
  ok("adapter: {error} ⇒ http.ok=false with error", (() => { const a = P.adaptObservation({ status: 0, error: "X" }); return a.http.ok === false && a.http.error === "X"; })());

  console.log(`\nALL PASS — odg-probe (${passed} assertions)`);
  process.exit(passed > 0 ? 0 : 1);
})().catch((e) => { console.error("test error:", e && e.message); process.exit(1); });
