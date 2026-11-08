#!/usr/bin/env node
"use strict";
const assert = require("assert");
const B = require("./metier-benchmark-suite");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 15 Step-4 — TRANSVERSAL MÉTIER BENCHMARK");

const s = B.runSuite();

// every métier catches its planted adversarial case (detection effectiveness, not self-tests).
check(s.total === 10, "10 métier improvements benchmarked");
check(s.detected === 10 && s.detectionRate === 1 && s.misses.length === 0, "all 10 CATCH their planted adversarial case (detectionRate 1.0, no miss)");

// results are reproducible (each probe run twice ⇒ identical verdict).
check(s.reproducible === true && s.reproducibleCount === 10, "all 10 reproducible (same input ⇒ identical verdict)");

// each named métier is present with a boolean detected flag.
for (const m of ["P1", "P2", "P3", "P4", "P6", "P7", "P8", "P9", "P12", "P15"]) {
  const row = s.results.find((r: any) => r.metier === m);
  check(row && row.detected === true, `${m} caught its planted case`);
}

check(B.METIER_BENCHMARK_CONTRACT.invariants.some((i: any) => /not by passing its own tests/.test(i)), "contract documents detection-not-self-tests");

console.log(failures === 0 ? "ALL PASS — SÉRIE 15 Step-4 MÉTIER BENCHMARK" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
