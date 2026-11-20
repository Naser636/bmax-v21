#!/usr/bin/env node
"use strict";
/* Tests for odg-native-outcome-calibration (V327 §5). Bridges the EXISTING native-build-outcome accumulator into the
 * survivorship-guarded calibrated-P: only verified SUCCESS/FAILURE counted (UNKNOWN censored); CALIBRATED only ≥20 with
 * failures; all-success ⇒ BIASED (the guard the raw rate lacks). Deterministic. */
const M = require("./odg-native-outcome-calibration.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const rec = (type: string, outcome: string, verified: boolean) => ({ type, outcome, independentlyVerified: verified, at: null, missionId: "native:x" });
const mk = (type: string, s: number, f: number, u: number): any[] => [
  ...Array(s).fill(0).map(() => rec(type, "SUCCESS", true)),
  ...Array(f).fill(0).map(() => rec(type, "FAILURE", true)),
  ...Array(u).fill(0).map(() => rec(type, "UNKNOWN", false)),
];

function main(): void {
  // ≥20 verified with failures ⇒ CALIBRATED; UNKNOWN censored (not counted)
  const cal = M.calibrateFromBuildOutcomes(mk("t", 15, 5, 3));
  check("20 verified (15✓/5✗) + 3 UNKNOWN ⇒ CALIBRATED over 20 (UNKNOWN censored), measuredP 0.75", cal.quality === "CALIBRATED" && cal.observations === 20 && cal.measuredP === 0.75 && cal.censoredUnknown === 3);

  // THE GUARD: all-success is survivorship-BIASED ⇒ null (the honest difference vs a raw success rate that would say 1.0)
  const allS = M.calibrateFromBuildOutcomes(mk("t", 12, 0, 0));
  check("all-success (12✓/0✗) ⇒ BIASED/null (survivorship-guarded, NOT a flattering 1.0)", allS.quality === "BIASED" && allS.pForPlanner === null && allS.successes === 12 && allS.failures === 0);

  // thin ⇒ DEGRADED/null; empty ⇒ UNKNOWN/null (fail-closed)
  check("thin verified (8✓/4✗ = 12 < 20) ⇒ DEGRADED, null", M.calibrateFromBuildOutcomes(mk("t", 8, 4, 0)).quality === "DEGRADED");
  check("no outcomes ⇒ UNKNOWN, null, mappedFrom 0", (() => { const r = M.calibrateFromBuildOutcomes([]); return r.quality === "UNKNOWN" && r.pForPlanner === null && r.mappedFrom === 0; })());

  // filter by native-build class `type` (missionType)
  const mixed = [...mk("a", 15, 5, 0), ...mk("b", 20, 0, 0)];
  const onlyA = M.calibrateFromBuildOutcomes(mixed, { missionType: "a" });
  check("missionType filter: only class 'a' outcomes counted (20), 'b' excluded", onlyA.observations === 20 && onlyA.quality === "CALIBRATED" && onlyA.measuredP === 0.75);

  // `at` carried through for belief-refresh staleness
  const withAt = M.calibrateFromBuildOutcomes([{ type: "t", outcome: "SUCCESS", independentlyVerified: true, at: "2026-11-01T00:00:00Z", missionId: "x" }]);
  check("mapping carries `at` (bridge produces records belief-refresh can age)", withAt.mappedFrom === 1 && withAt.observations === 1);

  // UNKNOWN / unverified never counted as success (anti-fabrication)
  check("UNKNOWN + unverified outcomes are censored (never a fabricated success)", M.calibrateFromBuildOutcomes(mk("t", 0, 0, 5)).observations === 0 && M.calibrateFromBuildOutcomes(mk("t", 0, 0, 5)).censoredUnknown === 5);

  // frozen + contract
  check("frozen result", Object.isFrozen(cal));
  check("contract: reuses native-build-outcome store + calibrated-P guard; no second memory; UNKNOWN censored",
    M.NATIVE_OUTCOME_CALIBRATION_CONTRACT.reuses.some((s: string) => /native-build-outcome/.test(s)) &&
    M.NATIVE_OUTCOME_CALIBRATION_CONTRACT.reuses.some((s: string) => /calibrateLocalModel/.test(s)) &&
    M.NATIVE_OUTCOME_CALIBRATION_CONTRACT.invariants.some((s: string) => /UNKNOWN is censored/.test(s)) &&
    M.NATIVE_OUTCOME_CALIBRATION_CONTRACT.invariants.some((s: string) => /NO second store/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-native-outcome-calibration (V327 §5: bridge native-build-outcome store → survivorship-guarded calibrated-P; UNKNOWN censored; ≥20✓✗⇒CALIBRATED, all-success⇒BIASED/null [vs raw rate 1.0 — the honest guard], thin⇒DEGRADED, empty⇒UNKNOWN; missionType filter; `at` carried for staleness; reuses existing store+calibrator, no 2nd memory; PURE/deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
