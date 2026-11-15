#!/usr/bin/env node
"use strict";
/*
 * IMP-P12-STREAM-REF (lot-5 contract, owner-authorized block) — P12 Streaming/realtime: a streaming REFERENCE (method
 * only). PURE, deterministic. ODG is NOT a stream processor: a real streaming runtime is REJECTED/OWNER_GATED. This
 * module encodes the sourced patterns (exactly-once via 2-phase commit, at-least-once + idempotent sinks, event-time
 * watermarks, backpressure) and provides a deterministic idempotency de-dup helper (reusing the existing idempotency
 * discipline) so the PATTERN is testable without any runtime.
 *
 * Acceptance (contract): reference only; real streaming runtime REJECTED/OWNER_GATED; gate green.
 */

const PATTERNS = Object.freeze([
  { key: "exactly-once", method: "2-phase commit: checkpoint ↔ source offset ↔ transactional sink (Kafka+Flink)" },
  { key: "practical-default", method: "at-least-once delivery + IDEMPOTENT sinks (dedup by key) — the common production default" },
  { key: "event-time", method: "event-time + watermarks (BoundedOutOfOrderness 5–30s); late events → side-output, never silently dropped" },
  { key: "backpressure", method: "bounded buffers + backpressure propagation; no unbounded queues" },
]);

function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

/* dedupByKey(events, seen) -> {kept, duplicates}. The idempotent-sink pattern made testable (NOT a runtime): a repeated
 * key is dropped. seen is a Set the caller owns (idempotency across a window). */
function dedupByKey(events: any, seen: any): any {
  const s = seen instanceof Set ? seen : new Set();
  const kept: any[] = [], duplicates: any[] = [];
  for (const e of arr(events)) { const k = e && e.key != null ? String(e.key) : null; if (k === null) { duplicates.push({ reason: "no idempotency key" }); continue; } if (s.has(k)) duplicates.push(e); else { s.add(k); kept.push(e); } }
  return { kept, duplicates, keptCount: kept.length, duplicateCount: duplicates.length };
}

function reference(): any {
  return Object.freeze({
    metier: "P12", patterns: PATTERNS,
    runtime: Object.freeze({ status: "REJECTED", reason: "ODG is NOT a stream processor — a real streaming runtime (Kafka/Flink) is REJECTED/OWNER_GATED; this is method/reference only" }),
    honesty: "reference/method ONLY (sourced from Kafka/Flink practice); the idempotent-sink pattern is made testable via dedupByKey; a real streaming runtime is REJECTED/OWNER_GATED.",
  });
}

const STREAMING_REFERENCE_CONTRACT = Object.freeze({
  id: "IMP-P12-STREAM-REF",
  purpose: "P12 — streaming reference/method (exactly-once/idempotent/watermarks/backpressure); runtime REJECTED",
  invariants: Object.freeze([
    "reference/method ONLY — a real streaming runtime is REJECTED/OWNER_GATED (ODG is not a stream processor)",
    "the idempotent-sink pattern is testable (dedupByKey drops repeated keys; no key ⇒ dropped, never silently kept)",
    "deterministic; read-only; no new engine",
  ]),
});

module.exports = { PATTERNS, dedupByKey, reference, STREAMING_REFERENCE_CONTRACT };
export {};
