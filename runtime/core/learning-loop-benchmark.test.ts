#!/usr/bin/env node
"use strict";
const L = require("./learning-loop-benchmark");
let failures = 0; function check(c: any, l: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + l + "\n"); } }
const r = L.runBenchmark();
check(r.suppressedByLedger.includes("prec:net-regress"), "a net-regression precedent is SUPPRESSED");
check(r.suppressedByLedger.includes("prec:local-win-global-loss"), "a local-win/global-loss precedent is SUPPRESSED (a win on one metric is not a universal rule)");
check(!r.suppressedByLedger.includes("prec:genuine-win"), "a genuine improvement precedent is NOT suppressed (no false suppression)");
check(r.measures.regressorsMissed === 0, "no real net-regressor was missed");
check(r.measures.genuineWinsWronglySuppressed === 0, "no genuine win was wrongly suppressed");
check(r.measures.regressionsAvoided === r.measures.regressionsIfNoLedger && r.measures.regressionsAvoided > 0, "the ledger avoids ALL the control-group regressions (measured net improvement)");
check(r.measures.ledgerAgreesWithIndependent === true && r.disagreements.length === 0, "the ledger flag AGREES with an INDEPENDENT recomputation from raw deltas (genuine independent assurance)");
if (failures === 0) process.stdout.write("ALL PASS — V12.4 LEARNING-LOOP BENCHMARK\n");
process.exit(failures === 0 ? 0 : 1);
export {};
