#!/usr/bin/env node
"use strict";

/*
 * WI-INT-23 — MULTI-PROFESSION INTEGRATION P12 → P4 → P7. PURE, deterministic. Composes by contract:
 * P12 event-stream-engine (publish/dedup/consume/offsets/replay) → P4 dataset-quality-service (data quality of
 * the event payloads) → P7 reliability (duplicate/loss/ordering rates + an SLO check). Honest scope: the P12
 * engine is IN-MEMORY (not a distributed broker). Produces a verifiable reliability report. Dual export.
 */

const ES = require("./event-stream-engine");
const DQ = require("./dataset-quality-service");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function round(n: number): number { return Number(n.toFixed(6)); }
function metricsOf(res: any): any { if (!isObj(res) || !res.ok) return null; if (isObj(res.metrics)) return res.metrics; for (const k of Object.keys(res)) { const v = res[k]; if (isObj(v) && isObj(v.metrics)) return v.metrics; } return null; }

// per-key ordering inversions over a monotone field (default payload.order) in consumption order.
function orderingViolations(events: any[]): number {
  const lastByKey: any = {}; let inv = 0;
  for (const e of events) {
    const k = e.key || "_"; const ord = e.payload && typeof e.payload.order === "number" ? e.payload.order : null;
    if (ord === null) continue;
    if (lastByKey[k] !== undefined && ord < lastByKey[k]) inv++;
    lastByKey[k] = ord;
  }
  return inv;
}

/** runStreamReliability(events, opts) -> report. opts: { expectedUnique?, dataSchema?, slo?:{maxLossRate,maxDuplicateRate,maxOrderingViolations} }. */
function runStreamReliability(events: any, opts?: any): any {
  const o = isObj(opts) ? opts : {};
  const batch = Array.isArray(events) ? events : [];
  // --- P12 ---
  const pub = ES.publishMany(ES.createStream(), batch);
  const stream = pub.stream;
  const all = ES.consume(stream, {});
  const off = ES.offsets(stream);
  const attempts = batch.length;
  const appended = pub.appended;
  const deduped = pub.deduped;
  const rejected = attempts - appended - deduped;
  const replayTail = ES.consume(stream, { fromSeq: Math.max(0, off.lastSeq - 1) }); // replay last event (proves offset replay)

  // --- P7 reliability metrics ---
  const expectedUnique = typeof o.expectedUnique === "number" ? o.expectedUnique : appended;
  const loss = Math.max(0, expectedUnique - appended);
  const duplicateRate = attempts > 0 ? round(deduped / attempts) : 0;
  const lossRate = expectedUnique > 0 ? round(loss / expectedUnique) : 0;
  const ordViol = orderingViolations(all);
  const slo = isObj(o.slo) ? o.slo : {};
  const breaches: string[] = [];
  if (typeof slo.maxLossRate === "number" && lossRate > slo.maxLossRate) breaches.push("lossRate");
  if (typeof slo.maxDuplicateRate === "number" && duplicateRate > slo.maxDuplicateRate) breaches.push("duplicateRate");
  if (typeof slo.maxOrderingViolations === "number" && ordViol > slo.maxOrderingViolations) breaches.push("orderingViolations");
  const sloVerdict = Object.keys(slo).length === 0 ? "NO_SLO" : (breaches.length === 0 ? "MEETS" : "BREACHES");

  // --- P4 data quality over event payloads ---
  const records = all.map((e: any) => (isObj(e.payload) ? e.payload : { value: e.payload })).filter(isObj);
  const p4 = records.length ? DQ.assessDataset({ records, schema: isObj(o.dataSchema) ? o.dataSchema : {} }) : { ok: false, code: "NO_DATA" };

  const verdict = (rejected > 0 || breaches.length > 0) ? "DEGRADED" : "RELIABLE";
  return Object.freeze({
    verdict, sloVerdict,
    engine: "IN_MEMORY (not a distributed broker)",
    p12: Object.freeze({ attempts, appended, deduped, rejected, lastSeq: off.lastSeq, replayedTail: replayTail.length }),
    p7: Object.freeze({ duplicateRate, lossRate, orderingViolations: ordViol, breaches: Object.freeze(breaches.sort()) }),
    p4: Object.freeze({ ok: !!(p4 && p4.ok), metrics: metricsOf(p4) }),
  });
}

const INTEGRATION_STREAM_RELIABILITY_CONTRACT = Object.freeze({
  id: "WI-INT-23-STREAM-RELIABILITY",
  source: "Integration P12 (event-stream-engine) → P4 (dataset-quality-service) → P7 (reliability metrics + SLO)",
  notAuthority: "pure cross-métier composition over an IN-MEMORY engine; not a distributed broker; reuses capabilities by contract",
  invariants: Object.freeze([
    "pure/deterministic: events in → reliability report out",
    "P12 provides dedup/ordering/replay; P4 assesses payload quality; P7 computes loss/duplicate/ordering + SLO",
    "honest scope: the engine is in-memory (distributed broker NOT claimed)",
    "fail-closed: rejected events or SLO breaches ⇒ verdict DEGRADED",
  ]),
});

module.exports = { INTEGRATION_STREAM_RELIABILITY_CONTRACT, orderingViolations, runStreamReliability };

if (require.main === module) {
  process.stdout.write(JSON.stringify(INTEGRATION_STREAM_RELIABILITY_CONTRACT, null, 2) + "\n");
}

export {};
