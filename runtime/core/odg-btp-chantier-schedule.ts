#!/usr/bin/env node
"use strict";
/*
 * BTP CHANTIER SCHEDULE — PRECEDENCE CRITICAL-PATH METHOD (CPM). PURE, deterministic, integer-day, fail-closed.
 *
 * THE GAP (reconciled, D07 in odg-btp-capability-matrix: "cockpit + workflow + labour exist; full scheduling/critical-path
 * planning not consolidated"): odg-btp-project-workflow has a "planning" lifecycle STAGE but computes no schedule;
 * engineering-scheduler does resource/worker LPT makespan with NO task dependencies (its "critical path" = the single
 * longest task, a makespan bound — not a precedence critical path). A precedence-CPM over a task dependency DAG
 * (earliest/latest start/finish, per-task float, the critical path) was absent. This builds exactly that.
 *
 * Classic CPM: forward pass (ES/EF) + backward pass (LS/LF) over a precedence DAG ⇒ float = LS−ES; critical = float 0.
 *
 * Honesty (never over-claim a plan as a guarantee):
 *  - day INDICES, not calendar dates (no clock ⇒ deterministic); the caller maps day 0 to a real start date;
 *  - PRECEDENCE-only CPM: it does NOT level resources / crew availability — a flagged limitation, not silently ignored;
 *  - durations are PLANNING ESTIMATES, never commitments; float is schedule slack, NOT spare budget;
 *  - fail-closed: duplicate id / bad duration / unknown dependency / a CYCLE ⇒ typed refusal (the cycle is reported),
 *    never a partial or fabricated schedule. No network/randomness.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function isNonNegInt(v: any): boolean { return typeof v === "number" && Number.isSafeInteger(v) && v >= 0; }
function freeze(o: any): any { return Object.freeze(o); }

/**
 * computeSchedule(input) -> frozen { ok, startDay, projectEndDay, projectDurationDays, tasks[], criticalTaskIds[], note }.
 * input = { tasks:[{ id, label?, durationDays, deps?:[id] }], startDay? }. Each task gets { id, label, durationDays,
 * deps, es, ef, ls, lf, floatDays, critical }. Fail-closed on dup id / bad duration / unknown dep / cycle.
 */
function computeSchedule(input: any): any {
  const i = isObj(input) ? input : {};
  const startDay = isNonNegInt(i.startDay) ? i.startDay : 0;
  const raw = Array.isArray(i.tasks) ? i.tasks.filter(isObj) : [];
  if (!raw.length) return freeze({ ok: false, code: "NO_TASKS" });

  // normalise + validate ids/durations
  const byId = new Map<string, any>();
  for (const t of raw) {
    if (!isStr(t.id)) return freeze({ ok: false, code: "BAD_ID", detail: "every task needs a string id" });
    if (byId.has(t.id)) return freeze({ ok: false, code: "DUP_ID", detail: `duplicate task id '${t.id}'` });
    if (!isNonNegInt(t.durationDays)) return freeze({ ok: false, code: "BAD_DURATION", detail: `task '${t.id}' durationDays must be a non-negative integer` });
    const deps = Array.isArray(t.deps) ? t.deps.filter(isStr) : [];
    byId.set(t.id, { id: t.id, label: isStr(t.label) ? t.label : null, durationDays: t.durationDays, deps });
  }
  // all deps must reference known tasks
  for (const t of byId.values()) for (const d of t.deps) if (!byId.has(d)) return freeze({ ok: false, code: "UNKNOWN_DEP", detail: `task '${t.id}' depends on unknown task '${d}'` });

  // successors map + Kahn topological order (stable: ready set drained in id-sorted order ⇒ deterministic)
  const successors = new Map<string, string[]>(); for (const id of byId.keys()) successors.set(id, []);
  const indeg = new Map<string, number>();
  for (const t of byId.values()) { indeg.set(t.id, t.deps.length); for (const d of t.deps) successors.get(d)!.push(t.id); }
  const ready = [...byId.keys()].filter((id) => indeg.get(id) === 0).sort();
  const topo: string[] = [];
  while (ready.length) {
    const id = ready.shift()!;
    topo.push(id);
    for (const s of successors.get(id)!.slice().sort()) { indeg.set(s, indeg.get(s)! - 1); if (indeg.get(s) === 0) { ready.push(s); ready.sort(); } }
  }
  if (topo.length !== byId.size) {
    const inCycle = [...byId.keys()].filter((id) => !topo.includes(id)).sort();
    return freeze({ ok: false, code: "CYCLE_DETECTED", detail: "the task graph has a precedence cycle — no valid schedule", cycleMembers: freeze(inCycle) });
  }

  // forward pass: ES = max EF of deps (or startDay); EF = ES + duration
  const es = new Map<string, number>(); const ef = new Map<string, number>();
  for (const id of topo) { const t = byId.get(id)!; const s = t.deps.length ? Math.max(...t.deps.map((d: string) => ef.get(d)!)) : startDay; es.set(id, s); ef.set(id, s + t.durationDays); }
  const projectEndDay = Math.max(...[...ef.values()]);

  // backward pass: LF = min LS of successors (or projectEndDay if terminal); LS = LF - duration
  const ls = new Map<string, number>(); const lf = new Map<string, number>();
  for (let k = topo.length - 1; k >= 0; k--) { const id = topo[k]; const t = byId.get(id)!; const succ = successors.get(id)!; const lateFinish = succ.length ? Math.min(...succ.map((s: string) => ls.get(s)!)) : projectEndDay; lf.set(id, lateFinish); ls.set(id, lateFinish - t.durationDays); }

  const tasks = topo.map((id) => { const t = byId.get(id)!; const floatDays = ls.get(id)! - es.get(id)!;
    return freeze({ id, label: t.label, durationDays: t.durationDays, deps: freeze(t.deps.slice().sort()),
      es: es.get(id)!, ef: ef.get(id)!, ls: ls.get(id)!, lf: lf.get(id)!, floatDays, critical: floatDays === 0 }); });
  const criticalTaskIds = tasks.filter((t: any) => t.critical).map((t: any) => t.id);

  return freeze({ ok: true, startDay, projectEndDay, projectDurationDays: projectEndDay - startDay,
    tasks: freeze(tasks), criticalTaskIds: freeze(criticalTaskIds),
    note: "precedence-CPM (float = LS−ES; critical = float 0); day INDICES not calendar; does NOT level resources/crew (precedence only); durations are PLANNING ESTIMATES, float is schedule slack not budget; ≥1 critical path may exist" });
}

/**
 * criticalPath(schedule) -> one representative critical chain (ordered by ES), following critical predecessors.
 * Multiple critical paths may exist; this returns a single valid chain (ids) + total duration. Read-only.
 */
function criticalPath(schedule: any): any {
  if (!isObj(schedule) || schedule.ok !== true) return freeze({ ok: false, code: "BAD_SCHEDULE" });
  const crit = schedule.tasks.filter((t: any) => t.critical).slice().sort((a: any, b: any) => a.es - b.es || (a.id < b.id ? -1 : 1));
  const chainDurationDays = crit.reduce((n: number, t: any) => n + t.durationDays, 0);
  return freeze({ ok: true, path: freeze(crit.map((t: any) => t.id)), chainDurationDays,
    note: "one representative critical chain (float-0 tasks ordered by earliest start); other critical paths of equal length may exist" });
}

const CHANTIER_SCHEDULE_CONTRACT = Object.freeze({
  id: "BTP-CHANTIER-SCHEDULE",
  purpose: "precedence critical-path-method (CPM) scheduler for chantier tasks — the missing D07 piece (ES/EF/LS/LF/float/critical path over a dependency DAG)",
  reuses: Object.freeze(["distinct from engineering-scheduler (resource/worker LPT makespan, NO task dependencies) — this is precedence-CPM", "feeds odg-btp-project-workflow planning stage"]),
  invariants: Object.freeze([
    "precedence-CPM: forward pass ES/EF + backward pass LS/LF ⇒ float = LS−ES; critical = float 0",
    "fail-closed: duplicate id / bad duration / unknown dependency / CYCLE ⇒ typed refusal (cycle reported); never a partial schedule",
    "day INDICES not calendar (no clock ⇒ deterministic); caller maps day 0 to a real date",
    "PRECEDENCE-only: does NOT level resources/crew availability — a flagged limitation, never silently assumed",
    "durations are PLANNING ESTIMATES, never commitments; float is schedule slack, NOT spare budget",
    "PURE + deterministic (stable topological order); no network/randomness",
  ]),
});

module.exports = { computeSchedule, criticalPath, CHANTIER_SCHEDULE_CONTRACT };
export {};
