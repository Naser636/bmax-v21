#!/usr/bin/env node
"use strict";
/*
 * IMP-P11-CONF-CALIB (V189-A contract, owner-authorized block) — P11 Document/IDP: confidence calibration measured
 * against a supplied LABELLED set + a straight-through-processing (STP) threshold flagged HYPOTHESIS. PURE,
 * deterministic. Fail-closed: no labelled set ⇒ NOT_MEASURED (no fabricated calibration). No OCR is introduced here.
 *
 * Acceptance (contract): calibration measured against a labelled set; STP threshold flagged HYPOTHESIS; no OCR introduced.
 */

function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function num(v: any): number | null { return typeof v === "number" && isFinite(v) ? v : null; }

/* calibrate(labelled, {bins, stpThreshold}) -> ECE + per-bin reliability + an STP-threshold recommendation (HYPOTHESIS).
 * labelled = [{confidence 0..1, correct:boolean}]. */
function calibrate(labelled: any, opts: any): any {
  const data = arr(labelled).filter((d: any) => num(d.confidence) !== null && d.confidence >= 0 && d.confidence <= 1 && typeof d.correct === "boolean");
  if (data.length === 0) return Object.freeze({ metier: "P11", status: "NOT_MEASURED", reason: "no valid labelled examples supplied (a calibration needs ground truth)", honesty: honest() });

  const o = opts && typeof opts === "object" ? opts : {};
  const nBins = Number.isInteger(o.bins) && o.bins >= 2 ? o.bins : 10;
  const bins = Array.from({ length: nBins }, (_, k) => ({ lo: k / nBins, hi: (k + 1) / nBins, n: 0, correct: 0, confSum: 0 }));
  for (const d of data) { const idx = Math.min(nBins - 1, Math.floor(d.confidence * nBins)); const b = bins[idx]; b.n++; b.confSum += d.confidence; if (d.correct) b.correct++; }

  let ece = 0;
  const reliability = bins.filter((b) => b.n > 0).map((b) => { const acc = b.correct / b.n; const conf = b.confSum / b.n; ece += (b.n / data.length) * Math.abs(acc - conf); return Object.freeze({ range: [Number(b.lo.toFixed(2)), Number(b.hi.toFixed(2))], n: b.n, accuracy: Number(acc.toFixed(4)), avgConfidence: Number(conf.toFixed(4)), gap: Number((conf - acc).toFixed(4)) }); });

  // STP threshold: the lowest confidence at/above which observed accuracy ≥ a target (default 0.98). HYPOTHESIS only.
  const target = num(o.stpTargetAccuracy) !== null ? o.stpTargetAccuracy : 0.98;
  let stp: any = { recommended: null, status: "HYPOTHESIS", reason: "no confidence band met the target accuracy on this labelled set" };
  for (let t = 0.5; t <= 0.999; t += 0.01) { const above = data.filter((d: any) => d.confidence >= t); if (above.length >= 10) { const acc = above.filter((d: any) => d.correct).length / above.length; if (acc >= target) { stp = { recommended: Number(t.toFixed(2)), observedAccuracyAbove: Number(acc.toFixed(4)), sampleAbove: above.length, status: "HYPOTHESIS", note: "a straight-through-processing threshold is a HYPOTHESIS from THIS labelled set — revalidate on a held-out set before use" }; break; } } }

  return Object.freeze({
    metier: "P11", status: "MEASURED", n: data.length,
    expectedCalibrationError: Number(ece.toFixed(4)), reliability: Object.freeze(reliability),
    stpThreshold: Object.freeze(stp), honesty: honest(),
  });
}
function honest(): string { return "calibration is measured against a SUPPLIED labelled set (ground truth); no labelled set ⇒ NOT_MEASURED (never fabricated); any STP threshold is a HYPOTHESIS to revalidate on held-out data; no OCR is introduced here."; }

const DOC_CONFIDENCE_CALIBRATION_CONTRACT = Object.freeze({
  id: "IMP-P11-CONF-CALIB",
  purpose: "P11 — confidence calibration (ECE + reliability) against a labelled set; STP threshold HYPOTHESIS; no OCR",
  invariants: Object.freeze([
    "calibration measured ONLY against a supplied labelled set; no labelled set ⇒ NOT_MEASURED (never fabricated)",
    "the STP threshold is flagged HYPOTHESIS — revalidate on held-out data before use",
    "no OCR is introduced here; deterministic; read-only; no new engine",
  ]),
});

module.exports = { calibrate, DOC_CONFIDENCE_CALIBRATION_CONTRACT };
export {};
