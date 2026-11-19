#!/usr/bin/env node
"use strict";
/*
 * EVALUATOR-AGREEMENT SCORECARD — composes the three eval statistics into ONE view. PURE, deterministic, fail-closed.
 * MODIFIES NONE of what it composes.
 *
 *  - odg-inter-rater-agreement.cohenKappa  : do two evaluators give the SAME LABEL (agreement beyond chance)?
 *  - odg-rank-correlation.spearman/kendall : do they ORDER items the same way (if they emit numeric scores)?
 *  - odg-binary-classification-metrics      : if GROUND TRUTH is supplied, how ACCURATE is each evaluator (MCC et al.)?
 *
 * This is the consumer the governance layer actually needs for its independent-evaluator theme: a single, honest answer
 * to "are my two evaluators agreeing — and does that agreement mean anything?". The crucial discipline it enforces:
 * AGREEMENT ≠ ACCURACY. Two evaluators can agree perfectly (high κ, high rank-corr) and BOTH be wrong — only the
 * ground-truth MCC dimension measures correctness, and the scorecard keeps the dimensions SEPARATE, never conflated.
 *
 * Honesty:
 *  - a dimension whose inputs are absent/insufficient is NOT_MEASURED (with a reason) — never fabricated or defaulted;
 *  - any sub-module refusal (length mismatch, UNDEFINED κ, etc.) is surfaced verbatim in that dimension;
 *  - the cross-reference flags are FACTUAL observations derived from the computed numbers (e.g. "consistent but
 *    inaccurate" only when κ is substantial AND both MCC are weak) — descriptive, never a pass/fail verdict;
 *  - no network/clock/randomness.
 */

const IRA = require("./odg-inter-rater-agreement.js");
const RC = require("./odg-rank-correlation.js");
const BCM = require("./odg-binary-classification-metrics.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function freeze(o: any): any { return Object.freeze(o); }
function notMeasured(reason: string): any { return freeze({ measured: false, reason }); }

/** Build a 2×2 confusion {tp,tn,fp,fn} from an evaluator's labels vs truth labels, for the declared positive class. */
function confusion(pred: any[], truth: any[], pos: any): any {
  let tp = 0, tn = 0, fp = 0, fn = 0;
  for (let i = 0; i < pred.length; i++) {
    const p = pred[i] === pos, t = truth[i] === pos;
    if (p && t) tp++; else if (p && !t) fp++; else if (!p && t) fn++; else tn++;
  }
  return { tp, tn, fp, fn };
}

/**
 * scoreAgreement(input) -> frozen scorecard. input = {
 *   categorical?: { a:[label], b:[label] },           // → Cohen's κ (evaluator-vs-evaluator label agreement)
 *   scores?:      { a:[number], b:[number] },          // → Spearman ρ + Kendall τ-b (ordering agreement)
 *   truth?:       { labels:[label], positiveClass },   // → MCC of each evaluator vs ground truth (uses categorical.a/b)
 * }
 * Each dimension is computed only if its inputs are present; otherwise NOT_MEASURED (honest). Fail-closed: no usable
 * input at all ⇒ NO_INPUT.
 */
function scoreAgreement(input: any): any {
  const i = isObj(input) ? input : {};
  const hasCat = isObj(i.categorical) && Array.isArray(i.categorical.a) && Array.isArray(i.categorical.b);
  const hasScores = isObj(i.scores) && Array.isArray(i.scores.a) && Array.isArray(i.scores.b);
  const hasTruth = isObj(i.truth) && Array.isArray(i.truth.labels) && i.truth.positiveClass !== undefined;
  if (!hasCat && !hasScores) return freeze({ ok: false, code: "NO_INPUT", detail: "need at least categorical labels or numeric scores from both evaluators" });

  // 1) categorical agreement beyond chance (κ) — surfaces the sub-module result verbatim
  const agreement = hasCat ? IRA.cohenKappa(i.categorical.a, i.categorical.b) : notMeasured("no categorical labels supplied for both evaluators");

  // 2) ordering agreement (rank correlation) — only if numeric scores present
  let ordering: any;
  if (hasScores) {
    const sp = RC.spearman(i.scores.a, i.scores.b);
    const kd = RC.kendall(i.scores.a, i.scores.b);
    ordering = freeze({ measured: true, spearman: sp, kendall: kd });
  } else ordering = notMeasured("no numeric scores supplied for both evaluators");

  // 3) accuracy vs ground truth (MCC per evaluator) — AGREEMENT ≠ ACCURACY; only when truth + binary categorical present
  let quality: any;
  if (hasTruth && hasCat) {
    const pos = i.truth.positiveClass, truth = i.truth.labels;
    const a = i.categorical.a, b = i.categorical.b;
    if (a.length !== truth.length || b.length !== truth.length) quality = notMeasured("evaluator labels and truth differ in length");
    else {
      quality = freeze({ measured: true, positiveClass: pos,
        evaluatorA: BCM.classificationMetrics(confusion(a, truth, pos)),
        evaluatorB: BCM.classificationMetrics(confusion(b, truth, pos)) });
    }
  } else quality = notMeasured(hasTruth ? "truth supplied but no categorical labels to score" : "no ground truth supplied — accuracy NOT measured (agreement ≠ accuracy)");

  // factual cross-reference flags — derived strictly from computed numbers, only when the needed dimensions were measured
  const flags: string[] = [];
  const kappaVal = agreement && agreement.ok === true ? agreement.kappa : null;
  const aMcc = quality.measured && quality.evaluatorA.ok ? quality.evaluatorA.mcc : null;
  const bMcc = quality.measured && quality.evaluatorB.ok ? quality.evaluatorB.mcc : null;
  if (kappaVal !== null && aMcc !== null && bMcc !== null) {
    if (kappaVal >= 0.61 && aMcc < 0.4 && bMcc < 0.4) flags.push("CONSISTENT_BUT_INACCURATE: evaluators agree substantially (κ≥0.61) yet BOTH have weak accuracy vs truth (MCC<0.4) — agreement is not correctness");
    if (kappaVal >= 0.61 && aMcc >= 0.7 && bMcc >= 0.7) flags.push("CONSISTENT_AND_ACCURATE: substantial agreement AND both strong vs truth");
  }
  if (kappaVal !== null && kappaVal < 0.21) flags.push("LOW_AGREEMENT: κ<0.21 — the two evaluators barely agree beyond chance");

  return freeze({ ok: true, agreement, ordering, quality, flags: freeze(flags),
    note: "AGREEMENT ≠ ACCURACY: κ/rank-correlation measure whether the two evaluators concur; only the ground-truth MCC dimension measures correctness — kept separate, never conflated. NOT_MEASURED dimensions are honest (inputs absent), not fabricated." });
}

const EVALUATOR_AGREEMENT_SCORECARD_CONTRACT = Object.freeze({
  id: "EVALUATOR-AGREEMENT-SCORECARD",
  purpose: "compose Cohen's κ + rank-correlation + MCC into one evaluator-agreement view; enforce AGREEMENT ≠ ACCURACY for the independent-evaluator governance theme",
  reuses: Object.freeze(["odg-inter-rater-agreement.cohenKappa", "odg-rank-correlation.spearman/kendall", "odg-binary-classification-metrics.classificationMetrics"]),
  invariants: Object.freeze([
    "composes the three eval statistics and MODIFIES NONE (no new statistic)",
    "AGREEMENT ≠ ACCURACY — κ/rank-corr (concur) kept SEPARATE from MCC-vs-truth (correct); never conflated",
    "a dimension with absent/insufficient inputs is NOT_MEASURED (with reason) — never fabricated/defaulted",
    "sub-module refusals (mismatch, UNDEFINED κ) are surfaced verbatim in their dimension",
    "cross-reference flags are FACTUAL (derived from computed numbers), descriptive — NOT a pass/fail verdict",
    "PURE + deterministic; no network/clock/randomness",
  ]),
});

module.exports = { confusion, scoreAgreement, EVALUATOR_AGREEMENT_SCORECARD_CONTRACT };
export {};
