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

  // REGRESSION GUARD: `require("./x.js")` edges must be captured (basename-normalised), not dropped. The `.js`-style is the
  // DOMINANT import form in runtime/core; a prior bug did `slice(2)` without stripping `.js`, so `present.has("x.js")` was
  // false and every such edge vanished — collapsing the graph and producing false orphan/no-consumer verdicts downstream.
  const modulesWithDeps = Object.values(g.deps).filter((ds: any) => Array.isArray(ds) && ds.length > 0).length;
  check(modulesWithDeps > 400, `most core modules have ≥1 captured dep edge (${modulesWithDeps} > 400; .js-style edges not dropped)`);
  // a concrete known `.js`-style edge: odg-lesson-decision-loop requires ./odg-radar-learning-bridge.js + ./excellence-gate.js
  check((g.deps["odg-lesson-decision-loop"] || []).includes("odg-radar-learning-bridge"), "a `.js`-style edge is captured: odg-lesson-decision-loop → odg-radar-learning-bridge");
  check((g.consumers["odg-radar-learning-bridge"] || []).includes("odg-lesson-decision-loop"), "reverse consumer recorded: odg-radar-learning-bridge ← odg-lesson-decision-loop");
}

// impactOf: an existing module reports exists:true with a transitive closure; a nonexistent one exists:false.
{
  const r = CIG.impactOf(root, "action-gate");
  check(r.exists === true && r.module === "action-gate", "impactOf(existing) ⇒ exists:true");
  check(Array.isArray(r.transitiveClosure) && Array.isArray(r.consumers), "impactOf returns transitiveClosure + consumers arrays");
  const none = CIG.impactOf(root, "definitely-not-a-real-module-xyz");
  check(none.exists === false && none.transitiveClosure.length === 0, "impactOf(nonexistent) ⇒ exists:false, empty closure (fail-closed)");

  // V327 §9 — a PRE-BUILT graph is reused instead of rescanning; results match a freshly-scanned query (same graph).
  const g = CIG.buildGraph(root);
  const mod = g.modules[0];
  const fresh = CIG.impactOf(root, mod);
  const prebuilt = CIG.impactOf(root, mod, g);
  check(JSON.stringify(prebuilt.transitiveClosure) === JSON.stringify(fresh.transitiveClosure) && JSON.stringify(prebuilt.consumers) === JSON.stringify(fresh.consumers), "impactOf(root, module, prebuiltGraph) ⇒ identical closure+consumers (reuse, no rescan)");
}

console.log(failures === 0 ? "ALL PASS — CHANGE-IMPACT-GRAPH" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
