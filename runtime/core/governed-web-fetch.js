#!/usr/bin/env node

/*
 * Governed Web Fetch — the MINIMAL governed HTTP(S) client that resolves D1/D2/D3 for ODG's single
 * External Research Acquisition seam (runtime/core/capability-executors.js). It is NOT a second
 * research system: it only performs ONE governed GET and returns the bytes + provenance; all
 * orchestration, allowlist, authorization, policy, ranking and evidence stay in the existing seam.
 *
 * WHY A SUBPROCESS. The research executor's run() is SYNCHRONOUS and calls fetcher(url) synchronously
 * (a disk-driven JSON mission cannot carry a function — that was D2). This module exports a SYNCHRONOUS
 * `fetch(url)` that spawns `node governed-web-fetch.js <url>` (the exact pattern the Connectivity Audit
 * already uses in the same file) and parses the child's JSON. So a disk/JSON mission reaches a real
 * network client with no injected function (D2/D3 resolved), while the seam's gates are unchanged.
 *
 * GOVERNANCE (fail-closed, no bypass):
 *   - HTTPS ONLY (http/file/etc. refused — returned as status 0 with an error, never fetched).
 *   - Hard TIMEOUT.
 *   - MAX response bytes (truncate + mark, never unbounded).
 *   - NO redirect following (a 3xx is returned verbatim as a non-2xx; the seam counts only 2xx as
 *     acquired, so a redirect can never silently cross to an off-allowlist host — minimal SSRF guard).
 *   - NO secrets, NO auth headers, honest User-Agent.
 *   - One request per call (sequential by construction; the seam loops allowlisted URLs one at a time).
 * It asserts only OBSERVED bytes (reality); it fabricates nothing. On any failure it returns an honest
 * error shape so the caller fails closed (never a fake 200).
 */

"use strict";

const https = require("https");
const { spawnSync } = require("child_process");

const TIMEOUT_MS = 8000;
const MAX_BYTES = 1048576; // 1 MiB cap
const USER_AGENT = "ODG-Research/1.0 (+governed; https-only; no-redirect)";

// Async single GET, used in the child process. Resolves an honest result object (never throws).
function getOnce(url) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(url); } catch { return resolve({ ok: false, status: 0, error: "invalid url" }); }
    if (u.protocol !== "https:") return resolve({ ok: false, status: 0, error: "non-https refused (governed: https only)" });
    const req = https.request(
      u,
      { method: "GET", timeout: TIMEOUT_MS, headers: { "user-agent": USER_AGENT, accept: "*/*" } },
      (res) => {
        const chunks = [];
        let bytes = 0;
        let truncated = false;
        res.on("data", (c) => {
          bytes += c.length;
          if (bytes <= MAX_BYTES) chunks.push(c);
          else { truncated = true; req.destroy(); }
        });
        res.on("end", () =>
          resolve({
            ok: true,
            status: res.statusCode,
            body: Buffer.concat(chunks).toString("utf8"),
            bytes: Math.min(bytes, MAX_BYTES),
            truncated,
            fetched_at: new Date().toISOString(),
            finalUrl: url, // no redirects followed — same URL
          }),
        );
      },
    );
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, status: 0, error: "timeout" }); });
    req.on("error", (e) => resolve({ ok: false, status: 0, error: e.code || String(e.message || e) }));
    req.end();
  });
}

// Synchronous facade: spawn this file as a child for ONE url and parse its JSON. Matches the executor's
// synchronous fetcher contract. On any failure returns { status: 0, ... } so the caller fails closed.
function fetch(url) {
  const r = spawnSync(process.execPath, [__filename, String(url)], {
    encoding: "utf8",
    timeout: TIMEOUT_MS + 2000,
    maxBuffer: MAX_BYTES + 262144,
  });
  if (r.status !== 0 || !r.stdout) {
    return { status: 0, body: "", error: "fetch subprocess failed: " + String((r.stderr || "").trim() || r.error || "no output") };
  }
  try {
    const out = JSON.parse(r.stdout);
    return { status: typeof out.status === "number" ? out.status : 0, body: typeof out.body === "string" ? out.body : "", fetched_at: out.fetched_at, bytes: out.bytes, truncated: out.truncated, error: out.error };
  } catch {
    return { status: 0, body: "", error: "unparseable fetch output" };
  }
}

module.exports = { fetch, getOnce, TIMEOUT_MS, MAX_BYTES, USER_AGENT };

// CLI: fetch ONE url and print the JSON result. Exit 0 even on a fetch error (the error is in the JSON)
// so the synchronous parent can read an honest result; exit 2 only on misuse.
if (require.main === module) {
  const url = process.argv[2];
  if (!url) { process.stderr.write("usage: governed-web-fetch.js <https-url>\n"); process.exit(2); }
  getOnce(url).then((res) => { process.stdout.write(JSON.stringify(res)); process.exit(0); });
}
