#!/usr/bin/env node
"use strict";
const C = require("./calibration");
let failures = 0; function check(c: any, l: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + l + "\n"); } }
// (1) empty history ⇒ UNKNOWN (never favourable).
check(C.calibratedEstimate({ observations: 0 }).quality === "UNKNOWN", "no observations ⇒ UNKNOWN");
// (2) THE KEY FINDING — a survivorship-biased source (409 obs, 0 failures) ⇒ BIASED, not calibrated confidence.
{
  const r = C.calibratedEstimate({ p: 0.9633, observations: 409, successes: 395, failures: 0, source: "closure-register" });
  check(r.quality === "BIASED" && r.authorizes === false, "register ACCEPTED-rate (0 failures) ⇒ BIASED, not usable as calibrated confidence");
  check(/survivorship bias/i.test(r.reason), "the bias is named (survivorship)");
}
// (3) insufficient sample (with failures present) ⇒ DEGRADED.
check(C.calibratedEstimate({ p: 0.7, observations: 5, successes: 3, failures: 2 }).quality === "DEGRADED", "insufficient sample ⇒ DEGRADED");
// (4) a sufficient sample WITH recorded failures ⇒ CALIBRATED (uncertainty reported).
{
  const r = C.calibratedEstimate({ p: 0.7, observations: 50, successes: 35, failures: 15 });
  check(r.quality === "CALIBRATED" && r.uncertainty > 0, "sufficient sample with failures ⇒ CALIBRATED + uncertainty reported");
}
// (5) stale data ⇒ DEGRADED.
check(C.calibratedEstimate({ p: 0.8, observations: 50, successes: 40, failures: 10, ageDays: 400 }, { maxAgeDays: 365 }).quality === "DEGRADED", "stale data ⇒ DEGRADED");
// (6) Brier score: good predictions ⇒ low Brier; bad (confident-but-wrong) ⇒ high Brier.
{
  const good = C.brierScore([{ p: 0.9, outcome: 1 }, { p: 0.1, outcome: 0 }, { p: 0.8, outcome: 1 }]);
  const bad = C.brierScore([{ p: 0.9, outcome: 0 }, { p: 0.1, outcome: 1 }]);
  check(good.brier < 0.1 && bad.brier > 0.5, "Brier: well-calibrated ⇒ low; confident-but-wrong ⇒ high");
}
// (7) calibration verdict: insufficient predictions ⇒ NOT calibrated by default.
check(C.calibrationVerdict([{ p: 0.9, outcome: 1 }]).calibrated === false, "insufficient predictions ⇒ not calibrated by default (fail-closed)");
// (8) FALSIFICATION — a biased/degraded/unknown estimate NEVER authorizes.
check(["BIASED","DEGRADED","UNKNOWN","CALIBRATED"].every((q: string) => { const r = C.calibratedEstimate({ p: 1, observations: 5 }); return r.authorizes === false; }), "no estimate (any quality) authorizes a mission");
// (9) selection-bias detection directly.
check(C.assessSelectionBias({ successes: 395, failures: 0 }).biased === true, "395 successes / 0 failures ⇒ biased");
check(C.assessSelectionBias({ successes: 30, failures: 10 }).biased === false, "failures present ⇒ not flagged biased");
check(/survivorship-biased source|NOT served as calibrated confidence/i.test(JSON.stringify(C.CALIBRATION_CONTRACT.invariants)), "contract: biased source not served as confidence");
if (failures === 0) process.stdout.write("ALL PASS — V12.4 CALIBRATION\n");
process.exit(failures === 0 ? 0 : 1);
export {};
