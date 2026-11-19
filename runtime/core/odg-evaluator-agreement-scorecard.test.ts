#!/usr/bin/env node
"use strict";
/* Tests for odg-evaluator-agreement-scorecard (composes κ + rank-corr + MCC). PURE. Composes the REAL modules (no mocks). */
const S = require("./odg-evaluator-agreement-scorecard.js");
const IRA = require("./odg-inter-rater-agreement.js");
const RC = require("./odg-rank-correlation.js");
const BCM = require("./odg-binary-classification-metrics.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  // full input: categorical (κ) + scores (rank) + truth (MCC)
  const labelsA = ["Y", "Y", "N", "N", "Y", "N", "Y", "N", "N", "Y"];
  const labelsB = ["Y", "N", "N", "N", "Y", "N", "Y", "Y", "N", "Y"];
  const scoresA = [0.9, 0.8, 0.2, 0.1, 0.85, 0.3, 0.95, 0.4, 0.2, 0.7];
  const scoresB = [0.88, 0.5, 0.25, 0.15, 0.8, 0.35, 0.9, 0.6, 0.3, 0.72];
  const truth = ["Y", "Y", "N", "N", "Y", "N", "Y", "N", "N", "Y"];
  const sc = S.scoreAgreement({ categorical: { a: labelsA, b: labelsB }, scores: { a: scoresA, b: scoresB }, truth: { labels: truth, positiveClass: "Y" } });

  check("ok, all three dimensions measured", sc.ok === true && sc.agreement.ok === true && sc.ordering.measured === true && sc.quality.measured === true);

  // COMPOSITION FIDELITY: each dimension equals the standalone module (no re-implementation)
  check("κ equals standalone cohenKappa", sc.agreement.kappa === IRA.cohenKappa(labelsA, labelsB).kappa);
  check("Spearman/Kendall equal standalone", sc.ordering.spearman.rho === RC.spearman(scoresA, scoresB).rho && sc.ordering.kendall.tau === RC.kendall(scoresA, scoresB).tau);
  check("MCC(A vs truth) equals standalone from the same confusion", sc.quality.evaluatorA.mcc === BCM.classificationMetrics(S.confusion(labelsA, truth, "Y")).mcc);
  // evaluator A labels == truth here ⇒ A is perfect ⇒ MCC 1; B differs on one ⇒ MCC < 1
  check("evaluatorA perfect vs truth ⇒ MCC 1; evaluatorB < 1", sc.quality.evaluatorA.mcc === 1 && sc.quality.evaluatorB.mcc < 1);

  // confusion helper
  check("confusion([Y,N,Y,N],[Y,Y,N,N],Y) = tp1 fp1 fn1 tn1", JSON.stringify(S.confusion(["Y", "N", "Y", "N"], ["Y", "Y", "N", "N"], "Y")) === JSON.stringify({ tp: 1, tn: 1, fp: 1, fn: 1 }));

  // AGREEMENT ≠ ACCURACY: two evaluators that AGREE with each other but are BOTH wrong vs truth
  const bothWrong = S.scoreAgreement({ categorical: { a: ["Y", "Y", "Y", "Y", "N", "N"], b: ["Y", "Y", "Y", "Y", "N", "N"] }, truth: { labels: ["N", "N", "N", "N", "Y", "Y"], positiveClass: "Y" } });
  check("perfect inter-rater κ but both inaccurate ⇒ κ=1 yet MCC=-1 (agreement≠accuracy)", bothWrong.agreement.kappa === 1 && bothWrong.quality.evaluatorA.mcc === -1);
  check("flag CONSISTENT_BUT_INACCURATE raised", bothWrong.flags.some((f: string) => /CONSISTENT_BUT_INACCURATE/.test(f)));

  // consistent AND accurate ⇒ different flag
  const good = S.scoreAgreement({ categorical: { a: ["Y", "N", "Y", "N", "Y", "N"], b: ["Y", "N", "Y", "N", "Y", "N"] }, truth: { labels: ["Y", "N", "Y", "N", "Y", "N"], positiveClass: "Y" } });
  check("consistent AND accurate flag", good.flags.some((f: string) => /CONSISTENT_AND_ACCURATE/.test(f)));

  // NOT_MEASURED honesty: no truth ⇒ quality NOT measured (not fabricated)
  const noTruth = S.scoreAgreement({ categorical: { a: labelsA, b: labelsB } });
  check("no truth ⇒ quality NOT_MEASURED (agreement≠accuracy), κ still measured", noTruth.quality.measured === false && /no ground truth/.test(noTruth.quality.reason) && noTruth.agreement.ok === true);
  check("no scores ⇒ ordering NOT_MEASURED", noTruth.ordering.measured === false);

  // scores-only ⇒ ordering measured, agreement NOT measured
  const scoresOnly = S.scoreAgreement({ scores: { a: scoresA, b: scoresB } });
  check("scores-only ⇒ ordering measured, agreement NOT_MEASURED", scoresOnly.ordering.measured === true && scoresOnly.agreement.measured === false);

  // sub-module refusal surfaced: mismatched categorical lengths ⇒ agreement carries LENGTH_MISMATCH
  const mism = S.scoreAgreement({ categorical: { a: ["Y", "N", "Y"], b: ["Y", "N"] } });
  check("length mismatch surfaced in agreement dimension", mism.agreement.ok === false && mism.agreement.code === "LENGTH_MISMATCH");

  // LOW_AGREEMENT flag
  const low = S.scoreAgreement({ categorical: { a: ["Y", "N", "Y", "N", "Y", "N"], b: ["N", "Y", "N", "Y", "N", "Y"] } });
  check("systematic disagreement ⇒ LOW_AGREEMENT flag (κ<0.21)", low.flags.some((f: string) => /LOW_AGREEMENT/.test(f)));

  // fail-closed
  check("no usable input ⇒ NO_INPUT", S.scoreAgreement({}).code === "NO_INPUT");
  check("truth length mismatch ⇒ quality NOT_MEASURED", S.scoreAgreement({ categorical: { a: ["Y", "N"], b: ["Y", "N"] }, truth: { labels: ["Y"], positiveClass: "Y" } }).quality.measured === false);

  // honesty + determinism + frozen + contract
  check("note: AGREEMENT ≠ ACCURACY, NOT_MEASURED honest", /AGREEMENT ≠ ACCURACY/.test(sc.note) && /NOT_MEASURED/.test(sc.note));
  check("deterministic", JSON.stringify(S.scoreAgreement({ categorical: { a: labelsA, b: labelsB }, scores: { a: scoresA, b: scoresB }, truth: { labels: truth, positiveClass: "Y" } })) === JSON.stringify(sc));
  check("frozen", Object.isFrozen(sc) && Object.isFrozen(sc.flags) && Object.isFrozen(sc.ordering));
  check("contract: composes-modifies-none, agreement≠accuracy, not-measured-honest, flags-factual",
    S.EVALUATOR_AGREEMENT_SCORECARD_CONTRACT.invariants.some((s: string) => /MODIFIES NONE/.test(s)) &&
    S.EVALUATOR_AGREEMENT_SCORECARD_CONTRACT.invariants.some((s: string) => /AGREEMENT ≠ ACCURACY/.test(s)) &&
    S.EVALUATOR_AGREEMENT_SCORECARD_CONTRACT.invariants.some((s: string) => /NOT_MEASURED/.test(s)) &&
    S.EVALUATOR_AGREEMENT_SCORECARD_CONTRACT.invariants.some((s: string) => /FACTUAL/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-evaluator-agreement-scorecard (composes REAL κ + rank-corr + MCC, modifies none; fidelity vs standalone; AGREEMENT≠ACCURACY: κ=1 but MCC=-1 ⇒ CONSISTENT_BUT_INACCURATE flag; NOT_MEASURED when inputs absent [no truth⇒no accuracy]; sub-module refusals surfaced; deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
