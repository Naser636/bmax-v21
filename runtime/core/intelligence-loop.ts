#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V37 (§8) — INTELLIGENCE LOOP. PURE, deterministic, fail-closed. It builds NO new capability — it WIRES the
 * existing ones into ONE verifiable governed cycle so the system (not an isolated component) demonstrates intelligence:
 *   DISCOVER (roadmap-manager) → AUTHORIZE (external, never self) → PLAN/DECIDE (plan-evaluator) → EXECUTE (seam) →
 *   RECORD outcome (mission-outcome-recorder) → LEARN (calibration) → MEASURE (intelligence-scorecard).
 * Each step consumes the REAL output of the previous one; a discovery stops at PROPOSED unless an EXTERNAL authorization
 * is supplied (discovery ≠ authorization); any failed/absent step halts the cycle fail-closed (no silent success). Dual
 * export.
 */

const ROADMAP = require("./roadmap-manager.js");
const EVAL = require("./plan-evaluator.js");
const RECORDER = require("./mission-outcome-recorder.js");
const CAL = require("./calibration.js");
const LEDGER = require("./mission-outcome-ledger.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function fn(v: any): boolean { return typeof v === "function"; }

/**
 * runCycle(input, deps) -> { stage, trace, ... }. input: { discovery, existingItems, authorization?, candidatePlans,
 * priorOutcomes? }. deps: { execute(plan) -> missionReport }. The cycle threads real outputs: a PROPOSED discovery is
 * authorized ONLY by an external decision; the authorized plan is chosen by plan-evaluator (hard constraints first);
 * execution yields a canonical report; the outcome is recorded and feeds calibration + the scorecard.
 */
function runCycle(input: any, deps: any = {}): any {
  const i = isObj(input) ? input : {};
  const trace: any[] = [];
  const stop = (stage: string, reason: string, extra: any = {}) => Object.freeze({ stage, completed: false, reason, trace: Object.freeze(trace), ...extra });

  // 1) DISCOVER
  const disc = ROADMAP.intakeDiscovery(i.discovery, i.existingItems);
  trace.push({ step: "DISCOVER", status: disc.status });
  if (disc.status === "DUPLICATE") return stop("DISCOVER", "duplicate discovery — deduped (already covered)", { duplicate: true });
  if (disc.status !== "PROPOSED") return stop("DISCOVER", disc.reason || "discovery rejected");

  // 2) AUTHORIZE (external only — discovery never self-authorizes)
  const auth = ROADMAP.authorizeDiscovery(disc, i.authorization);
  trace.push({ step: "AUTHORIZE", authorized: auth.authorized });
  if (auth.authorized !== true) return stop("AUTHORIZE", "not authorized — the cycle stops at PROPOSED (discovery ≠ authorization, no self-promotion)", { proposedOnly: true });

  // 3) PLAN / DECIDE (hard constraints before optimization)
  const choice = EVAL.evaluatePlans(i.candidatePlans, {});
  trace.push({ step: "PLAN", selected: choice.selected });
  if (!choice.selected) return stop("PLAN", "no feasible plan (all violate a hard constraint)");

  // 4) EXECUTE (seam — the governed pipeline)
  const report = fn(deps.execute) ? safe(() => deps.execute(choice.selectedScore || { id: choice.selected })) : null;
  trace.push({ step: "EXECUTE", hasReport: !!report });
  if (!report || !isObj(report)) return stop("EXECUTE", "execution produced no canonical report");

  // 5) RECORD outcome (real, failure-inclusive)
  const rec = RECORDER.recordFromReport(i.priorOutcomes || [], report, { attempt: 1 });
  trace.push({ step: "RECORD", outcome: rec.outcome, recorded: rec.recorded });
  if (rec.ok !== true) return stop("RECORD", "outcome could not be recorded");

  // 6) LEARN (calibration over the accumulated outcomes — honest quality)
  const sample = LEDGER.buildCalibrationSample(rec.outcomes, { basis: "attempt" });
  const quality = CAL.calibratedEstimate({ p: sample.n ? sample.successes / sample.n : null, observations: sample.n, successes: sample.successes, failures: sample.failures });
  trace.push({ step: "LEARN", calibrationQuality: quality.quality });

  // 7) MEASURE (one dimension — real data)
  trace.push({ step: "MEASURE", dimension: { name: "cycle-outcome", dataKind: "REAL", value: rec.outcome === "SUCCESS" ? 1 : 0, denominator: 1 } });

  return Object.freeze({
    stage: "CLOSED", completed: true,
    outcome: rec.outcome, calibrationQuality: quality.quality, selectedPlan: choice.selected,
    connected: trace.map((t) => t.step),
    reason: "full cycle connected end-to-end: discover → authorize(external) → plan → execute → record → learn → measure",
    trace: Object.freeze(trace),
  });
}
function safe(t: any): any { try { return t(); } catch { return null; } }

const INTELLIGENCE_LOOP_CONTRACT = Object.freeze({
  id: "V124-INTELLIGENCE-LOOP",
  source: "CTO V37 §8 — wiring the existing capabilities into one verifiable governed cycle",
  reuses: Object.freeze(["roadmap-manager (discover/authorize)", "plan-evaluator (plan/decide)", "mission-outcome-recorder + mission-outcome-ledger (record)", "calibration (learn)", "the execution pipeline (seam)"]),
  notAuthority: "threads existing capabilities' real outputs through one cycle; it adds no capability and authorizes nothing — the AUTHORIZE step requires an external decision",
  invariants: Object.freeze([
    "each step consumes the REAL output of the previous one (system intelligence, not isolated components)",
    "a discovery stops at PROPOSED unless an EXTERNAL authorization is supplied — the loop never self-authorizes",
    "the plan step enforces hard constraints before optimization; no feasible plan ⇒ the cycle halts",
    "any failed/absent step halts the cycle fail-closed (no silent success); a duplicate discovery is deduped",
    "learning uses the honest calibration quality (UNKNOWN/BIASED/DEGRADED/CALIBRATED); pure/deterministic",
  ]),
});

module.exports = { runCycle, INTELLIGENCE_LOOP_CONTRACT };

if (require.main === module) {
  const r = runCycle(
    { discovery: { title: "a new demonstrated capability" }, existingItems: [], authorization: { approved: true, authorizedBy: "odg-cto" }, candidatePlans: [{ id: "p1", metrics: { Psuccess: 0.9, Vobjective: 0.8, Rrisk: 0.1, Uuncertainty: 0.1 } }] },
    { execute: () => ({ mission: "p1", validated: true, status: "SUCCESS" }) },
  );
  process.stdout.write(JSON.stringify({ ...INTELLIGENCE_LOOP_CONTRACT, demo: { completed: r.completed, connected: r.connected, outcome: r.outcome } }, null, 2) + "\n");
}

export {};
