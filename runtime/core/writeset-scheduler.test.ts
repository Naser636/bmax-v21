#!/usr/bin/env node
"use strict";

/*
 * WI-WSCONF-12 — writeset-scheduler. Locks: write-set overlap (equal + ancestor-prefix), conflict listing,
 * refinement of dep-planner layers so same sub-layer is write-set-disjoint, dependency ordering preserved,
 * fail-closed on cycle, determinism. Pure (no I/O). Run: node_modules/.bin/tsx runtime/core/writeset-scheduler.test.ts
 */
const assert = require("assert");
const W = require("./writeset-scheduler");

let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }

console.log("WI-WSCONF-12 — WRITE-SET-SAFE SCHEDULER");

// path overlap semantics
check(W.pathConflict("runtime/core/x.ts", "runtime/core/x.ts") === true, "equal paths conflict");
check(W.pathConflict("runtime", "runtime/core/x.ts") === true, "ancestor dir conflicts with file under it");
check(W.pathConflict("runtime/core/x.ts", "runtime/core/y.ts") === false, "sibling files do NOT conflict");
check(W.writeSetsOverlap(["a/b.ts"], ["a/c.ts"]) === false && W.writeSetsOverlap(["a/b.ts"], ["a"]) === true, "writeSetsOverlap uses prefix semantics");

// NO dependency relation but OVERLAPPING write-sets ⇒ must be SPLIT into successive sub-layers (the §79 fix)
{
  const items = [
    { id: "m1", writeSet: ["runtime/core/shared.ts"] },
    { id: "m2", writeSet: ["runtime/core/shared.ts"] }, // conflicts with m1, no dep ⇒ dep-planner would parallelise (unsafe)
    { id: "m3", writeSet: ["runtime/core/other.ts"] },  // disjoint ⇒ may parallelise with one of them
  ];
  const cf = W.conflicts(items);
  check(cf.length === 1 && cf[0].a === "m1" && cf[0].b === "m2", "conflicts(): exactly the m1/m2 overlap");
  const layers = W.safeLayers(items);
  // m1 & m2 must NOT be in the same sub-layer; m3 may share with the first.
  const layerOf = (id: string) => layers.findIndex((l: any) => l.includes(id));
  check(layerOf("m1") !== layerOf("m2"), "m1 and m2 placed in DIFFERENT sub-layers (no concurrent write to shared.ts)");
  check(layers.every((l: any) => { for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) if (W.writeSetsOverlap((items.find((x: any) => x.id === l[i]) as any).writeSet, (items.find((x: any) => x.id === l[j]) as any).writeSet)) return false; return true; }), "every sub-layer is write-set-disjoint");
}

// dependency ordering preserved AND write-set disjointness combined
{
  const items = [
    { id: "a", writeSet: ["p/a.ts"] },
    { id: "b", deps: ["a"], writeSet: ["p/b.ts"] },
    { id: "c", writeSet: ["p/a.ts"] }, // conflicts with a, no dep
  ];
  const layers = W.safeLayers(items);
  const li = (id: string) => layers.findIndex((l: any) => l.includes(id));
  check(li("b") > li("a"), "dependency: b after a");
  check(li("c") !== li("a"), "c (write-set conflict with a) not parallel with a");
}

// disjoint independent items ⇒ one parallel layer
{
  const items = [{ id: "x", writeSet: ["x.ts"] }, { id: "y", writeSet: ["y.ts"] }, { id: "z", writeSet: ["z.ts"] }];
  const p = W.plan(items);
  check(p.layers.length === 1 && p.layers[0].length === 3 && p.parallelWidth === 3 && p.conflicts.length === 0, "fully disjoint independent items ⇒ one 3-wide parallel layer, 0 conflicts");
}

// fail-closed on cycle (via dep-planner) + empty + determinism
check((() => { try { W.safeLayers([{ id: "a", deps: ["b"] }, { id: "b", deps: ["a"] }]); return false; } catch { return true; } })(), "dependency cycle ⇒ throws (fail-closed)");
check(JSON.stringify(W.plan([])) === JSON.stringify(W.plan([])) && W.plan([]).layers.length === 0, "empty ⇒ empty plan, deterministic");
check(JSON.stringify(W.plan([{ id: "a", writeSet: ["a"] }, { id: "b", writeSet: ["a"] }])) === JSON.stringify(W.plan([{ id: "a", writeSet: ["a"] }, { id: "b", writeSet: ["a"] }])), "deterministic plan");

console.log(failures === 0 ? "ALL PASS — WI-WSCONF-12 WRITE-SET-SAFE SCHEDULER" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

// Module-scope marker (TS2451/TS2588 guard).
export {};
