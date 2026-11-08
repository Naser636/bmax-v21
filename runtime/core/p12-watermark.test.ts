#!/usr/bin/env node
"use strict";
const assert = require("assert");
const P = require("./p12-watermark");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 14 P12 — WATERMARKS + LATE EVENTS");

// in-order events are all on-time.
{
  const r = P.processEvents([{ id: "a", ts: 10 }, { id: "b", ts: 20 }, { id: "c", ts: 30 }], { allowedLatenessMs: 5 });
  check(r.onTime === 3 && r.late === 0 && r.dropped === 0, "in-order events ⇒ all ON_TIME");
  check(r.finalWatermark === 25, "watermark = maxTs(30) − allowedLateness(5) = 25");
}

// a late-but-within-allowance event is accepted + flagged LATE.
{
  const r = P.processEvents([{ id: "a", ts: 10 }, { id: "b", ts: 20 }, { id: "c", ts: 16 }], { allowedLatenessMs: 5 });
  // after b: watermark = 20 − 5 = 15; c.ts=16 >= 15 ⇒ ON_TIME (not even late)
  check(r.results.find((x: any) => x.id === "c").status === "ON_TIME", "ts 16 ≥ watermark 15 ⇒ ON_TIME");
}

// a late event within allowed lateness.
{
  const r = P.processEvents([{ id: "a", ts: 10 }, { id: "b", ts: 30 }, { id: "c", ts: 23 }], { allowedLatenessMs: 5 });
  // after b: watermark = 30 − 5 = 25; c.ts=23 < 25 but >= 25−5=20 ⇒ LATE
  check(r.results.find((x: any) => x.id === "c").status === "LATE" && r.late === 1, "ts 23 (watermark 25, allowed 5) ⇒ LATE");
}

// a too-late event is DROPPED (fail-closed).
{
  const r = P.processEvents([{ id: "a", ts: 10 }, { id: "b", ts: 30 }, { id: "c", ts: 12 }], { allowedLatenessMs: 5 });
  // after b: watermark 25; c.ts=12 < 25−5=20 ⇒ DROPPED
  check(r.results.find((x: any) => x.id === "c").status === "DROPPED" && r.dropped === 1, "ts 12 below watermark−allowed ⇒ DROPPED (fail-closed)");
}

// zero allowed lateness ⇒ any out-of-order event is dropped.
{
  const r = P.processEvents([{ id: "a", ts: 10 }, { id: "b", ts: 30 }, { id: "c", ts: 20 }], { allowedLatenessMs: 0 });
  check(r.results.find((x: any) => x.id === "c").status === "DROPPED", "allowedLateness 0 ⇒ out-of-order event DROPPED");
}

check(P.P12_WATERMARK_CONTRACT.invariants.some((i: any) => /DROPPED \(fail-closed/.test(i)), "contract documents fail-closed drop");

console.log(failures === 0 ? "ALL PASS — SÉRIE 14 P12 WATERMARKS" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
