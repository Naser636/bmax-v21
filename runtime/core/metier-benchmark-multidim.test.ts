#!/usr/bin/env node
"use strict";
const assert = require("assert");
const B = require("./metier-benchmark-multidim");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 16 Step-2 — MULTIDIMENSIONAL MÉTIER BENCHMARK");

const s = B.runMultidim();

// all three dimensions measured over 10 métiers.
check(s.total === 10, "10 métiers across 3 dimensions");

// DETECTION: every métier catches its planted adversarial case (no false negative).
check(s.detectionRate === 1 && s.falseNegatives.length === 0, "detectionRate 1.0, 0 false negatives");

// SPECIFICITY: every métier ACCEPTS its benign case (no false positive) — a block-everything guard would fail here.
check(s.specificityRate === 1 && s.falsePositives.length === 0, "specificityRate 1.0, 0 false positives (not a block-everything detector)");

// ROBUSTNESS: malformed input handled without crash.
check(s.robustnessRate === 1 && s.crashes.length === 0, "robustnessRate 1.0, 0 crashes on malformed input");

// EFFECTIVE = detection ∧ specificity.
check(s.effectiveRate === 1, "effectiveRate 1.0 (every métier catches bad AND passes good)");

// reproducible across two runs.
check(s.reproducible === true, "all scenarios reproducible");

// each métier row carries the four flags.
for (const m of ["P1", "P2", "P3", "P4", "P6", "P7", "P8", "P9", "P12", "P15"]) {
  const row = s.results.find((r: any) => r.metier === m);
  check(row && row.detected && row.specific && row.robust && row.effective, `${m}: detected + specific + robust + effective`);
}

check(B.METIER_MULTIDIM_CONTRACT.invariants.some((i: any) => /DETECTION ∧ SPECIFICITY/.test(i)), "contract documents EFFECTIVE = detection ∧ specificity");

console.log(failures === 0 ? "ALL PASS — SÉRIE 16 Step-2 MULTIDIM BENCHMARK" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
