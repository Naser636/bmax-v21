"use strict";

/*
 * Research Ranking — PURE, DETERMINISM_FIRST (TypeScript port; parity with runtime/core/research-ranking.js).
 *
 * MATH ONLY: a weighted composite score, a descending sort, and a 1-based rank assignment. Carries NO
 * research data. An item without a resolved `provenance_ref` is REJECTED (fail-closed) and never scored.
 *
 * Strict TS port: public exports (rank, composite, DEFAULT_WEIGHTS), signatures, return shapes, sort
 * order + tiebreak, fail-closed throw messages, weight key ORDER and `toFixed(2)` rounding are
 * preserved EXACTLY. The historical .js remains the behavioural reference.
 */

export interface RankingWeights {
  incomePotential: number;
  demandGrowth: number;
  startupCostInverse: number;
  timeToRevenueInverse: number;
  skillAlignment: number;
}

// Default weighting model (the ranking MODEL, not research data). Key order is significant (the
// composite accumulates Σ in this order) and is preserved from the historical .js.
export const DEFAULT_WEIGHTS: RankingWeights = {
  incomePotential: 0.30,
  demandGrowth: 0.25,
  startupCostInverse: 0.15,
  timeToRevenueInverse: 0.15,
  skillAlignment: 0.15,
};

// Composite = Σ(dimension × weight). A missing weighted dimension is a fail-closed error, not a 0 score.
export function composite(scores: any, weights: Record<string, number>): number {
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
 * Returns a new array (inputs untouched) with `score` and `rank` added, ordered by score desc then
 * name asc (a deterministic, stable tiebreak).
 */
export function rank(items: any, opts: any = {}): any[] {
  if (!Array.isArray(items)) throw new Error("research-ranking: items must be an array");
  const weights: Record<string, number> =
    opts.weights && typeof opts.weights === "object" ? opts.weights : DEFAULT_WEIGHTS;

  const scored = items.map((it: any, i: number) => {
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
    (a: any, b: any) => b.score - a.score || String(a.name || "").localeCompare(String(b.name || ""))
  );
  scored.forEach((it: any, i: number) => {
    it.rank = i + 1;
  });
  return scored;
}
