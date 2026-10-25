#!/usr/bin/env node
// @ts-nocheck — runtime/core test convention: runs under tsx; type-checking of the SUT is done by the strict tsconfig.
"use strict";
/* ODG5 promotion — eval-metrics (confusion matrix + calibration). Run: tsx runtime/core/eval-metrics.test.ts */
const M = require("./eval-metrics");
let failures = 0;
function check(cond, label) { if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); } }

console.log("ODG5 — EVAL-METRICS (TS)");
let m = M.confusionMatrix([{ k: "a" }, { k: "b" }], [{ k: "a" }, { k: "b" }], (x) => x.k);
check(m.TP === 2 && m.FP === 0 && m.FN === 0 && m.precision === 1 && m.recall === 1 && m.f1 === 1, "perfect match => P=R=F1=1");
m = M.confusionMatrix([{ k: "a" }, { k: "x" }], [{ k: "a" }], (x) => x.k);
check(m.TP === 1 && m.FP === 1 && m.precision === 0.5 && m.recall === 1 && m.falsePositives[0] === "x", "false positive lowers precision");
m = M.confusionMatrix([{ k: "a" }], [{ k: "a" }, { k: "z" }], (x) => x.k);
check(m.FN === 1 && m.recall === 0.5 && m.falseNegatives[0] === "z", "false negative lowers recall");
m = M.confusionMatrix([], [], (x) => x.k);
check(m.precision === null && m.recall === null && m.f1 === null, "zero denominator => null not fake 1.0");
check(M.brierScore([{ p: 1, outcome: 1 }, { p: 0, outcome: 0 }]) === 0, "brier perfect => 0");
check(M.brierScore([{ p: 1, outcome: 0 }]) === 1 && M.brierScore([]) === null, "brier wrong =>1; empty=>null");
const bins = M.reliabilityBins([{ p: 0.95, outcome: 1 }, { p: 0.95, outcome: 0 }], 10);
check(bins[9].n === 2 && bins[9].meanPredicted === 0.95 && bins[9].observed === 0.5, "reliability bin mean vs observed");

console.log(failures ? `FAIL (${failures})` : "OK");
if (failures) process.exit(1);
