#!/usr/bin/env node
"use strict";

/*
 * WI-CAUSAL-06 — CAUSAL GRAPH reasoning over the World Model (§19 causal graph / counterfactual).
 *
 * PURE/deterministic READ layer ON TOP of a world-model model (`{ items, entities, relations }`): it adds
 * NO new primitive, mutates nothing, and holds no state. A causal edge is a world-model RELATION whose
 * `type` ∈ CAUSAL_TYPES, directed from (cause) → to (effect). SIMULATION-status edges are EXCLUDED unless
 * opts.includeSimulation (default false) — a *dreamed* link must never silently drive a FACTUAL causal
 * conclusion (§28). All traversals are cycle-safe (visited set) and all outputs are sorted for determinism.
 *
 * Dual export (CJS module.exports + ESM `export {}`) to pass both tsconfigs and be require()-able, mirroring
 * world-model.ts. The world-model remains the single source of entities/relations; this is a lens over it.
 */

const CAUSAL_TYPES = Object.freeze(["causes", "enables", "prevents", "contributes_to", "leads_to"]);

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function uniqSorted(xs: any): any { return Array.from(new Set(xs)).sort(); }

// Extract directed causal edges from a world-model model. SIMULATION excluded unless opts.includeSimulation.
function causalEdges(model: any, opts?: any): any[] {
  const rels = isObj(model) && isObj(model.relations) ? model.relations : {};
  const includeSim = !!(opts && opts.includeSimulation);
  const out: any[] = [];
  for (const id of Object.keys(rels)) {
    const r = rels[id];
    if (!isObj(r) || !CAUSAL_TYPES.includes(r.type)) continue;
    if (!includeSim && r.status === "SIMULATION") continue;
    if (typeof r.from !== "string" || typeof r.to !== "string") continue;
    out.push({ id, from: r.from, to: r.to, type: r.type, status: r.status });
  }
  return out;
}

function adjacency(model: any, opts?: any): any {
  const fwd: any = {}; const rev: any = {};
  for (const e of causalEdges(model, opts)) {
    (fwd[e.from] = fwd[e.from] || []).push(e.to);
    (rev[e.to] = rev[e.to] || []).push(e.from);
  }
  return { fwd, rev };
}

// Cycle-safe transitive reachability from `start` over `adjMap` (excludes `start`).
function reachable(adjMap: any, start: any): any[] {
  const seen = new Set<string>(); const stack = [start];
  while (stack.length) {
    const n = stack.pop();
    for (const m of (adjMap[n] || [])) {
      if (!seen.has(m)) { seen.add(m); stack.push(m); }
    }
  }
  seen.delete(start);
  return uniqSorted(Array.from(seen));
}

/** effectsOf(model, id) — transitive DESCENDANTS (things this node causally leads to). */
function effectsOf(model: any, nodeId: any, opts?: any): any[] { return reachable(adjacency(model, opts).fwd, nodeId); }
/** causesOf(model, id) — transitive ANCESTORS (things that causally lead to this node). */
function causesOf(model: any, nodeId: any, opts?: any): any[] { return reachable(adjacency(model, opts).rev, nodeId); }
/** impactOf(model, id) — the propagation set of a change at this node (= its transitive effects). */
function impactOf(model: any, nodeId: any, opts?: any): any[] { return effectsOf(model, nodeId, opts); }

/** hasCycle(model) — true if the causal graph contains a directed cycle (DFS 3-colour). */
function hasCycle(model: any, opts?: any): boolean {
  const { fwd } = adjacency(model, opts);
  const nodes = new Set<string>();
  for (const k of Object.keys(fwd)) { nodes.add(k); for (const t of fwd[k]) nodes.add(t); }
  const color: any = {}; // 0=unseen,1=in-stack,2=done
  const dfs = (u: string): boolean => {
    color[u] = 1;
    for (const v of (fwd[u] || [])) {
      if (color[v] === 1) return true;
      if (color[v] === undefined && dfs(v)) return true;
    }
    color[u] = 2; return false;
  };
  for (const n of nodes) { if (color[n] === undefined && dfs(n)) return true; }
  return false;
}

/**
 * counterfactualRemove(model, nodeId) — the set of nodes that lose ALL causal support when nodeId is removed.
 * Forward collapse: start from {nodeId}; iteratively add any node that HAS causal parents and ALL of them are
 * already removed (a node with an external surviving parent is NOT lost). Returns the lost set (excl. nodeId),
 * sorted. Deterministic; cycle-safe (fixpoint over a finite node set).
 */
function counterfactualRemove(model: any, nodeId: any, opts?: any): any[] {
  const { rev } = adjacency(model, opts);
  const removed = new Set<string>([nodeId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of Object.keys(rev)) {
      if (removed.has(n)) continue;
      const parents = rev[n] || [];
      if (parents.length > 0 && parents.every((p: string) => removed.has(p))) { removed.add(n); changed = true; }
    }
  }
  removed.delete(nodeId);
  return uniqSorted(Array.from(removed));
}

const CAUSAL_GRAPH_CONTRACT = Object.freeze({
  id: "WI-CAUSAL-06-CAUSAL-GRAPH",
  source: "FICHE §19 (causal graph + counterfactual); lens over V5-387 WORLD-MODEL relations",
  causalTypes: CAUSAL_TYPES,
  notAuthority: "Causal Graph is a READ lens over the World Model; it asserts no reality and grants no authority",
  invariants: Object.freeze([
    "pure/deterministic: model in → answer out; no mutation, no clock/random; outputs sorted",
    "a causal edge is a world-model relation with type ∈ CAUSAL_TYPES, directed from→to (cause→effect)",
    "SIMULATION edges are excluded unless opts.includeSimulation (a dream never drives a factual conclusion, §28)",
    "all traversals are cycle-safe",
  ]),
});

module.exports = {
  CAUSAL_TYPES, CAUSAL_GRAPH_CONTRACT,
  causalEdges, adjacency, effectsOf, causesOf, impactOf, hasCycle, counterfactualRemove,
};

if (require.main === module) {
  process.stdout.write(JSON.stringify(CAUSAL_GRAPH_CONTRACT, null, 2) + "\n");
}

export {};
