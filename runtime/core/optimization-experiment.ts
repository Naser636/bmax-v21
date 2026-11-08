#!/usr/bin/env node
"use strict";

/*
 * V5-E / ENGINEERING INTELLIGENCE — OPTIMIZATION EXPERIMENT + CONTROLLED PROMOTION (E19 Engineering Experimentation /
 * Validation Economics §5). PURE, deterministic. Compares a before/after optimization and promotes it ONLY when the
 * speed gain is real AND the quality guarantees are preserved: §5 — "un gain de vitesse n'est accepté que si les
 * garanties de qualité restent démontrées". PROMOTE requires: speed reduction ≥ target (75%, stretch 80%) AND
 * detection capability not degraded AND correctness preserved AND (when sampled evidence is supplied) the speedup is
 * statistically significant. Any quality/detection loss ⇒ REJECT regardless of speed; an unproven/insufficient speedup
 * ⇒ INCONCLUSIVE. REUSES gate-instrumentation.speedupTarget + eval-significance.significanceGate. Recommendation only:
 * selfAuthorized:false; promotion stays external/canonical. Dual export.
 */

const INSTR = require("./gate-instrumentation");       // speedupTarget — honest before/after reduction
const SIG = require("./eval-significance");            // significanceGate — the speedup must not be noise

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isNum(v: any): boolean { return typeof v === "number" && isFinite(v); }

const DECISION = Object.freeze(["PROMOTE", "REJECT", "INCONCLUSIVE"]);

/**
 * evaluateOptimization({ beforeMs, afterMs, beforeDetection, afterDetection, correctnessPreserved, significanceEvidence, targetPct })
 * -> { decision, reductionPct, detectionPreserved, correctnessPreserved, reasons, selfAuthorized }.
 * Fail-closed: quality/detection loss OR !correctnessPreserved ⇒ REJECT (speed never excuses quality loss);
 * insufficient/non-significant speedup ⇒ INCONCLUSIVE; PROMOTE only when ALL guarantees hold.
 */
function evaluateOptimization(input: any): any {
  const o = isObj(input) ? input : {};
  const targetPct = isNum(o.targetPct) ? o.targetPct : 75;
  const sp = INSTR.speedupTarget(o.beforeMs, o.afterMs);
  const reasons: string[] = [];

  // CORRECTNESS + DETECTION are non-negotiable — a quality loss rejects regardless of speed (§5/§4).
  const correctnessPreserved = o.correctnessPreserved === true;
  if (!correctnessPreserved) { reasons.push("correctness not preserved ⇒ REJECT (speed never excuses masking/altering results)"); return decide("REJECT", sp, false, false, reasons); }
  const detectionPreserved = isNum(o.beforeDetection) && isNum(o.afterDetection) ? o.afterDetection >= o.beforeDetection : (o.detectionPreserved === true);
  if (!detectionPreserved) { reasons.push("detection capability degraded ⇒ REJECT (a speed gain is only accepted if quality guarantees stay demonstrated)"); return decide("REJECT", sp, false, true, reasons); }

  // SPEED — must meet the target.
  if (sp.reductionPct === null) { reasons.push("speedup unmeasurable ⇒ INCONCLUSIVE"); return decide("INCONCLUSIVE", sp, detectionPreserved, true, reasons); }
  if (sp.reductionPct < targetPct) { reasons.push(`reduction ${sp.reductionPct}% < target ${targetPct}% ⇒ INCONCLUSIVE`); return decide("INCONCLUSIVE", sp, detectionPreserved, true, reasons); }
  // when sampled evidence is supplied, the speedup must be statistically significant (not a one-off).
  if (isObj(o.significanceEvidence)) {
    const g = SIG.significanceGate(o.significanceEvidence);
    if (g.verdict !== "IMPROVEMENT") { reasons.push(`speedup not statistically significant (${g.verdict}) ⇒ INCONCLUSIVE`); return decide("INCONCLUSIVE", sp, detectionPreserved, true, reasons); }
    reasons.push("speedup statistically significant");
  }
  reasons.push(`reduction ${sp.reductionPct}% ≥ target ${targetPct}% + detection preserved + correctness preserved ⇒ PROMOTE (recommendation; promotion external)`);
  return decide("PROMOTE", sp, detectionPreserved, true, reasons);
}

function decide(decision: string, sp: any, detectionPreserved: boolean, correctnessPreserved: boolean, reasons: string[]): any {
  return Object.freeze({ decision, reductionPct: sp.reductionPct, met75: sp.met75, met80: sp.met80, detectionPreserved, correctnessPreserved, reasons: Object.freeze(reasons), selfAuthorized: false, grantsNoPromotion: true });
}

const OPTIMIZATION_EXPERIMENT_CONTRACT = Object.freeze({
  id: "V5-E-OPTIMIZATION-EXPERIMENT",
  source: "ODG Engineering Intelligence — E19 Engineering Experimentation / Validation Economics (§5)",
  decisions: DECISION,
  reuses: Object.freeze(["gate-instrumentation.speedupTarget (before/after reduction)", "eval-significance.significanceGate (speedup not noise)"]),
  notAuthority: "evaluates an optimization and RECOMMENDS; it promotes nothing and grants no authority",
  invariants: Object.freeze([
    "PROMOTE only when speed reduction ≥ target AND detection preserved AND correctness preserved AND (if evidence) statistically significant",
    "any correctness loss OR detection degradation ⇒ REJECT regardless of speed — a speed gain is accepted only if quality guarantees stay demonstrated (§5)",
    "an insufficient or non-significant speedup ⇒ INCONCLUSIVE",
    "selfAuthorized:false, grantsNoPromotion:true — promotion stays external/canonical",
    "pure/deterministic: before/after measures in → decision out; no clock/random/network",
  ]),
});

module.exports = { evaluateOptimization, OPTIMIZATION_EXPERIMENT_CONTRACT };

if (require.main === module) {
  const promote = evaluateOptimization({ beforeMs: 187000, afterMs: 5000, beforeDetection: 0.9, afterDetection: 0.9, correctnessPreserved: true });
  const rejectQuality = evaluateOptimization({ beforeMs: 187000, afterMs: 5000, beforeDetection: 0.9, afterDetection: 0.7, correctnessPreserved: true });
  process.stdout.write(JSON.stringify({ ...OPTIMIZATION_EXPERIMENT_CONTRACT, demo: { fastAndSafe: promote.decision, fastButQualityLoss: rejectQuality.decision } }, null, 2) + "\n");
}

export {};
