#!/usr/bin/env node
/**
 * revenue-channels — compares go-to-market CHANNELS for the €500k TARGET by layering channel economics on top of the
 * monthly projection (revenue-schedule.projectMonthly — REUSED, not modified). Four comparable scenarios (mandate V10 §3):
 *   A SOLO (one-off only) · B SOLO_RECURRING · C PARTNER (commission on revenue, partner brings volume) ·
 *   D SUBCONTRACT (extra delivery capacity at a cost).
 * Channel cost (commission + subcontract) is taken off gross cash; ODG's own direct cost (base costRatio) still applies
 * — a deliberately CONSERVATIVE net (channel cost ADDS to, does not replace, direct cost unless the caller lowers it).
 * requiredForTargetCash() back-solves the monthly-prospect volume needed to CASH the target within the horizon and flags
 * when it exceeds the solo capacity ceiling. All rates are HYPOTHESIS; €500k is a TARGET; no partner revenue is invented.
 * Pure, deterministic.
 */
"use strict";

const SCHED = require("./revenue-schedule.js");

const SOLO_CEILING_PROSPECTS = 120;    // per month (HYPOTHESIS, single operator)

function n(v: number, d = 0): number { return typeof v === "number" && isFinite(v) && v >= 0 ? v : d; }
function pct(v: number): number { return typeof v === "number" && v >= 0 && v <= 1 ? v : 0; }
function r2(x: number): number { return Math.round(x * 100) / 100; }

/**
 * channelProjection(base, channel): base = revenue-schedule params; channel = { type, commissionRate?,
 * subcontractCostRatio?, capacityMultiplier?, prospectsMultiplier? }. Returns gross/channelCost/net cash + margin.
 */
function channelProjection(base: any, channel: any): any {
  const c = channel || {};
  const commissionRate = pct(c.commissionRate);
  const subcontractCostRatio = pct(c.subcontractCostRatio);
  const capacityMultiplier = n(c.capacityMultiplier, 1) || 1;       // subcontract raises deliverable throughput
  const prospectsMultiplier = n(c.prospectsMultiplier, 1) || 1;     // partner brings extra qualified volume
  const baseCostRatio = pct(base && base.costRatio);

  const effectiveProspects = n(base && base.monthlyProspects) * capacityMultiplier * prospectsMultiplier;
  const proj = SCHED.projectMonthly(Object.assign({}, base, { monthlyProspects: effectiveProspects }));
  const grossCashed = proj.totals.cashedWithinHorizon;
  const channelCost = r2(grossCashed * (commissionRate + subcontractCostRatio));
  const netCashed = r2(grossCashed - channelCost);
  const directCost = r2(grossCashed * baseCostRatio);
  const netMargin = r2(netCashed - directCost);                      // conservative: channel cost + own direct cost
  const feasible = effectiveProspects <= SOLO_CEILING_PROSPECTS || capacityMultiplier > 1; // subcontract lifts the ceiling
  return {
    type: (c.type || "SOLO"), effectiveProspects: r2(effectiveProspects),
    grossCashed, channelCost, netCashed, directCost, netMargin,
    marginPctOfGross: grossCashed > 0 ? r2((netMargin / grossCashed) * 100) : 0,
    capacityNote: effectiveProspects > SOLO_CEILING_PROSPECTS && capacityMultiplier <= 1 ? `effective prospects ${r2(effectiveProspects)}/mo exceed solo ceiling ${SOLO_CEILING_PROSPECTS} — needs subcontracting/partners` : "within capacity (or subcontract-expanded)",
    feasibleWithinCapacity: feasible,
  };
}

/** compareChannels(base, channels?): default A/B/C/D preset comparison, ranked by netMargin desc. */
function compareChannels(base: any, channels?: any): any {
  const presets = Array.isArray(channels) && channels.length ? channels : [
    { type: "SOLO", recurringMonthly: 0 },
    { type: "SOLO_RECURRING" },
    { type: "PARTNER", commissionRate: 0.3, prospectsMultiplier: 1.5 },
    { type: "SUBCONTRACT", subcontractCostRatio: 0.4, capacityMultiplier: 2 },
  ];
  const results = presets.map((p: any) => {
    const b = p.type === "SOLO" ? Object.assign({}, base, { recurringMonthly: 0 }) : base;
    return channelProjection(b, p);
  });
  const ranked = results.slice().sort((a: any, b: any) => b.netMargin - a.netMargin);
  return { base: { monthlyProspects: n(base && base.monthlyProspects), avgContractValue: n(base && base.avgContractValue), recurringMonthly: n(base && base.recurringMonthly) }, results, rankedByNetMargin: ranked.map((r: any) => r.type), notes: ["Channel rates (commission/subcontract/multipliers) are HYPOTHESIS. €500k is a TARGET. Net is conservative: channel cost is added to, not substituted for, ODG direct cost. No partner revenue invented."] };
}

/**
 * requiredForTargetCash(base, target, maxProspects): bounded search for the monthlyProspects needed so cashed-within-
 * horizon ≥ target. Returns the required prospects/mo + whether it exceeds the solo ceiling (⇒ needs partners/subcontract).
 */
function requiredForTargetCash(base: any, target = 500000, maxProspects = 2000): any {
  let lo = 0, hi = Math.max(1, n(maxProspects, 2000));
  const cashAt = (p: number) => SCHED.projectMonthly(Object.assign({}, base, { monthlyProspects: p })).totals.cashedWithinHorizon;
  if (cashAt(hi) < target) return { target, achievable: false, note: `even ${hi} prospects/mo does not cash ${target} within the horizon (price/recurring too low or lags too long)`, requiredMonthlyProspects: null, exceedsSoloCeiling: true };
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (cashAt(mid) >= target) hi = mid; else lo = mid; }
  const req = Math.ceil(hi);
  return { target, achievable: true, requiredMonthlyProspects: req, exceedsSoloCeiling: req > SOLO_CEILING_PROSPECTS, soloCeiling: SOLO_CEILING_PROSPECTS, note: req > SOLO_CEILING_PROSPECTS ? "exceeds solo ceiling ⇒ requires subcontracting/partners or higher price/recurring" : "within solo ceiling IF assumed conversions/prices hold (unvalidated)" };
}

export { channelProjection, compareChannels, requiredForTargetCash, SOLO_CEILING_PROSPECTS };
module.exports = { channelProjection, compareChannels, requiredForTargetCash, SOLO_CEILING_PROSPECTS };
