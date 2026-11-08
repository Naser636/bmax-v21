#!/usr/bin/env node
"use strict";

/*
 * WI-P12-15 — EVENT-STREAM ENGINE (P12 Real-Time Data Streaming & Event-Driven Engineering — foundation).
 * PURE, deterministic, IN-MEMORY event log (honestly NOT a distributed broker; no network/clock): immutable
 * stream-in → new-stream-out, like world-model. Guarantees: APPEND-ONLY total order (monotonic seq), PER-KEY
 * order (subsequence of the global order), IDEMPOTENT publish (an event with a repeated idempotencyKey is
 * de-duplicated, never re-appended), REPLAY from any offset, and consumer-group OFFSET tracking (at-least-once
 * made effectively-once by the idempotency + cursor). Synthetic load is deterministic + reproducible. Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.length > 0; }

/** createStream() -> frozen empty stream. */
function createStream(): any { return Object.freeze({ events: Object.freeze([]), byIdem: Object.freeze({}) }); }

function evs(stream: any): any[] { return isObj(stream) && Array.isArray(stream.events) ? stream.events : []; }
function idem(stream: any): any { return isObj(stream) && isObj(stream.byIdem) ? stream.byIdem : {}; }

/**
 * publish(stream, event) -> { ok, stream, event, duplicate? }. event: { type, key?, payload?, idempotencyKey? }.
 * Monotonic seq (= position). A repeated idempotencyKey is a no-op returning the ALREADY-stored event (dedup).
 */
function publish(stream: any, event: any): any {
  const e = isObj(event) ? event : {};
  if (!isStr(e.type)) return Object.freeze({ ok: false, reason: "event.type (non-empty string) required", stream });
  const events = evs(stream); const byIdem = idem(stream);
  if (isStr(e.idempotencyKey) && Object.prototype.hasOwnProperty.call(byIdem, e.idempotencyKey)) {
    const existing = events[byIdem[e.idempotencyKey] - 1];
    return Object.freeze({ ok: true, duplicate: true, stream, event: existing }); // dedup: no append
  }
  const seq = events.length + 1;
  const stored = Object.freeze({ seq, type: e.type, key: isStr(e.key) ? e.key : null, payload: e.payload === undefined ? null : e.payload, idempotencyKey: isStr(e.idempotencyKey) ? e.idempotencyKey : null });
  const nextEvents = events.concat([stored]);
  const nextIdem = { ...byIdem }; if (stored.idempotencyKey) nextIdem[stored.idempotencyKey] = seq;
  return Object.freeze({ ok: true, duplicate: false, stream: Object.freeze({ events: Object.freeze(nextEvents), byIdem: Object.freeze(nextIdem) }), event: stored });
}

/** publishMany(stream, events[]) -> { stream, appended, deduped }. Folds publish (idempotent). */
function publishMany(stream: any, events: any): any {
  let st = stream; let appended = 0; let deduped = 0;
  for (const e of (Array.isArray(events) ? events : [])) { const r = publish(st, e); if (r.ok) { st = r.stream; if (r.duplicate) deduped++; else appended++; } }
  return Object.freeze({ stream: st, appended, deduped });
}

/** consume(stream, opts) -> ordered events after fromSeq matching key/type (REPLAY). opts: {fromSeq?,key?,type?,limit?}. */
function consume(stream: any, opts?: any): any[] {
  const o = isObj(opts) ? opts : {};
  const from = typeof o.fromSeq === "number" ? o.fromSeq : 0;
  let out = evs(stream).filter((e: any) => e.seq > from);
  if (isStr(o.key)) out = out.filter((e: any) => e.key === o.key);
  if (isStr(o.type)) out = out.filter((e: any) => e.type === o.type);
  if (typeof o.limit === "number" && o.limit >= 0) out = out.slice(0, o.limit);
  return out; // already in ascending seq (append) order ⇒ total + per-key order preserved
}

/** offsets(stream) -> { lastSeq, count, byKey:{key:lastSeq} }. */
function offsets(stream: any): any {
  const events = evs(stream); const byKey: any = {};
  for (const e of events) if (e.key) byKey[e.key] = e.seq;
  return Object.freeze({ lastSeq: events.length, count: events.length, byKey: Object.freeze(byKey) });
}

/** advanceCursor(cursor, seq) -> { offset } — monotonic consumer offset (effectively-once via idempotency). */
function advanceCursor(cursor: any, seq: any): any {
  const cur = isObj(cursor) && typeof cursor.offset === "number" ? cursor.offset : 0;
  return Object.freeze({ offset: typeof seq === "number" && seq > cur ? seq : cur });
}

const EVENT_STREAM_CONTRACT = Object.freeze({
  id: "WI-P12-15-EVENT-STREAM-ENGINE",
  source: "P12 Real-Time Data Streaming & Event-Driven Engineering (foundation) — in-memory, pure, deterministic",
  notAuthority: "in-memory deterministic event log; NOT a distributed broker; no network/clock; no external delivery",
  invariants: Object.freeze([
    "pure/deterministic: stream in → new stream out; seq is the append position (no clock)",
    "append-only TOTAL order; PER-KEY order is the subsequence of the total order",
    "IDEMPOTENT publish: a repeated idempotencyKey is de-duplicated (no re-append), returns the stored event",
    "REPLAY from any offset via consume(fromSeq); consumer OFFSET is monotonic (effectively-once with idempotency)",
    "honest scope: single-process in-memory engine; distribution/persistence are out of this foundation",
  ]),
});

module.exports = { createStream, publish, publishMany, consume, offsets, advanceCursor, EVENT_STREAM_CONTRACT };

if (require.main === module) {
  process.stdout.write(JSON.stringify(EVENT_STREAM_CONTRACT, null, 2) + "\n");
}

export {};
