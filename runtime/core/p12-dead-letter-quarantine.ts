#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 22 (P12 streaming — world-research gap) — DEAD-LETTER / POISON-PILL QUARANTINE. PURE, deterministic. World
 * reference: the 2026 poison-message best practice (OneUptime 2026-01-21; "Dead Letter Queues and Retries: Production
 * Guide 2026") — a permanently-failing record at offset N blocks every offset above it; the mitigation is a finite
 * retry budget (typically 3-5) after which the record is routed to a DEDICATED dead-letter partition for inspection/
 * replay, NEVER retried forever and NEVER silently dropped; transient failures (succeed on retry) must be separated
 * from permanent ones. ODG's P12 stack covers ordering, dedup, replay, backpressure and event-time watermarks/late-
 * drop — but has NO failure-based quarantine (grep-verified: no dead-letter/poison/DLQ, no attempt budget). p12-
 * watermark drops LATE events (a TIME property); this handles UN-PROCESSABLE events (a FAILURE property) — orthogonal.
 * Sibling-shaped to p12-watermark (classify→partition). Composes idempotency-guard (a dead-lettered id is never re-
 * admitted) + p15-saga-compensation (terminal "cannot compensate forward"). No broker, no clock, no network. Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function num(v: any, d = 0): number { return typeof v === "number" && isFinite(v) ? v : d; }
function validAttempts(v: any): boolean { return typeof v === "number" && Number.isInteger(v) && v >= 0; }

const PARTITION = Object.freeze(["DELIVERED", "RETRYING", "DEAD_LETTERED"]);

/**
 * partitionDeliveries(events, {maxAttempts, blockHeadOfLine}) -> { delivered, retrying, deadLettered, headOfLineBlocker }.
 * event: { id, seq, attempts, lastOutcome }. lastOutcome === "SUCCESS" ⇒ delivered; a failing record with
 * attempts ≥ budget OR an invalid/missing attempt count ⇒ DEAD_LETTERED (poison, fail-closed); else RETRYING.
 */
function partitionDeliveries(events: any, opts: any): any {
  const o = isObj(opts) ? opts : {};
  const maxAttempts = Math.max(1, Math.floor(num(o.maxAttempts, 5)));
  const blockHeadOfLine = o.blockHeadOfLine === true;
  const delivered: any[] = []; const retrying: any[] = []; const deadLettered: any[] = [];

  for (const raw of arr(events)) {
    const e = isObj(raw) ? raw : {};
    const rec = Object.freeze({ id: e.id, seq: num(e.seq, 0), attempts: e.attempts, lastOutcome: e.lastOutcome });
    if (e.lastOutcome === "SUCCESS") { delivered.push(rec); continue; }
    // a failing record: exhausted budget OR an unverifiable attempt count ⇒ poison (never optimistically retried).
    if (!validAttempts(e.attempts)) { deadLettered.push(Object.freeze({ ...rec, reason: "invalid/missing attempt count ⇒ treated as poison (fail-closed)" })); continue; }
    if (e.attempts >= maxAttempts) { deadLettered.push(Object.freeze({ ...rec, reason: `retry budget exhausted (${e.attempts} ≥ ${maxAttempts})` })); continue; }
    retrying.push(rec); // transient: attempts < budget
  }

  // head-of-line: for an ordered stream, the lowest-seq RETRYING record blocks all higher offsets until it clears;
  // quarantining poison records is precisely what UNBLOCKS the stream (they leave the main partition).
  let headOfLineBlocker: any = null;
  if (blockHeadOfLine && retrying.length > 0) headOfLineBlocker = retrying.reduce((m, r) => (r.seq < m.seq ? r : m), retrying[0]).seq;

  return Object.freeze({
    delivered: Object.freeze(delivered), retrying: Object.freeze(retrying), deadLettered: Object.freeze(deadLettered),
    headOfLineBlocker,
    counts: Object.freeze({ delivered: delivered.length, retrying: retrying.length, deadLettered: deadLettered.length }),
    note: deadLettered.length > 0 ? "poison/exhausted records quarantined to the dead-letter partition (not dropped, not re-admitted)" : "no poison records; stream healthy",
  });
}

const P12_DLQ_CONTRACT = Object.freeze({
  id: "V124-P12-DEAD-LETTER-QUARANTINE",
  source: "SÉRIE 22 P12 — poison-pill / dead-letter quarantine (OneUptime 2026-01-21; DLQ Production Guide 2026)",
  partitions: PARTITION,
  reuses: Object.freeze(["sibling of p12-watermark (time-drop ↔ failure-quarantine)", "idempotency-guard (dead-lettered id never re-admitted)", "p15-saga-compensation (terminal cannot-compensate-forward)"]),
  notAuthority: "a deterministic classifier/partitioner over the caller's attempt log; it operates no broker and persists nothing",
  invariants: Object.freeze([
    "a failing record with attempts ≥ the finite retry budget is QUARANTINED to the dead-letter partition — never retried forever",
    "a missing/invalid/non-integer attempt count ⇒ treated as POISON (quarantined), never optimistically retried (fail-closed)",
    "quarantined records are never silently dropped and never re-admitted to the main stream (idempotency-guard)",
    "transient (attempts < budget) ⇒ RETRYING; SUCCESS ⇒ DELIVERED; for ordered streams the lowest-seq RETRYING record is the head-of-line blocker",
    "pure/deterministic: no broker, no clock, no random; empty/malformed input ⇒ empty DELIVERED (never a fabricated success)",
  ]),
});

module.exports = { partitionDeliveries, P12_DLQ_CONTRACT };

if (require.main === module) {
  const demo = partitionDeliveries([
    { id: "a", seq: 1, attempts: 0, lastOutcome: "SUCCESS" },
    { id: "b", seq: 2, attempts: 2, lastOutcome: "FAIL" },
    { id: "c", seq: 3, attempts: 5, lastOutcome: "FAIL" },
    { id: "d", seq: 4, lastOutcome: "FAIL" },
  ], { maxAttempts: 5, blockHeadOfLine: true });
  process.stdout.write(JSON.stringify({ ...P12_DLQ_CONTRACT, demo: { counts: demo.counts, headOfLineBlocker: demo.headOfLineBlocker } }, null, 2) + "\n");
}

export {};
