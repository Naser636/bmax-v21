#!/usr/bin/env node
"use strict";
const assert = require("assert");
const P12 = require("./profession-p12-streaming-reference");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V12.4 §43 P12 — STREAMING REFERENCE (E2/E3)");

// ordering + idempotent dedup over an out-of-order, duplicated stream.
{
  const r = P12.processStream([
    { id: "e1", seq: 3 }, { id: "e2", seq: 1 }, { id: "e3", seq: 2 }, { id: "e2", seq: 1 }, { id: "e4", seq: 4 },
  ], { maxInFlight: 2 });
  check(r.ordered === true, "events processed in sequence order");
  check(r.dropped === 1 && r.processed === 4, "duplicate event id dropped (idempotent dedup)");
  check(r.lastSeq === 4, "last processed seq is the highest");
}

// replay from a checkpoint is consistent (same processed set).
{
  const events = [ { id: "e1", seq: 1 }, { id: "e2", seq: 2 }, { id: "e3", seq: 3 } ];
  check(P12.replayConsistent(events, 0) === true, "replay from checkpoint 0 is consistent");
  check(P12.replayConsistent(events, 2) === true, "replay from checkpoint 2 is consistent");
}

// E2 reference run not degraded.
{
  const r = P12.runReferenceProject({});
  check(r.synthetic === true && r.profession === "P12" && r.replayConsistent === true && r.stream.ordered === true && r.degraded === false, "E2: synthetic stream ordered + replay-consistent ⇒ not degraded");
}

check(P12.P12_STREAMING_REFERENCE_CONTRACT.invariants.some((i: any) => /E5.*owner-gated NOT_RUN/.test(i)), "honesty: SYNTHETIC only, E5 owner-gated NOT_RUN");

console.log(failures === 0 ? "ALL PASS — V12.4 §43 P12 STREAMING REFERENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
