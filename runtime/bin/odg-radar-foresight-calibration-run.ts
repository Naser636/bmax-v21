#!/usr/bin/env node
"use strict";
/*
 * V360 §14 C2 — FORESIGHT-CALIBRATED RADAR SELF-EVALUATION RUN (demonstrator). Shows the Radar's PROPOSED source re-weighting
 * being driven by REALIZED forecast accuracy OVER TIME: it resolves a batch of source-tagged forecasts (odg-forecast-memory),
 * then odg-radar-foresight-calibration derives per-source realized accuracy and PROPOSES (only) which sources to down-weight /
 * trust / discount, and re-grounds the canonical frontier-radar-self-improvement on the resolved outcomes. READ-ONLY,
 * deterministic. Signals + observations are SYNTHETIC (clearly labelled) — a mechanism demonstration, not real radar sources.
 *
 * Usage: npx tsx runtime/bin/odg-radar-foresight-calibration-run.ts
 */
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const FM = require(path.join(ROOT, "runtime", "core", "odg-forecast-memory.js"));
const FC = require(path.join(ROOT, "runtime", "core", "odg-radar-foresight-calibration.js"));

const DAY = 24 * 3600 * 1000;
const T0 = Date.UTC(2026, 0, 1);

// SYNTHETIC source-tagged forecasts across two radar sources with DIFFERENT realized track records.
// srcA = well-calibrated / mostly materialize within horizon; srcB = overconfident / mostly false signals.
function fc(source: string, k: number, confidence: number, horizonDays: number): any {
  return FM.openForecast({ id: `${source}:${k}`, source, claim: `${source} forecast ${k}`, provenance: source, confidence, horizonDays }, T0);
}
const srcA = Array.from({ length: 6 }, (_, k) => fc("radar:arxiv", k, 0.8, 30));
const srcB = Array.from({ length: 6 }, (_, k) => fc("radar:hype-blog", k, 0.9, 30));

// SYNTHETIC later reality: srcA mostly materializes within horizon; srcB mostly does not.
const evalAt = T0 + 40 * DAY;
const resA = srcA.map((f: any, k: number) => ({ ...FM.resolveForecast(f, { materialized: k < 5, observedAtMs: T0 + 20 * DAY }, evalAt), source: "radar:arxiv" }));
const resB = srcB.map((f: any, k: number) => ({ ...FM.resolveForecast(f, { materialized: k < 1, observedAtMs: T0 + 20 * DAY }, evalAt), source: "radar:hype-blog" }));

const report = FC.assessForesightCalibration({ resolutions: [...resA, ...resB] }, { minDecided: 5 });

process.stdout.write(JSON.stringify({
  foresightCalibration: "V360 §14 C2 — Radar source re-weighting driven by REALIZED forecast accuracy over time. SYNTHETIC demonstration — not real radar sources.",
  bySource: report.bySource,
  proposals: report.proposals,
  radarSelfImprovement: { measurable: report.radarSelfImprovement.measurable, metrics: report.radarSelfImprovement.metrics, proposals: report.radarSelfImprovement.proposals, selfAuthorized: report.radarSelfImprovement.selfAuthorized },
  selfAuthorized: report.selfAuthorized,
}, null, 2) + "\n");
process.stdout.write(`\nFORESIGHT-CALIBRATION: ${report.measurableSources} measurable source(s); ${report.proposals.length} PROPOSED re-weighting(s) driven by realized accuracy over time; radar self-eval measurable=${report.radarSelfImprovement.measurable}. ` +
  `All PROPOSED (selfAuthorized=${report.selfAuthorized}) — the Radar never self-applies a source weight. A source is re-weighted only on ≥ minDecided resolved forecasts (fail-closed under noise); EXPIRED/PENDING excluded (no fabricated ground truth). SYNTHETIC demonstration.\n`);
process.exit(0);
export {};
