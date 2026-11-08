#!/usr/bin/env node
"use strict";

/*
 * WI-CAUSAL-06 — causal-graph lens over the World Model. Locks: edge extraction (causal-type filter +
 * SIMULATION exclusion), transitive effects/causes/impact (cycle-safe, sorted), cycle detection, and the
 * counterfactual forward-collapse. Pure (model in → answer out). Run: node_modules/.bin/tsx <this file>.
 */
const assert = require("assert");
const WM = require("./world-model");
const G = require("./causal-graph");

let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }

// Build: a→b→c, d→c (all causal); a⇢e (SIMULATION causal); a—mentions→f (NON-causal).
let m = WM.emptyModel();
for (const id of ["a", "b", "c", "d", "e", "f"]) m = WM.putEntity(m, id, { type: "node", status: "OBSERVED" }).model;
m = WM.transitionEntity(m, "e", { toStatus: "SIMULATION", expectedPreviousVersion: 1 }).model; // e is a simulated node
m = WM.linkRelation(m, "a-b", { from: "a", to: "b", type: "causes", status: "OBSERVED" }).model;
m = WM.linkRelation(m, "b-c", { from: "b", to: "c", type: "causes", status: "OBSERVED" }).model;
m = WM.linkRelation(m, "d-c", { from: "d", to: "c", type: "causes", status: "OBSERVED" }).model;
m = WM.linkRelation(m, "a-e", { from: "a", to: "e", type: "causes", status: "SIMULATION" }).model;
m = WM.linkRelation(m, "a-f", { from: "a", to: "f", type: "mentions", status: "OBSERVED" }).model;

console.log("WI-CAUSAL-06 — CAUSAL GRAPH");

// Edge extraction: causal-type filter + SIMULATION exclusion by default.
check(G.causalEdges(m).length === 3, "causalEdges: 3 factual causal edges (non-causal 'mentions' + SIMULATION excluded)");
check(G.causalEdges(m, { includeSimulation: true }).length === 4, "causalEdges: includeSimulation ⇒ 4 (the dreamed a→e included)");

// effects / causes / impact (transitive, sorted, SIMULATION excluded by default).
check(JSON.stringify(G.effectsOf(m, "a")) === JSON.stringify(["b", "c"]), "effectsOf(a) = [b,c] (sim e + non-causal f excluded)");
check(JSON.stringify(G.effectsOf(m, "a", { includeSimulation: true })) === JSON.stringify(["b", "c", "e"]), "effectsOf(a, +sim) = [b,c,e]");
check(JSON.stringify(G.causesOf(m, "c")) === JSON.stringify(["a", "b", "d"]), "causesOf(c) = [a,b,d]");
check(JSON.stringify(G.impactOf(m, "a")) === JSON.stringify(["b", "c"]), "impactOf(a) = transitive effects [b,c]");
check(JSON.stringify(G.effectsOf(m, "zzz")) === JSON.stringify([]), "effectsOf(unknown) = [] (no crash)");

// Determinism.
check(JSON.stringify(G.causesOf(m, "c")) === JSON.stringify(G.causesOf(m, "c")), "deterministic: same model ⇒ identical answer");

// Cycle detection.
check(G.hasCycle(m) === false, "hasCycle = false on the acyclic graph");
const mc = WM.linkRelation(m, "c-a", { from: "c", to: "a", type: "causes", status: "OBSERVED" }).model;
check(G.hasCycle(mc) === true, "hasCycle = true after adding c→a (back-edge)");
check(JSON.stringify(G.effectsOf(mc, "a")) === JSON.stringify(["b", "c"]), "effectsOf stays cycle-safe on a cyclic graph (terminates; start node excluded ⇒ [b,c])");

// Counterfactual forward-collapse.
check(JSON.stringify(G.counterfactualRemove(m, "a")) === JSON.stringify(["b"]), "counterfactualRemove(a) = [b] (c survives via external parent d)");
check(JSON.stringify(G.counterfactualRemove(m, "d")) === JSON.stringify([]), "counterfactualRemove(d) = [] (c survives via b←a)");
// Removing BOTH independent roots collapses c: remove a then test that c loses all support when d is also gone.
const m2 = WM.linkRelation(WM.putEntity(WM.emptyModel(), "x", { type: "n", status: "OBSERVED" }).model, "x-x", { from: "x", to: "x", type: "causes", status: "OBSERVED" }).model;
check(Array.isArray(G.counterfactualRemove(m2, "x")), "counterfactualRemove is cycle-safe on a self-loop (no hang)");

console.log(failures === 0 ? "ALL PASS — WI-CAUSAL-06 CAUSAL GRAPH" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

// Module-scope marker (adds NO export): forces TS MODULE scope so top-level test names are not global
// (TS2451/TS2588 guard), matching the world-model.test.ts discipline.
export {};
