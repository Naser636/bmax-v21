#!/usr/bin/env node
"use strict";
const L = require("./mission-outcome-ledger");
const CAL = require("./calibration");
let failures = 0; function check(c: any, l: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + l + "\n"); } }
function ledger(entries: any[]) { let s: any = { outcomes: [] }; for (const e of entries) s = L.recordOutcome(s.outcomes, e); return s.outcomes; }
// (1) verified success + verified failure both count.
{
  const s = L.buildCalibrationSample(ledger([{ missionId: "a", outcome: "SUCCESS", independentlyVerified: true }, { missionId: "b", outcome: "FAILURE", independentlyVerified: true }]));
  check(s.successes === 1 && s.failures === 1, "verified success + verified failure both counted");
}
// (2) failure then retry success — attempt basis keeps BOTH; mission basis uses the final (success).
{
  const outs = ledger([{ missionId: "m", attempt: 1, outcome: "FAILURE", independentlyVerified: true }, { missionId: "m", attempt: 2, outcome: "SUCCESS", independentlyVerified: true }]);
  const att = L.buildCalibrationSample(outs, { basis: "attempt" });
  const mis = L.buildCalibrationSample(outs, { basis: "mission" });
  check(att.successes === 1 && att.failures === 1, "attempt basis keeps BOTH the failure and the later success");
  check(mis.successes === 1 && mis.failures === 0, "mission basis uses the FINAL verified outcome (success)");
}
// (3) POLICY-blocked is NOT a technical failure (censored).
{
  const s = L.buildCalibrationSample(ledger([{ missionId: "p", outcome: "BLOCKED" }]));
  check(s.failures === 0 && s.censored === 1, "BLOCKED(policy) ⇒ censored, NOT counted as a failure");
}
// (4) never-executed (CANCELLED/DEFERRED) ⇒ censored, not a failure.
{
  const s = L.buildCalibrationSample(ledger([{ missionId: "c", outcome: "CANCELLED" }, { missionId: "d", outcome: "DEFERRED" }]));
  check(s.failures === 0 && s.censored === 2, "CANCELLED/DEFERRED ⇒ censored (not executed, not a failure)");
}
// (5) UNKNOWN ⇒ censored; unverified success/failure ⇒ EXCLUDED (not reliable).
{
  const s = L.buildCalibrationSample(ledger([{ missionId: "u", outcome: "UNKNOWN" }, { missionId: "x", outcome: "SUCCESS", independentlyVerified: false }]));
  check(s.successes === 0 && s.failures === 0 && s.unverified === 1, "unknown + unverified ⇒ excluded (no artificial confidence)");
}
// (6) duplicate (missionId, attempt) ⇒ deduped; malformed ⇒ rejected.
{
  let st = L.recordOutcome([], { missionId: "z", attempt: 1, outcome: "SUCCESS", independentlyVerified: true });
  st = L.recordOutcome(st.outcomes, { missionId: "z", attempt: 1, outcome: "SUCCESS", independentlyVerified: true });
  check(st.deduped === true && st.outcomes.length === 1, "duplicate (missionId,attempt) ⇒ deduped");
  check(L.recordOutcome([], { outcome: "SUCCESS" }).ok === false, "malformed (no missionId) ⇒ rejected, not stored");
  check(L.recordOutcome([], { missionId: "q", outcome: "WEIRD" }).ok === false, "unknown outcome ⇒ rejected");
}
// (7) §7 PROGRESS: a FAILURE-inclusive sample moves calibration from BIASED (V34) to a usable quality.
{
  // V34 state: 20 successes, 0 failures ⇒ BIASED.
  const biased = CAL.calibratedEstimate({ p: 1.0, observations: 20, successes: 20, failures: 0 });
  // V35 state: a sample that NOW includes verified failures.
  const withFailures = L.buildCalibrationSample(ledger(Array.from({ length: 40 }, (_, i) => ({ missionId: "s" + i, outcome: i < 30 ? "SUCCESS" : "FAILURE", independentlyVerified: true }))));
  const now = CAL.calibratedEstimate({ p: withFailures.successes / withFailures.n, observations: withFailures.n, successes: withFailures.successes, failures: withFailures.failures });
  check(biased.quality === "BIASED", "V34 all-success sample ⇒ BIASED");
  check(now.quality === "CALIBRATED" && withFailures.failures > 0, "V35 failure-inclusive verified sample ⇒ CALIBRATED (bias removed)");
  check(now.authorizes === false, "even a CALIBRATED estimate never authorizes a mission");
}
check(/BLOCKED\(policy\).*NOT technical failures|keeps BOTH events/i.test(JSON.stringify(L.MISSION_OUTCOME_LEDGER_CONTRACT.invariants)), "contract: distinct outcome kinds");
if (failures === 0) process.stdout.write("ALL PASS — V12.4 MISSION OUTCOME LEDGER\n");
process.exit(failures === 0 ? 0 : 1);
export {};
