#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves dep-planner is a REAL consumer via roadmap order validation: OK when order
// respects deps (dep-planner layering invoked), ORDER_VIOLATION when a dependency is listed after its dependent,
// CYCLE/missing-dep surfaced fail-closed, and the ACTUAL governed ROADMAP.json validates OK.
"use strict";
const assert = require("assert");
const C = require("./roadmap-dep-check.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const rm = (ids) => ({ missions: ids.map((id) => ({ id, title: id, contract: `x/${id}.json` })) });

// (1) OK: B depends on A, A listed first ⇒ consistent; dep-planner layering invoked (layers present).
const okR = C.checkRoadmapOrder({ roadmap: rm(["A", "B", "C"]), deps: { dependencies: { B: ["A"] } } });
ok("order respects deps ⇒ OK + dep-planner layers produced", okR.verdict === "OK" && Array.isArray(okR.layers) && okR.layers.length >= 1);

// (2) ORDER_VIOLATION: B depends on A but A is listed AFTER B.
const viol = C.checkRoadmapOrder({ roadmap: rm(["B", "A"]), deps: { dependencies: { B: ["A"] } } });
ok("dependency listed after dependent ⇒ ORDER_VIOLATION", viol.verdict === "ORDER_VIOLATION" && viol.violations.some(v => v.id === "B" && v.dep === "A" && v.kind === "ORDER_VIOLATION"));

// (3) CYCLE: A↔B ⇒ dep-planner throws CYCLE, surfaced fail-closed.
const cyc = C.checkRoadmapOrder({ roadmap: rm(["A", "B"]), deps: { dependencies: { A: ["B"], B: ["A"] } } });
ok("dependency cycle ⇒ CYCLE (fail-closed from dep-planner)", cyc.verdict === "CYCLE");

// (4) dep not in roadmap ⇒ DEP_NOT_IN_ROADMAP violation (not silently ignored).
const miss = C.checkRoadmapOrder({ roadmap: rm(["A"]), deps: { dependencies: { A: ["GHOST"] } } });
ok("dep absent from roadmap ⇒ DEP_NOT_IN_ROADMAP", miss.verdict === "ORDER_VIOLATION" && miss.violations.some(v => v.kind === "DEP_NOT_IN_ROADMAP"));

// (5) no deps ⇒ OK (single layer, trivial).
ok("no declared deps ⇒ OK", C.checkRoadmapOrder({ roadmap: rm(["A", "B"]), deps: { dependencies: {} } }).verdict === "OK");

// (6) fail-closed on bad input.
ok("fail-closed: no missions", C.checkRoadmapOrder({ roadmap: {}, deps: {} }).verdict === "INVALID_INPUT");

// (7) the ACTUAL governed ROADMAP.json + companion deps validate OK (DEPLOY after READINESS).
const real = C.checkCanonicalRoadmap(process.cwd());
ok("real governed ROADMAP.json ⇒ OK (DEPLOY_BMAX after VPS_DEPLOYMENT_READINESS)", real.verdict === "OK" && real.missions >= 10 && real.depsVersion === "roadmap-deps-v1");

console.log(`\nROADMAP-DEP-CHECK suite — ${pass} assertions passed. (dep-planner wired as a real consumer: roadmap order validated; OK/ORDER_VIOLATION/CYCLE/missing-dep; real ROADMAP OK)`);
