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

// V254 §2 — event-time tumbling windows + watermark late-event detection.
{
  // windowMs 10, watermark 0: events at 3,12,25 ⇒ windows [0,10),[10,20),[20,30).
  const w = P12.windowByEventTime([{ id: "a", eventTime: 3 }, { id: "b", eventTime: 12 }, { id: "c", eventTime: 25 }], { windowMs: 10, watermark: 0 });
  check(w.ok === true && w.windows.length === 3 && w.windows[0].start === 0 && w.windows[0].end === 10 && w.windows[1].start === 10 && w.windows[2].start === 20 && w.onTime === 3 && w.lateCount === 0, "event-time: 3 events ⇒ 3 tumbling windows [0,10)/[10,20)/[20,30), all on-time");
  check(w.windows[0].ids[0] === "a" && w.windows[2].ids[0] === "c", "event-time: events assigned to the correct window by event-time");
  // LATE (crux): watermark 15 ⇒ event at 3 and 12 are behind it ⇒ LATE, not folded into a window.
  const late = P12.windowByEventTime([{ id: "old", eventTime: 3 }, { id: "ok", eventTime: 25 }], { windowMs: 10, watermark: 15 });
  check(late.lateCount === 1 && late.late[0].id === "old" && late.onTime === 1 && late.windows.every((win: any) => win.ids.indexOf("old") < 0), "event-time LATE: eventTime(3) < watermark(15) ⇒ LATE, surfaced, NOT in any window");
  // BOUNDARY: eventTime exactly == watermark is NOT late (>= watermark is on-time); exactly at a window start lands in that window.
  const boundary = P12.windowByEventTime([{ id: "wm", eventTime: 15 }, { id: "ws", eventTime: 20 }], { windowMs: 10, watermark: 15 });
  check(boundary.lateCount === 0 && boundary.onTime === 2 && boundary.windows.some((win: any) => win.start === 20 && win.ids.indexOf("ws") >= 0), "event-time boundary: eventTime==watermark is on-time; eventTime==window.start lands in that window");
  // REJECTED fail-closed: missing/invalid eventTime ⇒ rejected, not silently windowed.
  const rej = P12.windowByEventTime([{ id: "x" }, { id: "y", eventTime: "nope" }, null, { id: "z", eventTime: 5 }], { windowMs: 10, watermark: 0 });
  check(rej.rejectedCount === 3 && rej.onTime === 1, "event-time fail-closed: missing/non-number/null eventTime ⇒ rejected (3), only the valid event windowed");
  check(P12.windowByEventTime([], { windowMs: 0 }).code === "INVALID_WINDOW" && P12.windowByEventTime([], { windowMs: -5 }).code === "INVALID_WINDOW", "event-time fail-closed: windowMs<=0 ⇒ INVALID_WINDOW (no throw)");
  check(JSON.stringify(P12.windowByEventTime([{ id: "a", eventTime: 3 }, { id: "b", eventTime: 12 }, { id: "c", eventTime: 25 }], { windowMs: 10, watermark: 0 })) === JSON.stringify(w) && Object.isFrozen(w), "event-time deterministic + frozen");
  const integ = P12.runReferenceProject({ eventTimeWindows: true, events: [{ id: "old", eventTime: 1 }, { id: "ok", eventTime: 25 }], windowMs: 10, watermark: 10 });
  check(integ.eventTimeWindows && integ.eventTimeWindows.lateCount === 1 && integ.degraded === true, "integration: a late event ⇒ degraded");
}

console.log(failures === 0 ? "ALL PASS — V12.4 §43 P12 STREAMING REFERENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
