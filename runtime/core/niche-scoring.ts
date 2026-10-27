#!/usr/bin/env node
/**
 * niche-scoring — reproducible multi-niche scoring (§2) + the A/B/C/D switch engine (§4) for the field-execution
 * system. Deterministic + pure: given explicit per-criterion scores (1–5) and weights, it ranks niches identically
 * every run. The switch engine turns OBSERVED commercial signals (not opinions) into an A/B/C/D recommendation under
 * PRE-SET thresholds, fail-closed: it will NOT switch on a single refusal (minimum sample required) and will NOT
 * declare success without the success threshold being met. No clock, no IO. Scores are HYPOTHESIS inputs unless cited.
 */
"use strict";

const CRITERIA = ["urgency", "publicNeedSignal", "budget", "decisionMakerAccess", "timeToCashInv", "contractValue", "deliveryCapacity", "acquisitionCostRiskInv", "referenceRecurrence"];
// Default weights (importance). timeToCash & acquisition-cost are INVERTED on input (higher input = better/faster/cheaper).
const DEFAULT_WEIGHTS: Record<string, number> = { urgency: 3, publicNeedSignal: 3, budget: 2, decisionMakerAccess: 2, timeToCashInv: 2, contractValue: 2, deliveryCapacity: 2, acquisitionCostRiskInv: 1, referenceRecurrence: 2 };

function clamp15(n: any): number { const v = typeof n === "number" ? n : 0; return Math.max(0, Math.min(5, v)); }

/** scoreNiche(niche, weights?): weighted sum of 1–5 criterion scores. Missing criterion ⇒ 0 (fail-closed, flagged). */
function scoreNiche(niche: any, weights?: any): { id: string; score: number; missing: string[] } {
  const w = weights || DEFAULT_WEIGHTS;
  const s = (niche && niche.scores) || {};
  let total = 0; const missing: string[] = [];
  for (const c of CRITERIA) { if (typeof s[c] !== "number") missing.push(c); total += clamp15(s[c]) * (typeof w[c] === "number" ? w[c] : 0); }
  return { id: (niche && niche.id) || "?", score: total, missing };
}

/** rankNiches(niches, weights?): deterministic ranking (desc score, then id asc for ties). */
function rankNiches(niches: any[], weights?: any): Array<{ id: string; score: number; missing: string[] }> {
  return (Array.isArray(niches) ? niches : []).map((n) => scoreNiche(n, weights)).sort((a, b) => (b.score - a.score) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * switchDecision(observed, thresholds): decide A/B/C/D from OBSERVED signals.
 *   observed = { sample, qualifiedReplies, meetings, proposals, signed }  (counts, real)
 *   thresholds = { minSample, successMeetings|successProposals|successSigned, stopQualifiedRate }
 * - sample < minSample ⇒ HOLD_A (never switch on too few attempts / a single refusal).
 * - success signal met ⇒ STAY_A (keep the working niche/offer).
 * - sample ≥ minSample but below the stop rate ⇒ escalate B → C → D depending on `stage`.
 */
function switchDecision(observed: any, thresholds: any, stage = "A"): { strategy: string; reason: string } {
  const o = observed || {}; const t = thresholds || {};
  const sample = clampN(o.sample), minSample = clampN(t.minSample, 10);
  if (sample < minSample) return { strategy: "HOLD_A", reason: `sample ${sample} < minSample ${minSample} — do NOT switch on too few attempts / a single refusal` };
  const signed = clampN(o.signed), meetings = clampN(o.meetings), proposals = clampN(o.proposals), qr = clampN(o.qualifiedReplies);
  if ((t.successSigned && signed >= t.successSigned) || (t.successProposals && proposals >= t.successProposals) || (t.successMeetings && meetings >= t.successMeetings)) {
    return { strategy: "STAY_A", reason: "success threshold met — keep the current niche/offer/channel and scale it" };
  }
  const rate = sample > 0 ? qr / sample : 0;
  const stopRate = typeof t.stopQualifiedRate === "number" ? t.stopQualifiedRate : 0.05;
  if (rate >= stopRate) return { strategy: "CONTINUE_A", reason: `qualified-reply rate ${round3(rate)} ≥ stop ${stopRate} — signal present, continue + refine` };
  // below the stop rate after a full sample ⇒ re-orient, escalating per current stage
  const next = stage === "A" ? "B" : stage === "B" ? "C" : stage === "C" ? "D" : "D";
  const why: Record<string, string> = { B: "adjust scope/price/segment/problem (offer re-design)", C: "switch to partner/white-label or a different acquisition channel", D: "activate a different niche or business model" };
  return { strategy: "SWITCH_" + next, reason: `qualified-reply rate ${round3(rate)} < stop ${stopRate} after ${sample} attempts ⇒ ${why[next]}` };
}

function clampN(v: any, d = 0): number { return typeof v === "number" && isFinite(v) && v >= 0 ? v : d; }
function round3(n: number): number { return Math.round(n * 1000) / 1000; }

export { CRITERIA, DEFAULT_WEIGHTS, scoreNiche, rankNiches, switchDecision };
module.exports = { CRITERIA, DEFAULT_WEIGHTS, scoreNiche, rankNiches, switchDecision };
