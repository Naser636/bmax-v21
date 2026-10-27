#!/usr/bin/env node
/**
 * pricing-grid — a FAIL-CLOSED pricing grid where every price band is bound to a scope, a day range, a minimum margin
 * and a demand-test flag (mandate V15 §4). It validates that no price exists without scope + days + minMargin, computes
 * the implied day-rate and checks it against a floor + the minimum-margin given a daily delivery cost, and selects which
 * entries are defensible to display PUBLICLY vs quote-only. **All prices are HYPOTHESIS until validated by market
 * demand + CTO; no price is published by this module.** Pure, deterministic. Tiers: ENTRY / INTERMEDIATE / HIGH /
 * RECURRING. The live site currently shows NO prices (quote-only) — this grid is an internal pricing instrument +
 * a proposal to test "starting-from" prices, not an instruction to publish.
 */
"use strict";

const DAY_RATE_FLOOR = 400;     // € / day (HYPOTHESIS minimum defensible rate)

function num(v: any, d = 0): number { return typeof v === "number" && isFinite(v) && v >= 0 ? v : d; }
function r2(x: number): number { return Math.round(x * 100) / 100; }

// The working grid (HYPOTHESIS bands, from V15 §4 + verified comparables in COMMERCIAL_RESEARCH_V3).
const GRID: Array<any> = [
  { id: "diagnostic", tier: "ENTRY", scope: "bounded diagnostic + options report", days: [1, 1], priceBand: [490, 990], minMarginPct: 60, publicDisplay: true, exclusions: ["remediation", "running on client prod"] },
  { id: "audit-limited", tier: "ENTRY", scope: "limited technical audit + report + evidence (SBOM/deps/licenses)", days: [2, 3], priceBand: [1500, 3000], minMarginPct: 60, publicDisplay: true, exclusions: ["implementation of fixes", "certification"] },
  { id: "remediation-assurance", tier: "ENTRY", scope: "bounded remediation / technical assurance pack", days: [4, 6], priceBand: [3000, 5000], minMarginPct: 55, publicDisplay: false, exclusions: ["unbounded rework", "legal opinion"] },
  { id: "deep-audit", tier: "INTERMEDIATE", scope: "deep audit / defined technical lot", days: [6, 10], priceBand: [5000, 10000], minMarginPct: 55, publicDisplay: false, exclusions: ["production hosting"] },
  { id: "reliability-integration", tier: "INTERMEDIATE", scope: "reliability / automation / integration project", days: [10, 18], priceBand: [8000, 15000], minMarginPct: 55, publicDisplay: false, exclusions: ["open-ended scope"] },
  { id: "program", tier: "HIGH", scope: "multi-lot program / extended engagement", days: [20, 36], priceBand: [15000, 30000], minMarginPct: 50, publicDisplay: false, exclusions: ["scope beyond SOW"] },
  { id: "recurring-assurance", tier: "RECURRING", scope: "monthly recurring assurance/monitoring (deliverable-based)", days: [2, 4], priceBand: [1000, 2000], minMarginPct: 60, publicDisplay: false, recurringMonthly: true, exclusions: ["certification", "guaranteed outcome"] },
];

/** impliedDayRate(entry): priceBand / days (min and max). */
function impliedDayRate(e: any): { min: number; max: number } {
  const [pLo, pHi] = e.priceBand || [0, 0]; const [dLo, dHi] = e.days || [1, 1];
  return { min: dHi > 0 ? r2(pLo / dHi) : 0, max: dLo > 0 ? r2(pHi / dLo) : 0 };   // min rate = lowPrice/maxDays
}

/** validateEntry(e, dailyCost): fail-closed — scope + days + priceBand + minMargin required; rate ≥ floor; margin ok. */
function validateEntry(e: any, dailyCost = 0): any {
  const problems: string[] = [];
  if (!(e && typeof e.scope === "string" && e.scope.trim())) problems.push("missing scope");
  if (!(Array.isArray(e.days) && e.days[0] > 0)) problems.push("missing/invalid day range");
  if (!(Array.isArray(e.priceBand) && e.priceBand[0] > 0)) problems.push("missing/invalid price band");
  if (!(num(e.minMarginPct) > 0)) problems.push("missing minimum margin");
  const rate = impliedDayRate(e);
  // Day-rate floor applies to day-priced engagements only — a monthly recurring subscription is not day-rated.
  if (e.recurringMonthly !== true && rate.min > 0 && rate.min < DAY_RATE_FLOOR) problems.push(`implied min day-rate ${rate.min} < floor ${DAY_RATE_FLOOR}`);
  // margin: lowest price must still clear minMargin given a daily cost over max days.
  const cost = num(dailyCost) * (e.days ? e.days[1] : 0);
  const lowPrice = e.priceBand ? e.priceBand[0] : 0;
  const marginPct = lowPrice > 0 ? r2((1 - cost / lowPrice) * 100) : 0;
  if (dailyCost > 0 && marginPct < num(e.minMarginPct)) problems.push(`worst-case margin ${marginPct}% < min ${e.minMarginPct}%`);
  return { id: e.id, ok: problems.length === 0, problems, impliedDayRate: rate, worstCaseMarginPct: dailyCost > 0 ? marginPct : null };
}

/** validateGrid(grid?, dailyCost?): validate every entry; returns {ok, entries, publicEntries, notes}. */
function validateGrid(grid?: any, dailyCost = 0): any {
  const g = Array.isArray(grid) && grid.length ? grid : GRID;
  const entries = g.map((e: any) => ({ ...e, validation: validateEntry(e, dailyCost) }));
  const ok = entries.every((e: any) => e.validation.ok);
  const publicEntries = entries.filter((e: any) => e.publicDisplay === true && e.validation.ok).map((e: any) => ({ id: e.id, tier: e.tier, startingFrom: e.priceBand[0], scope: e.scope }));
  const notes = [
    "All prices are HYPOTHESIS — bound to a scope + day range + minimum margin; validate with market demand + CTO before publishing.",
    "The live site currently shows NO prices (quote-only). This grid is an internal pricing instrument + a proposal to test public 'starting-from' prices; it publishes nothing.",
    "Only publicDisplay entries carry a defensible starting-from price; everything else stays quote-after-scoping. No invented testimonial/client/result.",
  ];
  return { ok, entries, publicEntries, dayRateFloor: DAY_RATE_FLOOR, notes };
}

export { GRID, DAY_RATE_FLOOR, impliedDayRate, validateEntry, validateGrid };
module.exports = { GRID, DAY_RATE_FLOOR, impliedDayRate, validateEntry, validateGrid };
