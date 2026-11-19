#!/usr/bin/env node
"use strict";
/* Tests for odg-binary-classification-metrics (2×2 incl. MCC). PURE. Values hand-computed from the definitions. */
const M = require("./odg-binary-classification-metrics.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  // hand-computed: tp50 tn40 fp10 fn5 ⇒ MCC=1950/√(60·55·50·45)=0.715626; spec 0.8; recall 0.909091; BA 0.854545; acc 0.857143
  const r = M.classificationMetrics({ tp: 50, tn: 40, fp: 10, fn: 5 });
  check("MCC = 0.715626 (= 1950/√(60·55·50·45))", r.mcc === 0.715626);
  check("specificity 0.8 (TN/(TN+FP)), recall 0.909091", r.specificity === 0.8 && r.recall === 0.909091);
  check("balanced accuracy 0.854545 = (recall+specificity)/2", r.balancedAccuracy === 0.854545);
  check("precision 0.833333, f1 0.869565, accuracy 0.857143", r.precision === 0.833333 && r.f1 === 0.869565 && r.accuracy === 0.857143);
  check("prevalence 0.52381 ((tp+fn)/total)", r.prevalence === 0.52381);

  // perfect / worst MCC bounds
  check("perfect classifier ⇒ MCC 1", M.classificationMetrics({ tp: 10, tn: 10, fp: 0, fn: 0 }).mcc === 1);
  check("all-wrong classifier ⇒ MCC -1", M.classificationMetrics({ tp: 0, tn: 0, fp: 10, fn: 10 }).mcc === -1);

  // IMBALANCE: 95 negatives, predict-all-negative ⇒ accuracy 0.95 but MCC 0 (the whole point)
  const alwaysNeg = M.classificationMetrics({ tp: 0, tn: 95, fp: 0, fn: 5 });
  check("imbalance: predict-all-negative ⇒ accuracy 0.95 but MCC null/0 (honest)", alwaysNeg.accuracy === 0.95 && (alwaysNeg.mcc === null || alwaysNeg.mcc === 0));
  // specifically: tp+fp=0 ⇒ precision & MCC UNDEFINED (null), not faked
  check("predict-all-negative: precision null + MCC null (zero margin, not coerced to 0)", alwaysNeg.precision === null && alwaysNeg.mcc === null);

  // zero-denominator honesty: no actual positives ⇒ recall null; no predicted positives ⇒ precision null
  const noPos = M.classificationMetrics({ tp: 0, tn: 10, fp: 0, fn: 0 });
  check("no positives at all ⇒ recall null, specificity 1, MCC null (not 0)", noPos.recall === null && noPos.specificity === 1 && noPos.mcc === null);

  // symmetry sanity: swapping does not NaN; MCC stays in [-1,1]
  const r2 = M.classificationMetrics({ tp: 30, tn: 30, fp: 20, fn: 20 });
  check("balanced errors ⇒ MCC in [-1,1], here ~0.2", r2.mcc >= -1 && r2.mcc <= 1 && Math.abs(r2.mcc - 0.2) < 0.0001);

  // fail-closed
  check("non-integer count ⇒ BAD_COUNTS", M.classificationMetrics({ tp: 1.5, tn: 1, fp: 1, fn: 1 }).code === "BAD_COUNTS");
  check("negative count ⇒ BAD_COUNTS", M.classificationMetrics({ tp: -1, tn: 1, fp: 1, fn: 1 }).code === "BAD_COUNTS");
  check("missing count ⇒ BAD_COUNTS", M.classificationMetrics({ tp: 1, tn: 1, fp: 1 }).code === "BAD_COUNTS");
  check("all-zero matrix ⇒ EMPTY_MATRIX", M.classificationMetrics({ tp: 0, tn: 0, fp: 0, fn: 0 }).code === "EMPTY_MATRIX");

  // honesty + determinism + frozen + contract
  check("note: MCC honest for imbalance, null=UNDEFINED not zero, descriptive not verdict", /honest single number for IMBALANCED/.test(r.note) && /UNDEFINED .*NOT zero/.test(r.note) && /not a pass\/fail verdict/.test(r.note));
  check("deterministic", JSON.stringify(M.classificationMetrics({ tp: 50, tn: 40, fp: 10, fn: 5 })) === JSON.stringify(r));
  check("frozen", Object.isFrozen(r));
  check("contract: MCC formula, null-not-coerced, needs-TN distinct, descriptive, fail-closed",
    M.BINARY_CLASSIFICATION_METRICS_CONTRACT.invariants.some((s: string) => /honest single number for imbalanced/.test(s)) &&
    M.BINARY_CLASSIFICATION_METRICS_CONTRACT.invariants.some((s: string) => /NEVER coerced to 0/.test(s)) &&
    M.BINARY_CLASSIFICATION_METRICS_CONTRACT.invariants.some((s: string) => /requires TN/.test(s)) &&
    M.BINARY_CLASSIFICATION_METRICS_CONTRACT.invariants.some((s: string) => /NOT a pass\/fail verdict/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-binary-classification-metrics (2×2 incl. MCC: tp50/tn40/fp10/fn5⇒MCC0.7156/spec0.8/BA0.8545 hand-verified; perfect±1; IMBALANCE predict-all-neg⇒acc0.95 but MCC null [honest]; zero-denominator⇒null not coerced; non-int/negative/empty fail-closed; PURE/deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
