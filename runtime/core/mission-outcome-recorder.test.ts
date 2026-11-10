#!/usr/bin/env node
"use strict";
const R = require("./mission-outcome-recorder");
const L = require("./mission-outcome-ledger");
const CAL = require("./calibration");
let failures = 0; function check(c: any, l: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + l + "\n"); } }
// (1) the canonical verdict mapping (fail-closed).
check(R.deriveOutcome({ validated: true, status: "SUCCESS" }).outcome === "SUCCESS", "validated+SUCCESS ⇒ SUCCESS");
check(R.deriveOutcome({ validated: false, status: "FAILED" }).outcome === "FAILURE", "FAILED/validated:false ⇒ FAILURE (real failures recorded)");
check(R.deriveOutcome({ status: "BLOCKED" }).outcome === "BLOCKED", "BLOCKED ⇒ BLOCKED (not a technical failure)");
check(R.deriveOutcome({ status: "WEIRD" }).outcome === "UNKNOWN", "unknown status ⇒ UNKNOWN (never a silent success)");
check(R.deriveOutcome({}).outcome === "UNKNOWN", "absent verdict ⇒ UNKNOWN");
// (2) independentlyVerified only when the governed boolean verdict decided a SUCCESS/FAILURE.
check(R.deriveOutcome({ validated: true, status: "SUCCESS" }).independentlyVerified === true, "a boolean verdict ⇒ independentlyVerified");
check(R.deriveOutcome({ status: "SUCCESS" }).independentlyVerified === false, "no validated field ⇒ not independently verified");
// (3) recordFromReport composes with the ledger; a report with no mission id is rejected.
{
  const r = R.recordFromReport([], { mission: "m1", validated: true, status: "SUCCESS" });
  check(r.ok === true && r.recorded === true && r.outcome === "SUCCESS", "records a success from a report");
  check(R.recordFromReport([], { validated: true, status: "SUCCESS" }).ok === false, "report without a mission id ⇒ rejected (fail-closed)");
}
// (4) append-only + dedup by (missionId, attempt).
{
  let s = R.recordFromReport([], { mission: "dup", validated: true, status: "SUCCESS" }, { attempt: 1 });
  s = R.recordFromReport(s.outcomes, { mission: "dup", validated: true, status: "SUCCESS" }, { attempt: 1 });
  check(s.deduped === true && s.outcomes.length === 1, "duplicate (missionId, attempt) ⇒ deduped");
}
// (5) KEY — recording from BOTH a failed and a succeeded report yields a FAILURE-inclusive sample ⇒ calibration CALIBRATED.
{
  let outs: any[] = [];
  // 15 real-shaped success verdicts + 10 real-shaped failure verdicts (clearly a fixture of governed verdicts)
  for (let i = 0; i < 15; i++) outs = R.recordFromReport(outs, { mission: "ok" + i, validated: true, status: "SUCCESS" }).outcomes;
  for (let i = 0; i < 10; i++) outs = R.recordFromReport(outs, { mission: "ko" + i, validated: false, status: "FAILED" }).outcomes;
  const sample = L.buildCalibrationSample(outs, { basis: "attempt" });
  check(sample.successes === 15 && sample.failures === 10, "failure-inclusive sample recorded from real verdict shapes (15 success / 10 failure)");
  const q = CAL.calibratedEstimate({ p: sample.successes / sample.n, observations: sample.n, successes: sample.successes, failures: sample.failures });
  check(q.quality === "CALIBRATED" && q.authorizes === false, "a verdict-derived failure-inclusive sample ⇒ CALIBRATED (bias removed), still authorizes nothing");
}
check(/governed Validation-Engine verdict.*NOT the generator/i.test(JSON.stringify(R.MISSION_OUTCOME_RECORDER_CONTRACT.invariants)), "contract: independent verdict source");
if (failures === 0) process.stdout.write("ALL PASS — V12.4 MISSION OUTCOME RECORDER\n");
process.exit(failures === 0 ? 0 : 1);
export {};
