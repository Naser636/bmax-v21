#!/usr/bin/env node
"use strict";
/* Tests for odg-calibrated-psuccess (bias-guarded P(success) for the planner). PURE. Composes the REAL
   calibration, continuous-planner (the naive estimator it corrects) and plan-evaluator (the consumer) — no mocks. */
const M = require("./odg-calibrated-psuccess.js");
const CP = require("./continuous-planner.js");
const PE = require("./plan-evaluator.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
function mk(n: number, st: string): any[] { return Array.from({ length: n }, () => ({ missionType: "build", status: st })); }

function main(): void {
  // A) SURVIVORSHIP — the honesty hole, demonstrated against the REAL naive estimator
  const surv = mk(12, "ACCEPTED"); // 12 successes, 0 recorded failures
  const dA = M.derivePsuccess("build", surv);
  const nA = CP.estimateSuccess("build", surv);
  check("naive estimateSuccess returns p=1.0 and LABELS it 'calibrated' (the overclaim)", nA.p === 1 && /calibrated/.test(nA.note));
  check("honest: same raw measuredP=1 BUT quality BIASED", dA.measuredP === 1 && dA.quality === "BIASED");
  check("honest: biased ⇒ pForPlanner=null (never served as confidence)", dA.pForPlanner === null);
  check("honest reason names survivorship bias", /survivorship/.test(dA.reason));

  // B) CALIBRATED — enough observations WITH recorded failures
  const dB = M.derivePsuccess("build", [...mk(18, "ACCEPTED"), ...mk(6, "REJECTED")]);
  check("calibrated: 24 obs, measuredP 0.75, quality CALIBRATED", dB.observations === 24 && dB.measuredP === 0.75 && dB.quality === "CALIBRATED");
  check("calibrated: pForPlanner = measuredP (0.75), uncertainty reported", dB.pForPlanner === 0.75 && dB.uncertainty === 0.2041);
  check("calibrated basis label", dB.basis === "CALIBRATED_HISTORY");

  // C) THIN — below MIN_OBSERVATIONS ⇒ DEGRADED ⇒ null (even though it has a failure)
  const dC = M.derivePsuccess("build", [...mk(3, "ACCEPTED"), ...mk(1, "REJECTED")]);
  check("thin sample ⇒ DEGRADED, pForPlanner null (measuredP still shown)", dC.quality === "DEGRADED" && dC.pForPlanner === null && dC.measuredP === 0.75);

  // D) EMPTY ⇒ UNKNOWN ⇒ null
  const dD = M.derivePsuccess("build", []);
  check("no observations ⇒ UNKNOWN, pForPlanner null, measuredP null", dD.quality === "UNKNOWN" && dD.pForPlanner === null && dD.measuredP === null && dD.observations === 0);

  // E) undecided outcomes never pad the rate
  const dE = M.derivePsuccess("build", [...mk(5, "ACCEPTED"), ...mk(10, "OPEN"), ...mk(3, "PENDING")]);
  check("OPEN/PENDING not counted as outcomes (observations=5)", dE.observations === 5 && dE.successes === 5 && dE.failures === 0);

  // outcome vocabulary: VALIDATED/verified true = success; FAILED/verified false = failure
  const dVocab = M.derivePsuccess("build", [
    { missionType: "build", status: "VALIDATED" }, { missionType: "build", verified: true },
    { missionType: "build", status: "FAILED" }, { missionType: "build", verified: false },
  ]);
  check("VALIDATED/verified⇒success, FAILED/¬verified⇒failure", dVocab.successes === 2 && dVocab.failures === 2);

  // missionType filter: null ⇒ all types; a type ⇒ only that type
  const mixed = [{ missionType: "a", status: "ACCEPTED" }, { missionType: "b", status: "REJECTED" }];
  check("missionType null counts all types", M.derivePsuccess(null, mixed).observations === 2);
  check("missionType filters to its type", M.derivePsuccess("a", mixed).observations === 1 && M.derivePsuccess("a", mixed).successes === 1);

  // F) END-TO-END planner effect through the REAL plan-evaluator: biased naive p inflates J by the full
  //    Psuccess weight; the honest null earns 0 success-credit.
  const base = { Vobjective: 0.6, Qquality: 0.6, Ttime: 0.2, Cresources: 0.2, Rrisk: 0.2, Uuncertainty: 0.2 };
  const Jh = PE.scorePlan({ metrics: { ...base, Psuccess: dA.pForPlanner } }); // null
  const Jn = PE.scorePlan({ metrics: { ...base, Psuccess: nA.p } });          // 1.0 (biased)
  check("planner: honest null ⇒ 0 Psuccess contribution", Jh.contributions.Psuccess === 0);
  check("planner: biased 1.0 ⇒ full (1.0) Psuccess contribution", Jn.contributions.Psuccess === 1);
  check("planner: biased estimate inflates plan J by exactly the Psuccess weight (1.0)", Number((Jn.J - Jh.J).toFixed(4)) === 1);

  // fail-closed
  check("non-array history ⇒ BAD_HISTORY", M.derivePsuccess("build", "x").ok === false && M.derivePsuccess("build", "x").code === "BAD_HISTORY");
  check("null/garbage records tolerated (skipped), not a throw", M.derivePsuccess("build", [null, 5, { status: "ACCEPTED", missionType: "build" }]).observations === 1);

  // honesty + determinism + frozen + contract
  check("note: measuredP≠confidence, CALIBRATED-only, plan is a hypothesis", /raw success RATE/.test(dA.note) && /ONLY when the estimate is CALIBRATED/.test(dA.note) && /a plan is a hypothesis, not a result/i.test(dA.note));
  check("deterministic", JSON.stringify(M.derivePsuccess("build", surv)) === JSON.stringify(dA));
  check("frozen", Object.isFrozen(dA));
  check("contract: measuredP≠confidence, bias⇒null, thin/stale⇒null, null⇒0-credit, only-decided",
    M.CALIBRATED_PSUCCESS_CONTRACT.invariants.some((s: string) => /pForPlanner is non-null ONLY when the estimate is CALIBRATED/.test(s)) &&
    M.CALIBRATED_PSUCCESS_CONTRACT.invariants.some((s: string) => /survivorship-biased.*pForPlanner=null/.test(s)) &&
    M.CALIBRATED_PSUCCESS_CONTRACT.invariants.some((s: string) => /thin .* or stale .* DEGRADED/.test(s)) &&
    M.CALIBRATED_PSUCCESS_CONTRACT.invariants.some((s: string) => /0 success-credit — fail-closed/.test(s)) &&
    M.CALIBRATED_PSUCCESS_CONTRACT.invariants.some((s: string) => /only DECIDED outcomes are counted/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-calibrated-psuccess (bias-guarded P(success) composing REAL calibration + contrasting the REAL naive continuous-planner.estimateSuccess + feeding REAL plan-evaluator: survivorship 12/0 ⇒ naive p=1.0 'calibrated' BUT honest quality=BIASED pForPlanner=null; 24-obs-with-failures ⇒ CALIBRATED 0.75; thin⇒DEGRADED null; empty⇒UNKNOWN null; OPEN/PENDING not counted; VALIDATED/FAILED/verified vocabulary; missionType filter; END-TO-END biased estimate inflates plan J by the full Psuccess weight while honest null earns 0 credit; non-array fail-closed; measuredP≠confidence honest; PURE/deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
