#!/usr/bin/env node
"use strict";

const C = require("./customer-outcome-intelligence");

let failures = 0;
function check(c: any, label: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + label + "\n"); } }

// §34: a SIMULATED improvement is NEVER a real client gain (capped OBSERVED, real=false, value=null) — even if "verified".
const sim = C.measureOutcome({ source: "SIMULATED", baseline: { timeCost: 100, metric: 0.6 }, after: { timeCost: 30, metric: 0.95 }, outcomeContract: { target: 0.9 }, independentlyVerified: true, controlComparison: true, robustMethod: true });
check(sim.real === false && sim.attribution === "OBSERVED" && sim.valueCreated === null, "SIMULATED ⇒ real=false, capped OBSERVED, value=null (never a real client gain)");

// missing baseline/after ⇒ NOT_DEMONSTRATED.
check(C.measureOutcome({ source: "REAL", after: { metric: 1 } }).attribution === "NOT_DEMONSTRATED", "no baseline ⇒ NOT_DEMONSTRATED");
check(C.measureOutcome({ source: "REAL", baseline: { metric: 0 } }).attribution === "NOT_DEMONSTRATED", "no after ⇒ NOT_DEMONSTRATED");

// REAL, target met, no errors, independent + control ⇒ PROBABLY_ATTRIBUTABLE with a real value.
const good = C.measureOutcome({ source: "REAL", baseline: { timeCost: 100, moneyCost: 50, metric: 0.6 }, after: { timeCost: 30, moneyCost: 20, metric: 0.95 }, outcomeContract: { target: 0.9 }, independentlyVerified: true, controlComparison: true });
check(good.real === true && good.solved === true && good.attribution === "PROBABLY_ATTRIBUTABLE" && good.valueCreated === 100, "REAL + verified + control ⇒ PROBABLY_ATTRIBUTABLE, value=100");

// robust method raises to ROBUSTLY_ATTRIBUTABLE (the strongest).
const robust = C.measureOutcome({ source: "REAL", baseline: { timeCost: 100, metric: 0.6 }, after: { timeCost: 30, metric: 0.95 }, outcomeContract: { target: 0.9 }, independentlyVerified: true, controlComparison: true, robustMethod: true });
check(robust.attribution === "ROBUSTLY_ATTRIBUTABLE", "REAL + verified + control + robust ⇒ ROBUSTLY_ATTRIBUTABLE");

// NO independent verification ⇒ cannot exceed OBSERVED (even if real + target met).
const unver = C.measureOutcome({ source: "REAL", baseline: { timeCost: 100, metric: 0.6 }, after: { timeCost: 30, metric: 0.95 }, outcomeContract: { target: 0.9 } });
check(unver.attribution === "OBSERVED", "REAL but not independently verified ⇒ capped at OBSERVED");

// an introduced regression caps attribution at OBSERVED and marks not solved.
const reg = C.measureOutcome({ source: "REAL", baseline: { timeCost: 100, metric: 0.6 }, after: { timeCost: 30, metric: 0.95 }, outcomeContract: { target: 0.9 }, independentlyVerified: true, controlComparison: true, errorsIntroduced: 2 });
check(reg.solved === false && reg.attribution === "OBSERVED", "introduced regression ⇒ not solved, capped OBSERVED");

// unmet target ⇒ not solved.
const unmet = C.measureOutcome({ source: "REAL", baseline: { metric: 0.6, timeCost: 10 }, after: { metric: 0.7, timeCost: 10 }, outcomeContract: { target: 0.9 }, independentlyVerified: true });
check(unmet.solved === false, "target not met ⇒ not solved");

// value model: net gain = time saved + cost saved − cost added.
const val = C.measureOutcome({ source: "REAL", baseline: { timeCost: 100, moneyCost: 40, metric: 1 }, after: { timeCost: 60, moneyCost: 30, metric: 1 }, outcomeContract: { target: 0.5 }, costAdded: 15, independentlyVerified: true });
check(val.gainNet === 100 - 60 + (40 - 30) - 15, "value model: net = timeSaved(40) + costSaved(10) − costAdded(15) = 35");

// default source is SIMULATED (safe).
check(C.measureOutcome({ baseline: { metric: 0, timeCost: 10 }, after: { metric: 1, timeCost: 5 }, outcomeContract: { target: 0.5 } }).real === false, "default source SIMULATED ⇒ real=false (safe)");

// contract invariants.
check(/SIMULATED improvement is NEVER presented as a real client gain/i.test(JSON.stringify(C.CUSTOMER_OUTCOME_CONTRACT.invariants)), "contract: simulated never a real gain");
check(/tasks\/files\/tests executed are NOT an outcome/i.test(JSON.stringify(C.CUSTOMER_OUTCOME_CONTRACT.invariants)), "contract: activity ≠ outcome");

if (failures === 0) process.stdout.write("ALL PASS — V12.4 CUSTOMER OUTCOME INTELLIGENCE\n");
process.exit(failures === 0 ? 0 : 1);

export {};
