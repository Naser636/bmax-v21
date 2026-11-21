#!/usr/bin/env node
"use strict";
/*
 * V361 §2/P1 (A-D,I) — LIGHT-PATH SELECTOR. PURE, deterministic, fail-closed, READ-ONLY, PROPOSED-only. Picks the LIGHTEST
 * path that is RELIABLE enough for a task, composing the canonical pieces — it is NOT a second router/planner/model-selector:
 *   - COMPLEXITY: decomposition-planner.assessComplexity (TRIVIAL/SIMPLE ⇒ light; COMPLEX ⇒ deeper; META ⇒ decompose).
 *   - MODEL: model-router.selectModel (SIMPLE ⇒ fastest benchmarked-CORRECT model; COMPLEX ⇒ highest-quality).
 *   - LOCAL-FIRST TIER: capability-router.route (first LOCAL resolver; external AI only as last resort).
 *   - RELIABILITY GATE: odg-execution-routing.NATIVE_THRESHOLD over a CALIBRATED P(success) — reliability overrides speed.
 *
 * HONESTY (§2.I): the LIGHT path is chosen ONLY when reliability permits. CALIBRATED evidence of LOW native success ⇒
 * ESCALATE (a reliable heavier path) even for a simple task — speed never overrides reliability. NO calibrated evidence ⇒
 * the light path is UNVERIFIED (a PROBE to gather data), never a confident pick. Expected latency / budget-fit is NOT_MEASURED
 * unless a real measured profile (odg-mission-performance-profile) is supplied — no fabricated speed estimate. Recommends only
 * (selfAuthorized:false); the independent test + calibrated evidence remain the arbiters.
 */

const DP = require("./decomposition-planner.js");       // complexity (TRIVIAL/SIMPLE/COMPLEX/META)
const MR = require("./model-router.js");                 // fastest-correct vs highest-quality model
const CR = require("./capability-router.js");            // local-first tier plan
const XR = require("./odg-execution-routing.js");        // NATIVE_THRESHOLD (reliability gate)

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isNum(v: any): boolean { return typeof v === "number" && isFinite(v); }

const BASE_TIER: Record<string, string> = { TRIVIAL: "LIGHT_LOCAL", SIMPLE: "LIGHT_LOCAL", COMPLEX: "DEEP_REASONING", META: "DECOMPOSE" };

/**
 * selectLightPath(input, opts?) -> frozen recommendation. input: {
 *   spec (for complexity: { name?, architecture?[] }), available? (installed models),
 *   reliability?: { quality: "CALIBRATED"|..., pForPlanner?: number },  (e.g. odg-execution-routing/odg-calibrated-psuccess),
 *   latencyBudgetMs?, measuredLatencyMs? (from a real odg-mission-performance-profile — else latency is NOT_MEASURED),
 *   routeTask?, routerOpts? }.
 * Picks the lightest RELIABLE path; recommends only.
 */
function selectLightPath(input: any, opts: any = {}): any {
  const i = isObj(input) ? input : {};
  const o = isObj(opts) ? opts : {};
  const complexity = DP.assessComplexity(isObj(i.spec) ? i.spec : {}).complexity;
  const baseTier = BASE_TIER[complexity] || "DEEP_REASONING";
  const wantsLight = baseTier === "LIGHT_LOCAL";

  // RELIABILITY GATE — reliability overrides speed (§2.I).
  const rel = isObj(i.reliability) ? i.reliability : {};
  // a usable calibrated signal needs quality CALIBRATED AND a probability in [0,1]; an out-of-range "P" is NOT trusted (⇒ UNVERIFIED).
  const calibrated = rel.quality === "CALIBRATED" && isNum(rel.pForPlanner) && rel.pForPlanner >= 0 && rel.pForPlanner <= 1;
  let gate: string; let gateBasis: string;
  if (calibrated && rel.pForPlanner >= XR.NATIVE_THRESHOLD) { gate = "TRUSTED"; gateBasis = `CALIBRATED P=${rel.pForPlanner} ≥ ${XR.NATIVE_THRESHOLD}`; }
  else if (calibrated && rel.pForPlanner < XR.NATIVE_THRESHOLD) { gate = "ESCALATE"; gateBasis = `CALIBRATED P=${rel.pForPlanner} < ${XR.NATIVE_THRESHOLD} ⇒ local path unreliable`; }
  else { gate = "UNVERIFIED"; gateBasis = "no CALIBRATED reliability evidence ⇒ reliability UNVERIFIED (never a confident light pick; probe to gather data)"; }

  // final path tier: reliability can OVERRIDE a light choice (escalate), never the reverse.
  let pathTier: string;
  if (gate === "ESCALATE") pathTier = "ESCALATE_PROVIDER";       // calibrated-unreliable local ⇒ heavier reliable path
  else pathTier = baseTier;                                       // LIGHT_LOCAL (if gate TRUSTED/UNVERIFIED) / DEEP_REASONING / DECOMPOSE

  // MODEL + LOCAL-FIRST TIER (reused; recommendations only).
  const modelComplexity = (pathTier === "LIGHT_LOCAL") ? "SIMPLE" : "COMPLEX";
  const modelRec = MR.selectModel({ taskComplexity: modelComplexity, available: Array.isArray(i.available) ? i.available : undefined });
  let routerFirstLocalTier: string | null = null;
  try { const r = CR.route(isObj(i.routeTask) ? i.routeTask : {}, isObj(i.routerOpts) ? i.routerOpts : {}); const c = r && r.chosen; routerFirstLocalTier = c && c.source === "LOCAL" ? (c.tier || null) : (c ? c.tier + "(EXTERNAL_LAST_RESORT)" : null); } catch { routerFirstLocalTier = null; }

  // expected latency / budget-fit — MEASURED only if a real profile latency is supplied; never fabricated.
  const latency = isNum(i.measuredLatencyMs) ? { ms: i.measuredLatencyMs, status: "MEASURED" } : { ms: null, status: "NOT_MEASURED" };
  let fitsBudget: boolean | null = null;
  if (isNum(i.latencyBudgetMs) && latency.status === "MEASURED") fitsBudget = (latency.ms as number) <= i.latencyBudgetMs;

  return freeze({
    complexity, baseTier, pathTier,
    decompose: complexity === "META",
    model: modelRec.model, modelReason: modelRec.reason,
    routerFirstLocalTier,
    reliability: freeze({ gate, basis: gateBasis }),
    expectedLatency: freeze(latency), latencyBudgetMs: isNum(i.latencyBudgetMs) ? i.latencyBudgetMs : null, fitsBudget,
    recommendation: pathTier === "LIGHT_LOCAL" ? (gate === "UNVERIFIED" ? "LIGHT path (local-first, fastest-correct model) — reliability UNVERIFIED, run it as a PROBE to gather calibration data" : "LIGHT path (local-first, fastest-correct model) — calibrated-reliable")
      : pathTier === "ESCALATE_PROVIDER" ? `ESCALATE to a heavier reliable path — calibrated evidence shows the local path is unreliable (speed never overrides reliability; base complexity ${complexity}${complexity === "META" ? " ⇒ decompose after escalation" : ""})`
      : pathTier === "DECOMPOSE" ? "DECOMPOSE (meta/complex) into focused sub-specs then assemble — monolithic generation fails on local models (V30)"
      : "DEEP_REASONING / higher-quality model — complexity warrants it",
    selfAuthorized: false, authorizes: false,
    note: "lightest RELIABLE path: complexity (decomposition-planner) → base tier; reliability gate (calibrated P vs NATIVE_THRESHOLD) can ESCALATE a light choice but never the reverse (speed never overrides reliability); no calibrated evidence ⇒ UNVERIFIED (probe, not a confident pick). Expected latency/budget-fit is NOT_MEASURED without a real measured profile. Recommends only; the independent test + calibrated evidence are the arbiters. Composes decomposition-planner + model-router + capability-router + execution-routing threshold — no second router/planner/selector.",
  });
}

const LIGHT_PATH_SELECTOR_CONTRACT = Object.freeze({
  id: "V361-LIGHT-PATH-SELECTOR",
  purpose: "§2/P1 (A-D,I) — recommend the LIGHTEST path that is RELIABLE enough: complexity → tier, fastest-correct model, local-first, reliability-gated; composes the canonical pieces; recommends only",
  reuses: Object.freeze([
    "decomposition-planner.assessComplexity (TRIVIAL/SIMPLE/COMPLEX/META)",
    "model-router.selectModel (SIMPLE ⇒ fastest benchmarked-CORRECT model; COMPLEX ⇒ highest-quality) + capability-router.route (local-first)",
    "odg-execution-routing.NATIVE_THRESHOLD (reliability gate over a CALIBRATED P(success)) + odg-mission-performance-profile (measured latency, optional)",
  ]),
  invariants: Object.freeze([
    "the LIGHT path is chosen only when reliability permits: CALIBRATED low-P ⇒ ESCALATE to a reliable heavier path even for a simple task (speed never overrides reliability §2.I)",
    "NO calibrated evidence ⇒ reliability UNVERIFIED (a PROBE to gather data), never a confident light pick; reliability can override a light choice but never the reverse",
    "expected latency / budget-fit is NOT_MEASURED without a real measured profile — no fabricated speed estimate",
    "PROPOSED-only (selfAuthorized:false) — the independent test + calibrated evidence are the arbiters; composes the canonical router/planner/model-selector, no second engine",
  ]),
});

module.exports = { selectLightPath, LIGHT_PATH_SELECTOR_CONTRACT };
export {};
