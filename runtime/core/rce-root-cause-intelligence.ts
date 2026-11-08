#!/usr/bin/env node
"use strict";

/*
 * V5 PHASE 3 / M-CH3 (Root-Cause Engineering — program §4.3 RCE-04) — ROOT-CAUSE INTELLIGENCE. PURE, deterministic.
 * Distinguishes the causal LAYERS of a defect — SYMPTOM / TRIGGER / IMMEDIATE_CAUSE / ROOT_CAUSE / SYSTEMIC_CAUSE /
 * AGGRAVATING_FACTOR / FAILING_DEPENDENCY / CONTRACT_DEFECT / DESIGN_DEFECT — ranks competing hypotheses with an
 * evidence-derived confidence, and selects the single most-likely root cause ONLY when it is well-supported; otherwise
 * INCONCLUSIVE (NEEDS_REVIEW). A symptom is never returned as a root cause. REUSES causal-graph.causesOf/effectsOf
 * over a supplied world-model to corroborate a layer (a root cause is a source with broad downstream impact; a symptom
 * is a leaf effect) — no new causal engine. Fail-closed: no reproduction / insufficient confidence ⇒ INCONCLUSIVE,
 * never a fabricated root cause. It diagnoses; it repairs nothing and grants no authority. Dual export.
 */

const CG = require("./causal-graph");                  // causesOf / effectsOf — corroborate a hypothesis layer

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function num(v: any, d = 0): number { return typeof v === "number" && isFinite(v) ? v : d; }
function round(n: number): number { return Number(n.toFixed(4)); }

const LAYER = Object.freeze(["SYMPTOM", "TRIGGER", "IMMEDIATE_CAUSE", "ROOT_CAUSE", "SYSTEMIC_CAUSE", "AGGRAVATING_FACTOR", "FAILING_DEPENDENCY", "CONTRACT_DEFECT", "DESIGN_DEFECT", "UNDETERMINED"]);
const ROOT_LAYERS = new Set(["ROOT_CAUSE", "SYSTEMIC_CAUSE", "DESIGN_DEFECT", "CONTRACT_DEFECT", "FAILING_DEPENDENCY"]);

/** confidenceOf(evidence) -> [0,1] from reproduction + isolation + corroboration. No reproduction halves it (can't be sure). */
function confidenceOf(ev: any): number {
  const e = isObj(ev) ? ev : {};
  let c = (e.reproduces === true ? 0.4 : 0) + (e.isolated === true ? 0.3 : 0) + (e.corroborated === true ? 0.3 : 0);
  if (e.reproduces !== true) c = c / 2;   // a cause not reproduced cannot be highly confident
  return round(Math.max(0, Math.min(1, c)));
}

/** layerOf(hypothesis, model) -> causal layer. Uses explicit flags first, then causal-graph topology (source/leaf). */
function layerOf(h: any, model: any): string {
  const e = isObj(h.evidence) ? h.evidence : {};
  if (e.contractDefect === true) return "CONTRACT_DEFECT";
  if (e.designDefect === true) return "DESIGN_DEFECT";
  if (e.failingDependency === true) return "FAILING_DEPENDENCY";
  if (e.aggravating === true) return "AGGRAVATING_FACTOR";
  if (e.externalTrigger === true) return "TRIGGER";
  // topology from the causal graph (if a model + nodeId are supplied).
  let upstream = num(e.upstreamCauses, -1); let downstream = num(e.downstreamEffects, -1);
  if ((upstream < 0 || downstream < 0) && isObj(model) && typeof h.nodeId === "string") {
    try { upstream = CG.causesOf(model, h.nodeId).length; downstream = CG.effectsOf(model, h.nodeId).length; } catch { /* keep -1 */ }
  }
  if (upstream < 0 || downstream < 0) return "UNDETERMINED";
  if (downstream === 0) return "SYMPTOM";                                  // a leaf effect
  if (upstream === 0) return downstream >= 3 ? "SYSTEMIC_CAUSE" : "ROOT_CAUSE";  // a source; broad impact ⇒ systemic
  return "IMMEDIATE_CAUSE";                                                // middle of the chain
}

/**
 * classifyCausalChain({ symptom, hypotheses, model, confidenceThreshold }) ->
 *   { verdict, rootCause, rankedHypotheses, reasons }. verdict: ROOT_CAUSE_IDENTIFIED | INCONCLUSIVE.
 * Fail-closed: a root cause is returned ONLY if its layer is a root layer AND confidence ≥ threshold AND it reproduces
 * AND it is isolated; otherwise INCONCLUSIVE (NEEDS_REVIEW). A SYMPTOM is never returned as a root cause.
 */
function classifyCausalChain(input: any): any {
  const o = isObj(input) ? input : {};
  const threshold = Math.min(1, Math.max(0, num(o.confidenceThreshold, 0.7)));
  const model = o.model;
  const hyps = arr(o.hypotheses).filter(isObj);
  const reasons: string[] = [];

  const ranked = hyps.map((h) => {
    const layer = layerOf(h, model);
    const confidence = confidenceOf(h.evidence);
    const ev = isObj(h.evidence) ? h.evidence : {};
    const rootEligible = ROOT_LAYERS.has(layer) && confidence >= threshold && ev.reproduces === true && ev.isolated === true;
    return Object.freeze({ id: typeof h.id === "string" ? h.id : null, layer, confidence, rootEligible, nodeId: h.nodeId });
  }).sort((a, b) => (Number(b.rootEligible) - Number(a.rootEligible)) || (b.confidence - a.confidence) || (String(a.id) < String(b.id) ? -1 : 1));

  const winner = ranked.find((r) => r.rootEligible) || null;
  if (!winner) {
    reasons.push(hyps.length === 0 ? "no hypotheses supplied" : "no hypothesis is a well-supported root cause (layer/confidence/reproduction/isolation) ⇒ INCONCLUSIVE (NEEDS_REVIEW)");
    return Object.freeze({ verdict: "INCONCLUSIVE", rootCause: null, rankedHypotheses: Object.freeze(ranked), reasons: Object.freeze(reasons), symptom: typeof o.symptom === "string" ? o.symptom : null });
  }
  reasons.push(`root cause '${winner.id}' at layer ${winner.layer} (confidence ${winner.confidence} ≥ ${threshold}, reproduced + isolated); a symptom is never returned as root`);
  return Object.freeze({ verdict: "ROOT_CAUSE_IDENTIFIED", rootCause: winner, rankedHypotheses: Object.freeze(ranked), reasons: Object.freeze(reasons), symptom: typeof o.symptom === "string" ? o.symptom : null });
}

const RCE_ROOT_CAUSE_CONTRACT = Object.freeze({
  id: "V5-RCE-ROOT-CAUSE-INTELLIGENCE",
  source: "ODG Master program §4.3 RCE-04 — Root-Cause Intelligence (symptom/trigger/root/systemic + confidence)",
  layers: LAYER,
  reuses: Object.freeze(["causal-graph.causesOf/effectsOf (topology corroboration over a world-model)", "feeds RCE repair-planner / repair-workflow (diagnosis only)"]),
  notAuthority: "a read-only causal diagnosis; it reproduces nothing, repairs nothing, and grants no authority",
  invariants: Object.freeze([
    "distinguishes causal layers: SYMPTOM / TRIGGER / IMMEDIATE_CAUSE / ROOT_CAUSE / SYSTEMIC_CAUSE / dependency/contract/design/aggravating",
    "a hypothesis is ROOT_CAUSE_IDENTIFIED only if its layer is a root layer AND confidence ≥ threshold AND it reproduces AND it is isolated",
    "a SYMPTOM is never returned as a root cause; a cause not reproduced cannot be highly confident (confidence halved)",
    "no well-supported hypothesis ⇒ INCONCLUSIVE (NEEDS_REVIEW) — never a fabricated root cause (fail-closed)",
    "topology (source vs leaf) is corroborated via causal-graph when a world-model is supplied; pure/deterministic, no clock/random",
  ]),
});

module.exports = { confidenceOf, layerOf, classifyCausalChain, RCE_ROOT_CAUSE_CONTRACT };

if (require.main === module) {
  const model = { entities: { n1: { id: "n1" }, n2: { id: "n2" }, n3: { id: "n3" }, n4: { id: "n4" } }, relations: { r1: { from: "n1", to: "n2", type: "causes" }, r2: { from: "n2", to: "n3", type: "causes" }, r3: { from: "n2", to: "n4", type: "causes" } } };
  const demo = classifyCausalChain({ symptom: "test fails", model, hypotheses: [
    { id: "h-root", nodeId: "n1", evidence: { reproduces: true, isolated: true, corroborated: true } },
    { id: "h-symptom", nodeId: "n3", evidence: { reproduces: true, isolated: false } },
  ] });
  process.stdout.write(JSON.stringify({ ...RCE_ROOT_CAUSE_CONTRACT, demo: { verdict: demo.verdict, rootCause: demo.rootCause } }, null, 2) + "\n");
}

export {};
