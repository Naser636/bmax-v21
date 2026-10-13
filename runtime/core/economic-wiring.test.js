#!/usr/bin/env node

/*
 * Economic wiring — External Research seam × economic extractor/opportunity policy (Option A).
 *
 * Proves the LIVE research executor turns ACQUIRED 2xx bytes into OBSERVED observations + a
 * deterministic opportunity classification, bound to the EXISTING governed fetcher seam — using an
 * INJECTED spy fetcher only (ZERO external network). Runs in a throwaway cwd with a minimal provider
 * policy so no real tree / no real policy is touched. Deterministic.
 *
 * Gates asserted:
 *   1. dry-run (execute:false) ⇒ spy fetcher NEVER called; no observations/opportunities emitted.
 *   2. LIVE + 2xx + declared rule ⇒ OBSERVED observation w/ provenance; PROVEN opportunity.
 *   3. non-2xx source ⇒ observation NOT OBSERVED; opportunity REJECTED (policy fail-closed).
 *   4. no extract/opportunity declarations ⇒ evidence shape byte-identical (no economic keys).
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const CE_PATH = path.resolve(__dirname, "capability-executors.js");

let passed = 0;
function ok(label, cond) { assert.strictEqual(cond, true, "FAIL: " + label); console.log("  ok - " + label); passed++; }

// Run the research executor in an isolated cwd with a minimal LIVE-enabling provider policy.
// `ra` carries an injected spy fetcher (ra.fetch) — the existing JSON-safe seam — so ZERO network.
function runResearch(ra) {
  const prev = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eco-wire-"));
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  fs.mkdirSync(path.join(dir, "runtime", "config"), { recursive: true });
  fs.writeFileSync(path.join(dir, "runtime", "config", "provider-policy.json"), JSON.stringify({ externalProvidersEnabled: true }));
  process.chdir(dir);
  let threw = null, evidence = null;
  try {
    delete require.cache[require.resolve(CE_PATH)];
    const ce = require(CE_PATH);
    const exec = ce.resolve({ objectiveId: "EXTERNAL_RESEARCH_1", goal: "wire", research_acquisition: ra });
    try { exec.run(); } catch (e) { threw = e; }
    const EVI = path.join("runtime", "generated", "external-research-acquisition.json");
    evidence = fs.existsSync(EVI) ? JSON.parse(fs.readFileSync(EVI, "utf8")) : null;
  } finally {
    process.chdir(prev);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return { threw, evidence };
}

console.log("ECONOMIC WIRING — research seam × extractor/opportunity-policy (injected fetcher, no network)");

// 1. DRY-RUN: spy fetcher must be untouched; no economic keys emitted.
{
  const calls = [];
  const spy = (u) => { calls.push(u); return { status: 200, body: "PRICE=42", fetched_at: "2020-01-01T00:00:00Z" }; };
  const { evidence } = runResearch({
    authorized: true, execute: false, source_allowlist: ["https://a.test"], fetch: spy,
    extract: [{ url: "https://a.test", field: "price", rule: { type: "regex", pattern: "PRICE=(\\d+)", group: 1, unit: "EUR", kind: "COST_UNIT", scale: 0 } }],
    opportunities: [{ identity: { name: "X" }, fields: [{ name: "price", source_url: "https://a.test" }] }],
  });
  ok("dry-run ⇒ spy fetcher received ZERO calls", calls.length === 0);
  ok("dry-run ⇒ mode DRY_RUN, acquired false", evidence && evidence.mode === "DRY_RUN" && evidence.acquired === false);
  ok("dry-run ⇒ NO observations emitted", !("observations" in evidence));
  ok("dry-run ⇒ NO opportunities emitted", !("opportunities" in evidence) && !("opportunityCounts" in evidence));
}

// 2. LIVE + 2xx + declared rule ⇒ OBSERVED observation (provenance) + PROVEN opportunity.
{
  const calls = [];
  const spy = (u) => { calls.push(u); return { status: 200, body: "PRICE=42", fetched_at: "2020-01-01T00:00:00Z" }; };
  const { threw, evidence } = runResearch({
    authorized: true, execute: true, source_allowlist: ["https://a.test"], fetch: spy,
    extract: [{ url: "https://a.test", field: "price", rule: { type: "regex", pattern: "PRICE=(\\d+)", group: 1, unit: "EUR", kind: "COST_UNIT", scale: 0 } }],
    opportunities: [{ identity: { name: "X" }, fields: [{ name: "price", source_url: "https://a.test" }] }],
  });
  ok("LIVE ⇒ no throw (a 2xx source was acquired)", threw === null);
  ok("LIVE ⇒ spy called with EXACTLY the allowlist (no scope broadening)", JSON.stringify(calls) === JSON.stringify(["https://a.test"]));
  const obs = evidence.observations.find((o) => o.field === "price");
  ok("observation is OBSERVED with full provenance (2xx + content_hash + fetched_at)", obs && obs.status === "OBSERVED" && obs.http_status === 200 && typeof obs.content_hash === "string" && obs.content_hash.length === 64 && obs.fetched_at === "2020-01-01T00:00:00Z");
  ok("observation carries the OBSERVED raw value from the acquired bytes (42)", obs && obs.raw === "42");
  const opp = evidence.opportunities[0];
  ok("opportunity is PROVEN (>=1 OBSERVED field, full chain)", opp && opp.verification_status === "PROVEN");
  ok("opportunityCounts reflect 1 proven / 1 observed field", evidence.opportunityCounts.proven === 1 && evidence.opportunityCounts.observedFields === 1);
}

// 3. non-2xx source ⇒ observation not OBSERVED; opportunity REJECTED (fail-closed). LIVE throws (no 2xx
//    acquired), but the evidence is written BEFORE the throw, so we assert on it.
{
  const spy = () => ({ status: 503, body: "", fetched_at: "2020-01-01T00:00:00Z" });
  const { threw, evidence } = runResearch({
    authorized: true, execute: true, source_allowlist: ["https://a.test"], fetch: spy,
    extract: [{ url: "https://a.test", field: "price", rule: { type: "regex", pattern: "PRICE=(\\d+)", group: 1 } }],
    opportunities: [{ identity: { name: "X" }, fields: [{ name: "price", source_url: "https://a.test" }] }],
  });
  ok("non-2xx ⇒ LIVE fails closed (throws: no 2xx source acquired)", !!threw && /no 2xx source acquired/.test(threw.message));
  const obs = evidence.observations.find((o) => o.field === "price");
  ok("non-2xx ⇒ observation is NOT OBSERVED (UNKNOWN, source not 2xx)", obs && obs.status !== "OBSERVED");
  const opp = evidence.opportunities[0];
  ok("non-2xx ⇒ opportunity REJECTED (references a non-2xx source)", opp && opp.verification_status === "REJECTED");
}

// 4. No extract/opportunity declarations ⇒ evidence shape UNCHANGED (no economic keys added).
{
  const spy = () => ({ status: 200, body: "irrelevant", fetched_at: "2020-01-01T00:00:00Z" });
  const { threw, evidence } = runResearch({ authorized: true, execute: true, source_allowlist: ["https://a.test"], fetch: spy });
  ok("LIVE without declarations ⇒ no throw", threw === null);
  ok("no declarations ⇒ NO observations key (byte-identical shape)", !("observations" in evidence));
  ok("no declarations ⇒ NO opportunities/opportunityCounts keys", !("opportunities" in evidence) && !("opportunityCounts" in evidence));
  ok("no declarations ⇒ existing keys still present (sources, acquired, mode LIVE)", Array.isArray(evidence.sources) && evidence.acquired === true && evidence.mode === "LIVE");
}

console.log(`\nEconomic Wiring — ${passed} assertions passed.`);
