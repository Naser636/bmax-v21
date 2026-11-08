#!/usr/bin/env node
"use strict";
const assert = require("assert");
const D = require("./p12-dead-letter-quarantine");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 22 — P12 DEAD-LETTER / POISON-PILL QUARANTINE");

// SUCCESS ⇒ DELIVERED.
check(D.partitionDeliveries([{ id: "a", seq: 1, attempts: 1, lastOutcome: "SUCCESS" }], { maxAttempts: 5 }).counts.delivered === 1, "SUCCESS ⇒ DELIVERED");

// attempts < budget ⇒ RETRYING (transient).
check(D.partitionDeliveries([{ id: "b", seq: 1, attempts: 2, lastOutcome: "FAIL" }], { maxAttempts: 5 }).counts.retrying === 1, "attempts<budget ⇒ RETRYING");

// attempts >= budget ⇒ DEAD_LETTERED (exhausted).
{
  const r = D.partitionDeliveries([{ id: "c", seq: 1, attempts: 5, lastOutcome: "FAIL" }], { maxAttempts: 5 });
  check(r.counts.deadLettered === 1 && /exhausted/.test(r.deadLettered[0].reason), "attempts≥budget ⇒ DEAD_LETTERED (exhausted)");
}

// missing/invalid attempt count on a failing record ⇒ DEAD_LETTERED (poison, fail-closed).
check(D.partitionDeliveries([{ id: "d", seq: 1, lastOutcome: "FAIL" }], { maxAttempts: 5 }).counts.deadLettered === 1, "missing attempts on failure ⇒ POISON (fail-closed)");
check(D.partitionDeliveries([{ id: "e", seq: 1, attempts: -1, lastOutcome: "FAIL" }], { maxAttempts: 5 }).counts.deadLettered === 1, "negative attempts ⇒ POISON");
check(D.partitionDeliveries([{ id: "f", seq: 1, attempts: "lots", lastOutcome: "FAIL" }], { maxAttempts: 5 }).counts.deadLettered === 1, "non-numeric attempts ⇒ POISON");

// head-of-line: lowest-seq RETRYING record is the blocker; poison records are quarantined (do NOT block).
{
  const r = D.partitionDeliveries([
    { id: "ok", seq: 1, attempts: 0, lastOutcome: "SUCCESS" },
    { id: "poison", seq: 2, attempts: 9, lastOutcome: "FAIL" },   // quarantined
    { id: "stuck", seq: 3, attempts: 1, lastOutcome: "FAIL" },    // retrying — the real blocker
  ], { maxAttempts: 5, blockHeadOfLine: true });
  check(r.headOfLineBlocker === 3, `head-of-line blocker is the lowest-seq RETRYING (seq 3), got ${r.headOfLineBlocker}`);
  check(r.counts.deadLettered === 1, "poison record quarantined (unblocks the stream)");
}

// no blockHeadOfLine ⇒ no blocker reported.
check(D.partitionDeliveries([{ id: "x", seq: 1, attempts: 1, lastOutcome: "FAIL" }], { maxAttempts: 5 }).headOfLineBlocker === null, "no blockHeadOfLine ⇒ blocker null");

// empty/malformed ⇒ empty delivered (never fabricated success).
check(D.partitionDeliveries([], {}).counts.delivered === 0, "empty input ⇒ empty DELIVERED");
check(D.partitionDeliveries(null, null).counts.delivered === 0, "null input ⇒ empty DELIVERED (no crash)");

check(D.P12_DLQ_CONTRACT.invariants.some((i: any) => /never silently dropped and never re-admitted/.test(i)), "contract: never dropped, never re-admitted");

console.log(failures === 0 ? "ALL PASS — SÉRIE 22 P12 DEAD-LETTER QUARANTINE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
