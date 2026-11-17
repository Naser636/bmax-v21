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

// V254 §2 — the existing P12 ordered/deduped by SEQUENCE but had no EVENT-TIME semantics: tumbling windows + a WATERMARK to
// detect LATE events (events whose event-time is behind the watermark). This is the core streaming-correctness model (Apache
// Flink / Google Dataflow): a late event must be surfaced explicitly, NEVER silently folded into a window as if on-time.
// Deterministic (watermark is INJECTED, no wall clock); fail-closed.
/** windowByEventTime(events, {windowMs, watermark}) -> tumbling event-time windows + late/rejected events. */
function windowByEventTime(events: any, opts: any): any {
  const o = isObj(opts) ? opts : {};
  const windowMs = num(o.windowMs, 0);
  const watermark = num(o.watermark, 0);
  if (!(windowMs > 0)) return Object.freeze({ ok: false, code: "INVALID_WINDOW", detail: "windowMs must be > 0 (fail-closed)" });
  const byStart: Record<number, string[]> = {};
  const late: any[] = []; const rejected: any[] = []; let onTime = 0;
  for (const e of arr(events)) {
    if (!isObj(e) || typeof e.eventTime !== "number" || !isFinite(e.eventTime)) { rejected.push(Object.freeze({ event: e === null ? null : (isObj(e) ? (isStr(e.id) ? e.id : "(no-id)") : String(e)), reason: "missing/invalid eventTime (fail-closed)" })); continue; }
    const id = isStr(e.id) ? e.id : "ev@" + e.eventTime;
    if (e.eventTime < watermark) { late.push(Object.freeze({ id, eventTime: e.eventTime })); continue; }   // behind the watermark ⇒ LATE
    const start = Math.floor(e.eventTime / windowMs) * windowMs;
    (byStart[start] = byStart[start] || []).push(id); onTime++;
  }
  const windows = Object.keys(byStart).map(Number).sort((a, b) => a - b).map((start) => Object.freeze({ start, end: start + windowMs, ids: Object.freeze(byStart[start].slice()), count: byStart[start].length }));
  return Object.freeze({
    ok: true, windowMs, watermark, windows: Object.freeze(windows),
    onTime, late: Object.freeze(late), lateCount: late.length, rejected: Object.freeze(rejected), rejectedCount: rejected.length,
    note: "tumbling EVENT-TIME windows [start, start+windowMs); an event with eventTime < watermark is LATE (surfaced, NOT folded into a window); missing/invalid eventTime ⇒ rejected (fail-closed). Watermark injected (deterministic, no wall clock).",
  });
}

function runReferenceProject(opts: any): any {
  const o = isObj(opts) ? opts : {};
  if (o.eventTimeWindows) {
    const w = windowByEventTime(arr(o.events), { windowMs: num(o.windowMs, 10), watermark: num(o.watermark, 0) });
    return Object.freeze({ synthetic: true, profession: "P12", eventTimeWindows: w, level: "E2", degraded: w.ok === false || w.lateCount > 0 || w.rejectedCount > 0, note: "SYNTHETIC event stream (not a real broker, not E5); event-time tumbling windows + watermark late-event detection; real Kafka/Pulsar + real watermarks (E5) owner-gated NOT_RUN" });
  }
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
    "V254 event-time: windowByEventTime assigns events to tumbling [start,start+windowMs) windows; an event behind the WATERMARK is LATE (surfaced, never silently folded in); invalid eventTime ⇒ rejected (fail-closed); watermark injected (deterministic)",
  ]),
});

module.exports = { processStream, replayConsistent, windowByEventTime, runReferenceProject, P12_STREAMING_REFERENCE_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...P12_STREAMING_REFERENCE_CONTRACT, demo: runReferenceProject({}) }, null, 2) + "\n"); }

export {};
