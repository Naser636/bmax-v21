#!/usr/bin/env node
"use strict";
/*
 * V360 §14 C3 / §8 — MODEL INTELLIGENCE VIEW: "which model/route, and did it MEASURABLY win?". PURE, deterministic,
 * fail-closed, READ-ONLY. Unifies the fragmented model/route selection + its performance into one honest view that
 * COMPOSES the canonical modules — it is NOT a second selector/router/measurer:
 *   - WHICH route/model: odg-execution-routing.routeType (calibrated P(success) over REAL observed outcomes — evidence,
 *     NOT popularity/recency; NATIVE_LOCAL / ESCALATE_PROVIDER / NATIVE_PROBE).
 *   - DID IT WIN: performance-observability.compareReproducible (a latency gain is credited ONLY when reproducible — enough
 *     samples on both sides AND low variance; a noisy one-off is never a win) + latency-measure.summarizeSamples.
 *
 * HONESTY (§8): activity ≠ intelligence — a WIN requires BOTH a calibrated selection AND a reproducible measured gain; a
 * one-off/thin/variance-noisy improvement is NOT_MEASURED, never credited. Selection on NO calibrated evidence is a PROBE
 * (gather data), never a confident pick. The view RECOMMENDS only (selfAuthorized:false, authorizes:false) — it changes no
 * router and applies no model; a real route/model change stays governed.
 */

const ROUTE = require("./odg-execution-routing.js");       // calibrated route/tier selection (no second router)
const PERF = require("./performance-observability.js");    // reproducible before/after (no second measurer)
const LAT = require("./latency-measure.js");               // per-route latency summary

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

// classify the selected route as "native" or "provider" (explicit kind wins; else inferred from the route name). UNKNOWN ⇒
// reliability alignment cannot be verified ⇒ a speed gain is NOT promoted to a full MEASURED_WIN (honest, fail-closed).
function routeKind(route: any, explicit: any): string {
  if (explicit === "native" || explicit === "provider") return explicit;
  const r = String(route == null ? "" : route).toLowerCase();
  const nativeish = /native|local/.test(r);
  const providerish = /provider|remote|cloud|api|escalat/.test(r);
  if (nativeish && providerish) return "unknown"; // AMBIGUOUS name (both token sets) ⇒ fail-closed, not resolved by regex order
  if (nativeish) return "native";
  if (providerish) return "provider";
  return "unknown";
}

/**
 * assessModelIntelligence(input, opts?) -> frozen view. input: {
 *   missionType, history: [{ missionType|type, status|verified, ... }] (REAL observed outcomes per odg-calibrated-psuccess;
 *     a `success` field is NOT counted — use status ACCEPTED/VALIDATED/REJECTED/FAILED or verified true/false),
 *   selected: { route, latencyMs: number[] } (the chosen route/model + its latency samples),
 *   baseline?: { route, latencyMs: number[] } (the alternative/prior route to compare against) }.
 *   opts: { minSamples? (default 3 for the perf compare), maxVarianceRatio? (1.5), minSampleN? (20 for latency summary) }.
 * Answers "which route (calibrated) and did it measurably beat the baseline (reproducibly)?". Recommends only.
 */
function assessModelIntelligence(input: any, opts: any = {}): any {
  const i = isObj(input) ? input : {};
  const o = isObj(opts) ? opts : {};
  const selected = isObj(i.selected) ? i.selected : {};
  const baseline = isObj(i.baseline) ? i.baseline : null;
  const minSampleN = Math.max(1, Math.floor(o.minSampleN || 20));

  // (1) WHICH route/model — calibrated selection over REAL outcomes (evidence, not popularity). The calibrated tier names the
  // RELIABILITY-preferred route class; `reliabilityAligned` checks the SELECTED route is that class (speed ≠ reliability).
  const routing = ROUTE.routeType(i.missionType, arr(i.history), isObj(o.routeOpts) ? o.routeOpts : {});
  const calibrated = routing.quality === "CALIBRATED";
  const preferred = routing.tier === ROUTE.TIER.NATIVE_LOCAL ? "native" : routing.tier === ROUTE.TIER.ESCALATE_PROVIDER ? "provider" : "probe";
  const kind = routeKind(selected.route, selected.kind);
  const reliabilityAligned = !calibrated ? "N/A" : kind === "unknown" ? "UNKNOWN" : (preferred === kind ? "ALIGNED" : "MISALIGNED");
  const selection = freeze({ route: typeof selected.route === "string" ? selected.route : null, kind, tier: routing.tier, reliabilityPreferred: preferred, reliabilityAligned, calibrated, pForPlanner: routing.pForPlanner, basis: calibrated ? "CALIBRATED P(success) over real observed outcomes" : "NO calibrated evidence ⇒ PROBE (gather data; never a confident pick)", reason: routing.reason });

  // (2) per-route latency summaries (honest: thin sample ⇒ INSUFFICIENT_EVIDENCE, never generalized).
  const selectedLatency = LAT.summarizeSamples(arr(selected.latencyMs), minSampleN);
  const baselineLatency = baseline ? LAT.summarizeSamples(arr(baseline.latencyMs), minSampleN) : null;

  // (3) DID IT WIN — reproducible before/after (baseline → selected). A gain is credited ONLY when reproducible.
  let comparison: any = null; let measuredPerformance = "NOT_MEASURED";
  if (baseline && arr(selected.latencyMs).length && arr(baseline.latencyMs).length) {
    comparison = PERF.compareReproducible({ before: arr(baseline.latencyMs), after: arr(selected.latencyMs), minSamples: o.minSamples, maxVarianceRatio: o.maxVarianceRatio });
    if (!comparison.reproducible) measuredPerformance = "NOT_REPRODUCIBLE";
    else if (typeof comparison.reductionPct === "number" && comparison.reductionPct > 0) measuredPerformance = "FASTER_REPRODUCIBLE";
    else if (typeof comparison.reductionPct === "number" && comparison.reductionPct < 0) measuredPerformance = "SLOWER_REPRODUCIBLE";
    else measuredPerformance = "NO_DIFFERENCE";
  }

  // (4) overall verdict — a WIN needs calibrated selection, RELIABILITY alignment, AND a reproducible measured gain. Reliability
  // dominates speed: a reproducibly faster route that calibrated evidence routes AWAY from is NOT a win (speed ≠ reliability).
  let verdict: string; let recommendation: string;
  if (!calibrated) { verdict = "INSUFFICIENT_EVIDENCE"; recommendation = "PROBE the selected route natively to gather outcome data; do NOT confidently prefer a model on no calibrated evidence"; }
  else if (reliabilityAligned === "MISALIGNED") { verdict = "RELIABILITY_OVERRIDES_SPEED"; recommendation = `calibrated evidence favors the ${preferred} route (native P=${routing.pForPlanner}); the selected ${kind} route is NOT the reliable choice${measuredPerformance === "FASTER_REPRODUCIBLE" ? ", even though it was reproducibly faster" : ""} — speed ≠ reliability`; }
  else if (measuredPerformance === "FASTER_REPRODUCIBLE") { verdict = reliabilityAligned === "ALIGNED" ? "MEASURED_WIN" : "MEASURED_FASTER_RELIABILITY_UNVERIFIED"; recommendation = reliabilityAligned === "ALIGNED" ? `prefer ${selection.route} — calibrated-aligned AND a reproducible ${comparison.reductionPct}% latency reduction vs baseline` : `reproducibly ${comparison.reductionPct}% faster, but the route class is unknown ⇒ reliability alignment UNVERIFIED (supply selected.kind) — not promoted to a full win`; }
  else if (measuredPerformance === "SLOWER_REPRODUCIBLE") { verdict = "MEASURED_REGRESSION"; recommendation = `reconsider: the selected route is reproducibly SLOWER than the baseline — a measured regression, not a win`; }
  else if (measuredPerformance === "NO_DIFFERENCE") { verdict = "SELECTED_NO_MEASURED_GAIN"; recommendation = "keep the calibrated selection, but there is NO reproducible latency difference — do not claim a performance win"; }
  else { verdict = "SELECTED_UNMEASURED"; recommendation = "calibrated selection stands, but performance is NOT_MEASURED (no/thin/variance-noisy samples) — collect reproducible before/after before claiming a gain"; }

  return freeze({
    selection, selectedLatency: freeze(selectedLatency), baselineLatency: baselineLatency ? freeze(baselineLatency) : null,
    comparison: comparison ? freeze({ reproducible: comparison.reproducible, reductionPct: comparison.reductionPct, beforeP50: comparison.beforeP50, afterP50: comparison.afterP50 }) : null,
    measuredPerformance, verdict, recommendation,
    authorizes: false, selfAuthorized: false,            // recommends only; a real route/model change is governed
    note: "WHICH route = calibrated P(success) (evidence, not popularity); DID IT WIN = reproducible before/after (enough samples + low variance). activity ≠ intelligence: a WIN needs BOTH a calibrated selection AND a reproducible measured gain — a one-off/thin/noisy improvement is NOT_MEASURED, never credited. Recommends only; applies nothing.",
  });
}

const MODEL_INTELLIGENCE_CONTRACT = Object.freeze({
  id: "V360-MODEL-INTELLIGENCE",
  purpose: "§14 C3 / §8 — unified 'which model/route, and did it MEASURABLY win?' view: calibrated selection + reproducible before/after measurement; composes the canonical selector + measurer; recommends only",
  reuses: Object.freeze([
    "odg-execution-routing.routeType (calibrated P(success) selection — evidence, not popularity; no second router)",
    "performance-observability.compareReproducible (a gain credited ONLY when reproducible — samples + low variance; no second measurer)",
    "latency-measure.summarizeSamples (per-route latency, thin ⇒ INSUFFICIENT_EVIDENCE)",
  ]),
  invariants: Object.freeze([
    "WHICH route/model is driven by CALIBRATED P(success) over real observed outcomes — NOT popularity/recency; no calibrated evidence ⇒ PROBE (never a confident pick)",
    "activity ≠ intelligence: a MEASURED_WIN requires a calibrated selection, RELIABILITY alignment (the selected route IS the calibrated-preferred class), AND a reproducible latency gain; a one-off/thin/variance-noisy improvement is NOT_MEASURED, never credited",
    "reliability dominates speed: a reproducibly FASTER route that calibrated evidence routes AWAY from is RELIABILITY_OVERRIDES_SPEED, not a win (speed ≠ reliability); unknown route class ⇒ alignment UNVERIFIED (not a full win)",
    "a reproducible regression is reported as MEASURED_REGRESSION (not hidden); NO_DIFFERENCE is not a win",
    "READ-ONLY / recommends only (selfAuthorized:false, authorizes:false) — changes no router, applies no model; composes the canonical selector+measurer, no second engine",
  ]),
});

module.exports = { assessModelIntelligence, MODEL_INTELLIGENCE_CONTRACT };
export {};
