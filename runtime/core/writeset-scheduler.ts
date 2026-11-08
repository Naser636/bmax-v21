#!/usr/bin/env node
"use strict";

/*
 * WI-WSCONF-12 — WRITE-SET-SAFE SCHEDULER (§79 "no uncoordinated concurrent writes to the same files"; §3D
 * multi-agent). PURE, deterministic. REUSES dep-planner.planLayers (dependency-safe parallel layers) and
 * REFINES each layer so that items placed in the same parallel sub-layer ALSO have DISJOINT write-sets. Two
 * work items with no dependency relation but OVERLAPPING write-sets would be parallel-unsafe under dep-planner
 * alone; this splits them into successive sub-layers. Does NOT duplicate dep-planner (composes it) nor
 * scope-observer (reuses the path-prefix overlap semantics). Fail-closed: dep-planner throws on unknown dep /
 * cycle / duplicate id and that propagates. Dual export (CJS + ESM export {}).
 */

const DEP = require("./dep-planner");

function normPaths(ws: any): string[] {
  return (Array.isArray(ws) ? ws : [])
    .filter((p: any) => typeof p === "string" && p.trim().length > 0)
    .map((p: string) => p.trim().replace(/^\.?\/+/, "").replace(/\/+$/, ""));
}
// Two normalized paths conflict if equal or one is an ancestor directory of the other (prefix semantics).
function pathConflict(a: string, b: string): boolean {
  return a === b || a.startsWith(b + "/") || b.startsWith(a + "/");
}
function writeSetsOverlap(wsA: string[], wsB: string[]): boolean {
  for (const a of wsA) for (const b of wsB) if (pathConflict(a, b)) return true;
  return false;
}
function wsMap(items: any[]): any { const m: any = {}; for (const it of items) if (it && typeof it.id === "string") m[it.id] = normPaths(it.writeSet); return m; }

/** conflicts(items) -> [{a,b}] every unordered pair whose write-sets overlap (deterministic, id-ordered). */
function conflicts(items: any): any[] {
  const list = (Array.isArray(items) ? items : []).filter((it: any) => it && typeof it.id === "string").map((it: any) => ({ id: it.id, ws: normPaths(it.writeSet) }));
  list.sort((x: any, y: any) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  const out: any[] = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    if (writeSetsOverlap(list[i].ws, list[j].ws)) out.push(Object.freeze({ a: list[i].id, b: list[j].id }));
  }
  return out;
}

/**
 * safeLayers(items) -> string[][] — execution sub-layers that are BOTH dependency-safe (deps in earlier layers)
 * AND write-set-disjoint (items within a sub-layer never touch overlapping paths ⇒ safe to run in parallel).
 * Stable greedy packing (input/planLayers order). Fail-closed via dep-planner (throws on unknown dep/cycle/dup).
 */
function safeLayers(items: any): any[] {
  const list = Array.isArray(items) ? items : [];
  const depLayers = DEP.planLayers(list); // dependency-safe parallel layers (reused; fail-closed)
  const ws = wsMap(list);
  const out: any[] = [];
  for (const layer of depLayers) {
    const sub: any[] = []; // each: { ids: string[] } — write-set-disjoint within
    for (const id of layer) {
      const w = ws[id] || [];
      let placed = false;
      for (const s of sub) {
        if (!s.ids.some((x: string) => writeSetsOverlap(ws[x] || [], w))) { s.ids.push(id); placed = true; break; }
      }
      if (!placed) sub.push({ ids: [id] });
    }
    for (const s of sub) out.push(s.ids);
  }
  return out;
}

/** plan(items) -> { layers, conflicts, parallelWidth, sequential } — the full write-set-safe schedule. Pure. */
function plan(items: any): any {
  const layers = safeLayers(items);
  const cf = conflicts(items);
  const parallelWidth = layers.reduce((m: number, l: any) => Math.max(m, l.length), 0);
  return Object.freeze({
    layers: Object.freeze(layers.map((l: any) => Object.freeze(l.slice()))),
    conflicts: Object.freeze(cf),
    parallelWidth,
    sequential: Object.freeze([].concat(...layers)),
  });
}

const WRITESET_SCHEDULER_CONTRACT = Object.freeze({
  id: "WI-WSCONF-12-WRITESET-SCHEDULER",
  source: "FICHE §79 (no uncoordinated concurrent writes) + §3D multi-agent; composes dep-planner + scope-observer path semantics",
  notAuthority: "pure planning lens; schedules nothing externally, executes nothing; a SUB-LAYER is safe to parallelise",
  invariants: Object.freeze([
    "pure/deterministic: items in → layers out; no clock/random; stable packing",
    "a sub-layer is BOTH dependency-safe (deps in earlier layers) AND write-set-disjoint",
    "write-set conflict = path equality OR ancestor-directory prefix (reuses scope-observer semantics)",
    "fail-closed: unknown dependency / cycle / duplicate id throw (via dep-planner)",
    "reuses dep-planner + scope-observer; does not duplicate them (§139)",
  ]),
});

module.exports = {
  WRITESET_SCHEDULER_CONTRACT,
  normPaths, pathConflict, writeSetsOverlap, conflicts, safeLayers, plan,
};

if (require.main === module) {
  process.stdout.write(JSON.stringify(WRITESET_SCHEDULER_CONTRACT, null, 2) + "\n");
}

export {};
