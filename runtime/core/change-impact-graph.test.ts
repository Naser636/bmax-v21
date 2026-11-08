#!/usr/bin/env node
"use strict";
const assert = require("assert");
const CIG = require("./change-impact-graph");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("CHANGE-IMPACT-GRAPH (direct unit coverage)");

const root = process.cwd();

// buildGraph: a graph over the real core modules with deps + consumers.
{
  const g = CIG.buildGraph(root);
  check(Array.isArray(g.modules) && g.modules.length > 100, `buildGraph returns ${g.modules.length} modules`);
  check(g.deps && typeof g.deps === "object" && g.consumers && typeof g.consumers === "object", "graph has deps + consumers maps");
  check(g.modules.includes("action-gate"), "graph includes a known core module (action-gate)");
  // every dep edge points to a real node (internal-only edges, per the module's contract).
  const present = new Set(g.modules);
  const allEdgesInternal = Object.values(g.deps).every((ds: any) => Array.isArray(ds) && ds.every((d: any) => present.has(d)));
  check(allEdgesInternal, "every dependency edge targets a real core node (no dangling edges)");
}

// impactOf: an existing module reports exists:true with a transitive closure; a nonexistent one exists:false.
{
  const r = CIG.impactOf(root, "action-gate");
  check(r.exists === true && r.module === "action-gate", "impactOf(existing) ⇒ exists:true");
  check(Array.isArray(r.transitiveClosure) && Array.isArray(r.consumers), "impactOf returns transitiveClosure + consumers arrays");
  const none = CIG.impactOf(root, "definitely-not-a-real-module-xyz");
  check(none.exists === false && none.transitiveClosure.length === 0, "impactOf(nonexistent) ⇒ exists:false, empty closure (fail-closed)");
}

console.log(failures === 0 ? "ALL PASS — CHANGE-IMPACT-GRAPH" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
