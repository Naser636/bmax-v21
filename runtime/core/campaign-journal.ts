#!/usr/bin/env node
/**
 * campaign-journal — durable, append-only telemetry for campaign runs, so the engine is OBSERVABLE across runs and a
 * real before/after comparison becomes possible (the gap the ENGINE-EXCELLENCE measurement exposed: campaign-metrics
 * computes per-run metrics but nothing persisted them, so throughput/regressions over time could not be measured).
 *
 * Composition only — reuses campaign-metrics.summarizeRun; NO new primitive (this is EVIDENCE/STATE-style persistence,
 * a pure core + a thin injected-fs appender). Honesty contract:
 *   - the journal records ONLY what a run actually observed; timing stays null when the run was unclocked.
 *   - compareRuns yields a delta ONLY when BOTH sides have a comparable (non-null) number — otherwise "unmeasured",
 *     never a fabricated 0/100 (the mandate: before/after only when both measurement sets exist and are comparable).
 *   - malformed journal lines are skipped and counted, never silently treated as valid runs.
 * `at` (timestamp) is INJECTED by the caller — the core takes no clock (determinism; also Date.now is unavailable in
 * some sandboxes). The thin appendRun wrapper is the only I/O.
 */
"use strict";

const fs = require("fs");
const M = require("./campaign-metrics.js");

const MODEL = "campaign-journal/1";

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function num(v: any): number | null { return typeof v === "number" && Number.isFinite(v) ? v : null; }

/**
 * toJournalEntry(runResult, opts?): PURE — build a COMPACT journal entry from a campaign-loop/odg-campaign-run result.
 * opts = { at?: string, head?: string }. Uses runResult.metrics if present, else computes via summarizeRun.
 */
function toJournalEntry(runResult: any, opts: any = {}): any {
  const r = isObj(runResult) ? runResult : {};
  const m = isObj(r.metrics) ? r.metrics : M.summarizeRun(r);
  const timing = isObj(m.timing) ? m.timing : {};
  return {
    model: MODEL,
    at: typeof opts.at === "string" ? opts.at : null,          // injected timestamp (null if the caller gave none)
    head: typeof opts.head === "string" ? opts.head : null,
    stopReason: m.stopReason != null ? m.stopReason : (r.stopped != null ? r.stopped : null),
    iterations: num(m.iterations) != null ? m.iterations : num(r.iterations),
    missionsAttempted: num(m.missionsAttempted) || 0,
    acceptedWithEvidence: num(m.acceptedWithEvidence) || 0,
    failed: num(m.failed) || 0,
    retries: num(m.retries) || 0,
    waitingExternal: num(m.waitingExternal) || 0,
    successRate: num(m.successRate),                            // null when nothing attempted (honest)
    meanMissionMs: timing.timingMeasured ? num(timing.meanMissionMs) : null,
    totalDurationMs: timing.timingMeasured ? num(timing.totalDurationMs) : null,
    blockedCount: Array.isArray(m.blockedCauses) ? m.blockedCauses.length : null,
  };
}

/** appendRun(journalPath, runResult, opts?): thin fs appender — append one JSONL entry. Returns the entry. */
function appendRun(journalPath: string, runResult: any, opts: any = {}): any {
  if (typeof journalPath !== "string" || !journalPath) throw new TypeError("campaign-journal.appendRun: journalPath required");
  const entry = toJournalEntry(runResult, opts);
  const sink = opts.fs || fs;
  sink.appendFileSync(journalPath, JSON.stringify(entry) + "\n");
  return entry;
}

/** readJournal(journalPath, opts?): parse JSONL ⇒ { entries[], malformed }. Missing file ⇒ empty (not an error). */
function readJournal(journalPath: string, opts: any = {}): any {
  const sink = opts.fs || fs;
  let text = "";
  try { text = sink.readFileSync(journalPath, "utf8"); } catch { return { entries: [], malformed: 0 }; }
  const entries: any[] = []; let malformed = 0;
  for (const line of String(text).split("\n")) { const l = line.trim(); if (!l) continue; try { const o = JSON.parse(l); if (isObj(o)) entries.push(o); else malformed++; } catch { malformed++; } }
  return { entries, malformed };
}

/** summarizeJournal(entries): aggregate across runs — honest nulls where a dimension was never measured. */
function summarizeJournal(entries: any[]): any {
  const es = Array.isArray(entries) ? entries.filter(isObj) : [];
  const runs = es.length;
  const byStopReason: Record<string, number> = {};
  let attempted = 0, accepted = 0, failed = 0, retries = 0;
  const missionMs: number[] = [];
  for (const e of es) {
    const sr = typeof e.stopReason === "string" ? e.stopReason : "UNKNOWN";
    byStopReason[sr] = (byStopReason[sr] || 0) + 1;
    attempted += num(e.missionsAttempted) || 0;
    accepted += num(e.acceptedWithEvidence) || 0;
    failed += num(e.failed) || 0;
    retries += num(e.retries) || 0;
    if (num(e.meanMissionMs) != null) missionMs.push(e.meanMissionMs);
  }
  const completedRuns = byStopReason["COMPLETED"] || 0;
  // interruptions = runs that stopped for a non-terminal reason (hit the iteration cap or an explicit stop request).
  const interruptions = (byStopReason["MAX_ITERATIONS"] || 0) + (byStopReason["STOP_REQUESTED"] || 0);
  const ats = es.map((e) => e.at).filter((a) => typeof a === "string");
  return {
    model: MODEL,
    runs,
    totalMissionsAttempted: attempted,
    totalAcceptedWithEvidence: accepted,
    totalFailed: failed,
    totalRetries: retries,
    aggregateSuccessRate: attempted > 0 ? Number((accepted / attempted).toFixed(3)) : null,   // null if nothing attempted
    completedRuns,
    interruptions,
    byStopReason,
    meanMissionMsAcrossRuns: missionMs.length ? Math.round(missionMs.reduce((a, b) => a + b, 0) / missionMs.length) : null,
    firstAt: ats.length ? ats[0] : null,
    lastAt: ats.length ? ats[ats.length - 1] : null,
  };
}

/**
 * compareRuns(before, after): before/after delta on comparable numeric fields. A field is compared ONLY when BOTH
 * sides are non-null numbers; otherwise it is "unmeasured" (never a fabricated delta). Returns { metrics, summary }.
 */
function compareRuns(before: any, after: any): any {
  const a = isObj(before) ? before : {}, b = isObj(after) ? after : {};
  const fields = ["successRate", "meanMissionMs", "missionsAttempted", "acceptedWithEvidence", "failed", "aggregateSuccessRate", "meanMissionMsAcrossRuns"];
  const metrics: Record<string, any> = {};
  let improved = 0, regressed = 0, flat = 0, unmeasured = 0;
  // for rate/accepted higher is better; for meanMissionMs/failed lower is better.
  const lowerIsBetter = new Set(["meanMissionMs", "failed", "meanMissionMsAcrossRuns"]);
  for (const f of fields) {
    const x = num(a[f]), y = num(b[f]);
    if (x == null || y == null) { if (a[f] !== undefined || b[f] !== undefined) { metrics[f] = { before: x, after: y, direction: "unmeasured" }; unmeasured++; } continue; }
    const delta = y - x;
    let direction: string;
    if (delta === 0) { direction = "flat"; flat++; }
    else { const better = lowerIsBetter.has(f) ? delta < 0 : delta > 0; direction = better ? "improved" : "regressed"; better ? improved++ : regressed++; }
    metrics[f] = { before: x, after: y, delta: Number(delta.toFixed(3)), direction };
  }
  return { metrics, summary: { compared: improved + regressed + flat, improved, regressed, flat, unmeasured } };
}

export { MODEL, toJournalEntry, appendRun, readJournal, summarizeJournal, compareRuns };
module.exports = { MODEL, toJournalEntry, appendRun, readJournal, summarizeJournal, compareRuns };

if (require.main === module) {
  const p = process.argv[2];
  if (p) { const j = readJournal(p); process.stdout.write(JSON.stringify(summarizeJournal(j.entries), null, 2) + "\n"); }
  else process.stdout.write(JSON.stringify({ model: MODEL, usage: "campaign-journal <journal.jsonl> ⇒ aggregate summary" }, null, 2) + "\n");
}
