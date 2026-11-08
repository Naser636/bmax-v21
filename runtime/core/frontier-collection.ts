#!/usr/bin/env node
"use strict";

/*
 * WI-FR-07 (LOCAL WIRING) — FRONTIER COLLECTION tick. PURE orchestration that closes the LOCAL gaps of the autonomous
 * world Radar WITHOUT real network and WITHOUT a new scheduler/queue/store/client:
 *   - invokes frontier-radar.collect() through an INJECTED fetcher (fail-closed AUTH_REQUIRED when none — NO built-in
 *     network client; the production fetcher is bounded-http-client.get, wired only under a separate owner-gated unit);
 *   - adds the two durable partitions the Radar lacked: a CROSS-RUN seen-fingerprint set (raw-signal dedup across ticks)
 *     and a per-source HEALTH/CURSOR record (lastCollected, errors, cursor) — both via autonomy-store/idempotency-guard;
 *   - exposes a pure weekly-cadence predicate `dueForCollection` (the actual cadence is driven by the EXISTING systemd
 *     timer deploy/odg-mission-runner.timer — NOT an in-process scheduler);
 *   - feeds qualified candidates/proposals to frontier-radar-store (canonical DEFERRED-lot integration).
 *
 * LIVE network egress stays BLOCKED/owner-gated (live unit is IPAddressDeny=any). Fixtures/injected fetcher prove the
 * PROCESSING pipeline, never the Internet. SIGNAL ≠ FACT and the Radar never self-authorizes (preserved from FR-01/02).
 * Pure/deterministic (now + fetcher + parser injected; the only side effect is the injected store). Dual export.
 */

const RADAR = require("./frontier-radar");
const STORE = require("./frontier-radar-store");
const autonomyStore = require("./autonomy-store");

const KEYS = Object.freeze({ seen: "frontier-seen-fingerprints", health: "frontier-source-health" });
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function isNum(v: any): boolean { return typeof v === "number" && isFinite(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function storeOf(opts: any): any { return isObj(opts) && isObj(opts.store) ? opts.store : autonomyStore; }

/** loadSeen(opts) -> durable cross-run seen-fingerprint set (array). Fail-open to empty (dedup is additive, never destructive). */
function loadSeen(opts: any): any {
  const st = storeOf(opts);
  const rs = (typeof st.readStrict === "function") ? st.readStrict(KEYS.seen) : { value: st.read(KEYS.seen, null) };
  return arr(rs.value && rs.value.fingerprints).filter(isStr);
}
function recordSeen(opts: any, fingerprints: any): any {
  const st = storeOf(opts);
  const merged = Array.from(new Set(loadSeen(opts).concat(arr(fingerprints).filter(isStr))));
  st.write(KEYS.seen, { fingerprints: merged });
  return merged.length;
}

/** loadHealth / updateHealth(opts, sourceId, patch) -> per-source { lastCollected, errors[], cursor, collects, failures }. */
function loadHealth(opts: any): any {
  const st = storeOf(opts);
  const rs = (typeof st.readStrict === "function") ? st.readStrict(KEYS.health) : { value: st.read(KEYS.health, null) };
  return isObj(rs.value) ? rs.value : {};
}
function updateHealth(opts: any, sourceId: any, patch: any): any {
  if (!isStr(sourceId)) return loadHealth(opts);
  const st = storeOf(opts);
  const health = loadHealth(opts);
  const prev = isObj(health[sourceId]) ? health[sourceId] : { collects: 0, failures: 0, errors: [], cursor: null, lastCollected: null };
  const p = isObj(patch) ? patch : {};
  const next = {
    lastCollected: p.collectedAt !== undefined ? p.collectedAt : prev.lastCollected,
    cursor: p.cursor !== undefined ? p.cursor : prev.cursor,
    collects: prev.collects + (p.collected === true ? 1 : 0),
    failures: prev.failures + (p.error ? 1 : 0),
    errors: isStr(p.error) ? arr(prev.errors).concat([p.error]).slice(-10) : arr(prev.errors),
  };
  const merged = { ...health, [sourceId]: next };
  st.write(KEYS.health, merged);
  return merged;
}

/** dueForCollection(source, now, lastCollectedAt) -> boolean. Pure cadence predicate (weekly default). `now`/last are ms. */
function dueForCollection(source: any, now: any, lastCollectedAt: any): boolean {
  if (!isNum(now)) return true;              // no clock supplied ⇒ treat as due (caller/timer decides)
  if (!isNum(lastCollectedAt)) return true;  // never collected ⇒ due
  const cadence = source && source.cadence;
  const periodMs = cadence === "daily" ? WEEK_MS / 7 : WEEK_MS; // weekly default; only daily/weekly honored
  return now - lastCollectedAt >= periodMs;
}

/**
 * collectTick(input, deps) -> a structured collection report. input: { registry }. deps: { httpGet, parseSignals, store,
 * baseline, odgBaseline, now }. For each DUE source: collect() via the injected fetcher → parse raw → runRadar → drop
 * raw signals already in the cross-run seen set → persist fresh candidates/proposals → update seen + source health.
 * FAIL-CLOSED: no fetcher ⇒ every source AUTH_REQUIRED (no live collection, no fabrication).
 */
async function collectTick(input: any, deps: any): Promise<any> {
  const i = isObj(input) ? input : {};
  const d = isObj(deps) ? deps : {};
  const now = d.now;
  const registry = isObj(i.registry) ? i.registry : {};
  const parse = typeof d.parseSignals === "function" ? d.parseSignals : (() => []);
  const health = loadHealth(d);
  const perSource: any[] = [];
  const allFresh: any[] = [];

  for (const id of Object.keys(registry)) {
    const source = registry[id];
    const last = health[id] && isNum(health[id].lastCollected) ? health[id].lastCollected : null;
    if (!dueForCollection(source, now, last)) { perSource.push({ sourceId: id, state: "NOT_DUE" }); continue; }
    const col = await RADAR.collect(source, { httpGet: d.httpGet, now });
    if (col.state !== RADAR.COLLECT_STATE.COLLECTED) {
      updateHealth(d, id, { error: col.reason || col.state });
      perSource.push({ sourceId: id, state: col.state, reason: col.reason || null });
      continue;
    }
    const rawSignals = arr(parse(col.raw, source)).map((s: any) => (isObj(s) ? { ...s, sourceId: id } : s));
    perSource.push({ sourceId: id, state: "COLLECTED", signals: rawSignals.length });
    updateHealth(d, id, { collected: true, collectedAt: now, cursor: col.cursor });
    allFresh.push(...rawSignals);
  }

  // CROSS-RUN dedup: drop any raw signal whose fingerprint was already seen in a previous tick.
  const seen = new Set(loadSeen(d));
  const normalized = allFresh.map((r: any) => RADAR.normalizeSignal(r, { sourceId: r && r.sourceId, now }));
  const fresh = normalized.filter((s: any) => !seen.has(s.fingerprint));
  const freshFingerprints = fresh.map((s: any) => s.fingerprint);

  // Qualify only the fresh signals; persist resulting candidates/proposals via the canonical store.
  const report = RADAR.runRadar({ registry, rawSignals: fresh.map((s: any) => ({ sourceId: s.sourceId, title: s.title, categories: s.categories, claims: s.claims })), baseline: isObj(d.baseline) ? { ...d.baseline, seenFingerprints: Array.from(seen) } : { seenFingerprints: Array.from(seen) }, odgBaseline: isObj(d.odgBaseline) ? d.odgBaseline : {}, now });
  let persistedCandidates = 0, persistedProposals = 0;
  for (const c of report.candidates) { if (STORE.persistCandidate(c, { store: storeOf(d), now }).added) persistedCandidates++; }
  for (const p of report.proposals) { if (STORE.recordProposal(p, { store: storeOf(d), now }).added) persistedProposals++; }
  recordSeen(d, freshFingerprints);

  const authRequired = perSource.every((s: any) => s.state === "AUTH_REQUIRED") && perSource.length > 0;
  return Object.freeze({
    ok: true, authRequired,
    perSource: Object.freeze(perSource),
    freshSignals: fresh.length, duplicatesDropped: normalized.length - fresh.length,
    byDecision: report.byDecision, persistedCandidates, persistedProposals,
    note: "fixtures/injected fetcher prove PROCESSING, never live network; live egress is owner-gated (IPAddressDeny=any)",
  });
}

const FRONTIER_COLLECTION_CONTRACT = Object.freeze({
  id: "WI-FR-07-FRONTIER-COLLECTION-LOCAL",
  source: "Resumption mandate WI-FR-07 (local wiring) — collect invocation + cross-run dedup + source health + cadence predicate",
  storeKeys: KEYS,
  reuses: Object.freeze(["frontier-radar (collect/normalizeSignal/runRadar)", "frontier-radar-store (persistCandidate/recordProposal)", "autonomy-store (durable partitions)", "the EXISTING systemd timer for cadence"]),
  notAuthority: "drives collection→qualification→persistence over existing mechanisms; creates NO scheduler/queue/store/network-client; live egress stays owner-gated; the Radar never self-authorizes",
  invariants: Object.freeze([
    "NO built-in network client — collection is via an INJECTED fetcher; absent ⇒ AUTH_REQUIRED per source (fail-closed)",
    "LIVE network egress stays BLOCKED/owner-gated; fixtures prove processing, never the Internet",
    "cross-run seen-fingerprint dedup + per-source health/cursor are durable (autonomy-store); no new store",
    "cadence is a PURE predicate (weekly default); the real cadence is the EXISTING systemd timer — no in-process scheduler",
    "SIGNAL ≠ FACT and the Radar never self-authorizes (preserved from FR-01/02); proposals stay PROPOSED/DEFERRED",
    "pure/deterministic; the only side effect is the injected store",
  ]),
});

module.exports = { KEYS, FRONTIER_COLLECTION_CONTRACT, loadSeen, recordSeen, loadHealth, updateHealth, dueForCollection, collectTick };

if (require.main === module) { process.stdout.write(JSON.stringify(FRONTIER_COLLECTION_CONTRACT, null, 2) + "\n"); }

export {};
