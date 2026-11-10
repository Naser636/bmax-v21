#!/usr/bin/env node
"use strict";
const R = require("./native-engineering-readiness");
const NBO = require("./native-build-outcome");
let failures = 0;
function check(c: any, l: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + l + "\n"); } }

const metaSpec = { name: "symbol detector", architecture: [{ path: "src/d.js", role: "analyze code symbols", contract: "parse references" }] };
// metaSpec ⇒ chooseStrategy = DECOMPOSED, class = DECOMPOSED:META. Record outcomes with that same strategy.
function record(nSuccess: number, nFail: number): any {
  let outs: any = [];
  let attempt = 1;
  for (let k = 0; k < nSuccess; k++) outs = NBO.recordNativeBuild(outs, { accepted: true, buildOk: true, verified: true }, metaSpec, "DECOMPOSED", attempt++).outcomes;
  for (let k = 0; k < nFail; k++) outs = NBO.recordNativeBuild(outs, { accepted: false, buildOk: false, verified: false }, metaSpec, "DECOMPOSED", attempt++).outcomes;
  return outs;
}

// (1) COLD START — no evidence ⇒ INSUFFICIENT_DATA ⇒ DEFER to provider (fail-closed; autonomy is earned not claimed).
const cold = R.assessReadiness(metaSpec, []);
check(cold.verdict === "INSUFFICIENT_DATA" && cold.recommendProvider === true, "cold start (no evidence) ⇒ INSUFFICIENT_DATA ⇒ DEFER to provider");
check(cold.class === "DECOMPOSED:META", "readiness is per strategy × complexity class");
check(R.shouldAttemptNative(metaSpec, []) === false, "shouldAttemptNative is false by default (fail-closed)");

// (2) a FEW attempts (< MIN_OBSERVATIONS) ⇒ DEGRADED ⇒ still INSUFFICIENT_DATA ⇒ DEFER (not enough demonstrated).
const few = R.assessReadiness(metaSpec, record(4, 1));
check(few.verdict === "INSUFFICIENT_DATA" && few.quality === "DEGRADED", "a small sample (5<20) ⇒ DEGRADED ⇒ INSUFFICIENT_DATA ⇒ DEFER");

// (3) SELECTION-BIASED — many successes, ZERO recorded failures ⇒ DEFER (not stress-tested; reuses the calibration bias guard).
const biased = R.assessReadiness(metaSpec, record(12, 0));
check(biased.quality === "BIASED" && biased.verdict === "DEFER_TO_PROVIDER", "observed-but-no-failures ⇒ BIASED ⇒ DEFER (survivorship bias)");
check(R.shouldAttemptNative(metaSpec, record(12, 0)) === false, "a biased 100% reliability does NOT earn a native attempt");

// (4) CALIBRATED + reliability ≥ threshold ⇒ ATTEMPT_NATIVE (native autonomy EARNED by demonstrated, failure-inclusive evidence).
const strong = R.assessReadiness(metaSpec, record(18, 2));   // 20 verified attempts, reliability 0.9, 2 failures recorded
check(strong.quality === "CALIBRATED" && strong.reliability === 0.9 && strong.verifiedAttempts === 20, "20 verified attempts with recorded failures ⇒ CALIBRATED reliability 0.9");
check(strong.verdict === "ATTEMPT_NATIVE" && strong.recommendProvider === false, "CALIBRATED reliability ≥ 0.8 ⇒ ATTEMPT_NATIVE (provider not needed)");
check(R.shouldAttemptNative(metaSpec, record(18, 2)) === true, "shouldAttemptNative true only when native autonomy is demonstrated");

// (5) CALIBRATED but BELOW threshold ⇒ DEFER (do not attempt below demonstrated competence).
const weak = R.assessReadiness(metaSpec, record(10, 10));    // 20 attempts, reliability 0.5
check(weak.quality === "CALIBRATED" && weak.reliability === 0.5 && weak.verdict === "DEFER_TO_PROVIDER", "CALIBRATED but reliability 0.5 < 0.8 ⇒ DEFER");

// (6) threshold is configurable (a policy param, not a proof) — same evidence, stricter bar ⇒ DEFER.
check(R.assessReadiness(metaSpec, record(18, 2), { reliabilityThreshold: 0.95 }).verdict === "DEFER_TO_PROVIDER", "a stricter threshold (0.95) ⇒ the same 0.9 evidence DEFERS");

// (7) contract honesty.
check(/EARNED, not claimed/i.test(JSON.stringify(R.NATIVE_ENGINEERING_READINESS_CONTRACT.invariants)) && /authorizes nothing/i.test(R.NATIVE_ENGINEERING_READINESS_CONTRACT.notAuthority), "contract: native autonomy earned, authorizes nothing");

if (failures === 0) process.stdout.write("ALL PASS — V12.4 NATIVE ENGINEERING READINESS\n");
process.exit(failures === 0 ? 0 : 1);

export {};
