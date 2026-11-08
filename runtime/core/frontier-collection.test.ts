#!/usr/bin/env node
"use strict";
const assert = require("assert");
const FC = require("./frontier-collection");
const RADAR = require("./frontier-radar");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("WI-FR-07 (local) — FRONTIER COLLECTION");

function fakeStore(): any {
  const m = new Map();
  return { read: (n: any, f: any) => (m.has(n) ? m.get(n) : (f === undefined ? null : f)), readStrict: (n: any) => m.has(n) ? { present: true, corrupt: false, value: m.get(n) } : { present: false, corrupt: false, value: null }, write: (n: any, o: any) => { m.set(n, o); return o; } };
}
const allowedUrl = "https://api.ted.europa.eu/v3/notices/search";
const registry = RADAR.registerSource({}, { id: "ted", owner: "EU", url: allowedUrl, type: "api", reliability: 0.9, cadence: "weekly" }, { now: 0 }).registry;
const parseSignals = (_raw: any) => [{ title: "Faster parser", categories: ["parsing"], claims: ["2x"] }];
const baseline = { focusAreas: ["parsing"], crossChecked: true };

void (async () => {
  // (1) FAIL-CLOSED: no injected fetcher ⇒ AUTH_REQUIRED per source.
  {
    const store = fakeStore();
    const r = await FC.collectTick({ registry }, { parseSignals, store, baseline, odgBaseline: { capabilities: [] }, now: 1 });
    check(r.authRequired === true && r.perSource[0].state === "AUTH_REQUIRED", "no injected fetcher ⇒ AUTH_REQUIRED (no live collection, fail-closed)");
  }

  // (2) injected fetcher ⇒ COLLECTED, qualified, candidate+proposal persisted; (4) health updated.
  {
    const store = fakeStore();
    const httpGet = async (_u: any) => ({ statusCode: 200, body: "<notices/>" });
    const r = await FC.collectTick({ registry }, { httpGet, parseSignals, store, baseline, odgBaseline: { capabilities: [] }, now: 1000 });
    check(r.perSource[0].state === "COLLECTED" && r.freshSignals === 1 && r.persistedCandidates === 1 && r.persistedProposals === 1, "injected fetcher ⇒ COLLECTED + qualified + candidate/proposal persisted");
    const health = FC.loadHealth({ store });
    check(health.ted && health.ted.collects === 1 && health.ted.lastCollected === 1000, "source health updated (collects, lastCollected)");

    // (3) CROSS-RUN dedup: a later tick with the SAME signal drops it (already seen) ⇒ 0 new candidates.
    const r2 = await FC.collectTick({ registry }, { httpGet, parseSignals, store, baseline, odgBaseline: { capabilities: [] }, now: 1000 + 8 * 24 * 3600 * 1000 });
    check(r2.duplicatesDropped >= 1 && r2.freshSignals === 0 && r2.persistedCandidates === 0, "cross-run dedup: a repeated signal is dropped (no duplicate candidate)");
  }

  // (5) blocked (non-allowlisted / SSRF) url ⇒ BLOCKED_SOURCE + health error.
  {
    const store = fakeStore();
    const badRegistry = { evil: { id: "evil", url: "http://169.254.169.254/x", type: "api", reliability: 0.5 } };
    const r = await FC.collectTick({ registry: badRegistry }, { httpGet: async () => ({ statusCode: 200, body: "x" }), parseSignals, store, baseline, now: 1 });
    check(r.perSource[0].state === "BLOCKED_SOURCE", "non-allowlisted/SSRF url ⇒ BLOCKED_SOURCE");
    check(FC.loadHealth({ store }).evil.failures === 1, "a failed collection records a source-health error");
  }

  // (6) cadence predicate.
  check(FC.dueForCollection({ cadence: "weekly" }, 1000, null) === true, "never collected ⇒ due");
  check(FC.dueForCollection({ cadence: "weekly" }, 1000, 1000 - 8 * 24 * 3600 * 1000) === true, "weekly cadence, >7 days since last ⇒ due");
  check(FC.dueForCollection({ cadence: "weekly" }, 1000, 1000 - 1 * 24 * 3600 * 1000) === false, "weekly cadence, 1 day since last ⇒ NOT due");
  check(FC.dueForCollection({ cadence: "daily" }, 1000 + 2 * 24 * 3600 * 1000, 1000) === true, "daily cadence, 2 days since last ⇒ due");

  // (7) durable seen set survives (resume): recordSeen then loadSeen.
  {
    const store = fakeStore();
    FC.recordSeen({ store }, ["fp1", "fp2"]);
    check(FC.loadSeen({ store }).length === 2 && FC.recordSeen({ store }, ["fp2", "fp3"]) === 3, "seen-fingerprint set is durable + de-duplicated across ticks");
  }

  console.log(failures === 0 ? "ALL PASS — WI-FR-07 (local) FRONTIER COLLECTION" : `FAILURES: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
})();
export {};
