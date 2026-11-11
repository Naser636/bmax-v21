#!/usr/bin/env node
"use strict";

/*
 * parallel-execution-planner (mission O1) — PURE, deterministic, FAIL-CLOSED planner that turns a dependency graph of
 * ready missions into CONTROLLED PARALLEL WAVES. It closes the V104/F4 gap (parallel-execution ABSENT — campaign-engine
 * is a sequential re-select loop). It does NOT execute anything and does NOT duplicate dep-planner (single ordering) or
 * p12-weighted-fair-share-scheduler (admission weighting): it composes those concepts into concurrency- and resource-
 * bounded execution waves, with a hard barrier between waves (a wave's missions may start only once every dependency
 * completed in an earlier wave). No I/O, no clock, no network.
 *
 * plan(missions, opts) → frozen { waves: string[][], scheduled, unscheduled:[{id,reason}], stats }.
 *   missions: [{ id, deps?: string[], weight?: number }]   (weight = resource cost, default 1)
 *   opts: { maxConcurrency (>=1), resourceBudget?, completed?: string[] }
 * Rules (deterministic — id-sorted everywhere):
 *   - a mission is READY when all its deps are in `completed` or an earlier wave;
 *   - a wave holds at most maxConcurrency missions AND sum(weight) <= resourceBudget (if set);
 *   - each mission appears in exactly ONE wave (no duplicate execution);
 *   - UNSCHEDULABLE (reported, never silently dropped): cycle (CYCLE), unknown/dangling dep (UNKNOWN_DEP),
 *     a single weight > resourceBudget (WEIGHT_EXCEEDS_BUDGET), duplicate id (DUPLICATE_ID). Invalid opts ⇒ empty plan.
 */

function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function isPosInt(v: any): boolean { return typeof v === "number" && Number.isInteger(v) && v >= 1; }
function isPosNum(v: any): boolean { return typeof v === "number" && Number.isFinite(v) && v > 0; }
function weightOf(m: any): number { return isPosNum(m.weight) ? m.weight : 1; }

function plan(missions: any, opts: any): any {
  const o = opts && typeof opts === "object" ? opts : {};
  const maxConc = o.maxConcurrency;
  const resourceBudget = isPosNum(o.resourceBudget) ? o.resourceBudget : undefined;
  const list: any[] = Array.isArray(missions) ? missions : [];
  const empty = (reason: string) => Object.freeze({ waves: Object.freeze([]), scheduled: Object.freeze([]), unscheduled: Object.freeze(list.map((m: any) => ({ id: isStr(m && m.id) ? m.id : "<invalid>", reason })).sort((a: any, b: any) => a.id.localeCompare(b.id))), stats: Object.freeze({ maxConcurrency: maxConc, resourceBudget, waveCount: 0, fatal: reason }) });
  if (!isPosInt(maxConc)) return empty("INVALID_MAX_CONCURRENCY");
  if (!Array.isArray(missions)) return empty("INVALID_MISSIONS");

  // index + validate ids (dedupe-detect)
  const byId: Record<string, any> = {};
  const unsched: Array<{ id: string; reason: string }> = [];
  const dupes = new Set<string>();
  for (const m of list) {
    if (!m || !isStr(m.id)) { unsched.push({ id: "<invalid>", reason: "INVALID_ID" }); continue; }
    if (byId[m.id]) { dupes.add(m.id); continue; }
    byId[m.id] = m;
  }
  dupes.forEach((id) => unsched.push({ id, reason: "DUPLICATE_ID" }));

  const allIds = Object.keys(byId).sort();
  const completed = new Set<string>(Array.isArray(o.completed) ? o.completed.filter(isStr) : []);
  const depsOf = (id: string): string[] => { const d = byId[id].deps; return Array.isArray(d) ? d.filter(isStr) : []; };

  // UNKNOWN_DEP (transitive): a dep that is neither a known mission nor already completed can never be satisfied, and
  // that impossibility propagates to everything that (transitively) depends on it. Computed as a fixpoint so a mission
  // blocked only via a chain of unknown deps is labeled UNKNOWN_DEP, not mislabeled CYCLE.
  const unknownBlocked = new Set<string>();
  for (const id of allIds) for (const d of depsOf(id)) if (!byId[d] && !completed.has(d)) unknownBlocked.add(id);
  for (let changed = true; changed;) {
    changed = false;
    for (const id of allIds) { if (!unknownBlocked.has(id) && depsOf(id).some((d) => unknownBlocked.has(d))) { unknownBlocked.add(id); changed = true; } }
  }

  const done = new Set<string>(completed);           // satisfied (completed or scheduled in an earlier wave)
  const placed = new Set<string>();                  // already assigned to a wave
  const waves: string[][] = [];
  const schedulable = (id: string): boolean => !unknownBlocked.has(id) && depsOf(id).every((d) => done.has(d));

  // deterministic wave loop with a hard progress guarantee (bounded by mission count)
  for (let guard = 0; guard <= allIds.length; guard++) {
    const ready = allIds.filter((id) => !placed.has(id) && !unknownBlocked.has(id) && schedulable(id)).sort();
    if (ready.length === 0) break;
    const wave: string[] = [];
    let used = 0;
    for (const id of ready) {
      if (wave.length >= maxConc) break;
      const w = weightOf(byId[id]);
      if (resourceBudget !== undefined) {
        if (w > resourceBudget) { placed.add(id); unsched.push({ id, reason: "WEIGHT_EXCEEDS_BUDGET" }); continue; }
        if (used + w > resourceBudget) continue;  // defer to a later wave
        used += w;
      }
      wave.push(id); placed.add(id);
    }
    if (wave.length === 0) continue;                 // only budget-deferred this round; next round frees the barrier? no — avoid spin:
    waves.push(wave);
    wave.forEach((id) => done.add(id));              // barrier: completed for the NEXT wave only
  }

  // anything never placed ⇒ blocked by an (transitive) unknown dep, or genuinely in a cycle
  for (const id of allIds) {
    if (placed.has(id)) continue;
    if (unknownBlocked.has(id)) unsched.push({ id, reason: "UNKNOWN_DEP" });
    else unsched.push({ id, reason: "CYCLE" });
  }

  const scheduled = waves.flat();
  return Object.freeze({
    waves: Object.freeze(waves.map((w) => Object.freeze(w.slice()))),
    scheduled: Object.freeze(scheduled),
    unscheduled: Object.freeze(unsched.sort((a, b) => a.id.localeCompare(b.id))),
    stats: Object.freeze({ maxConcurrency: maxConc, resourceBudget, waveCount: waves.length, scheduledCount: scheduled.length, unscheduledCount: unsched.length }),
  });
}

module.exports = { plan };
export {};
