#!/usr/bin/env node
"use strict";
/* Tests for odg-native-learning-pass (V360 §7/§18). Runs the EXISTING learning-loop over native-build-outcome records:
 * recurring REAL same-class failures ⇒ consolidated lessons; SIMULATED excluded; UNKNOWN censored; no metric ⇒ measured:false. */
const P = require("./odg-native-learning-pass.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const rec = (missionId: string, type: string, outcome: string, verified = true) => ({ missionId, type, outcome, independentlyVerified: verified, evidence: `native ${outcome} of ${type}` });

function main(): void {
  const outcomes = [
    rec("m1", "native-build:MONOLITHIC:COMPLEX", "FAILURE"),
    rec("m2", "native-build:MONOLITHIC:COMPLEX", "FAILURE"),   // 2nd same-class REAL failure ⇒ recurring ⇒ lesson
    rec("m3", "native-build:MONOLITHIC:TRIVIAL", "SUCCESS"),
    rec("m4", "native-build:MONOLITHIC:COMPLEX", "FAILURE", false), // SIMULATED (not independently verified) ⇒ excluded from facts
    { missionId: "m5", type: "native-build:X", outcome: "UNKNOWN", independentlyVerified: false }, // censored
  ];
  const r = P.learnFromNativeOutcomes(outcomes);
  check("recurring REAL same-class failure ⇒ a consolidated lesson is formed", r.lessons.indexOf("lesson:native-build:MONOLITHIC:COMPLEX") >= 0 && r.recurringErrors.indexOf("native-build:MONOLITHIC:COMPLEX") >= 0);
  check("SIMULATED (not independently-verified) outcome excluded from facts (count 1)", r.simulatedExcludedFromFacts === 1);
  check("UNKNOWN censored: mappedFrom 5, counted 4 (SUCCESS/FAILURE only)", r.mappedFrom === 5 && r.counted === 4);
  check("no before/after metric in native records ⇒ measured:false (a lesson is NOT a fabricated improvement)", r.measured === false && r.improvement.delta === null);

  // a single same-class failure is NOT yet recurring (needs ≥2) — no premature lesson
  const one = P.learnFromNativeOutcomes([rec("m1", "native-build:X", "FAILURE"), rec("m2", "native-build:X", "SUCCESS")]);
  check("a single REAL failure of a class ⇒ NOT recurring (no premature lesson)", one.lessons.length === 0 && one.recurringErrors.length === 0);

  // empty / non-array ⇒ fail-closed (no lessons, counted 0)
  check("empty ⇒ fail-closed (counted 0, no lessons)", P.learnFromNativeOutcomes([]).counted === 0 && P.learnFromNativeOutcomes(null).counted === 0);

  // frozen + contract
  check("frozen result", Object.isFrozen(r));
  check("contract: reuses learning-loop + native store; no new memory; REAL-only facts",
    /learning-loop/.test(JSON.stringify(P.NATIVE_LEARNING_PASS_CONTRACT.reuses)) &&
    /NO new memory/.test(JSON.stringify(P.NATIVE_LEARNING_PASS_CONTRACT.reuses)) &&
    /INDEPENDENTLY-VERIFIED/.test(JSON.stringify(P.NATIVE_LEARNING_PASS_CONTRACT.invariants)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-native-learning-pass (V360 §7/§18: run learning-loop over accumulated native-build outcomes; recurring REAL same-class failures⇒consolidated lessons; SIMULATED excluded; UNKNOWN censored; no metric⇒measured:false; reuses learning-loop + store, no new memory)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
