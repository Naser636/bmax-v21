#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V37 LOT E — INTELLIGENCE SCORECARD (measured, per-dimension). PURE, deterministic, fail-closed. It builds
 * no new benchmark engine — it COMPOSES the measured results of the EXISTING benchmarks/capabilities into a per-dimension
 * scorecard. HARD RULE (§6): NO single global score that could mask a weak dimension. Each dimension carries its value,
 * denominator, data kind (REAL / SYNTHETIC / SIMULATED / ADVERSARIAL — never conflated) and a measurability flag. A
 * dimension with no denominator is NOT_MEASURABLE (never scored favourably). The scorecard surfaces the WEAKEST dimension
 * and refuses to present a SYNTHETIC result as real operational performance. Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

const DATA_KINDS = Object.freeze(["REAL", "SYNTHETIC", "SIMULATED", "ADVERSARIAL"]);

/** scoreDimension(d) -> { name, value, denominator, dataKind, measurable, note }. FAIL-CLOSED: no denominator ⇒ NOT
 *  measurable (not scored); an unknown data kind ⇒ UNSPECIFIED (not presented as real). */
function scoreDimension(d: any): any {
  const x = isObj(d) ? d : {};
  const denom = Number(x.denominator);
  const measurable = Number.isFinite(denom) && denom > 0 && Number.isFinite(Number(x.value));
  const dataKind = DATA_KINDS.indexOf(String(x.dataKind).toUpperCase()) >= 0 ? String(x.dataKind).toUpperCase() : "UNSPECIFIED";
  return Object.freeze({
    name: x.name || "(dimension)", value: measurable ? Number(Number(x.value).toFixed(4)) : null,
    denominator: Number.isFinite(denom) ? denom : 0, dataKind, measurable,
    note: !measurable ? "NOT_MEASURABLE (no denominator / value) — never scored favourably" : (dataKind !== "REAL" ? `${dataKind} result — NOT real operational performance` : "measured on real data"),
  });
}

/**
 * buildScorecard(dimensions) -> { dimensions:[...], weakest, notMeasurable, syntheticCount, summary }. NO single global
 * score. It surfaces the weakest MEASURABLE dimension and counts the non-real and not-measurable ones honestly.
 */
function buildScorecard(dimensions: any): any {
  const ds = arr(dimensions).map(scoreDimension);
  const measurable = ds.filter((d) => d.measurable);
  const weakest = measurable.length ? measurable.reduce((w, d) => (d.value < w.value ? d : w)) : null;
  return Object.freeze({
    dimensions: Object.freeze(ds),
    weakest: weakest ? { name: weakest.name, value: weakest.value, dataKind: weakest.dataKind } : null,
    notMeasurable: Object.freeze(ds.filter((d) => !d.measurable).map((d) => d.name)),
    nonRealDimensions: Object.freeze(ds.filter((d) => d.measurable && d.dataKind !== "REAL").map((d) => ({ name: d.name, kind: d.dataKind }))),
    summary: Object.freeze({
      total: ds.length, measurable: measurable.length, notMeasurable: ds.length - measurable.length,
      realMeasured: ds.filter((d) => d.measurable && d.dataKind === "REAL").length,
      note: "per-dimension only — NO single global score (a global number would mask the weakest dimension); SYNTHETIC/SIMULATED/ADVERSARIAL results are flagged and are NOT real operational performance",
    }),
  });
}

/** comparePredictionToOutcome(predicted, observed) -> { error, within, note }. Measures prediction vs real result. */
function comparePredictionToOutcome(predicted: any, observed: any, tolerance: any = 0.1): any {
  const p = Number(predicted), o = Number(observed), t = Number(tolerance);
  if (!Number.isFinite(p) || !Number.isFinite(o)) return Object.freeze({ error: null, within: null, note: "insufficient data to compare prediction to outcome" });
  const error = Number(Math.abs(p - o).toFixed(4));
  return Object.freeze({ error, within: error <= (Number.isFinite(t) ? t : 0.1), note: `|predicted ${p} − observed ${o}| = ${error}` });
}

const INTELLIGENCE_SCORECARD_CONTRACT = Object.freeze({
  id: "V124-INTELLIGENCE-SCORECARD",
  source: "CTO V37 LOT E — per-dimension measured intelligence (no global score)",
  reuses: Object.freeze(["the measured results of the existing benchmarks/capabilities (composed)"]),
  notAuthority: "aggregates measured dimensions into an honest per-dimension scorecard; it measures nothing new and authorizes nothing",
  invariants: Object.freeze([
    "NO single global score — a per-dimension view only (a global number would mask a weak dimension)",
    "each dimension carries its denominator + data kind (REAL/SYNTHETIC/SIMULATED/ADVERSARIAL) — never conflated; a SYNTHETIC result is NOT real operational performance",
    "a dimension with no denominator/value is NOT_MEASURABLE (never scored favourably)",
    "the weakest measurable dimension is surfaced (no averaging-away of a weakness)",
    "predictions are compared to real outcomes; pure/deterministic",
  ]),
});

module.exports = { DATA_KINDS, scoreDimension, buildScorecard, comparePredictionToOutcome, INTELLIGENCE_SCORECARD_CONTRACT };

if (require.main === module) {
  const sc = buildScorecard([
    { name: "repair-false-success", value: 1.0, denominator: 7, dataKind: "synthetic" },
    { name: "recovery-no-silent-loss", value: 1.0, denominator: 4, dataKind: "synthetic" },
    { name: "native-3file-build", value: 1.0, denominator: 3, dataKind: "real" },
    { name: "calibration-on-real-data", value: 0, denominator: 0, dataKind: "real" },
  ]);
  process.stdout.write(JSON.stringify({ ...INTELLIGENCE_SCORECARD_CONTRACT, demo: { noGlobalScore: true, weakest: sc.weakest, notMeasurable: sc.notMeasurable } }, null, 2) + "\n");
}

export {};
