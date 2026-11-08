#!/usr/bin/env node
"use strict";

/*
 * V5-E / ENGINEERING INTELLIGENCE — RESOURCE-AWARE SCHEDULER + CRITICAL PATH (E05 Global Scheduler / E06 Critical
 * Path / E07 Resource-Aware Execution). PURE, deterministic. Given measured suite/task durations and a worker count,
 * it schedules tasks to minimize the makespan (Longest-Processing-Time greedy — assign each task, longest first, to
 * the least-loaded worker), identifies the critical path (the single longest task = the makespan lower bound), and
 * reports the achievable vs naive makespan. REUSES gate-instrumentation durations; worker count never exceeds cores.
 * Fail-closed: a task with no/invalid duration ⇒ flagged UNKNOWN and scheduled conservatively (not dropped); empty ⇒
 * not schedulable. It plans; it runs nothing and changes no runner. Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function num(v: any, d = 0): number { return typeof v === "number" && isFinite(v) && v >= 0 ? v : d; }
function round(n: number): number { return Number(n.toFixed(2)); }

/**
 * schedule({ tasks, workers, cores }) -> { schedulable, makespan, naiveMakespan, lowerBound, criticalPath, workers, assignments, unknown }.
 * LPT: sort tasks by duration desc, assign each to the least-loaded worker. Minimizes makespan for variable durations.
 */
function schedule(input: any): any {
  const o = isObj(input) ? input : {};
  const cores = Math.max(1, Math.floor(num(o.cores, 1)));
  const workers = Math.max(1, Math.min(Math.floor(num(o.workers, 1)), cores));   // never over-subscribe
  const raw = arr(o.tasks).filter(isObj);
  if (raw.length === 0) return Object.freeze({ schedulable: false, reason: "no tasks", makespan: null, criticalPath: null });

  // normalize; a task with an invalid duration is UNKNOWN and gets a conservative (max observed) duration, never dropped.
  const durations = raw.map((t) => num(t.durationMs, NaN)).filter((d) => isFinite(d));
  const maxObserved = durations.length > 0 ? Math.max(...durations) : 1;
  const unknown: string[] = [];
  const tasks = raw.map((t, i) => {
    const d = num(t.durationMs, NaN);
    const valid = isFinite(d) && d >= 0;
    if (!valid) unknown.push(typeof t.id === "string" ? t.id : `task-${i}`);
    return { id: typeof t.id === "string" ? t.id : `task-${i}`, durationMs: valid ? d : maxObserved };
  }).sort((a, b) => b.durationMs - a.durationMs);

  // LPT greedy assignment.
  const load = new Array(workers).fill(0); const assignments: any[] = Array.from({ length: workers }, () => []);
  for (const t of tasks) { let w = 0; for (let i = 1; i < workers; i++) if (load[i] < load[w]) w = i; load[w] += t.durationMs; assignments[w].push(t.id); }
  const makespan = round(Math.max(...load));

  const total = tasks.reduce((s, t) => s + t.durationMs, 0);
  const longest = tasks[0];                                  // the critical path (single longest task)
  const lowerBound = round(Math.max(longest.durationMs, total / workers));   // makespan can't beat this
  const naiveMakespan = round(total / workers);              // idealized even split (ignores indivisibility)

  return Object.freeze({
    schedulable: true, workers,
    makespan, lowerBound, naiveMakespan,
    criticalPath: Object.freeze({ id: longest.id, durationMs: longest.durationMs }),
    assignments: Object.freeze(assignments.map((a) => Object.freeze(a))),
    perWorkerLoad: Object.freeze(load.map(round)),
    unknown: Object.freeze(unknown),
    note: unknown.length > 0 ? `${unknown.length} task(s) had no valid duration ⇒ UNKNOWN, scheduled conservatively (max observed), not dropped` : "all tasks have measured durations",
  });
}

/** criticalPathBound(tasks, workers) -> the makespan lower bound = max(longest task, total/workers). */
function criticalPathBound(tasks: any, workers: any): number | null {
  const ts = arr(tasks).filter(isObj).map((t) => num(t.durationMs, 0));
  if (ts.length === 0) return null;
  const w = Math.max(1, Math.floor(num(workers, 1)));
  return round(Math.max(Math.max(...ts), ts.reduce((s, d) => s + d, 0) / w));
}

const ENGINEERING_SCHEDULER_CONTRACT = Object.freeze({
  id: "V5-E-ENGINEERING-SCHEDULER",
  source: "ODG Engineering Intelligence — E05 Global Scheduler / E06 Critical Path / E07 Resource-Aware Execution",
  reuses: Object.freeze(["gate-instrumentation durations", "informs odg-test-report worker scheduling"]),
  notAuthority: "a scheduling/critical-path plan; it runs nothing and changes no runner",
  invariants: Object.freeze([
    "LPT: tasks sorted longest-first assigned to the least-loaded worker ⇒ minimized makespan for variable durations",
    "the critical path is the single longest task = the makespan lower bound (max(longest, total/workers))",
    "worker count never exceeds cores (no over-subscription)",
    "fail-closed: a task with no valid duration is UNKNOWN and scheduled conservatively (max observed), never dropped; empty ⇒ not schedulable",
    "pure/deterministic: durations + workers in → schedule out; no clock/random/network; plans only",
  ]),
});

module.exports = { schedule, criticalPathBound, ENGINEERING_SCHEDULER_CONTRACT };

if (require.main === module) {
  const s = schedule({ tasks: [{ id: "a", durationMs: 100 }, { id: "b", durationMs: 50 }, { id: "c", durationMs: 50 }, { id: "d", durationMs: 30 }], workers: 2, cores: 8 });
  process.stdout.write(JSON.stringify({ ...ENGINEERING_SCHEDULER_CONTRACT, demo: { makespan: s.makespan, criticalPath: s.criticalPath, lowerBound: s.lowerBound } }, null, 2) + "\n");
}

export {};
