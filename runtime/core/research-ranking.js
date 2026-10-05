"use strict";

/*
 * Research Ranking — PURE, DETERMINISM_FIRST.
 *
 * This is the MATH ONLY, extracted from the retired online-opportunities report builder: a weighted
 * composite score, a descending sort, and a 1-based rank assignment. It carries NO research data:
 * no opportunities, no source URLs, no provider names, no provenance narrative. It ranks ONLY
 * caller-supplied items whose citations have ALREADY been bound to verified provenance by the
 * External Research Acquisition executor. An item without a resolved `provenance_ref` is REJECTED
 * (fail-closed) and never scored — ranking can never launder unverified data into a result.
 *
 * Pure: output is a function of (items, weights) only — no wall-clock, no randomness, no I/O — so the
 * same inputs always produce the same order (reproducible / testable).
 */

// Default weighting model. These are the ranking MODEL (dimension weights), not research data.
const DEFAULT_WEIGHTS = {
  incomePotential: 0.30,
  demandGrowth: 0.25,
  startupCostInverse: 0.15,
  timeToRevenueInverse: 0.15,
  skillAlignment: 0.15,
};

// Composite = Σ(dimension × weight). Every weighted dimension MUST be a number on the item (no silent
// default to 0 — a missing dimension is a fail-closed error, not a zero score).
function composite(scores, weights) {
  return Number(
    Object.entries(weights)
      .reduce((sum, [dim, w]) => {
        const v = scores && typeof scores[dim] === "number" ? scores[dim] : null;
        if (v === null) throw new Error(`research-ranking: missing score dimension "${dim}"`);
        return sum + v * w;
      }, 0)
      .toFixed(2)
  );
}

/*
 * Rank caller-supplied items. Each item: { name, scores:{...}, provenance_ref }.
 * - provenance_ref MUST be a non-empty string (verified provenance bound by the executor).
 * - scores MUST cover every weighted dimension.
 * Returns a new array (inputs untouched) with `score` and `rank` added, ordered by score desc then
 * name asc (a deterministic, stable tiebreak).
 */
function rank(items, opts = {}) {
  if (!Array.isArray(items)) throw new Error("research-ranking: items must be an array");
  const weights =
    opts.weights && typeof opts.weights === "object" ? opts.weights : DEFAULT_WEIGHTS;

  const scored = items.map((it, i) => {
    if (!it || typeof it !== "object") {
      throw new Error(`research-ranking: item ${i} is not an object`);
    }
    if (typeof it.provenance_ref !== "string" || !it.provenance_ref) {
      throw new Error(
        `research-ranking: item "${it.name || i}" has no verified provenance_ref (fail-closed)`
      );
    }
    return { ...it, score: composite(it.scores, weights) };
  });

  scored.sort(
    (a, b) => b.score - a.score || String(a.name || "").localeCompare(String(b.name || ""))
  );
  scored.forEach((it, i) => {
    it.rank = i + 1;
  });
  return scored;
}

module.exports = { rank, composite, DEFAULT_WEIGHTS };
