#!/usr/bin/env node
"use strict";

/*
 * V12.4 §34–§37 / §8-§10 — SELF-IMPROVEMENT end-to-end orchestration + completeness gate. PURE composition over the
 * EXISTING self-improvement chain (NO new engine): it ties the WI-FR lots into one governed cycle
 *   OBSERVE(frontier-radar) → [evolution-loop: DIAGNOSE→HYPOTHESIS→CANDIDATE→SANDBOX(frontier-sandbox)→REPLAY→
 *   ADVERSARIAL(meta-intelligence)→INDEPENDENT_EVALUATION(frontier-lab)→BASELINE_COMPARE→SHADOW→CANARY→PROMOTION_REVIEW]
 *   → COMPOUND(compounding-loop) → MEASURE.
 * It adds (1) a COMPLETENESS GATE that fails closed if any required stage's module is absent, and (2) a single E2E
 * driver used to validate the positive / negative / adversarial scenarios. Promotion stays EXTERNAL/governed (the
 * cycle reaches PROMOTION_REVIEW and stops; MEASURED requires an external authorized decision in evolution-loop). No
 * self-authorization, no self-promotion, no evaluator/baseline/G0 modification. Dual export.
 */

const EVO = require("./evolution-loop");
const COMP = require("./compounding-loop");

// Required chain stages → the real module that realizes each (for the completeness gate).
const STAGE_MODULES = Object.freeze({
  OBSERVE: "frontier-radar", DIAGNOSE: "evolution-loop", HYPOTHESIS: "frontier-lab", BUILD: "evolution-loop",
  SANDBOX: "frontier-sandbox", REPLAY: "evolution-loop", ADVERSARIAL: "meta-intelligence",
  INDEPENDENT_EVALUATION: "frontier-lab", BASELINE_COMPARE: "improvement-baseline", SHADOW: "evolution-loop",
  CANARY: "canary-decision-pack", PROMOTION_REVIEW: "evolution-loop", COMPOUND: "compounding-loop", MEASURE: "improvement-baseline",
});
const REQUIRED_STAGES = Object.freeze(Object.keys(STAGE_MODULES));

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }

/** assessCompleteness(present) -> { complete, missing, byStage }. present = array/set of module names physically available.
 * FAIL-CLOSED: any required stage whose module is absent ⇒ NOT complete (a module existing ≠ the system being complete). */
function assessCompleteness(present: any): any {
  const set = new Set((Array.isArray(present) ? present : (isObj(present) ? Object.keys(present) : [])).filter(isStr));
  const byStage: any = {}; const missing: string[] = [];
  for (const stage of REQUIRED_STAGES) {
    const mod = (STAGE_MODULES as any)[stage];
    const ok = set.has(mod);
    byStage[stage] = { module: mod, present: ok };
    if (!ok) missing.push(stage + "(" + mod + ")");
  }
  return Object.freeze({ complete: missing.length === 0, missing: Object.freeze(missing), byStage: Object.freeze(byStage), requiredStages: REQUIRED_STAGES.length });
}

/**
 * runSelfImprovement(spec, deps) -> full self-improvement record. deps: { builder, runner, collectors, integritySignals,
 * transferTarget, now }. Composes the evolution cycle (OBSERVE→…→PROMOTION_REVIEW/ROLLED_BACK) and, ONLY when the cycle
 * reaches PROMOTION_REVIEW, the compounding cycle (held-out transfer ⇒ VALIDATED_CAPABILITY or not). Promotion is NOT
 * performed (external/governed). Fail-closed throughout.
 */
async function runSelfImprovement(spec: any, deps: any): Promise<any> {
  const d = isObj(deps) ? deps : {};
  const now = d.now;
  const evo = await EVO.runEvolutionCycle(spec, { builder: d.builder, runner: d.runner, collectors: d.collectors, integritySignals: d.integritySignals, observation: d.observation, now });
  if (!evo.ok) return Object.freeze({ ok: false, stage: "evolution", result: evo });
  const cycle = evo.cycle;
  const reachedReview = cycle && cycle.outcome === "PROMOTION_REVIEW";

  let compounding: any = null, compounded = false;
  if (reachedReview) {
    const assetSpec = {
      id: (isObj(spec) ? spec.id : "si") + ":asset", kind: "capability", signature: isObj(spec) ? spec.id : "si",
      evidenceRefs: ["evolution:" + (isObj(spec) ? spec.id : "si")], provenance: "self-improvement",
      domain: { domainKey: (isObj(spec) && isObj(spec.config) && isStr(spec.config.domainKey)) ? spec.config.domainKey : "self", goal: "improve ODG capability", scope: "local" },
      benefit: 10, storageCost: 1, retrievalCost: 1, maintenanceCost: 1, uses: 1, reliability: 1, freshness: 1,
    };
    compounding = COMP.runCompoundingCycle(assetSpec, { target: isObj(d.transferTarget) ? d.transferTarget : {}, rewardHacking: { builder: "evolution", validator: "frontier-lab" }, now });
    compounded = compounding && compounding.capability === "VALIDATED_CAPABILITY";
  }

  const stagesReached = cycle ? (cycle.history || []).map((h: any) => h.event) : [];
  return Object.freeze({
    ok: true,
    outcome: cycle ? cycle.outcome : null,
    reachedReview, compounded,
    promoted: false, promotionIsExternal: true,  // self-improvement NEVER promotes itself
    cycle, compounding,
    stagesReached: Object.freeze(stagesReached),
    note: "the cycle stops at PROMOTION_REVIEW; promotion requires an external authorized decision; compounding validates held-out transfer; no self-promotion",
  });
}

const SELF_IMPROVEMENT_CONTRACT = Object.freeze({
  id: "V124-SELF-IMPROVEMENT-E2E",
  source: "V12.4 §34–§37/§8-§10 — end-to-end self-improvement orchestration + completeness gate (compose-only)",
  requiredStages: REQUIRED_STAGES, stageModules: STAGE_MODULES,
  reuses: Object.freeze(["frontier-radar (OBSERVE)", "evolution-loop (DIAGNOSE→…→PROMOTION_REVIEW, incl. SHADOW/CANARY)", "frontier-lab (independent verify)", "frontier-sandbox (real isolated run)", "meta-intelligence (adversarial/integrity)", "compounding-loop (COMPOUND/transfer)", "improvement-baseline (MEASURE)"]),
  notAuthority: "drives the self-improvement chain end-to-end; it promotes/authorizes NOTHING (PROMOTION_REVIEW is external) and modifies no baseline/evaluator/G0",
  invariants: Object.freeze([
    "NO new engine — composes the existing WI-FR chain; the completeness gate fails closed on any missing stage module",
    "a module existing ≠ the system being complete (gate checks every required stage)",
    "promotion is EXTERNAL/governed; self-improvement never self-promotes or self-certifies",
    "regression/integrity-DETECTED/reward-hacking ⇒ ROLLBACK (no promotion, no compounding)",
    "compounding counts only a VALIDATED held-out transfer; fail-closed on uncertainty",
    "pure/deterministic composition; the only real I/O is the injected sandbox runner",
  ]),
});

module.exports = { STAGE_MODULES, REQUIRED_STAGES, SELF_IMPROVEMENT_CONTRACT, assessCompleteness, runSelfImprovement };

if (require.main === module) { process.stdout.write(JSON.stringify(SELF_IMPROVEMENT_CONTRACT, null, 2) + "\n"); }

export {};
