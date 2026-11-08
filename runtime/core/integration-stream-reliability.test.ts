#!/usr/bin/env node
"use strict";

/*
 * WI-INT-23 — P12→P4→P7. Locks: clean stream ⇒ RELIABLE/MEETS; duplicate idempotency ⇒ deduped; invalid event
 * ⇒ rejected/DEGRADED; disorder ⇒ orderingViolations/BREACHES; simulated loss ⇒ lossRate/BREACHES; replay; P4
 * metrics; determinism. Pure. Run: node_modules/.bin/tsx runtime/core/integration-stream-reliability.test.ts
 */
const assert = require("assert");
const S = require("./integration-stream-reliability");

let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }

console.log("WI-INT-23 — INTEGRATION P12 → P4 → P7");
const slo = { maxLossRate: 0, maxDuplicateRate: 0, maxOrderingViolations: 0 };

// clean stream ⇒ RELIABLE + MEETS
{
  const ev = [{ type: "e", key: "k", payload: { order: 1, v: 1 } }, { type: "e", key: "k", payload: { order: 2, v: 2 } }];
  const r = S.runStreamReliability(ev, { slo });
  check(r.verdict === "RELIABLE" && r.sloVerdict === "MEETS", "clean ordered unique stream ⇒ RELIABLE/MEETS");
  check(r.p12.appended === 2 && r.p12.replayedTail >= 1, "P12: 2 appended + replay works");
  check(r.engine.indexOf("IN_MEMORY") === 0, "honest: engine is IN_MEMORY (not a distributed broker)");
}
// duplicate idempotencyKey ⇒ deduped, duplicateRate > 0, SLO BREACHES
{
  const ev = [{ type: "e", key: "k", idempotencyKey: "d", payload: { order: 1 } }, { type: "e", key: "k", idempotencyKey: "d", payload: { order: 2 } }];
  const r = S.runStreamReliability(ev, { slo });
  check(r.p12.deduped === 1 && r.p7.duplicateRate > 0 && r.p7.breaches.includes("duplicateRate"), "duplicate ⇒ deduped + duplicateRate breach");
}
// invalid event ⇒ rejected ⇒ DEGRADED
check(S.runStreamReliability([{ key: "k" }]).verdict === "DEGRADED", "invalid event (no type) ⇒ rejected ⇒ DEGRADED");
// disorder ⇒ orderingViolations + BREACHES
{
  const ev = [{ type: "e", key: "k", payload: { order: 5 } }, { type: "e", key: "k", payload: { order: 1 } }];
  const r = S.runStreamReliability(ev, { slo });
  check(r.p7.orderingViolations === 1 && r.p7.breaches.includes("orderingViolations"), "out-of-order payloads ⇒ orderingViolations + breach");
}
// simulated loss ⇒ lossRate + BREACHES
{
  const ev = [{ type: "e", key: "k", payload: { order: 1 } }];
  const r = S.runStreamReliability(ev, { expectedUnique: 4, slo });
  check(r.p7.lossRate > 0 && r.p7.breaches.includes("lossRate"), "expectedUnique > appended ⇒ lossRate breach (simulated loss)");
}
// determinism
check(JSON.stringify(S.runStreamReliability([{ type: "e", key: "k", payload: { order: 1 } }], { slo })) === JSON.stringify(S.runStreamReliability([{ type: "e", key: "k", payload: { order: 1 } }], { slo })), "deterministic reliability report");

console.log(failures === 0 ? "ALL PASS — WI-INT-23 P12→P4→P7" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

// Module-scope marker (TS2451/TS2588 guard).
export {};
