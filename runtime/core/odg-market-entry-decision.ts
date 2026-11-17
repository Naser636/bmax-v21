#!/usr/bin/env node
"use strict";

/*
 * V274 §5.A / §12 — ODG MARKET-ENTRY DECISION (deterministic). Connects the V272 country-ranking mechanism to the V271
 * executive decision engine: it turns a ranked country list into a governed market-entry decision. A real cross-capability
 * integration (ranking → decision), not a report.
 *
 * REUSE (no new engine/primitive): odg-country-ranking.rankCountries (V272 — transparent ranking) + odg-executive-decision-
 * engine.decision (V271 — the A/B/C/D authority record).
 *
 * HONESTY: entering a new market is a SIGNIFICANT commercial/financial/legal act ⇒ ALWAYS authority level C (human approval);
 * NEVER autonomous, executionResult always null (propose, never self-execute). A decision is NEVER taken on an INSUFFICIENT_
 * EVIDENCE country or an empty ranking ⇒ a level-A GATHER_EVIDENCE action instead. Low confidence is surfaced, never hidden.
 * All inputs are planning/research estimates (via country-ranking) — no real market traction is claimed. Deterministic/read-only.
 */

const CR = require("./odg-country-ranking.js");                 // V272 — rankCountries
const DEC = require("./odg-executive-decision-engine.js");      // V271 — decision() + A/B/C/D authority

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/** proposeMarketEntry(rankingResult, policy) -> a governed market-entry decision (level C) or a level-A gather-evidence action. */
function proposeMarketEntry(rankingResult: any, policy: any): any {
  const r = isObj(rankingResult) ? rankingResult : {};
  const pol = isObj(policy) ? policy : {};
  const minConfidence = typeof pol.minConfidence === "number" ? pol.minConfidence : 0;

  // no eligible ranked country (empty / all insufficient-evidence) ⇒ NEVER decide on nothing — gather evidence (level A).
  if (r.ok !== true || !Array.isArray(r.ranking) || r.ranking.length === 0) {
    const dec = DEC.decision({
      id: "DEC_MARKET_ENTRY_EVIDENCE", condition: "no country has sufficient evidence to rank (empty eligible set)",
      evidence: "country-ranking", source: "odg-country-ranking (V272)", currentState: "eligible=0",
      policy: "evidence-first — no market-entry decision on insufficient evidence",
      options: ["collect country evidence (market size/competition/regulatory/payment)", "lower nothing — never decide on UNKNOWN"],
      expectedBenefit: "restore decidability", estimatedCost: "research", risks: ["entering a market on unknown data is unsound"],
      reversibility: "high", confidence: "certain", uncertainty: "none",
      recommendedAction: "run country research (Radar) to produce provenance-backed scores before any market-entry decision",
      authorityLevel: "A",
    });
    return Object.freeze({ ok: true, hasCandidate: false, decision: dec, topCountry: null, note: "no eligible country — a level-A gather-evidence action, never a market-entry decision on insufficient evidence." });
  }

  const top = r.ranking[0];
  const runnerUp = r.ranking.length > 1 ? r.ranking[1] : null;
  const lowConfidence = top.confidence < minConfidence;
  // market entry is a significant commercial/financial/legal act ⇒ ALWAYS level C (human approval), never autonomous.
  const dec = DEC.decision({
    id: "DEC_MARKET_ENTRY", condition: "top-ranked market candidate " + top.code + " (score " + top.score + ", coverage " + top.coverage + ", confidence " + top.confidence + ")" + (lowConfidence ? " [BELOW confidence floor " + minConfidence + "]" : ""),
    evidence: "country-ranking:" + top.code, source: "odg-country-ranking (V272) → odg-executive-decision-engine (V271)",
    currentState: "rank1=" + top.code + (runnerUp ? " rank2=" + runnerUp.code : ""),
    policy: "market entry = significant commercial/financial/legal act ⇒ human approval (level C)",
    options: Object.freeze(["prioritize market-entry preparation for " + top.code, runnerUp ? "compare against " + runnerUp.code : "single candidate", "defer pending more evidence"]),
    expectedBenefit: "focus limited (≤3-person) capacity on the highest-scored market", estimatedCost: "localization + entry (planning estimate)",
    risks: Object.freeze(["ranking is planning-estimate not measured demand", lowConfidence ? "confidence below floor — evidence thin" : "scores are research estimates"]),
    reversibility: "medium", confidence: lowConfidence ? "low" : "evidence-ranked (estimates)", uncertainty: "scores are planning estimates, not measured traction",
    recommendedAction: "HUMAN approval to prioritize market-entry preparation for " + top.code + " (never autonomous; no external commitment)",
    authorityLevel: "C",
  });
  return Object.freeze({
    ok: true, hasCandidate: true, topCountry: Object.freeze({ code: top.code, score: top.score, coverage: top.coverage, confidence: top.confidence }),
    runnerUp: runnerUp ? Object.freeze({ code: runnerUp.code, score: runnerUp.score }) : null,
    lowConfidence, decision: dec,
    note: "market entry proposed as a level-C decision (human approval, never autonomous, executionResult null). Scores are planning estimates from country-ranking — not measured market traction; entry preparation only, no external commitment.",
  });
}

/** rankAndPropose(input, policy) -> convenience: rank countries (V272) then propose a governed entry decision (V271). */
function rankAndPropose(input: any, policy: any): any {
  const ranking = CR.rankCountries(input);
  return Object.freeze({ ok: true, ranking, proposal: proposeMarketEntry(ranking, policy) });
}

const MARKET_ENTRY_DECISION_CONTRACT = Object.freeze({
  id: "V274-ODG-MARKET-ENTRY-DECISION",
  source: "V274 §5.A / §12 — connect country-ranking (V272) to the decision engine (V271) for governed market entry",
  reuses: Object.freeze(["odg-country-ranking (V272 rankCountries)", "odg-executive-decision-engine (V271 decision / A-B-C-D authority)"]),
  invariants: Object.freeze([
    "market entry is ALWAYS authority level C (human approval) — a significant commercial/financial/legal act, NEVER autonomous; executionResult always null (propose, never self-execute)",
    "NEVER a market-entry decision on an INSUFFICIENT_EVIDENCE country or an empty ranking ⇒ a level-A GATHER_EVIDENCE action instead",
    "low confidence (below the policy floor) is surfaced in the decision, never hidden; the top candidate's score/coverage/confidence are carried",
    "scores are PLANNING estimates from country-ranking — NOT measured market traction/demand; entry PREPARATION only, no external commitment",
    "reuses V272 ranking + V271 decision — no new scoring/decision engine, no new primitive; deterministic/read-only",
  ]),
});

module.exports = { proposeMarketEntry, rankAndPropose, MARKET_ENTRY_DECISION_CONTRACT };

export {};
