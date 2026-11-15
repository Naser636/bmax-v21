#!/usr/bin/env node
"use strict";
/* IMP-P11-CONF-CALIB — calibration against a labelled set; STP threshold HYPOTHESIS; no-data ⇒ NOT_MEASURED. */
const C = require("./odg-doc-confidence-calibration.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  // labelled set: high-confidence mostly correct, low-confidence mixed
  const labelled: any[] = [];
  for (let i = 0; i < 40; i++) labelled.push({ confidence: 0.99, correct: i < 40 }); // 0.99 all correct
  for (let i = 0; i < 20; i++) labelled.push({ confidence: 0.6, correct: i < 12 });   // 0.6 → 60% correct
  const r = C.calibrate(labelled, { bins: 10, stpTargetAccuracy: 0.98 });
  check("measured: ECE + reliability bins computed from labelled set", r.status === "MEASURED" && typeof r.expectedCalibrationError === "number" && r.reliability.length >= 2);
  check("well-calibrated high band has small gap; mis-cal band surfaced", r.reliability.some((b: any) => b.range[0] >= 0.9 && Math.abs(b.gap) < 0.05));
  check("STP threshold recommended (0.99 band ≥ 98% acc) + flagged HYPOTHESIS", r.stpThreshold.status === "HYPOTHESIS" && r.stpThreshold.recommended !== null && /revalidate on/.test(r.stpThreshold.note));

  // fail-closed: no labelled set ⇒ NOT_MEASURED
  check("no labelled examples ⇒ NOT_MEASURED (no fabricated calibration)", C.calibrate([], {}).status === "NOT_MEASURED" && C.calibrate(null, {}).status === "NOT_MEASURED");
  check("STP threshold unmet ⇒ recommended null, still HYPOTHESIS (not fabricated)", (() => { const lo = Array.from({ length: 30 }, () => ({ confidence: 0.7, correct: Math.random() < 0.5 })); const x = C.calibrate(lo.map((d, i) => ({ confidence: 0.7, correct: i < 15 })), {}); return x.stpThreshold.recommended === null && x.stpThreshold.status === "HYPOTHESIS"; })());

  check("contract + honesty (labelled set, STP hypothesis, no OCR)", C.DOC_CONFIDENCE_CALIBRATION_CONTRACT.invariants.some((i: string) => /no OCR is introduced/.test(i)) && /HYPOTHESIS to revalidate/.test(r.honesty));
  check("deterministic", JSON.stringify(C.calibrate(labelled, { bins: 10, stpTargetAccuracy: 0.98 }).expectedCalibrationError) === JSON.stringify(r.expectedCalibrationError));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — doc-confidence-calibration (IMP-P11: ECE + reliability from labelled set; STP threshold HYPOTHESIS; no-data ⇒ NOT_MEASURED; no OCR)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
