#!/usr/bin/env node
"use strict";
/*
 * V360 §14 C2 — FORESIGHT-CALIBRATED RADAR SELF-EVALUATION. PURE, deterministic, fail-closed. Closes the loop between the
 * anticipation ledger (odg-forecast-memory) and the Radar's self-improvement: the Radar's PROPOSED source/classifier changes
 * become driven by REALIZED forecast accuracy OVER TIME (resolved forecasts per source), not just one cycle's hand-supplied
 * ground-truth. It is NOT a second radar / self-eval engine: it COMPOSES forecast-memory.scoreForecasts (per source) and
 * frontier-radar-self-improvement.assessRadarCycle (the canonical self-eval, meta-intelligence integrity-guarded).
 *
 * HONESTY: a source is re-weighted ONLY on ENOUGH resolved (DECIDED) forecasts — fewer ⇒ NOT_MEASURED (never down-weight a
 * source on noise). EXPIRED/PENDING forecasts carry no ground truth and are excluded (reusing the ledger's discipline). Every
 * output is PROPOSED (selfAuthorized:false) — the Radar never self-applies a source weight or modifies its own authorizations.
 */

const FM = require("./odg-forecast-memory.js");                 // per-source realized accuracy (DECIDED-only, fail-closed)
const RSI = require("./frontier-radar-self-improvement.js");    // canonical radar self-eval (meta-intelligence guarded)

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

/**
 * assessForesightCalibration(input, opts?) -> frozen report. input: {
 *   resolutions: [{ forecastId, source, verdict, confidence, outcome, ... }]  (odg-forecast-memory resolutions, source-tagged),
 *   knownMissed?: [ids]  (events the radar failed to anticipate — optional), priorMetrics?, integritySignals? }
 *   opts: { minDecided? (default 5 — a source needs this many DECIDED forecasts before it may be re-weighted),
 *           loHit? (0.3), hiFalse? (0.5), hiHit? (0.7) }.
 * Returns per-source realized accuracy + PROPOSED-only re-weighting, and the canonical radar self-eval re-grounded on the
 * REALIZED (resolved) outcomes. selfAuthorized is always false.
 */
function assessForesightCalibration(input: any, opts: any = {}): any {
  const i = isObj(input) ? input : {};
  const o = isObj(opts) ? opts : {};
  const resolutions = arr(i.resolutions).filter(isObj);
  const minDecided = Math.max(1, Math.floor(o.minDecided || 5));
  const loHit = typeof o.loHit === "number" ? o.loHit : 0.3;
  const hiFalse = typeof o.hiFalse === "number" ? o.hiFalse : 0.5;
  const hiHit = typeof o.hiHit === "number" ? o.hiHit : 0.7;
  const DECIDED = new Set(["CONFIRMED", "CONFIRMED_LATE", "REFUTED"]);

  // group resolutions by source.
  const bySrc: Record<string, any[]> = {};
  for (const r of resolutions) { const s = typeof r.source === "string" && r.source ? r.source : "UNATTRIBUTED"; (bySrc[s] || (bySrc[s] = [])).push(r); }

  // per-source realized accuracy + PROPOSED re-weighting (fail-closed under minDecided).
  const bySource: any[] = []; const proposals: any[] = [];
  for (const src of Object.keys(bySrc).sort()) {
    const rs = bySrc[src];
    const decided = rs.filter((r) => DECIDED.has(r.verdict)).length;
    const score = FM.scoreForecasts(rs, { minSamples: 1 }); // DECIDED-only inside; calibration over decided
    if (decided < minDecided) {
      bySource.push(freeze({ source: src, decided, measurable: false, hitRate: score.hitRate, note: `only ${decided} decided forecasts (< minDecided ${minDecided}) ⇒ NOT_MEASURED — not re-weighted on noise` }));
      continue;
    }
    const entry: any = { source: src, decided, measurable: true, hitRate: score.hitRate, falseSignalRate: score.falseSignalRate, lateRate: score.lateRate, calibration: score.calibration.verdict };
    bySource.push(freeze(entry));
    // PROPOSED-only re-weighting, grounded in REALIZED accuracy over time.
    if ((typeof score.hitRate === "number" && score.hitRate < loHit) || (typeof score.falseSignalRate === "number" && score.falseSignalRate > hiFalse)) {
      proposals.push(freeze({ kind: "down-weight-source", source: src, reason: `realized hitRate ${score.hitRate} / falseSignal ${score.falseSignalRate} over ${decided} resolved forecasts`, status: "PROPOSED" }));
    } else if (typeof score.hitRate === "number" && score.hitRate >= hiHit && score.calibration.verdict === "CALIBRATED") {
      proposals.push(freeze({ kind: "trust-source", source: src, reason: `realized hitRate ${score.hitRate} + CALIBRATED over ${decided} resolved forecasts`, status: "PROPOSED" }));
    }
    if (score.calibration.verdict === "OVERCONFIDENT" || score.calibration.verdict === "MISCALIBRATED") {
      proposals.push(freeze({ kind: "discount-confidence-source", source: src, reason: `realized confidence ${score.calibration.verdict} (ECE ${score.calibration.ece})`, status: "PROPOSED" }));
    }
  }

  // re-ground the CANONICAL radar self-eval on REALIZED outcomes: each DECIDED forecast is a verified discovery whose
  // "relevant" = it CONFIRMED within the horizon. EXPIRED/PENDING carry no ground truth ⇒ excluded (no fabrication).
  const discoveries = resolutions.filter((r) => DECIDED.has(r.verdict)).map((r) => ({ id: r.forecastId, relevant: r.verdict === "CONFIRMED" }));
  const radarSelfImprovement = RSI.assessRadarCycle({ discoveries, groundTruth: { knownMissed: arr(i.knownMissed) }, priorMetrics: i.priorMetrics, integritySignals: i.integritySignals });

  return freeze({
    bySource: freeze(bySource),
    proposals: freeze(proposals),                    // PROPOSED source re-weighting (realized-accuracy-driven)
    radarSelfImprovement,                            // the canonical self-eval, now grounded on realized outcomes
    measurableSources: bySource.filter((s: any) => s.measurable).length,
    selfAuthorized: false,                           // the radar never self-applies (§6.6)
    note: "foresight-calibrated radar self-eval: PROPOSED source re-weighting driven by REALIZED forecast accuracy over time (DECIDED-only, fail-closed under minDecided) + the canonical frontier-radar-self-improvement re-grounded on resolved outcomes. Nothing self-applied; EXPIRED/PENDING excluded (no fabricated ground truth).",
  });
}

const FORESIGHT_CALIBRATION_CONTRACT = Object.freeze({
  id: "V360-RADAR-FORESIGHT-CALIBRATION",
  purpose: "§14 C2 — drive the Radar's PROPOSED source/classifier changes from REALIZED forecast accuracy over time (not one cycle); composes forecast-memory + frontier-radar-self-improvement; no second radar/self-eval engine",
  reuses: Object.freeze([
    "odg-forecast-memory.scoreForecasts (per-source realized accuracy — DECIDED-only, fail-closed NO_DATA)",
    "frontier-radar-self-improvement.assessRadarCycle (the canonical radar self-eval, meta-intelligence integrity-guarded) — re-grounded on resolved outcomes",
  ]),
  invariants: Object.freeze([
    "a source is re-weighted ONLY on ≥ minDecided resolved forecasts — fewer ⇒ NOT_MEASURED (never down-weight on noise)",
    "driven by REALIZED (resolved, DECIDED) forecast accuracy over time; EXPIRED/PENDING carry no ground truth and are excluded (no fabrication)",
    "every output is PROPOSED (selfAuthorized:false) — the Radar never self-applies a source weight and never modifies its own authorizations (§6.6)",
    "PURE/deterministic/frozen; composes forecast-memory + frontier-radar-self-improvement; no second radar / self-eval / store",
  ]),
});

module.exports = { assessForesightCalibration, FORESIGHT_CALIBRATION_CONTRACT };
export {};
