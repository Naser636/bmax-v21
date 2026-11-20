#!/usr/bin/env node
"use strict";
/*
 * V327 §6 — GENERALIZATION-VALIDITY GUARD (anti over-generalization / source-context overfitting). PURE, deterministic,
 * fail-closed, read-only over the EXISTING native-build-outcome store (NO parallel memory). World reference (verified
 * 2026): "Memory for Autonomous LLM Agents" (arXiv:2603.07670) — "over-generalization … a lesson learned in one context
 * applied blindly in another"; and the finding that "skills evolved from NARROW experience exhibit SOURCE-CONTEXT
 * OVERFITTING, while skills evolved from DIVERSE experience move toward high-specificity, high-generality". AgentMemoryBench
 * lists generalization as a standard memory-evaluation dimension.
 *
 * The gap: odg-calibrated-psuccess already guards SAMPLE SIZE and SURVIVORSHIP, but a belief computed from many outcomes
 * that all come from a SINGLE source mission is over-fit to that one context — applying it to a genuinely NOVEL instance is
 * over-generalization. This measures the DIVERSITY of the evidence (distinct source missions) and refuses to generalize a
 * narrow-source belief: OVERFIT ⇒ do not trust the belief for a novel instance (probe instead). Fail-closed: if the
 * outcomes carry no source identity, diversity cannot be verified ⇒ NOT generalizable (never assume).
 */

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

const MIN_OBSERVATIONS = 4;      // < this ⇒ INSUFFICIENT_DATA (no generalization claim from near-nothing)
const MIN_DISTINCT_SOURCES = 3;  // < this distinct source contexts ⇒ OVERFIT (narrow experience ⇒ source-context overfitting)

function sourceOf(o: any): string | null {
  if (!isObj(o)) return null;
  for (const k of ["missionId", "source", "sourceSignature", "id"]) if (typeof o[k] === "string" && o[k]) return o[k];
  return null;
}

/**
 * assessGeneralization(outcomes, opts?) -> frozen verdict. outcomes: native-build-outcome records
 *   [{ type, outcome, independentlyVerified, missionId?/source? }]. opts: { key?, minObservations?, minDistinctSources? }.
 * Measures how many DISTINCT source contexts the verified evidence spans. OVERFIT (too few) ⇒ generalizable:false ⇒ a
 * novel instance should be probed, not ridden on a narrow belief. UNKNOWN_SOURCE (no source ids) ⇒ generalizable:false.
 */
function assessGeneralization(outcomes: any, opts: any = {}): any {
  const o = isObj(opts) ? opts : {};
  const minObs = Number.isFinite(o.minObservations) && o.minObservations > 0 ? Math.floor(o.minObservations) : MIN_OBSERVATIONS;
  const minDistinct = Number.isFinite(o.minDistinctSources) && o.minDistinctSources > 0 ? Math.floor(o.minDistinctSources) : MIN_DISTINCT_SOURCES;
  const wantKey = typeof o.key === "string" ? o.key : null;
  const all = Array.isArray(outcomes) ? outcomes.filter(isObj) : [];
  const scoped = wantKey === null ? all : all.filter((x: any) => x.type === wantKey);
  const decided = scoped.filter((x: any) => (x.outcome === "SUCCESS" || x.outcome === "FAILURE") && x.independentlyVerified === true);

  if (decided.length < minObs)
    return freeze({ verdict: "INSUFFICIENT_DATA", generalizable: false, observations: decided.length, distinctSources: 0, diversityRatio: null, recommendation: "too few verified outcomes to judge generalization — probe (fail-closed)", note: `need ≥${minObs} verified outcomes; have ${decided.length}` });

  const sources = new Set<string>();
  let missingSource = 0;
  for (const d of decided) { const s = sourceOf(d); if (s === null) missingSource++; else sources.add(s); }
  // fail-closed: if the evidence carries no source identity at all, diversity is unverifiable ⇒ do NOT generalize
  if (sources.size === 0)
    return freeze({ verdict: "UNKNOWN_SOURCE", generalizable: false, observations: decided.length, distinctSources: 0, diversityRatio: null, recommendation: "outcomes carry no source identity — diversity cannot be verified ⇒ do not generalize (probe)", note: `${missingSource} outcome(s) without a source id` });

  const distinct = sources.size;
  const diversityRatio = Number((distinct / decided.length).toFixed(4));
  if (distinct < minDistinct)
    return freeze({ verdict: "OVERFIT", generalizable: false, observations: decided.length, distinctSources: distinct, diversityRatio, recommendation: "belief rests on too few distinct source contexts (narrow experience ⇒ source-context overfitting) — do NOT apply it to a novel instance; probe instead", note: `${distinct} distinct source(s) < ${minDistinct} over ${decided.length} outcomes (over-generalization risk)` });

  return freeze({ verdict: "GENERALIZABLE", generalizable: true, observations: decided.length, distinctSources: distinct, diversityRatio, recommendation: "evidence spans enough distinct source contexts ⇒ safe to apply the belief to a novel instance", note: `${distinct} distinct sources over ${decided.length} outcomes` });
}

const GENERALIZATION_VALIDITY_CONTRACT = Object.freeze({
  id: "V327-GENERALIZATION-VALIDITY",
  purpose: "§6 — guard against over-generalization / source-context overfitting: measure the DIVERSITY of the evidence (distinct source contexts) behind a calibrated belief and refuse to generalize a narrow-source belief to a novel instance",
  worldReference: "Memory for Autonomous LLM Agents (arXiv:2603.07670): over-generalization = a lesson from one context applied blindly in another; narrow experience ⇒ source-context overfitting, diverse experience ⇒ high-specificity+high-generality. AgentMemoryBench lists generalization as a standard dimension.",
  reuses: Object.freeze(["native-build-outcome accumulated outcomes (read-only; NO parallel memory)", "complements odg-calibrated-psuccess (sample-size+survivorship) with the ORTHOGONAL source-diversity axis it does not cover"]),
  invariants: Object.freeze([
    "only INDEPENDENTLY-VERIFIED outcomes counted; measures DISTINCT source contexts (missionId/source), not raw count",
    "OVERFIT (too few distinct sources) ⇒ generalizable:false ⇒ a novel instance is probed, not ridden on a narrow belief",
    "fail-closed: no source identity ⇒ UNKNOWN_SOURCE ⇒ not generalizable (diversity never assumed); <minObservations ⇒ INSUFFICIENT_DATA",
    "distinct from sample-size: 20 outcomes from ONE mission is large but NOT diverse ⇒ still OVERFIT",
    "PURE/deterministic/frozen; read-only over the existing store; no clock/network",
  ]),
});

module.exports = { assessGeneralization, sourceOf, GENERALIZATION_VALIDITY_CONTRACT };
export {};
