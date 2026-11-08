#!/usr/bin/env node
"use strict";

/*
 * WI-P12-15 — event-stream-engine. Locks: append-only monotonic seq, per-key order, idempotent publish (dedup),
 * replay from offset, type/key filters, consumer cursor monotonicity, a synthetic deterministic load, and
 * determinism. Pure. Run: node_modules/.bin/tsx runtime/core/event-stream-engine.test.ts
 */
const assert = require("assert");
const S = require("./event-stream-engine");

let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }

console.log("WI-P12-15 — EVENT-STREAM ENGINE");

// append + monotonic seq
let st = S.createStream();
let r = S.publish(st, { type: "created", key: "o1", payload: { v: 1 } }); st = r.stream;
check(r.ok && r.event.seq === 1 && r.duplicate === false, "publish ⇒ seq 1, not duplicate");
r = S.publish(st, { type: "updated", key: "o1" }); st = r.stream;
r = S.publish(st, { type: "created", key: "o2" }); st = r.stream;
check(S.offsets(st).lastSeq === 3 && S.offsets(st).byKey.o1 === 2 && S.offsets(st).byKey.o2 === 3, "offsets: lastSeq + per-key last seq");

// per-key order preserved
check(JSON.stringify(S.consume(st, { key: "o1" }).map((e: any) => e.seq)) === JSON.stringify([1, 2]), "consume(key=o1) ⇒ ordered [1,2]");

// idempotent publish (dedup, no re-append)
const r1 = S.publish(st, { type: "pay", key: "o1", idempotencyKey: "idem-1" }); st = r1.stream;
const before = S.offsets(st).lastSeq;
const r2 = S.publish(st, { type: "pay", key: "o1", idempotencyKey: "idem-1" });
check(r2.duplicate === true && S.offsets(r2.stream).lastSeq === before && r2.event.seq === r1.event.seq, "repeated idempotencyKey ⇒ dedup (no re-append), returns stored event");

// replay from offset + type filter
check(JSON.stringify(S.consume(st, { fromSeq: 2 }).map((e: any) => e.seq)) === JSON.stringify([3, 4]), "replay from offset 2 ⇒ [3,4]");
check(S.consume(st, { type: "created" }).length === 2, "type filter: 2 'created' events");
check(S.consume(st, { fromSeq: 0, limit: 1 }).length === 1, "limit works");

// bad event rejected
check(S.publish(st, { key: "x" }).ok === false, "event without type ⇒ rejected (no append)");

// consumer cursor monotonic
check(S.advanceCursor({ offset: 2 }, 5).offset === 5 && S.advanceCursor({ offset: 5 }, 3).offset === 5, "cursor advances forward only (monotonic)");

// synthetic deterministic load: 500 events over 10 keys, 100 with repeated idempotency keys
{
  let s = S.createStream(); const batch: any[] = [];
  for (let i = 0; i < 500; i++) batch.push({ type: "ev", key: "k" + (i % 10), payload: i, idempotencyKey: i < 100 ? "dup-" + (i % 50) : undefined });
  const res = S.publishMany(s, batch); s = res.stream;
  check(res.appended === 450 && res.deduped === 50, "load: 500 published ⇒ 450 appended + 50 deduped (idempotency)");
  check(S.offsets(s).lastSeq === 450, "load: lastSeq 450");
  const k0 = S.consume(s, { key: "k0" }).map((e: any) => e.seq);
  check(k0.every((v: any, i: number) => i === 0 || v > k0[i - 1]), "load: per-key 'k0' events strictly increasing seq (ordering)");
}

// determinism
check(JSON.stringify(S.publish(S.createStream(), { type: "t", key: "k" })) === JSON.stringify(S.publish(S.createStream(), { type: "t", key: "k" })), "deterministic publish");

console.log(failures === 0 ? "ALL PASS — WI-P12-15 EVENT-STREAM ENGINE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

// Module-scope marker (TS2451/TS2588 guard).
export {};
