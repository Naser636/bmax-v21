#!/usr/bin/env node
"use strict";
/*
 * INTERVAL OPTIMIZATION — minimum resources (max concurrency / interval partitioning) + maximum compatible subset
 * (greedy activity selection). PURE, deterministic, fail-closed.
 *
 * THE GAP (reconciled): odg-interval-scheduling (#729) DETECTS overlaps (merge / conflicts / coverage / isFree) — it
 * does not OPTIMISE. metier-orchestration's `maxConcurrency` is a config CAP, not computed from intervals. Neither
 * answers "how many parallel resources (crews/rooms) do these bookings need?" or "what's the largest set of bookings
 * that fit on ONE resource without conflict?". This adds those two classic interval optimisations.
 *
 * Conventions (consistent with #729): CLOSED numeric ranges on the caller's scale (NO clock); STRICT overlap (touching
 * endpoints do NOT require a new resource / do NOT block selection — back-to-back reuse is allowed).
 *
 * Honesty:
 *  - maxConcurrency / minResourcesNeeded is a GEOMETRIC minimum under strict overlap — it ignores resource TYPE/skill/
 *    travel (the caller's domain constraints); it is not a staffing decision;
 *  - maxNonOverlapping maximises the COUNT of compatible intervals (greedy-by-end is provably optimal for count), NOT
 *    total covered time — a different objective; ties broken deterministically;
 *  - fail-closed: start>end / non-finite / non-array ⇒ typed refusal (no coercion). No network/clock/randomness.
 */

function isFiniteNum(v: any): boolean { return typeof v === "number" && Number.isFinite(v); }
function freeze(o: any): any { return Object.freeze(o); }

function normalise(intervals: any): any {
  if (!Array.isArray(intervals)) return { ok: false, code: "NOT_ARRAY" };
  const items: any[] = [];
  for (let i = 0; i < intervals.length; i++) {
    const it = intervals[i];
    if (it === null || typeof it !== "object" || Array.isArray(it)) return { ok: false, code: "BAD_INTERVAL", detail: `item ${i} is not an interval object` };
    if (!isFiniteNum(it.start) || !isFiniteNum(it.end)) return { ok: false, code: "BAD_BOUNDS", detail: `item ${i}: start/end must be finite` };
    if (it.start > it.end) return { ok: false, code: "START_AFTER_END", detail: `item ${i}: start ${it.start} > end ${it.end}` };
    items.push({ id: typeof it.id === "string" ? it.id : "i" + i, start: it.start, end: it.end });
  }
  return { ok: true, items };
}

/**
 * maxConcurrency(intervals) -> { ok, maxConcurrency, minResourcesNeeded, at }. The max number of intervals overlapping
 * at any point = minimum parallel resources to run them all. STRICT overlap: an end at t frees before a start at t.
 */
function maxConcurrency(intervals: any): any {
  const n = normalise(intervals); if (!n.ok) return freeze(n);
  if (n.items.length === 0) return freeze({ ok: true, maxConcurrency: 0, minResourcesNeeded: 0, at: null });
  const starts = n.items.map((x: any) => x.start).sort((a: number, b: number) => a - b);
  const ends = n.items.map((x: any) => x.end).sort((a: number, b: number) => a - b);
  let i = 0, j = 0, cur = 0, max = 0, at: number | null = null;
  while (i < starts.length) {
    if (starts[i] < ends[j]) { cur++; if (cur > max) { max = cur; at = starts[i]; } i++; } // strict: touching (start==end) ⇒ free first
    else { cur--; j++; }
  }
  return freeze({ ok: true, maxConcurrency: max, minResourcesNeeded: max, at,
    note: "max overlap depth = minimum parallel resources (strict overlap; touching reuses a resource). GEOMETRIC minimum — ignores resource type/skill/travel (caller's domain); not a staffing decision." });
}

/**
 * maxNonOverlapping(intervals) -> { ok, selected[], count, droppedCount }. Greedy activity selection: sort by END asc,
 * keep an interval if its start ≥ the last kept end (touching allowed). Maximises the COUNT of compatible intervals.
 */
function maxNonOverlapping(intervals: any): any {
  const n = normalise(intervals); if (!n.ok) return freeze(n);
  const sorted = n.items.slice().sort((a: any, b: any) => a.end - b.end || a.start - b.start || (a.id < b.id ? -1 : 1));
  const selected: any[] = [];
  let lastEnd = -Infinity;
  for (const it of sorted) {
    if (it.start >= lastEnd) { selected.push(freeze({ id: it.id, start: it.start, end: it.end })); lastEnd = it.end; } // touching allowed (back-to-back)
  }
  return freeze({ ok: true, selected: freeze(selected), count: selected.length, droppedCount: n.items.length - selected.length,
    note: "greedy-by-end activity selection: a MAXIMUM-COUNT set of mutually compatible intervals (touching allowed). Maximises COUNT, NOT total covered time — a different objective; ties broken deterministically." });
}

const INTERVAL_OPTIMIZATION_CONTRACT = Object.freeze({
  id: "INTERVAL-OPTIMIZATION",
  purpose: "interval optimisation — minimum parallel resources (max concurrency) + maximum compatible subset (activity selection); distinct from #729's overlap DETECTION",
  reuses: Object.freeze(["same CLOSED-range/strict-overlap/no-clock conventions as odg-interval-scheduling (#729); complements it (detection vs optimisation)"]),
  invariants: Object.freeze([
    "maxConcurrency/minResourcesNeeded = GEOMETRIC minimum under STRICT overlap (touching reuses a resource) — ignores resource type/skill/travel; not a staffing decision",
    "maxNonOverlapping maximises the COUNT of compatible intervals (greedy-by-end, provably optimal for count), NOT total covered time",
    "CLOSED numeric ranges on the caller's scale — NO clock; deterministic tie-breaks",
    "fail-closed: start>end / non-finite / non-array ⇒ typed refusal (no coercion)",
    "PURE + deterministic; no network/clock/randomness",
  ]),
});

module.exports = { maxConcurrency, maxNonOverlapping, INTERVAL_OPTIMIZATION_CONTRACT };
export {};
