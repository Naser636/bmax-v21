#!/usr/bin/env node
"use strict";
const assert = require("assert");
const C = require("./calibration-trust-gate");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 23 — CALIBRATION TRUST GATE (ECE)");

// well-calibrated: stated 0.9, observed ~0.9 over 40 samples ⇒ CALIBRATED / ACT.
{
  const samples = Array.from({ length: 40 }, (_, i) => ({ p: 0.9, outcome: i < 36 ? 1 : 0 }));
  const r = C.assessCalibration({ samples, maxECE: 0.05, minSamples: 20 });
  check(r.verdict === "CALIBRATED" && r.trusted === true && r.decision === "ACT", `calibrated ⇒ CALIBRATED/ACT (got ${r.verdict}, ece=${r.ece})`);
  check(r.ece <= 0.05, `ECE within target (${r.ece})`);
  check(r.selfAuthorized === false && r.grantsAuthority === false, "grants no authority (withholds trust only)");
}

// overconfident: stated 0.95 but observed ~0.5 ⇒ OVERCONFIDENT / ASK_OR_ABSTAIN.
{
  const samples = Array.from({ length: 40 }, (_, i) => ({ p: 0.95, outcome: i < 20 ? 1 : 0 }));
  const r = C.assessCalibration({ samples, maxECE: 0.05, minSamples: 20, highBand: 0.8, maxOverconfidence: 0.1 });
  check(r.verdict === "OVERCONFIDENT" && r.trusted === false && r.decision === "ASK_OR_ABSTAIN", `overconfident ⇒ OVERCONFIDENT (got ${r.verdict}, ocGap=${r.overconfidenceGap})`);
}

// miscalibrated (ECE high but not specifically high-band overconfidence): stated 0.5, observed 1.0.
{
  const samples = Array.from({ length: 40 }, () => ({ p: 0.5, outcome: 1 }));
  const r = C.assessCalibration({ samples, maxECE: 0.05, minSamples: 20, highBand: 0.8 });
  check(r.verdict === "MISCALIBRATED" && r.trusted === false, `ECE high, no high-band ⇒ MISCALIBRATED (got ${r.verdict}, ece=${r.ece})`);
}

// NO_DATA: too few samples ⇒ fail-closed, never ACT.
check(C.assessCalibration({ samples: [{ p: 0.9, outcome: 1 }], minSamples: 20 }).verdict === "NO_DATA", "few samples ⇒ NO_DATA (fail-closed)");
check(C.assessCalibration({ samples: [], minSamples: 20 }).decision === "ABSTAIN", "empty ⇒ ABSTAIN");

// UNTRUSTED: integrity-compromised calibration evidence ⇒ cannot certify, even if ECE small.
{
  const samples = Array.from({ length: 40 }, (_, i) => ({ p: 0.9, outcome: i < 36 ? 1 : 0 }));
  const r = C.assessCalibration({ samples, minSamples: 20, integritySignals: { gaming: { metric: { before: 0.5, after: 0.99 }, manipulationMarker: true } } });
  check(r.verdict === "UNTRUSTED" && r.trusted === false, `integrity DETECTED ⇒ UNTRUSTED (got ${r.verdict})`);
}

// ECE primitive: a perfectly calibrated single bin ⇒ ~0.
{
  const bins = C.overconfidenceGap; // sanity that exports exist
  check(typeof C.expectedCalibrationError === "function" && typeof bins === "function", "exports expectedCalibrationError + overconfidenceGap");
}

check(C.CALIBRATION_TRUST_CONTRACT.invariants.some((i: any) => /never acted on unproven/.test(i)), "contract: confidence never acted on unproven");

console.log(failures === 0 ? "ALL PASS — SÉRIE 23 CALIBRATION TRUST GATE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
