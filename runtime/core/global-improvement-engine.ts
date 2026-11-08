#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 14 (Step 4) — ODG-GLOBAL SELF-IMPROVEMENT ENGINE. PURE, deterministic. Orchestrates the whole-ODG improvement
 * loop GLOBAL_OBSERVATION → DIAGNOSIS → WORLD_RESEARCH → GAP_ANALYSIS → HYPOTHESIS → PROTOTYPE → SANDBOX → BENCHMARK →
 * ADVERSARIAL → INDEPENDENT_EVAL → SHADOW → CANARY → MEASUREMENT → RETAIN/ROLLBACK by COMPOSING existing mechanisms
 * (codebase-diagnostic for observation, v124-scorecard for global state, self-improvement for the build→verify→retain
 * loop) — it builds NO second engine/governance/registry. It discovers improvement targets from EVIDENCE, and a cycle
 * RETAINS an improvement ONLY on a measured BEFORE→AFTER gain with NO regression (else ROLLBACK), with NO self-
 * promotion (promotion stays external/governed). Dual export.
 */

const DIAG = require("./codebase-diagnostic");
const SCORE = require("./v124-scorecard");
const SI = require("./self-improvement");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function num(v: any, d = 0): number { return typeof v === "number" && isFinite(v) ? v : d; }

const LOOP_STAGES = Object.freeze([
  "GLOBAL_OBSERVATION", "DIAGNOSIS", "WORLD_RESEARCH", "GAP_ANALYSIS", "HYPOTHESIS", "PROTOTYPE",
  "SANDBOX", "BENCHMARK", "ADVERSARIAL", "INDEPENDENT_EVAL", "SHADOW", "CANARY", "MEASUREMENT", "RETAIN_OR_ROLLBACK",
]);

// Honest health taxonomy (SÉRIE 15 §2): an empty result is NOT proof of health.
const HEALTH_STATUS = Object.freeze(["NO_FINDING", "NOT_MEASURED", "HEALTHY", "DEGRADED", "UNKNOWN"]);

/** observe(facts, opts) -> global snapshot from the real diagnostic + scorecard (composition, no new scan). */
function observe(facts: any, opts?: any): any {
  const o = isObj(opts) ? opts : {};
  const diag = typeof o.scan === "function" ? o.scan() : DIAG.scanCore();
  const f = isObj(facts) ? facts : {};
  const sc = SCORE.buildScorecard({ primitivesPresent: num(f.primitivesPresent, 9), professionsProven: num(f.professionsProven, 15), registerAccepted: num(f.registerAccepted, 0) });
  const measured = isObj(diag.byCoverage) && num(diag.total) > 0;
  return Object.freeze({ measured, honest: diag.honest === true, total: num(diag.total), coverage: diag.byCoverage, uncoveredLibraries: diag.uncovered, scorecardOverall: sc.overall, scorecardReady: sc.ready, forecast: sc.forecast.remaining });
}

/** analyzeGaps(snapshot, opts) -> { status, targets }. HONEST taxonomy (§2): an empty target list is NO_FINDING, NOT
 * HEALTHY. HEALTHY is declared ONLY when the checks actually RAN (measured), found no gaps, the integrity flag holds,
 * AND the caller asserts sufficient positive controls (opts.healthCriteriaMet). Otherwise NO_FINDING / NOT_MEASURED /
 * DEGRADED / UNKNOWN. */
function analyzeGaps(snapshot: any, opts?: any): any {
  const s = isObj(snapshot) ? snapshot : {};
  const o = isObj(opts) ? opts : {};
  const targets: any[] = [];
  const uncovered = Array.isArray(s.uncoveredLibraries) ? s.uncoveredLibraries : [];
  if (uncovered.length > 0) targets.push({ kind: "COVERAGE", detail: `${uncovered.length} uncovered library module(s)`, items: uncovered, priority: 1 });
  for (const r of (Array.isArray(s.forecast) ? s.forecast : [])) targets.push({ kind: "SCORECARD", detail: r, priority: 2 });

  const measured = s.measured === true;
  const coverageGaps = uncovered.length > 0;
  let status: string;
  if (!measured) status = "NOT_MEASURED";                                   // the diagnostic did not run ⇒ no evidence
  else if (coverageGaps) status = "DEGRADED";                               // a measured weakness
  else if (s.honest !== true) status = "UNKNOWN";                           // measured but the integrity flag is off ⇒ cannot trust
  else if (o.healthCriteriaMet === true) status = "HEALTHY";                // measured + no gaps + integrity + sufficient controls DEMONSTRATED
  else status = "NO_FINDING";                                               // measured + no gaps, but health NOT demonstrated ⇒ not HEALTHY
  return Object.freeze({
    status, targets: Object.freeze(targets),
    note: "an empty result is NO_FINDING, NOT HEALTHY; HEALTHY requires measured checks + integrity + demonstrated sufficient controls (§2)",
  });
}

/** cycle(target, measurement) -> RETAIN | ROLLBACK. measurement: {baseline, after, regression}. Fail-closed:
 * RETAIN only if after > baseline AND no regression; otherwise ROLLBACK. No self-promotion (promotion external). */
function cycle(target: any, measurement: any): any {
  const m = isObj(measurement) ? measurement : {};
  const baseline = num(m.baseline); const after = num(m.after); const regression = m.regression === true;
  const improved = after > baseline;
  const decision = improved && !regression ? "RETAIN" : "ROLLBACK";
  return Object.freeze({
    target: isObj(target) ? target.detail : String(target),
    baseline, after, regression, improved, decision, selfPromoted: false,
    note: decision === "RETAIN" ? "measured before→after gain, no regression ⇒ retained (promotion stays external/governed)" : "no measured gain OR a regression ⇒ rolled back (fail-closed)",
  });
}

/** maturity() -> honest loop-maturity report: the stages mapped to real modules + completeness from self-improvement. */
function maturity(): any {
  const complete = SI.assessCompleteness();
  return Object.freeze({
    stages: LOOP_STAGES, stageCount: LOOP_STAGES.length,
    composes: Object.freeze(["codebase-diagnostic (observe)", "v124-scorecard (state)", "self-improvement (build→verify→retain loop)"]),
    selfImprovementComplete: complete && complete.complete === true,
    note: "the global loop reuses existing mechanisms; it creates no second engine/governance; promotion stays external",
  });
}

const GLOBAL_IMPROVEMENT_ENGINE_CONTRACT = Object.freeze({
  id: "V124-GLOBAL-IMPROVEMENT-ENGINE",
  source: "SÉRIE 14 Step-4 — ODG-global self-improvement loop (orchestrates existing mechanisms)",
  loop: LOOP_STAGES,
  reuses: Object.freeze(["codebase-diagnostic", "v124-scorecard", "self-improvement (evolution-loop/frontier-lab/compounding)"]),
  notAuthority: "a thin orchestrator; it builds no second engine/governance/registry and promotes nothing itself",
  healthStatus: HEALTH_STATUS,
  invariants: Object.freeze([
    "observation + diagnosis come from the REAL codebase-diagnostic + scorecard (no fabricated state)",
    "an empty result is NO_FINDING, NOT HEALTHY (§2): HEALTHY needs measured checks + integrity + demonstrated sufficient controls; absent measurement ⇒ NOT_MEASURED; a gap ⇒ DEGRADED; untrusted ⇒ UNKNOWN",
    "a cycle RETAINS only on a measured before→after gain with NO regression; otherwise ROLLBACK (fail-closed)",
    "NO self-promotion (promotion stays external/governed); reuses existing mechanisms; no second engine",
  ]),
});

module.exports = { LOOP_STAGES, HEALTH_STATUS, observe, analyzeGaps, cycle, maturity, GLOBAL_IMPROVEMENT_ENGINE_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...GLOBAL_IMPROVEMENT_ENGINE_CONTRACT, maturity: maturity() }, null, 2) + "\n"); }

export {};
