#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Locks the engine-behaviour baseline scorecard: every scenario maps to a primitive and
// PASSES against the real campaign-controller (resume, no-repeat, dep-regression invalidation, independent-selection-
// under-block, stale-evidence reconcile, strategy-change re-admit, no-false-accept, cycle-safe, reconcile-after-mission).
"use strict";
const assert = require("assert");
const B = require("./engine-benchmark.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const r = B.runEngineBenchmark();

// (1) the baseline is fully green — all engine guarantees hold on the current controller.
ok(`engine baseline: all ${r.total} scenarios pass`, r.allPass === true && r.passed === r.total && r.total >= 9);

// (2) each scenario is present, maps to a primitive, and reports a detail (reproducible scorecard).
for (const s of r.scorecard) {
  ok(`scenario ${s.id} [${s.primitive}] pass + detail`, s.pass === true && /STATE|CONTRACT|POLICY|RESOLVER|EXECUTOR|EVIDENCE|RECOVERY|ALLOCATOR|IDENTITY/.test(s.primitive) && typeof s.detail === "string" && s.detail.length > 0 && s.error === null);
}

// (3) the key hard guarantees are individually represented (no silent dropping of a scenario).
const ids = new Set(r.scorecard.map((s) => s.id));
for (const must of ["resume-after-interruption", "dedup-no-repeat", "dependency-regression-invalidation", "independent-selection-under-block", "no-false-accept", "cycle-safe"]) {
  ok(`benchmark covers '${must}'`, ids.has(must));
}

// (4) deterministic: two runs produce the identical scorecard (no clock/random).
const r2 = B.runEngineBenchmark();
ok("benchmark is deterministic (identical scorecard across runs)", JSON.stringify(r.scorecard) === JSON.stringify(r2.scorecard));

// (5) honest framing: no unmeasured improvement claim embedded.
ok("baseline note makes no unmeasured improvement claim", /no unmeasured improvement claimed/i.test(r.note));

console.log(`\nENGINE-BENCHMARK suite — ${pass} assertions passed. (reproducible baseline scorecard; ${r.passed}/${r.total} engine guarantees; deterministic; honest)`);
