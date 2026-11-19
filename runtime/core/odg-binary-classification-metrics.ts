#!/usr/bin/env node
"use strict";
/*
 * P6 EVAL — BINARY-CLASSIFICATION METRICS from a 2×2 confusion matrix, incl. Matthews Correlation Coefficient (MCC),
 * balanced accuracy, and specificity. PURE, deterministic, fail-closed.
 *
 * THE GAP (reconciled): eval-metrics.confusionMatrix is SET-based (predicted vs expected sets ⇒ TP/FP/FN only, NO TRUE
 * NEGATIVES). The metrics that REQUIRE TN — MCC, specificity (TNR), balanced accuracy, accuracy — are therefore
 * structurally absent, and no module computes them. This adds them from a full 2×2 matrix {tp, tn, fp, fn}. MCC is the
 * headline: on IMBALANCED classes plain accuracy is misleading (a 95%-negative set scores 95% by always predicting
 * negative) — MCC only scores high when the model does well on BOTH classes, which is why it's the honest single number.
 *
 * Honesty:
 *  - a metric with a ZERO denominator (e.g. precision when TP+FP=0, or MCC when a matrix margin is 0) is UNDEFINED ⇒
 *    null + flagged, NEVER coerced to 0 (coercing would fake a score);
 *  - MCC/specificity/balanced-accuracy need TN — this is a DIFFERENT input model from eval-metrics' set-membership
 *    precision/recall/F1 (which it keeps); this is not a second set-diff engine;
 *  - these are DESCRIPTIVE quality metrics, not a pass/fail verdict; fail-closed on non-integer / negative / empty counts.
 *  No network/clock/randomness.
 */

function isNonNegInt(v: any): boolean { return typeof v === "number" && Number.isSafeInteger(v) && v >= 0; }
function freeze(o: any): any { return Object.freeze(o); }
function r6(n: number): number { return Number(n.toFixed(6)); }
function ratio(num: number, den: number): number | null { return den === 0 ? null : r6(num / den); }

/**
 * classificationMetrics({ tp, tn, fp, fn }) -> frozen metric set.
 * All of tp/tn/fp/fn are non-negative integers; total must be > 0. A metric whose denominator is 0 is null (UNDEFINED),
 * never coerced. MCC = (TP·TN − FP·FN) / √((TP+FP)(TP+FN)(TN+FP)(TN+FN)); null if any margin is 0.
 */
function classificationMetrics(input: any): any {
  const i = input !== null && typeof input === "object" ? input : {};
  for (const k of ["tp", "tn", "fp", "fn"]) if (!isNonNegInt(i[k])) return freeze({ ok: false, code: "BAD_COUNTS", detail: `${k} must be a non-negative integer` });
  const tp = i.tp, tn = i.tn, fp = i.fp, fn = i.fn;
  const total = tp + tn + fp + fn;
  if (total === 0) return freeze({ ok: false, code: "EMPTY_MATRIX", detail: "the confusion matrix is all zeros" });

  const precision = ratio(tp, tp + fp);                 // PPV
  const recall = ratio(tp, tp + fn);                    // sensitivity / TPR
  const specificity = ratio(tn, tn + fp);               // TNR (needs TN — absent in set-based eval-metrics)
  const npv = ratio(tn, tn + fn);
  const f1 = precision !== null && recall !== null && precision + recall > 0 ? r6((2 * precision * recall) / (precision + recall)) : null;
  const accuracy = r6((tp + tn) / total);
  const balancedAccuracy = recall !== null && specificity !== null ? r6((recall + specificity) / 2) : null;
  // MCC — denominator is a product of the four margins; any zero margin ⇒ UNDEFINED (convention is 0, but we flag null honestly)
  const m1 = tp + fp, m2 = tp + fn, m3 = tn + fp, m4 = tn + fn;
  const mcc = (m1 === 0 || m2 === 0 || m3 === 0 || m4 === 0) ? null : r6((tp * tn - fp * fn) / Math.sqrt(m1 * m2 * m3 * m4));

  return freeze({ ok: true, tp, tn, fp, fn, total,
    mcc, precision, recall, specificity, npv, f1, accuracy, balancedAccuracy,
    prevalence: r6((tp + fn) / total),
    note: "metrics from a 2×2 confusion matrix; MCC is the honest single number for IMBALANCED classes (accuracy can be high just by predicting the majority). A null metric is UNDEFINED (zero denominator), NOT zero. Descriptive — not a pass/fail verdict." });
}

const BINARY_CLASSIFICATION_METRICS_CONTRACT = Object.freeze({
  id: "P6-BINARY-CLASSIFICATION-METRICS",
  purpose: "2×2 confusion-matrix metrics incl. MCC / specificity / balanced accuracy — the TN-requiring metrics absent from eval-metrics' set-based precision/recall/F1",
  reuses: Object.freeze(["distinct input model from eval-metrics.confusionMatrix (set-membership TP/FP/FN, no TN) — this takes a full 2×2 {tp,tn,fp,fn}; MCC/specificity/BA need TN"]),
  invariants: Object.freeze([
    "MCC = (TP·TN − FP·FN)/√((TP+FP)(TP+FN)(TN+FP)(TN+FN)); the honest single number for imbalanced classes",
    "a zero-denominator metric is UNDEFINED ⇒ null + flagged, NEVER coerced to 0 (coercion would fake a score)",
    "requires TN — a DIFFERENT input model than set-based precision/recall (not a second set-diff engine)",
    "descriptive quality metrics, NOT a pass/fail verdict",
    "fail-closed: non-integer / negative counts / all-zero matrix ⇒ typed refusal; PURE/deterministic; no network/clock/randomness",
  ]),
});

module.exports = { classificationMetrics, BINARY_CLASSIFICATION_METRICS_CONTRACT };
export {};
