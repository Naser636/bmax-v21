#!/usr/bin/env node
"use strict";

/*
 * V5-E / ENGINEERING INTELLIGENCE WAVE-2 — PERSISTENT FILE-LEVEL IMPACT GRAPH. Adds PERSISTENCE + PROVENANCE +
 * INVALIDATION on top of the existing change-impact-graph (it does NOT build a concurrent graph — the graph itself is
 * change-impact-graph.buildGraph, injected). A stamped graph records a SOURCE DIGEST (the combined digest of the
 * indexed files) + builtAt; it is FRESH only while the current source digest matches — any file change flips it STALE,
 * forcing a rebuild. Impact queries answer with a validity guarantee: a STALE graph, an unknown module, or a missing/
 * tampered stamp ⇒ the caller MUST widen to FULL (uncertainty widens validation). Transitive consumers are computed
 * cycle-safe. The pure core (stamp / isFresh / impactWithValidity / transitiveConsumers) composes evidence-provenance
 * .contentDigest; saveGraph/loadGraph persist the stamped graph as JSON. Fail-closed throughout. Dual export.
 */

const PROV = require("./evidence-provenance");         // contentDigest — source digest for provenance + invalidation

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
const SCHEMA = "odg.persistent-impact-graph.v1";

/** sourceDigestOf(fileDigests) -> one digest of the whole indexed source (a change to ANY file changes it). */
function sourceDigestOf(fileDigests: any): string | null {
  if (!isObj(fileDigests)) return null;
  const keys = Object.keys(fileDigests).sort();
  if (keys.length === 0) return null;
  return PROV.contentDigest(keys.map((k) => [k, String(fileDigests[k])]));
}

/** stampGraph(graph, { sourceDigest, builtAt }) -> persisted form with provenance. */
function stampGraph(graph: any, opts: any): any {
  const g = isObj(graph) ? graph : {};
  const o = isObj(opts) ? opts : {};
  return Object.freeze({
    schema: SCHEMA,
    sourceDigest: typeof o.sourceDigest === "string" ? o.sourceDigest : null,
    builtAt: typeof o.builtAt === "number" ? o.builtAt : null,
    modules: Object.freeze(arr(g.modules).slice().sort()),
    consumers: Object.freeze(isObj(g.consumers) ? { ...g.consumers } : {}),
    deps: Object.freeze(isObj(g.deps) ? { ...g.deps } : {}),
  });
}

/** isFresh(stamped, currentSourceDigest) -> true only if the stamp matches the current source (no change since build). */
function isFresh(stamped: any, currentSourceDigest: any): boolean {
  return isObj(stamped) && stamped.schema === SCHEMA && typeof stamped.sourceDigest === "string" && stamped.sourceDigest.length > 0 && stamped.sourceDigest === currentSourceDigest;
}

/** transitiveConsumers(stamped, module) -> module + all transitive consumers (cycle-safe BFS). */
function transitiveConsumers(stamped: any, module: any): string[] {
  const consumers = isObj(stamped) && isObj(stamped.consumers) ? stamped.consumers : {};
  const seen = new Set<string>(); const stack = [String(module)];
  while (stack.length) { const n = stack.pop() as string; if (seen.has(n)) continue; seen.add(n); for (const c of arr(consumers[n])) if (!seen.has(String(c))) stack.push(String(c)); }
  return Array.from(seen).sort();
}

/**
 * impactWithValidity(stamped, module, currentSourceDigest) -> { valid, mode, impacted, reason }.
 * Fail-closed: missing/tampered graph, STALE source, or an unknown module ⇒ valid:false + mode FULL.
 */
function impactWithValidity(stamped: any, module: any, currentSourceDigest: any): any {
  if (!isObj(stamped) || stamped.schema !== SCHEMA || !isObj(stamped.consumers)) return full("missing/invalid persistent graph ⇒ FULL (fail-closed)");
  if (!isFresh(stamped, currentSourceDigest)) return full("graph is STALE (source changed since build) ⇒ rebuild + FULL (uncertainty widens validation)");
  if (!arr(stamped.modules).includes(String(module))) return full(`module '${module}' not in the graph (unknown dependency) ⇒ FULL`);
  return Object.freeze({ valid: true, mode: "TARGETED", impacted: Object.freeze(transitiveConsumers(stamped, module)), reason: "fresh graph + known module ⇒ transitive impact is trustworthy" });
}

function full(reason: string): any { return Object.freeze({ valid: false, mode: "FULL", impacted: null, reason }); }

// --- persistence (fs round-trip) — the "real persistence" of the stamped graph. ---
function saveGraph(filePath: string, stamped: any): boolean {
  try { require("fs").writeFileSync(filePath, JSON.stringify(stamped), "utf8"); return true; } catch { return false; }
}
function loadGraph(filePath: string): any {
  try { const o = JSON.parse(require("fs").readFileSync(filePath, "utf8")); return o && o.schema === SCHEMA ? o : null; } catch { return null; }
}

const PERSISTENT_IMPACT_GRAPH_CONTRACT = Object.freeze({
  id: "V5-E-PERSISTENT-IMPACT-GRAPH",
  source: "ODG Engineering Intelligence wave-2 — persistent file-level impact graph (persistence + provenance + invalidation)",
  schema: SCHEMA,
  reuses: Object.freeze(["change-impact-graph.buildGraph (the graph itself — no concurrent graph)", "evidence-provenance.contentDigest (source digest / invalidation)"]),
  notAuthority: "a persisted, provenance-stamped impact graph with validity; it builds no concurrent graph and grants no authority",
  invariants: Object.freeze([
    "the graph is FRESH only while the current source digest matches the stamped one — any file change ⇒ STALE ⇒ rebuild",
    "a STALE graph / unknown module / missing-or-tampered stamp ⇒ impactWithValidity returns mode FULL (uncertainty widens validation, fail-closed)",
    "transitive consumers are computed cycle-safe (a dependency cycle never loops forever)",
    "it REUSES change-impact-graph (no concurrent graph); persistence is a JSON round-trip of the stamped graph",
    "pure core (stamp/isFresh/impact) is deterministic — digests + graph in → validity out; no clock/random/network",
  ]),
});

module.exports = { SCHEMA, sourceDigestOf, stampGraph, isFresh, transitiveConsumers, impactWithValidity, saveGraph, loadGraph, PERSISTENT_IMPACT_GRAPH_CONTRACT };

if (require.main === module) {
  const graph = { modules: ["a", "b", "c"], consumers: { a: ["b"], b: ["c"] }, deps: { b: ["a"], c: ["b"] } };
  const digest = sourceDigestOf({ "a.ts": "h1", "b.ts": "h2", "c.ts": "h3" });
  const stamped = stampGraph(graph, { sourceDigest: digest, builtAt: 1 });
  process.stdout.write(JSON.stringify({ ...PERSISTENT_IMPACT_GRAPH_CONTRACT, demo: { fresh: impactWithValidity(stamped, "a", digest).mode, stale: impactWithValidity(stamped, "a", "CHANGED").mode } }, null, 2) + "\n");
}

export {};
