#!/usr/bin/env node
"use strict";
/*
 * INTERVAL SCHEDULING — merge / overlap-conflict / coverage / availability over numeric intervals. PURE, deterministic,
 * fail-closed.
 *
 * THE GAP (reconciled): writeset-scheduler.conflicts detects WRITE-SET (file-path) overlaps; inference-engine
 * .availability is model availability — NEITHER does numeric TIME-interval merge or double-booking detection. The
 * chantier CPM scheduler (odg-btp-chantier-schedule) does dependency TIMING, not interval overlap. This adds the classic
 * interval ops, useful for resource conflicts (crew/equipment double-booking) and availability windows.
 *
 * Conventions (stated, not hidden):
 *  - intervals are CLOSED numeric ranges [start, end] on the CALLER's scale (day/minute indices) — NO clock here;
 *  - MERGE unions overlapping OR TOUCHING intervals (next.start ≤ cur.end) — the standard "merge intervals";
 *  - a CONFLICT/overlap is a STRICT positive-length overlap (max(start) < min(end)); touching endpoints (b==c) are NOT a
 *    conflict (the half-open booking convention) — so back-to-back bookings don't clash;
 *  - a detected overlap is a GEOMETRIC fact, NOT a domain judgment that it is disallowed (overlaps may be intentional —
 *    the caller decides); fail-closed: start>end / non-finite / non-array ⇒ typed refusal. No network/clock/randomness.
 */

function isFiniteNum(v: any): boolean { return typeof v === "number" && Number.isFinite(v); }
function freeze(o: any): any { return Object.freeze(o); }

/** Validate + normalise to [{id, start, end}]; returns { ok, items } or { ok:false, code }. */
function normalise(intervals: any): any {
  if (!Array.isArray(intervals)) return { ok: false, code: "NOT_ARRAY" };
  const items: any[] = [];
  for (let i = 0; i < intervals.length; i++) {
    const it = intervals[i];
    if (it === null || typeof it !== "object" || Array.isArray(it)) return { ok: false, code: "BAD_INTERVAL", detail: `item ${i} is not an interval object` };
    if (!isFiniteNum(it.start) || !isFiniteNum(it.end)) return { ok: false, code: "BAD_BOUNDS", detail: `item ${i}: start/end must be finite numbers` };
    if (it.start > it.end) return { ok: false, code: "START_AFTER_END", detail: `item ${i}: start ${it.start} > end ${it.end}` };
    items.push({ id: typeof it.id === "string" ? it.id : "i" + i, start: it.start, end: it.end });
  }
  return { ok: true, items };
}

/** mergeIntervals(intervals) -> { ok, merged[] } minimal set of disjoint closed intervals (overlapping OR touching unioned). */
function mergeIntervals(intervals: any): any {
  const n = normalise(intervals); if (!n.ok) return freeze(n);
  if (n.items.length === 0) return freeze({ ok: true, merged: freeze([]) });
  const sorted = n.items.slice().sort((a: any, b: any) => a.start - b.start || a.end - b.end);
  const merged: any[] = [{ start: sorted[0].start, end: sorted[0].end }];
  for (let i = 1; i < sorted.length; i++) {
    const cur = merged[merged.length - 1], nxt = sorted[i];
    if (nxt.start <= cur.end) cur.end = Math.max(cur.end, nxt.end);   // overlap OR touch ⇒ union
    else merged.push({ start: nxt.start, end: nxt.end });
  }
  return freeze({ ok: true, merged: freeze(merged.map(freeze)) });
}

/** findConflicts(intervals) -> { ok, conflicts[] } every pair with STRICT positive overlap (touching ≠ conflict). O(n log n). */
function findConflicts(intervals: any): any {
  const n = normalise(intervals); if (!n.ok) return freeze(n);
  const sorted = n.items.slice().sort((a: any, b: any) => a.start - b.start || a.end - b.end || (a.id < b.id ? -1 : 1));
  const conflicts: any[] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j].start >= sorted[i].end) break;                     // sorted by start ⇒ no later one can overlap i
      const oStart = Math.max(sorted[i].start, sorted[j].start), oEnd = Math.min(sorted[i].end, sorted[j].end);
      if (oStart < oEnd) conflicts.push(freeze({ a: sorted[i].id, b: sorted[j].id, overlapStart: oStart, overlapEnd: oEnd }));
    }
  }
  return freeze({ ok: true, conflicts: freeze(conflicts), hasConflict: conflicts.length > 0,
    note: "STRICT overlap (positive length); touching endpoints are NOT a conflict. An overlap is a GEOMETRIC fact, not a 'disallowed' verdict — the caller decides." });
}

/** totalCovered(intervals) -> { ok, covered } total length of the UNION (double-counts nothing). */
function totalCovered(intervals: any): any {
  const m = mergeIntervals(intervals); if (m.ok !== true) return m;
  const covered = m.merged.reduce((s: number, iv: any) => s + (iv.end - iv.start), 0);
  return freeze({ ok: true, covered, segments: m.merged.length });
}

/** isFree(intervals, query) -> { ok, free, conflicts[] }: does the query interval strictly overlap any booked interval? */
function isFree(intervals: any, query: any): any {
  const n = normalise(intervals); if (!n.ok) return freeze(n);
  const q = normalise([query]); if (!q.ok) return freeze({ ok: false, code: "BAD_QUERY", detail: q.code });
  const Q = q.items[0];
  const conflicts = n.items.filter((it: any) => Math.max(it.start, Q.start) < Math.min(it.end, Q.end))
    .map((it: any) => freeze({ id: it.id, overlapStart: Math.max(it.start, Q.start), overlapEnd: Math.min(it.end, Q.end) }));
  return freeze({ ok: true, free: conflicts.length === 0, conflicts: freeze(conflicts),
    note: "FREE = no STRICT overlap with any booked interval (touching endpoints allowed — back-to-back is free)." });
}

const INTERVAL_SCHEDULING_CONTRACT = Object.freeze({
  id: "INTERVAL-SCHEDULING",
  purpose: "numeric interval merge / booking-conflict / coverage / availability — distinct from writeset-scheduler (path overlaps) and chantier-schedule (dependency timing)",
  reuses: Object.freeze(["operates on the caller's numeric scale (day/minute indices); no clock — complements odg-btp-chantier-schedule"]),
  invariants: Object.freeze([
    "intervals are CLOSED numeric ranges on the caller's scale — NO clock (deterministic)",
    "MERGE unions overlapping OR touching intervals; CONFLICT is a STRICT positive-length overlap (touching endpoints are NOT a conflict — back-to-back is free)",
    "a detected overlap is a GEOMETRIC fact, NOT a 'disallowed' verdict — the caller decides whether an overlap is a problem",
    "fail-closed: start>end / non-finite / non-array ⇒ typed refusal (no coercion)",
    "PURE + deterministic; no network/clock/randomness",
  ]),
});

module.exports = { mergeIntervals, findConflicts, totalCovered, isFree, INTERVAL_SCHEDULING_CONTRACT };
export {};
