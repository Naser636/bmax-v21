#!/usr/bin/env node
"use strict";
/*
 * V360 §6 (anticipation) — FORECAST MEMORY RUN (runtime entry / demonstrator). Shows the prediction-accuracy-over-time loop
 * end-to-end: radar-shaped signals → open forecasts (with horizon + confidence + provenance) → resolve retrospectively against
 * OBSERVED reality → score hit-rate / false-signal / missed / lead-time + confidence calibration. READ-ONLY, deterministic
 * (injected clock). The signals + observations here are SYNTHETIC (clearly labelled) — a demonstration of the mechanism, NOT
 * real market traction and NOT a real forecast about the world.
 *
 * Usage: npx tsx runtime/bin/odg-forecast-memory-run.ts
 */
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const FM = require(path.join(ROOT, "runtime", "core", "odg-forecast-memory.js"));

const DAY = 24 * 3600 * 1000;
const T0 = Date.UTC(2026, 0, 1); // fixed injected clock (deterministic; no Date.now in the demonstrated mechanism)

// SYNTHETIC radar-shaped signals (provenance + confidence + domain). NOT real forecasts about the world.
const SIGNALS = [
  { id: "S1", claim: "retrieval-augmented agent memory becomes a standard pattern", provenance: "radar:arxiv", confidence: 0.75, horizonDays: 30, domain: "memory" },
  { id: "S2", claim: "a new consensus algorithm displaces Raft in mainstream use", provenance: "radar:github", confidence: 0.35, horizonDays: 30, domain: "orchestration" },
  { id: "S3", claim: "structured-output tool calling becomes the default integration", provenance: "radar:arxiv", confidence: 0.8, horizonDays: 45, domain: "reasoning" },
  { id: "S4", claim: "on-device small models reach parity for code repair", provenance: "radar:github", confidence: 0.6, horizonDays: 60, domain: "model-selection" },
];

// open forecasts at T0
const opened = SIGNALS.map((s) => FM.openForecast(s, T0));

// SYNTHETIC later observations (what reality "showed"). Some materialized, some not, one left unresolved.
const OBS: Record<string, any> = {
  S1: { materialized: true, observedAtMs: T0 + 18 * DAY, evidence: "adopted across 3 synthetic frameworks" }, // CONFIRMED early
  S2: { materialized: false }, // REFUTED (false signal)
  S3: { materialized: true, observedAtMs: T0 + 50 * DAY, evidence: "default in 2 synthetic SDKs (slightly late)" }, // CONFIRMED but past 45d horizon
  // S4: no observation supplied ⇒ EXPIRED_UNRESOLVED once the horizon passes
};
const evalAtMs = T0 + 70 * DAY; // evaluate after all horizons have passed
const resolutions = opened.map((f, k) => FM.resolveForecast(f, OBS[SIGNALS[k].id] || { materialized: null }, evalAtMs));

const score = FM.scoreForecasts(resolutions, { minSamples: 1 }); // minSamples 1 for the demo (production uses the default 20)
// a (synthetic) known-events set to exercise missed-events
const missed = FM.missedEvents([{ id: "E-reasoning", domain: "reasoning" }, { id: "E-vision", domain: "multimodal" }], opened);

process.stdout.write(JSON.stringify({
  anticipation: "V360 §6 — forecast memory (prediction-accuracy-over-time). SYNTHETIC demonstration — not real forecasts/traction.",
  openedForecasts: opened.map((f: any) => ({ id: f.id, claim: f.claim, confidence: f.confidence, horizonDays: f.horizonDays, epistemicStatus: f.epistemicStatus })),
  resolutions: resolutions.map((r: any) => ({ id: r.forecastId, verdict: r.verdict, withinHorizon: r.withinHorizon ?? null, leadDays: r.anticipationLeadDays ?? null })),
  score,
  missedEvents: missed,
}, null, 2) + "\n");
process.stdout.write(`\nANTICIPATION: ${score.counts.confirmed} confirmed / ${score.counts.refuted} refuted / ${score.counts.expiredUnresolved} expired-unresolved; hitRate=${score.hitRate}, falseSignalRate=${score.falseSignalRate}, meanLeadDays=${score.anticipationLeadDaysMean}; confidence calibration=${score.calibration.verdict} (Brier=${score.calibration.brier}). ` +
  `A forecast is NEVER a fact; PENDING forecasts are NOT_MEASURED; EXPIRED-with-no-evidence is a NON-hit (never auto-confirmed). Signals + observations are SYNTHETIC (mechanism demonstration, not real-world prediction).\n`);
process.exit(0);
export {};
