#!/usr/bin/env node
/**
 * campaign-metrics — a PURE summarizer that turns a campaign-loop run (transitions + optional timestamps + register
 * summary) into the §1 operating baseline the method mandate asks for: missions attempted, accepted-with-evidence,
 * failed, retries, waiting-external, stop reason + blocked causes, and — WHEN the loop was run with a clock — per-
 * mission duration and inter-mission gap.
 *
 * Honesty contract (the mandate: "Ne pas inventer de chiffres. Instrumenter les métriques manquantes."):
 *  - Everything here is derived ONLY from what the loop actually observes. Nothing is fabricated.
 *  - Timing is reported ONLY if the transitions carry a `t` stamp; otherwise it is `null` with timingMeasured:false.
 *  - Metrics the loop CANNOT see (per-phase diagnostic/impl/test/review time, test-success-rate, regressions) are
 *    returned under `unobservable` as explicit `null` with the reason they are not visible at this layer — they must
 *    be instrumented at the mission/gate layer, never guessed here.
 *
 * Pure: summarizeRun is a deterministic function of its input (no clock, no I/O). The loop injects the clock.
 */
"use strict";

const MODEL = "campaign-metrics/1";

// Event vocabulary emitted by campaign-loop transitions.
const EV_RUNNING = "RUNNING";
const EV_COMPLETED = "COMPLETED";        // ACCEPTED + evidence accepted by advance() (fail-closed) ⇒ accepted-with-evidence
const EV_FAILED = "FAILED";
const EV_WAITING = "WAITING_EXTERNAL";   // generic/back-compat alias
const EV_RETRY = "RETRY_WAIT";

// campaign-loop emits REFINED waits (WAITING_FOR_CI/PROVIDER/DEPENDENCY/EXTERNAL_AUTHORIZATION) alongside the generic
// WAITING_EXTERNAL. ALL of them are a "waiting-external" terminal with the SAME BLOCKED effect; the suffix is the
// precise diagnosis. A `WAITING`-prefixed event is thus a waiting terminal; its kind is the suffix (EXTERNAL for the
// generic alias). Previously only WAITING_EXTERNAL was recognized ⇒ the refined waits fell through every bucket AND
// were not terminal (timing left the mission open). Fixed here so counts reconcile and timing closes on any wait.
function isWaitingEvent(ev: string): boolean { return typeof ev === "string" && ev.indexOf("WAITING") === 0; }
function waitKindOf(ev: string): string {
  if (ev === EV_WAITING) return "EXTERNAL";
  const m = /^WAITING_FOR_(.+)$/.exec(ev);
  return m ? m[1] : "OTHER"; // CI | PROVIDER | DEPENDENCY | EXTERNAL_AUTHORIZATION | OTHER
}

// A terminal (non-RUNNING) event closes a mission attempt: COMPLETED, FAILED, any WAITING_*, or RETRY_WAIT.
function isTerminalEvent(ev: string): boolean { return ev === EV_COMPLETED || ev === EV_FAILED || isWaitingEvent(ev) || ev === EV_RETRY; }

function mean(xs: number[]): number | null { return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null; }
function maxOf(xs: number[]): number | null { return xs.length ? Math.max(...xs) : null; }

/**
 * summarizeRun(run) — run = { stopped, iterations, transitions[], summary?, startedAt?, endedAt?, blocked? }.
 * transitions = [{ lot, event, reason?, attempts?, strategy?, t? }] in chronological order.
 * Returns a structured, honest metrics object. Never throws on a malformed run (fail-soft to zeros/nulls).
 */
function summarizeRun(run: any = {}): any {
  const transitions: any[] = Array.isArray(run.transitions) ? run.transitions : [];
  const counts = { running: 0, accepted: 0, failed: 0, waitingExternal: 0, retries: 0, unknown: 0 };
  // Precise per-kind waiting breakdown (each wait state keeps a distinct meaning; blocked/deferred live in the
  // register snapshot, NOT here — waiting ≠ blocked ≠ deferred ≠ failed). `unknown` surfaces any UNRECOGNIZED
  // event rather than silently dropping it (so metrics cannot hide an un-bucketed transition).
  const waitingByKind: Record<string, number> = {};
  for (const tr of transitions) {
    if (!tr || typeof tr.event !== "string") continue;
    if (tr.event === EV_RUNNING) counts.running++;
    else if (tr.event === EV_COMPLETED) counts.accepted++;
    else if (tr.event === EV_FAILED) counts.failed++;
    else if (isWaitingEvent(tr.event)) { counts.waitingExternal++; const k = waitKindOf(tr.event); waitingByKind[k] = (waitingByKind[k] || 0) + 1; }
    else if (tr.event === EV_RETRY) counts.retries++;
    else counts.unknown++; // unrecognized terminal/event — counted, never silently misclassified as progress
  }
  const missionsAttempted = counts.running;
  // accepted-with-evidence == COMPLETED: the loop only emits COMPLETED after advance() accepts the evidence (fail-closed).
  const acceptedWithEvidence = counts.accepted;
  const successRate = missionsAttempted > 0 ? Number((acceptedWithEvidence / missionsAttempted).toFixed(3)) : null;

  // ---- Timing: ONLY if every mission-closing transition carries a numeric `t` stamp. Otherwise honestly null. ----
  const timed = transitions.length > 0 && transitions.every((tr) => typeof tr.t === "number" && Number.isFinite(tr.t));
  let timing: any;
  if (!timed) {
    timing = { timingMeasured: false, reason: "transitions carry no timestamp (loop run without an injected clock)", totalDurationMs: null, perMissionMs: [], meanMissionMs: null, maxMissionMs: null, interMissionGapsMs: [], meanInterMissionGapMs: null };
  } else {
    const perMissionMs: number[] = [];
    const gaps: number[] = [];
    let openRunAt: number | null = null;        // t of the current mission's RUNNING
    let lastTerminalAt: number | null = null;    // t of the previous mission's terminal event
    for (const tr of transitions) {
      if (tr.event === EV_RUNNING) {
        if (lastTerminalAt !== null) gaps.push(Math.max(0, tr.t - lastTerminalAt));   // gap since previous mission closed
        openRunAt = tr.t;
      } else if (isTerminalEvent(tr.event) && openRunAt !== null) {
        perMissionMs.push(Math.max(0, tr.t - openRunAt));
        lastTerminalAt = tr.t; openRunAt = null;
      }
    }
    const totalDurationMs = typeof run.startedAt === "number" && typeof run.endedAt === "number" ? Math.max(0, run.endedAt - run.startedAt) : null;
    timing = {
      timingMeasured: true,
      totalDurationMs,
      perMissionMs,
      meanMissionMs: mean(perMissionMs),
      maxMissionMs: maxOf(perMissionMs),
      interMissionGapsMs: gaps,
      meanInterMissionGapMs: mean(gaps),
    };
  }

  // ---- Register-level context (if the loop passed its summary). ----
  const regCounts = run.summary && run.summary.counts ? run.summary.counts : null;
  const blockedCauses = Array.isArray(run.blocked) ? run.blocked.slice() : [];

  return {
    model: MODEL,
    stopReason: typeof run.stopped === "string" ? run.stopped : null,
    iterations: Number.isFinite(run.iterations) ? run.iterations : missionsAttempted,
    missionsAttempted,
    acceptedWithEvidence,
    failed: counts.failed,
    retries: counts.retries,
    waitingExternal: counts.waitingExternal,   // TOTAL of all WAITING_* terminals (generic + refined)
    waitingByKind,                             // precise breakdown: { CI, PROVIDER, DEPENDENCY, EXTERNAL_AUTHORIZATION, EXTERNAL, OTHER }
    unknownEvents: counts.unknown,             // unrecognized events — surfaced, never counted as progress
    successRate,                       // accepted-with-evidence / attempted (null if nothing attempted)
    registerCounts: regCounts,         // ACCEPTED/BLOCKED/… snapshot at stop (if provided)
    blockedCauses,                     // lot ids blocked at stop (IDLE/WAITING causes)
    timing,
    // Honest: these are NOT observable from the campaign loop. Do NOT fabricate them here.
    unobservable: {
      reason: "not visible at the campaign-loop layer — instrument at the mission/gate layer (per-phase timings, test-suite outcomes)",
      diagnosticMs: null, implementationMs: null, testMs: null, reviewMs: null,
      testSuccessRate: null, regressionsDetected: null,
    },
  };
}

export { MODEL, summarizeRun, isTerminalEvent };
module.exports = { MODEL, summarizeRun, isTerminalEvent };

if (require.main === module) {
  // Demo over the real register via a dry-run loop (no autonomous executor) — shows the honest metrics shape.
  const LOOP = require("./campaign-loop.js");
  const path = process.argv[2] || "docs/odg/closure-register.json";
  const r = LOOP.runCampaignLoop({ registerPath: path, execute: () => ({ status: "WAITING_EXTERNAL", reason: "dry-run: no executor" }), maxIterations: 50 });
  process.stdout.write(JSON.stringify(summarizeRun(r), null, 2) + "\n");
}
