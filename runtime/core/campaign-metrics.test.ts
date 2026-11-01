#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the §1 operating-baseline summarizer: it derives mission counts, success rate,
// retries, stop reason and (when the loop ran with a clock) per-mission duration + inter-mission gap — and REFUSES to
// fabricate the phase/test metrics the loop cannot observe (they stay null). Deterministic: the loop is driven with an
// INJECTED fake clock, and the pure summarizer is also exercised on hand-built runs.
"use strict";
const assert = require("assert");
const M = require("./campaign-metrics.js");
const L = require("./campaign-loop.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };
const reg = (items) => ({ version: "metrics-test", items });

// (1) pure summarizer on an UNTIMED run ⇒ counts correct, timing honestly unmeasured, unobservables null.
{
  const run = { stopped: "COMPLETED", iterations: 2, summary: { counts: { ACCEPTED: 2 } }, transitions: [
    { lot: "A", event: "RUNNING" }, { lot: "A", event: "COMPLETED" },
    { lot: "B", event: "RUNNING" }, { lot: "B", event: "COMPLETED" } ] };
  const m = M.summarizeRun(run);
  ok("untimed: missionsAttempted/accepted/successRate correct", m.missionsAttempted === 2 && m.acceptedWithEvidence === 2 && m.successRate === 1);
  ok("untimed: timingMeasured false, durations null (not fabricated)", m.timing.timingMeasured === false && m.timing.totalDurationMs === null && m.timing.meanMissionMs === null);
  ok("unobservable phase/test metrics are null, never invented", m.unobservable.diagnosticMs === null && m.unobservable.testSuccessRate === null && m.unobservable.regressionsDetected === null && typeof m.unobservable.reason === "string");
}

// (2) pure summarizer on a TIMED run ⇒ per-mission durations + inter-mission gaps computed from stamps.
{
  const run = { stopped: "COMPLETED", iterations: 2, startedAt: 100, endedAt: 500, transitions: [
    { lot: "A", event: "RUNNING", t: 100 }, { lot: "A", event: "COMPLETED", t: 180 },   // mission A = 80ms
    { lot: "B", event: "RUNNING", t: 300 }, { lot: "B", event: "COMPLETED", t: 320 } ] }; // gap A→B = 120ms, mission B = 20ms
  const m = M.summarizeRun(run);
  ok("timed: perMissionMs = [80,20]", m.timing.timingMeasured === true && JSON.stringify(m.timing.perMissionMs) === JSON.stringify([80, 20]));
  ok("timed: inter-mission gap = [120], mean mission = 50, total = 400", JSON.stringify(m.timing.interMissionGapsMs) === JSON.stringify([120]) && m.timing.meanMissionMs === 50 && m.timing.totalDurationMs === 400);
}

// (3) INTEGRATION: run the REAL loop with an injected fake clock ⇒ result.metrics is populated + measured.
{
  let clock = 1000; const now = () => { clock += 50; return clock; };   // +50ms each read (deterministic)
  const calls = []; const items = Array.from({ length: 3 }, (_, i) => ({ id: `m${i}`, status: "READY", deps: i ? [`m${i - 1}`] : [], priority: i }));
  const r = L.runCampaignLoop({ register: reg(items), execute: (lot) => { calls.push(lot.id); return { status: "ACCEPTED", evidence: `did ${lot.id}` }; }, now });
  ok("loop returns a populated metrics block", r.metrics && r.metrics.model === "campaign-metrics/1" && typeof r.startedAt === "number" && typeof r.endedAt === "number");
  ok("metrics: 3 missions attempted, all accepted-with-evidence, successRate 1", r.metrics.missionsAttempted === 3 && r.metrics.acceptedWithEvidence === 3 && r.metrics.successRate === 1);
  ok("metrics: timing MEASURED (clock injected) with 3 per-mission durations + a positive total", r.metrics.timing.timingMeasured === true && r.metrics.timing.perMissionMs.length === 3 && r.metrics.timing.totalDurationMs > 0);
  ok("metrics: stopReason COMPLETED, 0 failed/retries", r.metrics.stopReason === "COMPLETED" && r.metrics.failed === 0 && r.metrics.retries === 0);
}

// (4) a FAILED mission is counted and drags successRate below 1 (honest).
{
  let clock = 0; const now = () => { clock += 10; return clock; };
  const r = L.runCampaignLoop({ register: reg([{ id: "F", status: "READY", deps: [], priority: 1 }]), execute: () => ({ status: "FAILED", reason: "boom" }), maxIterations: 20, now });
  ok("failed mission counted; successRate < 1; stop IDLE_BLOCKED", r.metrics.failed >= 1 && r.metrics.acceptedWithEvidence === 0 && r.metrics.successRate === 0 && r.metrics.stopReason === "IDLE_BLOCKED");
}

// (5) nothing attempted ⇒ successRate null (not a fabricated 0 or 1).
{
  const r = L.runCampaignLoop({ register: reg([{ id: "X", status: "BLOCKED", deps: [], blockReason: "owner" }]), execute: () => ({ status: "ACCEPTED", evidence: "e" }) });
  ok("no mission attempted ⇒ successRate null; blockedCauses lists X", r.metrics.missionsAttempted === 0 && r.metrics.successRate === null && r.metrics.blockedCauses.includes("X"));
}

// (6) fail-soft: a malformed/empty run never throws.
{
  const m = M.summarizeRun({});
  ok("empty run ⇒ zeros/nulls, no throw", m.missionsAttempted === 0 && m.successRate === null && m.timing.timingMeasured === false && m.stopReason === null);
}

// (WAITING_FOR buckets) — the refined campaign-loop waits must be bucketed, kept distinct, close timing, and
// reconcile with attempts; an unknown event must be surfaced, not counted as progress.
{
  const run = { stopped: "WAITING_EXTERNAL", iterations: 6, startedAt: 0, endedAt: 1000, transitions: [
    { lot: "A", event: "RUNNING", t: 0 },   { lot: "A", event: "COMPLETED", t: 10 },
    { lot: "B", event: "RUNNING", t: 20 },  { lot: "B", event: "WAITING_FOR_CI", t: 30 },
    { lot: "C", event: "RUNNING", t: 40 },  { lot: "C", event: "WAITING_FOR_PROVIDER", t: 50 },
    { lot: "D", event: "RUNNING", t: 60 },  { lot: "D", event: "WAITING_FOR_DEPENDENCY", t: 70 },
    { lot: "E", event: "RUNNING", t: 80 },  { lot: "E", event: "WAITING_FOR_EXTERNAL_AUTHORIZATION", t: 90 },
    { lot: "F", event: "RUNNING", t: 100 }, { lot: "F", event: "WAITING_EXTERNAL", t: 110 },
    { lot: "G", event: "RUNNING", t: 120 }, { lot: "G", event: "FAILED", t: 130 } ] };
  const m = M.summarizeRun(run);
  ok("waiting: ALL 5 WAITING_* terminals bucketed into waitingExternal (was 1, generic-only)", m.waitingExternal === 5);
  ok("waiting: per-kind breakdown precise + distinct", m.waitingByKind.CI === 1 && m.waitingByKind.PROVIDER === 1 && m.waitingByKind.DEPENDENCY === 1 && m.waitingByKind.EXTERNAL_AUTHORIZATION === 1 && m.waitingByKind.EXTERNAL === 1);
  ok("waiting: not counted as progress (accepted=1, successRate=1/7)", m.acceptedWithEvidence === 1 && m.failed === 1 && m.successRate === Number((1 / 7).toFixed(3)));
  ok("reconcile: attempts == accepted + failed + waitingExternal + retries + unknown", m.missionsAttempted === (m.acceptedWithEvidence + m.failed + m.waitingExternal + m.retries + m.unknownEvents));
  ok("waiting: timing CLOSES on each WAITING_* (7 per-mission durations, none dropped)", m.timing.timingMeasured === true && m.timing.perMissionMs.length === 7);
  ok("isTerminalEvent true for every refined wait", M.isTerminalEvent("WAITING_FOR_CI") && M.isTerminalEvent("WAITING_FOR_PROVIDER") && M.isTerminalEvent("WAITING_FOR_DEPENDENCY") && M.isTerminalEvent("WAITING_FOR_EXTERNAL_AUTHORIZATION") && M.isTerminalEvent("WAITING_EXTERNAL"));
}
// (unknown event) — an unrecognized event is surfaced via unknownEvents, never silently dropped or counted accepted.
{
  const run = { transitions: [ { lot: "X", event: "RUNNING" }, { lot: "X", event: "MYSTERY_STATE" } ] };
  const m = M.summarizeRun(run);
  ok("unknown event ⇒ unknownEvents=1, not accepted/failed/waiting", m.unknownEvents === 1 && m.acceptedWithEvidence === 0 && m.failed === 0 && m.waitingExternal === 0);
  ok("unknown event is NOT terminal (timing cannot claim a close it didn't observe)", M.isTerminalEvent("MYSTERY_STATE") === false);
}

console.log(`\nCAMPAIGN-METRICS suite — ${pass} assertions passed. (counts + success rate + retries + WAITING_FOR per-kind buckets + unknown-event surfacing + injected-clock timing; phase/test metrics honestly null; fail-soft)`);
