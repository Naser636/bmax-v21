#!/usr/bin/env node
"use strict";

/*
 * ODG5 shared-core promotion — dep-planner (topological work-item scheduler).
 * TypeScript port (strict) of docs/odg-operational/shared-core/dep-planner.mjs. Pure, deterministic, no I/O.
 * Closes the Domain-A inventory gap "no dependency-ordered work-item scheduler". Complements the existing
 * runtime/core/change-impact-graph (module deps) + mission-synthesizer (goal decomposition) — it schedules
 * WORK ITEMS into parallel layers; it does NOT duplicate them. Stable ordering (input order tie-break).
 */

export interface WorkItem { id: string; deps?: string[]; domain?: string; [k: string]: unknown; }

// Execution LAYERS: layer N holds every item whose deps are all in layers < N (so items in a layer are independent
// ⇒ parallelisable). Fail-closed: throws on unknown dependency, dependency cycle, or duplicate id.
export function planLayers(items: WorkItem[]): string[][] {
  const byId = new Map<string, WorkItem & { deps: string[] }>();
  for (const it of items) {
    if (byId.has(it.id)) throw new Error("DUPLICATE_WORK_ITEM_ID: " + it.id);
    byId.set(it.id, { ...it, deps: Array.isArray(it.deps) ? it.deps : [] });
  }
  for (const it of byId.values()) for (const d of it.deps) if (!byId.has(d)) throw new Error(`UNKNOWN_DEPENDENCY: "${it.id}" depends on missing "${d}"`);

  const done = new Set<string>(), layers: string[][] = [];
  const order = [...byId.values()];
  while (done.size < byId.size) {
    const ready = order.filter((it) => !done.has(it.id) && it.deps.every((d) => done.has(d)));
    if (ready.length === 0) {
      const stuck = order.filter((it) => !done.has(it.id)).map((it) => it.id);
      throw new Error("DEPENDENCY_CYCLE among: " + stuck.join(", "));
    }
    ready.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    layers.push(ready.map((it) => it.id));
    for (const it of ready) done.add(it.id);
  }
  return layers;
}

export function sequentialOrder(items: WorkItem[]): string[] { return planLayers(items).flat(); }

export interface LayerInfo { layer: number; items: string[]; parallelisable: boolean; domains: Record<string, number>; }
export interface Schedule { layerCount: number; maxParallelism: number; layers: LayerInfo[]; }

export function schedule(items: WorkItem[]): Schedule {
  const layers = planLayers(items);
  const byId = new Map(items.map((it) => [it.id, it]));
  return {
    layerCount: layers.length,
    maxParallelism: Math.max(...layers.map((l) => l.length)),
    layers: layers.map((ids, i): LayerInfo => ({
      layer: i,
      items: ids,
      parallelisable: ids.length > 1,
      domains: ids.reduce((a: Record<string, number>, id) => { const d = String(byId.get(id)?.domain ?? "?"); a[d] = (a[d] || 0) + 1; return a; }, {}),
    })),
  };
}
