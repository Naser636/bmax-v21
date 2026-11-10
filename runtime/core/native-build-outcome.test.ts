#!/usr/bin/env node
"use strict";
const N = require("./native-build-outcome");
const L = require("./mission-outcome-ledger");
let failures = 0;
function check(c: any, l: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + l + "\n"); } }

const metaSpec = { name: "symbol detector", architecture: [{ path: "src/d.js", role: "analyze code symbols", contract: "parse references" }] };
const simpleSpec = { name: "calc", architecture: [{ path: "a.js" }, { path: "b.js", dependsOn: ["a.js"] }] };

// (1) accepted build ⇒ SUCCESS + independently verified; type carries strategy × complexity.
const ok = N.deriveNativeOutcome({ accepted: true, buildOk: true, verified: true }, metaSpec, "DECOMPOSED");
check(ok.outcome === "SUCCESS" && ok.independentlyVerified === true, "accepted native build ⇒ SUCCESS + independentlyVerified");
check(ok.type === "native-build:DECOMPOSED:META", "outcome type encodes strategy × complexity class");

// (2) build FAILURE is recorded as a real FAILURE (not BLOCKED) and is independently determined ⇒ verified (V36: no survivorship bias).
const failBuild = N.deriveNativeOutcome({ accepted: false, buildOk: false, verified: false }, simpleSpec, "MONOLITHIC");
check(failBuild.outcome === "FAILURE" && failBuild.independentlyVerified === true, "a native build that FAILS to build ⇒ verified FAILURE (not BLOCKED)");
const failTest = N.deriveNativeOutcome({ accepted: false, buildOk: true, verified: false }, simpleSpec, "MONOLITHIC");
check(failTest.outcome === "FAILURE" && /independent test/i.test(failTest.evidence), "built-but-failed-independent-test ⇒ verified FAILURE");

// (3) FAIL-CLOSED: an absent/malformed build result ⇒ UNKNOWN + unverified — never fabricated as SUCCESS.
check(N.deriveNativeOutcome(null, metaSpec, "DECOMPOSED").outcome === "UNKNOWN", "no build result ⇒ UNKNOWN (never SUCCESS)");
check(N.deriveNativeOutcome(null, metaSpec, "DECOMPOSED").independentlyVerified === false, "no build result ⇒ unverified");
check(N.deriveNativeOutcome({}, metaSpec, "DECOMPOSED").outcome === "UNKNOWN", "a build object with NO build/verify signal ⇒ UNKNOWN (no invented success)");

// (4) recordNativeBuild composes the EXISTING ledger (append-only, deduped by (missionId, attempt)).
let s = N.recordNativeBuild([], { accepted: true, buildOk: true, verified: true }, metaSpec, "DECOMPOSED", 1);
check(s.ok === true && s.recorded === true && s.outcomes.length === 1, "recordNativeBuild appends to the ledger");
const again = N.recordNativeBuild(s.outcomes, { accepted: true, buildOk: true, verified: true }, metaSpec, "DECOMPOSED", 1);
check(again.deduped === true && again.outcomes.length === 1, "same (missionId, attempt) ⇒ deduped (no double-count)");

// (5) reliability is measured per class × strategy, FAILURE-INCLUSIVE, over VERIFIED outcomes only.
let t = N.recordNativeBuild([], { accepted: true, buildOk: true, verified: true }, metaSpec, "DECOMPOSED", 1);
t = N.recordNativeBuild(t.outcomes, { accepted: false, buildOk: false, verified: false }, simpleSpec, "MONOLITHIC", 1);
t = N.recordNativeBuild(t.outcomes, { accepted: true, buildOk: true, verified: true }, simpleSpec, "MONOLITHIC", 2);
const rel = N.nativeReliabilityByClass(t.outcomes);
check(rel.byClass["DECOMPOSED:META"].reliability === 1 && rel.byClass["DECOMPOSED:META"].attempts === 1, "DECOMPOSED:META class measured (1/1)");
check(rel.byClass["MONOLITHIC:SIMPLE"].failures === 1 && rel.byClass["MONOLITHIC:SIMPLE"].successes === 1 && rel.byClass["MONOLITHIC:SIMPLE"].reliability === 0.5, "MONOLITHIC:SIMPLE measured failure-inclusive (1 fail + 1 ok = 0.5)");
check(rel.overall.failures === 1 && rel.overall.verifiedAttempts === 3, "overall reliability includes the recorded FAILURE (no survivorship bias)");

// (6) zero verified attempts ⇒ reliability null (never a fabricated 1.0).
const unver = N.recordNativeBuild([], null, metaSpec, "DECOMPOSED", 1);  // UNKNOWN, unverified
check(N.nativeReliabilityByClass(unver.outcomes).overall.reliability === null, "no verified attempt ⇒ reliability NOT measurable (not fabricated as 1.0)");

// (7) contract honesty: records SUCCESS and FAILURE; builds/verifies/authorizes nothing anew.
check(/survivorship/i.test(JSON.stringify(N.NATIVE_BUILD_OUTCOME_CONTRACT.invariants)) && /authorizes nothing/i.test(N.NATIVE_BUILD_OUTCOME_CONTRACT.notAuthority), "contract: failure-inclusive, authorizes nothing");

// cross-check: the ledger's own calibration sample agrees (verified-only, failure-inclusive).
const sample = L.buildCalibrationSample(t.outcomes, { basis: "attempt" });
check(sample.successes === 2 && sample.failures === 1, "ledger calibration sample agrees: 2 successes, 1 failure");

if (failures === 0) process.stdout.write("ALL PASS — V12.4 NATIVE BUILD OUTCOME RACCORDEMENT\n");
process.exit(failures === 0 ? 0 : 1);

export {};
