#!/usr/bin/env node

/* Economic Discovery (D4) — REAL LIVE end-to-end test through the ODG seam.
 * Acquires a PRIMARY economic JSON source over the real network (governed built-in client), extracts
 * an OBSERVED price by a DECLARED json-pointer rule, and classifies a PROVEN opportunity carrying the
 * full chain. If egress is unavailable the live assertions are SKIPPED (honest, never faked). */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const web = require("./governed-web-fetch");

const MOD = path.resolve(__dirname, "capability-executors.js");
let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

const URL = "https://api.coinbase.com/v2/prices/BTC-USD/spot"; // primary public JSON: {data:{amount,currency}}
const probe = web.fetch(URL);
const LIVE = probe.status >= 200 && probe.status <= 299;
console.log("Economic Discovery LIVE — egress to primary source ->", LIVE ? ("AVAILABLE (status " + probe.status + ")") : ("UNAVAILABLE (" + (probe.error || probe.status) + ") — SKIPPED"));

function run() {
  const prev = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ed-live-"));
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  fs.mkdirSync(path.join(dir, "runtime", "config"), { recursive: true });
  fs.writeFileSync(path.join(dir, "runtime", "config", "provider-policy.json"), JSON.stringify({ externalProvidersEnabled: true }));
  process.chdir(dir);
  try {
    delete require.cache[MOD];
    const ce = require(MOD);
    const patch = JSON.parse(JSON.stringify({
      objectiveId: "EXTERNAL_RESEARCH_1",
      research_acquisition: {
        authorized: true, execute: true,
        source_allowlist: [URL],
        extract: [{ url: URL, field: "spot_price_usd", rule: { type: "json", pointer: "/data/amount" } }],
        opportunities: [{ identity: { name: "BTC-USD spot (observed reference price)", activity: "price observation", market: "crypto spot" }, fields: [{ name: "spot_price_usd", source_url: URL }], unknowns: ["buy/sell spread", "demand", "fees"] }],
      },
    }));
    const ev = JSON.parse(fs.readFileSync(ce.resolve(patch).run().evidence, "utf8"));
    return ev;
  } finally { process.chdir(prev); fs.rmSync(dir, { recursive: true, force: true }); }
}

console.log("Economic Discovery (D4) — real seam");

if (!LIVE) {
  console.log("  ~ live assertions SKIPPED (no egress) — not a fake pass");
} else {
  const ev = run();
  ok("acquisitionMode LIVE_BUILTIN (JSON mission, no injected function)", ev.acquisitionMode === "LIVE_BUILTIN" && ev.acquired === true);
  const o = (ev.observations || [])[0];
  ok("OBSERVED economic value extracted from the acquired bytes", o && o.status === "OBSERVED" && /^-?\d+(\.\d+)?$/.test(String(o.raw)));
  ok("observation bound to real provenance (2xx + sha256 + ISO date + evidence_ref)", o && o.http_status === 200 && /^[0-9a-f]{64}$/.test(o.content_hash) && /\d{4}-\d{2}-\d{2}T/.test(o.fetched_at) && o.evidence_ref);
  const op = (ev.opportunities || [])[0];
  ok("opportunity PROVEN on the OBSERVED field", op && op.verification_status === "PROVEN");
  ok("full chain: opportunity -> evidence -> source -> url -> date -> observation -> verification_status", op && op.evidence_ref && op.sources[0].url === URL && op.sources[0].date && op.sources[0].content_hash && op.observations[0].status === "OBSERVED");
  ok("counts: >=1 proven, >=1 observed field", ev.opportunityCounts.proven >= 1 && ev.opportunityCounts.observedFields >= 1);
  console.log("  OBSERVED spot_price_usd (raw) =", o.raw, "| fetched_at =", o.fetched_at);
}

console.log(`\nEconomic Discovery LIVE — ${passed} assertions passed (LIVE=${LIVE ? "OBSERVED" : "SKIPPED"}).`);
