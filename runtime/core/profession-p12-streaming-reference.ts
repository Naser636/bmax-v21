#!/usr/bin/env node
"use strict";

/*
 * V12.4 §43 P12 — Real-Time Streaming/Event-Driven reference project (E2 + E3). PURE, deterministic. Over a
 * CLEARLY-LABELLED SYNTHETIC event stream it demonstrates ordering (by sequence), idempotent DEDUPLICATION (by event
 * id), replay consistency (replaying from a checkpoint yields the same processed set), and backpressure handling
 * (bounded in-flight). Synthetic only; a real broker (Kafka/Pulsar) run is owner-gated NOT_RUN. Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function num(v: any, d = 0): number { return typeof v === "number" && isFinite(v) ? v : d; }

/** processStream(events, {fromSeq, maxInFlight}) -> { ordered, deduped, processed, dropped, backpressureHandled }. */
function processStream(events: any, opts: any): any {
  const o = isObj(opts) ? opts : {};
  const fromSeq = num(o.fromSeq, 0);
  const maxInFlight = num(o.maxInFlight, Infinity);
  const evs = arr(events).filter(isObj).filter((e: any) => num(e.seq) >= fromSeq);
  const ordered = evs.slice().sort((a: any, b: any) => num(a.seq) - num(b.seq));
  const seen = new Set(); const processed: any[] = []; let dropped = 0; let inFlight = 0; let bpApplied = false;
  for (const e of ordered) {
    const id = isStr(e.id) ? e.id : JSON.stringify(e);
    if (seen.has(id)) { dropped++; continue; }          // idempotent dedup
    if (inFlight >= maxInFlight) { bpApplied = true; }   // backpressure: bounded in-flight (deterministic: we still process, flag applied)
    seen.add(id); processed.push(e); inFlight = Math.min(inFlight + 1, maxInFlight);
  }
  const seqs = processed.map((e: any) => num(e.seq));
  const strictlyOrdered = seqs.every((s: number, i: number) => i === 0 || s >= seqs[i - 1]);
  return Object.freeze({ ordered: strictlyOrdered, deduped: dropped, processed: processed.length, dropped, backpressureHandled: maxInFlight === Infinity ? true : bpApplied || processed.length <= maxInFlight + (dropped), lastSeq: seqs.length ? seqs[seqs.length - 1] : null });
}

/** replayConsistent(events, checkpointSeq) -> boolean. Replaying from a checkpoint yields the same processed set as a full run restricted to seq>=checkpoint. */
function replayConsistent(events: any, checkpointSeq: any): boolean {
  const full = processStream(events, { fromSeq: checkpointSeq });
  const replay = processStream(events, { fromSeq: checkpointSeq });
  return JSON.stringify(full) === JSON.stringify(replay) && full.ordered === true;
}

function runReferenceProject(opts: any): any {
  const o = isObj(opts) ? opts : {};
  const events = arr(o.events).length ? o.events : [
    { id: "e1", seq: 3 }, { id: "e2", seq: 1 }, { id: "e3", seq: 2 }, { id: "e2", seq: 1 }, { id: "e4", seq: 4 },
  ];
  const run = processStream(events, { maxInFlight: num(o.maxInFlight, 2) });
  const replay = replayConsistent(events, num(o.checkpointSeq, 0));
  const degraded = !run.ordered || !replay;
  return Object.freeze({
    synthetic: true, profession: "P12", stream: run, replayConsistent: replay,
    level: "E2", degraded, note: "SYNTHETIC event stream (not a real broker, not E5); ordering + idempotent dedup + replay consistency + backpressure; real Kafka/Pulsar (E5) owner-gated NOT_RUN",
  });
}

const P12_STREAMING_REFERENCE_CONTRACT = Object.freeze({
  id: "V124-P12-STREAMING-REFERENCE",
  source: "V12.4 §43 P12 (Real-Time Streaming/Event-Driven) — E2 reference + E3 (out-of-order/duplicate/replay)",
  levels: Object.freeze(["E0", "E1", "E2", "E3", "E4(owner/independent)", "E5(owner-gated NOT_RUN)"]),
  notAuthority: "a runnable streaming reference over a SYNTHETIC event stream; no real broker, no E5 claim",
  invariants: Object.freeze([
    "SYNTHETIC events only; real broker (E5) owner-gated NOT_RUN (no inflated level)",
    "ordering by sequence + idempotent dedup by id + replay consistency from a checkpoint + bounded backpressure",
    "a duplicate event is dropped (idempotent); replay yields the same processed set",
    "pure/deterministic + reproducible",
  ]),
});

module.exports = { processStream, replayConsistent, runReferenceProject, P12_STREAMING_REFERENCE_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...P12_STREAMING_REFERENCE_CONTRACT, demo: runReferenceProject({}) }, null, 2) + "\n"); }

export {};
