#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 23 (central intelligence — world-research gap) — CALIBRATION TRUST GATE. PURE, deterministic, closed-form.
 * World reference: the 2026 agentic standard is that a confidence number may drive an autonomous decision ONLY when
 * that confidence is empirically CALIBRATED — Calibrated Act–Ask–Abstain Gating (CAAG, IJCOPE 2026-05): act on a
 * confidence-weighted decision only when confidence is calibrated, else ask/abstain; I-CALM (arXiv 2604.03904 2026)
 * + Stable Miscalibration in LLMs (arXiv 2608.13591 2026): raw model confidence is systematically OVERconfident, so
 * the practical gate is Expected Calibration Error (ECE) with a target < 0.05 before confidence is trusted. ODG can
 * MEASURE calibration (eval-metrics.reliabilityBins / brierScore) but NO runtime module turns it into a verdict or
 * GATES a decision on it (grep-verified: no ECE/calibrationError/overconfidence consumer; the arbiter, p11-document-
 * routing, cognitive-decision all trust raw confidence). This gate composes the existing primitives — it computes ECE
 * from the bins eval-metrics already returns and refuses to certify confidence that is uncalibrated or integrity-
 * compromised. It takes NO decision and grants NO authority — it only WITHHOLDS trust (not an accusation, §63). Dual export.
 */

const METRICS = require("./eval-metrics");             // reliabilityBins + brierScore (calibration primitives)
const MI = require("./meta-intelligence");             // assessIntegrity — contaminated eval cannot establish trust

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function num(v: any, d = 0): number { return typeof v === "number" && isFinite(v) ? v : d; }
function round(n: number): number { return Number(n.toFixed(6)); }

const VERDICT = Object.freeze(["CALIBRATED", "OVERCONFIDENT", "MISCALIBRATED", "UNTRUSTED", "NO_DATA"]);
const DECISION = Object.freeze({ CALIBRATED: "ACT", OVERCONFIDENT: "ASK_OR_ABSTAIN", MISCALIBRATED: "ASK_OR_ABSTAIN", UNTRUSTED: "ABSTAIN", NO_DATA: "ABSTAIN" });

/** expectedCalibrationError(bins, n) -> sample-weighted mean |observed − meanPredicted| over non-empty bins. */
function expectedCalibrationError(bins: any[], n: number): number {
  if (!(n > 0)) return 1;
  let ece = 0;
  for (const b of arr(bins)) { if (b && b.n > 0 && b.meanPredicted !== null && b.observed !== null) ece += (b.n / n) * Math.abs(b.observed - b.meanPredicted); }
  return round(ece);
}

/** worst OVER-confidence gap among high-confidence bins (meanPredicted ≥ highBand): predicted − observed. */
function overconfidenceGap(bins: any[], highBand: number): number {
  let gap = 0;
  for (const b of arr(bins)) { if (b && b.n > 0 && b.meanPredicted !== null && b.observed !== null && b.meanPredicted >= highBand) gap = Math.max(gap, b.meanPredicted - b.observed); }
  return round(gap);
}

/**
 * assessCalibration({samples, maxECE, minSamples, nBins, highBand, maxOverconfidence, integritySignals})
 *   samples: eval-metrics CalibrationSample[] = { p, outcome }
 * -> { verdict, trusted, decision, ece, brier, n, overconfidenceGap, integrity, reasons, selfAuthorized, grantsAuthority }.
 * Fail-closed: n<minSamples ⇒ NO_DATA; integrity DETECTED/SUSPECTED ⇒ UNTRUSTED; ECE>maxECE or high-bin overconfidence ⇒ not CALIBRATED.
 */
function assessCalibration(input: any): any {
  const o = isObj(input) ? input : {};
  const samples = arr(o.samples).filter((s) => isObj(s) && typeof s.p === "number");
  const n = samples.length;
  const maxECE = Math.max(0, num(o.maxECE, 0.05));
  const minSamples = Math.max(1, Math.floor(num(o.minSamples, 20)));
  const nBins = Math.max(2, Math.floor(num(o.nBins, 10)));
  const highBand = Math.min(1, Math.max(0, num(o.highBand, 0.8)));
  const maxOverconfidence = Math.max(0, num(o.maxOverconfidence, 0.1));

  if (n < minSamples) return gate("NO_DATA", n, { ece: null, brier: null, overconfidenceGap: null, integrity: "NO_DATA" }, [`only ${n} calibration samples (< minSamples ${minSamples}) — confidence UNtrusted (fail-closed)`]);

  const bins = METRICS.reliabilityBins(samples, nBins);
  const ece = expectedCalibrationError(bins, n);
  const brier = METRICS.brierScore(samples);
  const ocGap = overconfidenceGap(bins, highBand);
  const integrity = MI.assessIntegrity(isObj(o.integritySignals) ? o.integritySignals : {});

  const reasons: string[] = [];
  // integrity-compromised calibration evidence cannot establish trust.
  if (integrity.overall === "DETECTED" || integrity.overall === "SUSPECTED") { reasons.push(`calibration evidence integrity ${integrity.overall} — cannot certify (fail-closed)`); return gate("UNTRUSTED", n, { ece, brier, overconfidenceGap: ocGap, integrity: integrity.overall }, reasons); }

  if (ece <= maxECE && ocGap <= maxOverconfidence) return gate("CALIBRATED", n, { ece, brier, overconfidenceGap: ocGap, integrity: integrity.overall }, [`ECE ${ece} ≤ ${maxECE} and high-confidence overconfidence ${ocGap} ≤ ${maxOverconfidence} — confidence may drive ACT`]);
  if (ocGap > maxOverconfidence) reasons.push(`high-confidence bins over-predict by ${ocGap} (> ${maxOverconfidence}) — OVERCONFIDENT`);
  if (ece > maxECE) reasons.push(`ECE ${ece} exceeds target ${maxECE}`);
  const verdict = ocGap > maxOverconfidence ? "OVERCONFIDENT" : "MISCALIBRATED";
  return gate(verdict, n, { ece, brier, overconfidenceGap: ocGap, integrity: integrity.overall }, reasons);
}

function gate(verdict: string, n: number, m: any, reasons: string[]): any {
  return Object.freeze({
    verdict, trusted: verdict === "CALIBRATED", decision: (DECISION as any)[verdict] || "ABSTAIN",
    ece: m.ece, brier: m.brier, overconfidenceGap: m.overconfidenceGap, n, integrity: m.integrity,
    reasons: Object.freeze(reasons),
    selfAuthorized: false, grantsAuthority: false,   // withholds trust only; grants nothing (§63)
  });
}

const CALIBRATION_TRUST_CONTRACT = Object.freeze({
  id: "V124-CALIBRATION-TRUST-GATE",
  source: "SÉRIE 23 central-intelligence — calibration-gated decisions / ECE (CAAG IJCOPE 2026-05; I-CALM 2604.03904; Stable-Miscalibration 2608.13591 2026)",
  verdicts: VERDICT,
  reuses: Object.freeze(["eval-metrics.reliabilityBins + brierScore (ECE aggregation, no new primitive)", "meta-intelligence.assessIntegrity (contaminated eval ⇒ cannot certify)", "consumed-by champion-challenger-arbiter / p11-document-routing / cognitive-decision (referenced, not modified)"]),
  notAuthority: "withholds trust in a scorer's confidence; it takes no decision and grants no authority (Act-Ask-Abstain upstream signal)",
  invariants: Object.freeze([
    "confidence may drive ACT only when CALIBRATED: ECE ≤ target AND high-confidence bins not overconfident AND n ≥ minSamples AND integrity clean",
    "ECE > target ⇒ MISCALIBRATED; high-confidence bins over-predicting ⇒ OVERCONFIDENT; both ⇒ ASK_OR_ABSTAIN (never ACT)",
    "insufficient samples ⇒ NO_DATA; integrity DETECTED/SUSPECTED ⇒ UNTRUSTED — deny-by-default, confidence never acted on unproven",
    "pure/deterministic closed-form ECE (sample-weighted bin reliability gap); no clock/random/network; selfAuthorized:false",
  ]),
});

module.exports = { expectedCalibrationError, overconfidenceGap, assessCalibration, CALIBRATION_TRUST_CONTRACT };

if (require.main === module) {
  const good = Array.from({ length: 40 }, (_, i) => ({ p: 0.9, outcome: i < 36 ? 1 : 0 }));   // 0.9 stated, 0.9 observed
  process.stdout.write(JSON.stringify({ ...CALIBRATION_TRUST_CONTRACT, demo: assessCalibration({ samples: good }) }, null, 2) + "\n");
}

export {};
