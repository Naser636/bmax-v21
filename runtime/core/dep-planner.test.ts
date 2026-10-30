#!/usr/bin/env node
// @ts-nocheck — runtime/core test convention: runs under tsx; strict typing enforced by the strict tsconfig.
"use strict";
/* ODG5 promotion — dep-planner (topological scheduler). Run: tsx runtime/core/dep-planner.test.ts */
const P = require("./dep-planner");
let failures = 0;
function check(cond, label) { if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); } }
function throws(fn, re, label) { try { fn(); check(false, label + " (did not throw)"); } catch (e) { check(re.test(e.message), label); } }

console.log("ODG5 — DEP-PLANNER (TS)");
check(JSON.stringify(P.planLayers([{ id: "c", deps: ["a", "b"] }, { id: "a" }, { id: "b" }])) === JSON.stringify([["a", "b"], ["c"]]), "layers respect dependencies");
const s = P.schedule([{ id: "x", domain: "A" }, { id: "y", domain: "B" }, { id: "z", domain: "C" }]);
check(s.layerCount === 1 && s.maxParallelism === 3 && s.layers[0].parallelisable === true, "independent items share a parallel layer");
check(JSON.stringify(s.layers[0].domains) === JSON.stringify({ A: 1, B: 1, C: 1 }), "per-domain spread");
throws(() => P.planLayers([{ id: "a", deps: ["b"] }, { id: "b", deps: ["a"] }]), /DEPENDENCY_CYCLE/, "cycle reported");
throws(() => P.planLayers([{ id: "a", deps: ["ghost"] }]), /UNKNOWN_DEPENDENCY/, "unknown dep fail-closed");
throws(() => P.planLayers([{ id: "a" }, { id: "a" }]), /DUPLICATE_WORK_ITEM_ID/, "duplicate id fail-closed");
check(JSON.stringify(P.sequentialOrder([{ id: "deploy", deps: ["build"] }, { id: "build", deps: ["lint"] }, { id: "lint" }])) === JSON.stringify(["lint", "build", "deploy"]), "sequentialOrder dependency-respecting");

// REGRESSION (recon-2): schedule([]) must yield maxParallelism 0, NOT Math.max(...[]) === -Infinity.
const sEmpty = P.schedule([]);
check(sEmpty.layerCount === 0 && sEmpty.maxParallelism === 0 && Array.isArray(sEmpty.layers) && sEmpty.layers.length === 0, "schedule([]) ⇒ maxParallelism 0 (not -Infinity)");

console.log(failures ? `FAIL (${failures})` : "OK");
if (failures) process.exit(1);
