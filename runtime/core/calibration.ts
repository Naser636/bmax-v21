#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V34 LOT B (§2–§4) — PREDICTION CALIBRATION & SELECTION-BIAS GUARD. PURE, deterministic, fail-closed. It
 * does NOT create a new estimator — it MEASURES whether predicted probabilities match observed outcomes (Brier score,
 * reliability) and GUARDS an estimate against the selection bias found in V34's data audit: the canonical register records
 * governed CLOSURE decisions (ACCEPTED) and ~no FAILED/REJECTED items, so its ACCEPTED-rate is SURVIVORSHIP-BIASED and must
 * NOT be served as a calibrated P(success). FAIL-CLOSED: a biased / insufficient / stale / empty source yields a DEGRADED
 * or UNKNOWN estimate — NEVER artificial confidence. An estimate never authorizes anything. Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function clamp01(n: any): number { const x = Number(n); return Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : NaN; }

const MIN_OBSERVATIONS = 20;    // below this, an estimate is statistically DEGRADED
const BRIER_CALIBRATED = 0.15;  // mean Brier ≤ this ⇒ reasonably calibrated (0=perfect, 0.25=always-0.5)

/** brierScore(predictions) -> { brier, n }. predictions: [{ p (0..1), outcome (0|1) }]. Brier = mean((p−outcome)^2). */
function brierScore(predictions: any): any {
  const ps = arr(predictions).filter((x) => isObj(x) && Number.isFinite(clamp01(x.p)) && (x.outcome === 0 || x.outcome === 1));
  if (ps.length === 0) return Object.freeze({ brier: null, n: 0 });
  const s = ps.reduce((a, x) => a + Math.pow(clamp01(x.p) - x.outcome, 2), 0);
  return Object.freeze({ brier: Number((s / ps.length).toFixed(4)), n: ps.length });
}

/** reliabilityBins(predictions, nbins=5) -> per-bin predicted-vs-observed (calibration curve). */
function reliabilityBins(predictions: any, nbins: number = 5): any {
  const ps = arr(predictions).filter((x) => isObj(x) && Number.isFinite(clamp01(x.p)) && (x.outcome === 0 || x.outcome === 1));
  const bins: any[] = Array.from({ length: nbins }, (_, i) => ({ bin: i, lo: i / nbins, hi: (i + 1) / nbins, n: 0, predicted: 0, observed: 0 }));
  for (const x of ps) { const p = clamp01(x.p); const idx = Math.min(nbins - 1, Math.floor(p * nbins)); bins[idx].n++; bins[idx].predicted += p; bins[idx].observed += x.outcome; }
  return Object.freeze(bins.map((b) => Object.freeze({ bin: b.bin, range: [b.lo, b.hi], n: b.n, meanPredicted: b.n ? Number((b.predicted / b.n).toFixed(4)) : null, meanObserved: b.n ? Number((b.observed / b.n).toFixed(4)) : null })));
}

/**
 * assessSelectionBias({ successes, failures, source }) -> { biased, reason }. A source with observations but ~no recorded
 * FAILURES (and failures are recordable) is survivorship-biased — an estimator over it would be over-confident.
 */
function assessSelectionBias(input: any): any {
  const o = isObj(input) ? input : {};
  const successes = Math.max(0, Math.floor(Number(o.successes) || 0));
  const failures = Math.max(0, Math.floor(Number(o.failures) || 0));
  const n = successes + failures;
  if (n === 0) return Object.freeze({ biased: false, reason: "no observations" });
  if (failures === 0 && successes >= 10) return Object.freeze({ biased: true, reason: `survivorship bias: ${successes} successes and 0 recorded failures — the source records only accepted outcomes; its success-rate is NOT an unbiased P(success)` });
  return Object.freeze({ biased: false, reason: `${failures} failures recorded among ${n} — failures are represented` });
}

/**
 * calibratedEstimate(raw, opts) -> { p, quality, uncertainty, reason }. raw: { p, observations, successes?, failures?,
 * ageDays?, source? }. quality ∈ { CALIBRATED | DEGRADED | BIASED | UNKNOWN }. FAIL-CLOSED: no data ⇒ UNKNOWN; biased ⇒
 * BIASED (p reported but NOT trustworthy as confidence); insufficient/stale ⇒ DEGRADED. An estimate never authorizes.
 */
function calibratedEstimate(raw: any, opts: any = {}): any {
  const r = isObj(raw) ? raw : {};
  const n = Math.max(0, Math.floor(Number(r.observations) || 0));
  const maxAge = Number(opts.maxAgeDays) || 365;
  if (n === 0) return Object.freeze({ p: null, quality: "UNKNOWN", uncertainty: null, reason: "no observations — UNKNOWN (never a favourable default)", authorizes: false });
  const bias = assessSelectionBias({ successes: r.successes, failures: r.failures, source: r.source });
  const p = clamp01(r.p);
  // Wilson-ish uncertainty half-width ~ 1/sqrt(n) (coarse; reported, not hidden).
  const uncertainty = Number((1 / Math.sqrt(n)).toFixed(4));
  if (bias.biased) return Object.freeze({ p: Number.isFinite(p) ? p : null, quality: "BIASED", uncertainty, reason: `${bias.reason} — reported but NOT usable as calibrated confidence`, authorizes: false });
  if (Number.isFinite(Number(r.ageDays)) && Number(r.ageDays) > maxAge) return Object.freeze({ p: Number.isFinite(p) ? p : null, quality: "DEGRADED", uncertainty, reason: `stale (${r.ageDays}d > ${maxAge}d) — DEGRADED`, authorizes: false });
  if (n < MIN_OBSERVATIONS) return Object.freeze({ p: Number.isFinite(p) ? p : null, quality: "DEGRADED", uncertainty, reason: `insufficient sample (${n} < ${MIN_OBSERVATIONS}) — DEGRADED, wide uncertainty`, authorizes: false });
  return Object.freeze({ p: Number.isFinite(p) ? p : null, quality: "CALIBRATED", uncertainty, reason: `${n} observations with recorded failures; uncertainty ±${uncertainty}`, authorizes: false });
}

/** calibrationVerdict(predictions) -> { brier, calibrated, n, note }. calibrated only if n sufficient AND Brier ≤ threshold. */
function calibrationVerdict(predictions: any): any {
  const b = brierScore(predictions);
  const calibrated = b.n >= MIN_OBSERVATIONS && b.brier !== null && b.brier <= BRIER_CALIBRATED;
  return Object.freeze({ brier: b.brier, n: b.n, calibrated, bins: reliabilityBins(predictions), note: b.n < MIN_OBSERVATIONS ? "insufficient predictions to judge calibration (NOT calibrated by default)" : (calibrated ? "predictions track outcomes (Brier within bound)" : "predictions do NOT track outcomes — mis-calibrated") });
}

const CALIBRATION_CONTRACT = Object.freeze({
  id: "V124-CALIBRATION",
  source: "CTO V34 LOT B — prediction calibration + selection-bias guard (composes the estimator, no new memory)",
  reuses: Object.freeze(["continuous-planner.estimateSuccess output (wrapped, not replaced)", "verified register/outcome samples"]),
  notAuthority: "measures calibration and guards an estimate against bias/insufficiency; it estimates nothing new and authorizes nothing",
  invariants: Object.freeze([
    "a survivorship-biased source (observations but ~0 recorded failures) ⇒ BIASED — its rate is NOT served as calibrated confidence",
    "no observations ⇒ UNKNOWN; insufficient/stale ⇒ DEGRADED — never artificial confidence",
    "calibration is CALIBRATED only with a sufficient sample AND a Brier within bound; insufficient ⇒ not calibrated by default",
    "uncertainty is reported, never hidden; a missing datum is never a success",
    "an estimate NEVER authorizes a mission (authorizes:false always); pure/deterministic",
  ]),
});

module.exports = { MIN_OBSERVATIONS, BRIER_CALIBRATED, brierScore, reliabilityBins, assessSelectionBias, calibratedEstimate, calibrationVerdict, CALIBRATION_CONTRACT };

if (require.main === module) {
  const biased = calibratedEstimate({ p: 0.9633, observations: 409, successes: 395, failures: 0, source: "closure-register" });
  const good = calibrationVerdict([{ p: 0.9, outcome: 1 }, { p: 0.1, outcome: 0 }]);
  process.stdout.write(JSON.stringify({ ...CALIBRATION_CONTRACT, demo: { registerEstimateQuality: biased.quality, authorizes: biased.authorizes } }, null, 2) + "\n");
}

export {};
