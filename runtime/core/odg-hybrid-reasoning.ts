#!/usr/bin/env node
"use strict";
/*
 * V360 §14 (deep/hybrid reasoning) — HYBRID REASONING VIEW. PURE, deterministic, fail-closed, READ-ONLY. Combines the two
 * canonical reasoning layers into ONE honest conclusion — it is NOT a second reasoning engine / graph / world-model:
 *   - CAUSAL STRUCTURE: causal-graph (causesOf / effectsOf / counterfactualRemove) over the canonical world-model.
 *   - EPISTEMIC GROUNDING: world-model epistemic status of every supporting node/edge.
 *   - COMPUTE PROVENANCE: inference-engine.availability (which inference backends are real vs simulated).
 *
 * THE LOAD-BEARING HONESTY INVARIANT — WEAKEST LINK: a conclusion is only as certain as its WEAKEST supporting evidence. It
 * is FACTUAL only if EVERY supporting node/edge is a FACTUAL status (PROVEN/OBSERVED); any HYPOTHESIS ⇒ HYPOTHETICAL (not a
 * fact); any SIMULATION ⇒ SIMULATED (a dreamed link may NEVER drive a factual conclusion, §28); any CONTRADICTED ⇒ UNSOUND
 * (refuse to assert); a missing target ⇒ UNGROUNDED. Certainty is never fabricated above the weakest link.
 */

const CG = require("./causal-graph.js");       // causal structure over the world-model (SIMULATION excluded by default)
const WM = require("./world-model.js");         // canonical epistemic statuses (the single source — no second world-model)
const IE = require("./inference-engine.js");    // inference backend availability (real vs simulated — honest compute provenance)

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

const FACTUAL = new Set(WM.FACTUAL_STATUS || ["PROVEN", "OBSERVED"]);
// strength rank (higher = stronger evidence); SIMULATION + CONTRADICTED are handled separately (taint / unsound).
const RANK: Record<string, number> = { PROVEN: 8, OBSERVED: 7, INFERRED: 6, HYPOTHESIS: 4, UNVERIFIED: 4, STALE: 3, UNKNOWN: 2, CONTRADICTED: 1, MISSING: 0 };
const CONF: Record<string, string> = { PROVEN: "HIGH", OBSERVED: "HIGH", INFERRED: "MEDIUM", HYPOTHESIS: "LOW", UNVERIFIED: "LOW", STALE: "VERY_LOW", UNKNOWN: "VERY_LOW", MISSING: "NONE" };

function statusOfEntity(model: any, id: string): string {
  const ents = isObj(model) && isObj(model.entities) ? model.entities : {};
  const e = ents[id];
  return e && typeof e.status === "string" ? e.status : "MISSING";
}

/**
 * reason(model, query, opts?) -> frozen conclusion. query: { mode: "causes"|"effects"|"counterfactual", target: entityId }.
 *   opts: { includeSimulation? (default false — a SIMULATION edge never silently drives a factual conclusion) }.
 * Returns the causal result set AND its epistemic grounding: the conclusion is FACTUAL only if every supporting node/edge is
 * PROVEN/OBSERVED; otherwise HYPOTHETICAL / SIMULATED / UNSOUND / UNGROUNDED. Certainty never exceeds the weakest link.
 */
function reason(model: any, query: any, opts: any = {}): any {
  const m = isObj(model) ? model : {};
  const q = isObj(query) ? query : {};
  const o = isObj(opts) ? opts : {};
  const mode = q.mode === "effects" ? "effects" : q.mode === "counterfactual" ? "counterfactual" : "causes";
  const target = typeof q.target === "string" ? q.target : null;
  const cgOpts = { includeSimulation: !!o.includeSimulation };
  const backends = IE.availability();

  // fail-closed: a missing/unknown target ⇒ UNGROUNDED (no fabricated reasoning).
  if (!target || statusOfEntity(m, target) === "MISSING") {
    return freeze({ mode, target, result: freeze([]), epistemicStatus: "UNGROUNDED", factual: false, soundness: "UNGROUNDED", confidence: "NONE", simulationEdgesExcluded: 0, computeProvenance: freeze(backends), note: "target entity is absent from the world-model ⇒ UNGROUNDED (no fabricated conclusion)" });
  }

  // (1) CAUSAL STRUCTURE — result set via the canonical causal-graph (SIMULATION excluded unless opted).
  const result = mode === "effects" ? CG.effectsOf(m, target, cgOpts)
    : mode === "counterfactual" ? CG.counterfactualRemove(m, target, cgOpts)
    : CG.causesOf(m, target, cgOpts);

  // (2) SUPPORTING EVIDENCE — statuses of the target + result entities + the causal edges among that node set.
  const nodeSet = new Set<string>([target, ...arr(result)]);
  const nodeStatuses = Array.from(nodeSet).map((id) => statusOfEntity(m, id));
  const usedEdges = CG.causalEdges(m, cgOpts).filter((e: any) => nodeSet.has(e.from) && nodeSet.has(e.to));
  const edgeStatuses = usedEdges.map((e: any) => e.status);
  // transparency: how many SIMULATION causal edges POINTING INTO the conclusion frontier were EXCLUDED (ignored, not used to
  // reach a factual conclusion) — so the reader knows N dreamed links were deliberately not followed.
  const simulationEdgesExcluded = o.includeSimulation ? 0 : CG.causalEdges(m, { includeSimulation: true }).filter((e: any) => nodeSet.has(e.to) && e.status === "SIMULATION").length;
  const allStatuses = [...nodeStatuses, ...edgeStatuses];

  // (3) EPISTEMIC PROPAGATION — the weakest link governs.
  const hasContradicted = allStatuses.indexOf("CONTRADICTED") >= 0;
  const hasSimulation = allStatuses.indexOf("SIMULATION") >= 0; // only possible when includeSimulation
  const hasMissing = nodeStatuses.indexOf("MISSING") >= 0;      // a referenced result node with no entity record
  let epistemicStatus: string; let soundness: string; let factual: boolean; let confidence: string;
  if (hasContradicted) { epistemicStatus = "CONTRADICTED"; soundness = "UNSOUND"; factual = false; confidence = "NONE"; }
  else if (hasSimulation) { epistemicStatus = "SIMULATION"; soundness = "SIMULATED"; factual = false; confidence = "NOT_ASSERTED"; }
  else {
    // weakest (lowest rank) among the supporting statuses.
    const weakest = allStatuses.reduce((w, s) => (RANK[s] ?? 0) < (RANK[w] ?? 0) ? s : w, allStatuses[0] || "MISSING");
    epistemicStatus = weakest;
    factual = !hasMissing && allStatuses.every((s) => FACTUAL.has(s));
    soundness = factual ? "DEDUCTIVE_FACTUAL" : (RANK[weakest] ?? 0) >= RANK.INFERRED ? "INFERRED" : "HYPOTHETICAL";
    confidence = hasMissing ? "NONE" : (CONF[weakest] || "VERY_LOW");
  }

  return freeze({
    mode, target, result: freeze(arr(result)),
    epistemicStatus, soundness, factual, confidence,
    support: freeze({ nodes: nodeSet.size, edges: usedEdges.length, statuses: freeze(Array.from(new Set(allStatuses)).sort()) }),
    simulationEdgesExcluded,
    computeProvenance: freeze(backends), // honest: symbolic reasoning here is real CPU; ML-inference backends per inference-engine
    note: "hybrid reasoning = causal structure (causal-graph) × epistemic grounding (world-model), weakest-link: FACTUAL only if ALL support is PROVEN/OBSERVED; any HYPOTHESIS ⇒ HYPOTHETICAL; any SIMULATION ⇒ SIMULATED (never factual); any CONTRADICTED ⇒ UNSOUND; missing target ⇒ UNGROUNDED. Certainty never exceeds the weakest link; nothing is asserted above its evidence.",
  });
}

const HYBRID_REASONING_CONTRACT = Object.freeze({
  id: "V360-HYBRID-REASONING",
  purpose: "§14 deep/hybrid reasoning — ONE honest conclusion combining causal structure + epistemic grounding (+ compute provenance); a VIEW over the canonical world-model, no second reasoning engine/graph/world-model",
  reuses: Object.freeze([
    "causal-graph (causesOf / effectsOf / counterfactualRemove over the world-model; SIMULATION excluded by default)",
    "world-model epistemic statuses (the single source — PROVEN/OBSERVED factual, SIMULATION isolated)",
    "inference-engine.availability (honest compute provenance — real CPU vs simulated GPU)",
  ]),
  invariants: Object.freeze([
    "WEAKEST LINK: a conclusion is FACTUAL only if EVERY supporting node/edge is PROVEN/OBSERVED; certainty never exceeds the weakest supporting evidence",
    "any HYPOTHESIS ⇒ HYPOTHETICAL (not a fact); any SIMULATION ⇒ SIMULATED — a dreamed link may NEVER drive a factual conclusion (§28); any CONTRADICTED ⇒ UNSOUND (refuse to assert)",
    "a missing target ⇒ UNGROUNDED (no fabricated reasoning); excluded SIMULATION edges are counted and reported (transparency)",
    "PURE/deterministic/frozen READ-ONLY view; reuses causal-graph + world-model + inference-engine; no second reasoning engine/graph/world-model, mutates nothing",
  ]),
});

module.exports = { reason, HYBRID_REASONING_CONTRACT };
export {};
