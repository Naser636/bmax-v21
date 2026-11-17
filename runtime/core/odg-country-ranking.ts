#!/usr/bin/env node
"use strict";

/*
 * V272 §7 — ODG REPRODUCIBLE COUNTRY-RANKING MECHANISM (deterministic, transparent criteria). The V268 growth roadmap (§12
 * Stage 1 / §37) requires selecting target markets "not arbitrarily" but through "a reproducible country-ranking mechanism
 * with transparent criteria". This is that mechanism — a REAL functional capability, not a research report or a matrix.
 *
 * REUSE (no 2nd scoring/sort engine): research-ranking.composite (weighted sum, provenance-required) + research-ranking.rank
 * (deterministic descending sort + 1-based rank, fail-closed on missing provenance). This module adds ONLY the international
 * layer: the transparent weighted CRITERIA, benefit-direction handling (lower-is-better inversion), and the UNKNOWN-coverage
 * discipline.
 *
 * HONESTY: every criterion value is a SUPPLIED research/planning score (ESTIMATED), never "actual market performance"; a
 * missing criterion is NEVER fabricated — it lowers coverage/confidence and the weights are RENORMALISED over known criteria
 * (a missing criterion is not silently counted as 0); a country below the coverage floor OR without a provenance ref is
 * flagged INSUFFICIENT_EVIDENCE and NOT ranked (never ranked as 0). Deterministic/read-only (no Date.now/Math.random/I/O).
 * Nothing claims real traction, demand or market size — these are planning inputs for prioritisation only.
 */

const RR = require("./research-ranking.js");   // existing generic weighted-composite + deterministic rank (reuse; no 2nd engine)

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function score100(v: any): number | null { return typeof v === "number" && isFinite(v) && v >= 0 && v <= 100 ? v : null; }
function round2(n: number): number { return Math.round(n * 100) / 100; }

const VALUE_STATUS = Object.freeze(["ACTUAL", "MEASURED", "ESTIMATED", "VENDOR_CLAIM", "HYPOTHESIS", "UNKNOWN"]);

// transparent, weighted criteria (weights sum to 1.0). direction: higher_better keeps the score; lower_better inverts (100-s)
// so every criterion becomes a 0..100 BENEFIT score where higher is always better.
const CRITERIA = Object.freeze([
  Object.freeze({ key: "marketSize", weight: 0.25, direction: "higher_better", description: "addressable construction-business market size" }),
  Object.freeze({ key: "purchasingPower", weight: 0.15, direction: "higher_better", description: "customer purchasing power / willingness to pay" }),
  Object.freeze({ key: "languageFit", weight: 0.15, direction: "higher_better", description: "fit with ODG's supported languages (FR/EN/ES/AR)" }),
  Object.freeze({ key: "competitionIntensity", weight: 0.15, direction: "lower_better", description: "incumbent competition intensity (lower is better)" }),
  Object.freeze({ key: "regulatoryComplexity", weight: 0.10, direction: "lower_better", description: "regulatory/localization complexity (lower is better)" }),
  Object.freeze({ key: "paymentInfra", weight: 0.10, direction: "higher_better", description: "payment & e-invoicing infrastructure readiness" }),
  Object.freeze({ key: "entryCost", weight: 0.10, direction: "lower_better", description: "market-entry cost (lower is better)" }),
]);
const CRITERIA_BY_KEY: Record<string, any> = Object.freeze(CRITERIA.reduce((a: any, c: any) => { a[c.key] = c; return a; }, {}));
const TOTAL_WEIGHT = CRITERIA.reduce((a: number, c: any) => a + c.weight, 0);     // 1.0

/** benefit(value, direction) -> 0..100 benefit score (lower_better inverted). */
function benefit(value: number, direction: string): number { return direction === "lower_better" ? (100 - value) : value; }

/** scoreCountry(country, minCoverage) -> per-country transparent score with coverage/confidence + known/missing breakdown. */
function scoreCountry(country: any, minCoverage: number): any {
  const c = isObj(country) ? country : {};
  const code = isStr(c.code) ? c.code : null;
  const crit = isObj(c.criteria) ? c.criteria : {};
  const contributions: any[] = []; const missing: string[] = [];
  const knownScores: Record<string, number> = {}; const knownWeights: Record<string, number> = {};
  let knownWeight = 0, actualWeight = 0;
  for (const def of CRITERIA) {
    const cell = isObj(crit[def.key]) ? crit[def.key] : null;
    const raw = cell ? score100(cell.score) : null;
    const status = cell && VALUE_STATUS.indexOf(cell.status) >= 0 ? cell.status : "UNKNOWN";
    if (raw === null || status === "UNKNOWN") { missing.push(def.key); continue; }
    const b = benefit(raw, def.direction);
    knownScores[def.key] = b; knownWeights[def.key] = def.weight; knownWeight += def.weight;
    if (status === "ACTUAL" || status === "MEASURED") actualWeight += def.weight;
    contributions.push(Object.freeze({ key: def.key, rawScore: raw, benefitScore: b, weight: def.weight, status, source: isStr(cell.source) ? cell.source : null, weighted: round2(b * def.weight) }));
  }
  const coverage = round2(knownWeight / TOTAL_WEIGHT);
  const hasProvenance = isStr(c.provenanceRef);
  // weighted sum over KNOWN criteria via the reused composite, then RENORMALISE by known weight (missing never counted as 0).
  const rawComposite = knownWeight > 0 ? Number(RR.composite(knownScores, knownWeights)) : 0;
  const normalizedScore = knownWeight > 0 ? round2(rawComposite / knownWeight) : 0;
  const sufficient = knownWeight > 0 && coverage >= minCoverage && hasProvenance;
  // confidence: fraction of the KNOWN weight that is ACTUAL/MEASURED (vs estimate) × coverage.
  const confidence = knownWeight > 0 ? round2((actualWeight / knownWeight) * coverage) : 0;
  return Object.freeze({
    code, name: isStr(c.name) ? c.name : code,
    score: normalizedScore, coverage, confidence, sufficientEvidence: sufficient,
    hasProvenance, missing: Object.freeze(missing), contributions: Object.freeze(contributions),
    status: sufficient ? "RANKED" : (!hasProvenance ? "INSUFFICIENT_EVIDENCE_NO_PROVENANCE" : "INSUFFICIENT_EVIDENCE_LOW_COVERAGE"),
  });
}

/** rankCountries(input) -> transparent, reproducible country prioritisation. Insufficient-evidence countries are reported, NOT ranked. */
function rankCountries(input: any): any {
  const i = isObj(input) ? input : {};
  const countries = Array.isArray(i.countries) ? i.countries.filter(isObj) : [];
  const minCoverage = typeof i.minCoverage === "number" && i.minCoverage >= 0 && i.minCoverage <= 1 ? i.minCoverage : 0.6;
  if (countries.length === 0) return Object.freeze({ ok: false, code: "NO_COUNTRIES", detail: "at least one country required (fail-closed)" });
  const scored = countries.map((c: any) => scoreCountry(c, minCoverage));
  const eligible = scored.filter((s: any) => s.sufficientEvidence);
  const excluded = scored.filter((s: any) => !s.sufficientEvidence);
  // deterministic descending rank via the reused research-ranking (provenance-required, stable sort + 1-based rank).
  const items = eligible.map((s: any) => ({ name: s.code, scores: { weightedScore: s.score }, provenance_ref: "country:" + s.code }));
  const ranked = RR.rank(items, { weights: { weightedScore: 1 } });
  const byCode: Record<string, any> = {}; eligible.forEach((s: any) => { byCode[s.code] = s; });
  const ranking = ranked.map((r: any, idx: number) => Object.freeze({ rank: idx + 1, code: r.name, score: byCode[r.name].score, coverage: byCode[r.name].coverage, confidence: byCode[r.name].confidence, missing: byCode[r.name].missing, contributions: byCode[r.name].contributions }));
  return Object.freeze({
    ok: true, basis: "PLANNING_ESTIMATE (research-supplied scores — NOT actual market performance/traction/demand)",
    criteria: CRITERIA, minCoverage, totalWeight: TOTAL_WEIGHT,
    rankedCount: ranking.length, ranking: Object.freeze(ranking),
    excludedCount: excluded.length, excluded: Object.freeze(excluded.map((s: any) => Object.freeze({ code: s.code, status: s.status, coverage: s.coverage, missing: s.missing }))),
    note: "reproducible transparent-criteria country ranking. Weights renormalised over KNOWN criteria (a missing criterion is never counted as 0); a country below the coverage floor or without provenance is INSUFFICIENT_EVIDENCE and NOT ranked (never 0). Reuses research-ranking (composite + rank) — no 2nd scoring engine. All inputs are planning estimates — no real traction/demand/market-size is claimed.",
  });
}

const COUNTRY_RANKING_CONTRACT = Object.freeze({
  id: "V272-ODG-COUNTRY-RANKING",
  source: "V272 §7 / V268 §12 Stage 1 / §37 — reproducible country-ranking mechanism with transparent criteria",
  valueStatuses: VALUE_STATUS, criteria: CRITERIA.map((c: any) => c.key),
  reuses: Object.freeze(["research-ranking (composite weighted sum + deterministic rank, provenance-required)"]),
  invariants: Object.freeze([
    "transparent weighted criteria (weights sum to 1.0); lower-is-better criteria inverted to a 0..100 benefit score",
    "a missing criterion is NEVER fabricated: weights are RENORMALISED over known criteria (never counted as 0); coverage + confidence reported",
    "a country below the coverage floor OR without a provenance ref is INSUFFICIENT_EVIDENCE and NOT ranked — never ranked as 0",
    "reuses research-ranking for the weighted sum AND the deterministic sort/rank — no 2nd scoring/ranking engine",
    "all criterion values are SUPPLIED planning/research estimates — NOT actual market performance/traction/demand/size; deterministic/read-only; reproducible (same input ⇒ same ranking)",
  ]),
});

module.exports = { VALUE_STATUS, CRITERIA, TOTAL_WEIGHT, benefit, scoreCountry, rankCountries, COUNTRY_RANKING_CONTRACT };

export {};
