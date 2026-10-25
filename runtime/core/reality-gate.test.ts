#!/usr/bin/env node
// @ts-nocheck — runtime/core test convention: runs under tsx; strict typing enforced by the strict tsconfig.
"use strict";
/* ODG5 promotion — reality-gate. Proves the gate REJECTS false claims (amendment §6). Run: tsx runtime/core/reality-gate.test.ts */
const { gate, assertComplete, classify } = require("./reality-gate");
let failures = 0;
function check(cond, label) { if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); } }

const SOURCE = { sourceInspected: true, files: ["x.ts"] };
const TESTED = { ...SOURCE, testRun: true, exitCode: 0 };
const INTEGRATED = { ...TESTED, integrationRun: true, integrationExitCode: 0 };
const DEPLOYED = { ...INTEGRATED, deployRecord: "rec", deployedVersion: "v1", intendedVersion: "v1" };
const RUNNING = { ...DEPLOYED, serviceHealthy: true, smokeTestPassed: true };
const ACCEPTED = { ...RUNNING, acceptanceCriteria: [{ id: "c1", met: true }], independentChecksPassed: true, negativeTestsPassed: true };

console.log("ODG5 — REALITY-GATE (TS)");
check(gate("TEST_VERIFIED", { ...SOURCE, reportOnly: true }).granted === false, "§6.1 report-only cannot reach TEST");
check(gate("TEST_VERIFIED", { ...SOURCE, testRun: true, skipped: true, exitCode: 0 }).granted === false, "§6.2a skipped denied");
check(gate("TEST_VERIFIED", { ...SOURCE, testRun: true, exitCode: 1 }).granted === false, "§6.2b non-zero exit denied");
check(gate("TEST_VERIFIED", { ...SOURCE, testRun: true, exitCode: 0, dependencyFailed: true }).granted === false, "§6.2c dependency-failed denied");
let g = gate("DEPLOYMENT_VERIFIED", INTEGRATED);
check(g.granted === false && g.awarded === "INTEGRATION_VERIFIED", "§6.3 local success is NOT deployment");
g = gate("RUNTIME_VERIFIED", { ...DEPLOYED, serviceHealthy: true });
check(g.granted === false && g.awarded === "DEPLOYMENT_VERIFIED", "§6.4 deployment is NOT runtime without smoke");
check(gate("DEPLOYMENT_VERIFIED", { ...INTEGRATED, deployRecord: "r", deployedVersion: "v0", intendedVersion: "v1" }).granted === false, "§6.5 version mismatch blocks deployment");
check(gate("TEST_VERIFIED", { ...TESTED, contradiction: true }).blocked === true, "§6.6a contradictory => BLOCKED");
check(classify({}).state === "NOT_VERIFIED", "§6.6b no evidence => NOT_VERIFIED");
check(assertComplete({ ...RUNNING, acceptanceCriteria: [{ id: "c1", met: false }], independentChecksPassed: true, negativeTestsPassed: true }).complete === false, "§6.7a unmet acceptance rejects completion");
check(assertComplete({ ...RUNNING, acceptanceCriteria: [{ id: "c1", met: true }], independentChecksPassed: true, negativeTestsPassed: false }).complete === false, "§6.7b no negative tests rejects completion");
check(assertComplete(ACCEPTED).complete === true, "positive: full evidence => ACCEPTANCE_VERIFIED");
check(classify(TESTED).state === "TEST_VERIFIED" && classify(DEPLOYED).state === "DEPLOYMENT_VERIFIED" && classify(RUNNING).state === "RUNTIME_VERIFIED", "classify returns highest evidenced rung");
check(gate("TEST_VERIFIED", SOURCE).granted === false && gate("SOURCE_VERIFIED", SOURCE).granted === true, "SOURCE alone never awards TEST");

console.log(failures ? `FAIL (${failures})` : "OK");
if (failures) process.exit(1);
