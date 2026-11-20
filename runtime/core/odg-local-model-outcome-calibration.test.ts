#!/usr/bin/env node
"use strict";
/* Tests for odg-local-model-outcome-calibration (V327 §P3). Proves REAL ODG-local-model outcomes (independent-verifier
 * verdicts) flow into the production calibrated-P and yield an HONEST verdict: CALIBRATED only with ≥20 decided outcomes
 * WITH failures; all-success(survivorship)/thin/empty ⇒ null (fail-closed). Deterministic (synthetic outcomes). */
const M = require("./odg-local-model-outcome-calibration.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const mk = (s: number, f: number): any[] => [...Array(s).fill(0).map((_, i) => ({ id: "s" + i, verified: true, model: "qwen2.5-coder:3b" })), ...Array(f).fill(0).map((_, i) => ({ id: "f" + i, verified: false }))];

function main(): void {
  // ── CALIBRATED only with ≥20 decided outcomes WITH recorded failures ──
  const cal = M.calibrateLocalModel(mk(15, 5));
  check("20 mixed outcomes (15✓/5✗) ⇒ CALIBRATED, pForPlanner = measuredP (meaningful)", cal.quality === "CALIBRATED" && cal.observations === 20 && cal.successes === 15 && cal.failures === 5 && cal.measuredP === 0.75 && cal.pForPlanner === 0.75);
  check("CALIBRATED verdict authorizes nothing", cal.authorizes === false);

  // ── survivorship / thin / empty ⇒ null (fail-closed, honest) ──
  const biased = M.calibrateLocalModel(mk(12, 0));
  check("all-success 12/0 (survivorship) ⇒ BIASED, pForPlanner null (not a flattering P=1)", biased.quality === "BIASED" && biased.pForPlanner === null && biased.measuredP === 1);
  const thin = M.calibrateLocalModel(mk(8, 4));
  check("thin mixed 12 (<20) ⇒ DEGRADED, pForPlanner null", thin.quality === "DEGRADED" && thin.pForPlanner === null && thin.observations === 12);
  const empty = M.calibrateLocalModel([]);
  check("empty ⇒ UNKNOWN, pForPlanner null, 0 observations", empty.quality === "UNKNOWN" && empty.pForPlanner === null && empty.observations === 0);

  // ── mapping honesty: `verified` is the only decided signal; non-boolean ⇒ undecided (not a fabricated failure) ──
  check("outcomeToRecord: verified true/false mapped; executor tier tagged", M.outcomeToRecord({ verified: true }).verified === true && M.outcomeToRecord({ verified: false }).verified === false && M.outcomeToRecord({ verified: true }).executor === "ODG_LOCAL_MODEL_EXECUTION");
  check("outcomeToRecord: non-boolean verified ⇒ no decided outcome (undecided, not counted)", !("verified" in M.outcomeToRecord({ verified: "yes" })) && !("verified" in M.outcomeToRecord({})));
  // an undecided outcome does NOT pad the tally (10✓ + 5 undecided ⇒ still 10 obs, survivorship BIASED not CALIBRATED)
  const withUndecided = M.calibrateLocalModel([...mk(10, 0), { verified: "maybe" }, { id: "x" }, { verified: null }]);
  check("undecided outcomes never pad observations (10✓ + 3 undecided ⇒ 10 obs)", withUndecided.observations === 10);
  check("buildHistory filters non-objects", M.buildHistory([{ verified: true }, null, 42, "x"]).length === 1);
  check("outcomeToRecord carries `at` timestamp when present (for belief-refresh recency), omits when absent", M.outcomeToRecord({ verified: true, at: "2026-11-01T00:00:00Z" }).at === "2026-11-01T00:00:00Z" && !("at" in M.outcomeToRecord({ verified: true })));

  // ── fail-closed + frozen + determinism + contract ──
  check("fail-closed: non-array outcomes ⇒ BAD_OUTCOMES", M.calibrateLocalModel("x").code === "BAD_OUTCOMES" && M.calibrateLocalModel(null).code === "BAD_OUTCOMES");
  check("deterministic", JSON.stringify(M.calibrateLocalModel(mk(15, 5))) === JSON.stringify(M.calibrateLocalModel(mk(15, 5))));
  check("frozen result", Object.isFrozen(cal) && Object.isFrozen(M.outcomeToRecord({ verified: true })));
  check("executor constant + contract: real independent verdict, calibrated-only, no 2nd estimator",
    M.EXECUTOR === "ODG_LOCAL_MODEL_EXECUTION" &&
    M.LOCAL_MODEL_CALIBRATION_CONTRACT.invariants.some((s: string) => /INDEPENDENT verifier's real verdict/.test(s)) &&
    M.LOCAL_MODEL_CALIBRATION_CONTRACT.invariants.some((s: string) => /survivorship/.test(s)) &&
    M.LOCAL_MODEL_CALIBRATION_CONTRACT.invariants.some((s: string) => /builds NO second estimator/.test(s)) &&
    M.LOCAL_MODEL_CALIBRATION_CONTRACT.reuses.some((s: string) => /derivePsuccess/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-local-model-outcome-calibration (V327 §P3: REAL ODG-local-model outcomes [independent-verifier verdicts, ODG_LOCAL_MODEL_EXECUTION] → production calibrated-P; CALIBRATED only ≥20 decided WITH failures [pForPlanner=measuredP]; survivorship all-success⇒BIASED/null, thin⇒DEGRADED/null, empty⇒UNKNOWN/null; non-boolean verified⇒undecided [no fabricated failure, no padding]; authorizes nothing; fail-closed; PURE/deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
