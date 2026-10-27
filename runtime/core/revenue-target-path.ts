#!/usr/bin/env node
/**
 * revenue-target-path — closes the gap to a revenue TARGET (default €500k) by solving for the scale a track mix needs
 * to reach the target in SIGNED bookings within the period, then reporting the honest consequences: required monthly
 * prospects/signings, the delivery-capacity gap (⇒ subcontractors needed beyond the solo ceiling), and — critically —
 * that CASH collected within the 12-month horizon is LESS than signed (lag). It does NOT invent conversions: it scales
 * caller-supplied track profiles uniformly and reports what scale is required, flagging if it is implausible/infeasible.
 * Reuses commercial-portfolio (⇒ revenue-schedule) — no parallel model. €500k stays a TARGET; all HYPOTHESIS.
 * Pure, deterministic.
 */
"use strict";

const PORT = require("./commercial-portfolio.js");

const SOLO_SIGNING_CEILING = 4;          // signings/month a solo can deliver (HYPOTHESIS; ~3 concurrent)

function r2(x: number): number { return Math.round(x * 100) / 100; }

function scaleTracks(tracks: any[], factor: number): any[] {
  return (tracks || []).map((t: any) => ({ ...t, monthlyProspects: (typeof t.monthlyProspects === "number" ? t.monthlyProspects : 0) * factor }));
}
function signedAt(tracks: any[], factor: number): number {
  return PORT.projectPortfolio(scaleTracks(tracks, factor)).consolidated.signedBooked;
}

/**
 * closeGapSigned(baseTracks, target, maxScale): binary-search a uniform scale so consolidated SIGNED ≥ target within
 * the period. Returns the scale, the scaled portfolio (signed + cashed), prospect/signing load, subcontractors needed,
 * and the signed-vs-cash gap. achievable=false if even maxScale falls short.
 */
function closeGapSigned(baseTracks: any[], target = 500000, maxScale = 50): any {
  const base = PORT.projectPortfolio(baseTracks || []);
  const baseSigned = base.consolidated.signedBooked;
  if (baseSigned <= 0) return { target, achievable: false, note: "base mix signs nothing (zero price/prospects) — cannot scale", baseSigned, scaleFactor: null };
  if (signedAt(baseTracks, maxScale) < target) return { target, achievable: false, note: `even ${maxScale}× does not reach ${target} signed — raise price/recurring or add tracks`, baseSigned: r2(baseSigned), scaleFactor: null };
  let lo = 1, hi = maxScale;
  if (baseSigned >= target) lo = hi = 0; // base already meets it (lo=hi=0 sentinel ⇒ factor ~0..but handle)
  if (baseSigned < target) { for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (signedAt(baseTracks, mid) >= target) hi = mid; else lo = mid; } }
  const factor = baseSigned >= target ? 1 : hi;
  const scaled = PORT.projectPortfolio(scaleTracks(baseTracks, factor));
  const monthlyProspectsTotal = r2((baseTracks || []).reduce((s: number, t: any) => s + (t.monthlyProspects || 0), 0) * factor);
  const peakSignings = scaled.peakMonthlySignings;
  const subcontractorsNeeded = Math.max(0, Math.ceil(peakSignings / SOLO_SIGNING_CEILING) - 1);
  return {
    target, achievable: true, scaleFactor: r2(factor),
    signed: scaled.consolidated.signedBooked, cashedWithinHorizon: scaled.consolidated.cashedWithinHorizon,
    signedMinusCashGap: r2(scaled.consolidated.signedBooked - scaled.consolidated.cashedWithinHorizon),
    monthlyProspectsTotal, peakMonthlySignings: peakSignings, soloSigningCeiling: SOLO_SIGNING_CEILING, subcontractorsNeeded,
    concentrationRisk: scaled.concentrationRisk,
    notes: [
      "Target met in SIGNED bookings within the period at this scale — a TARGET, not a result; conversions/prices are HYPOTHESIS (not tuned).",
      `CASH within the 12-month horizon is LOWER than signed (lag): signed ${scaled.consolidated.signedBooked} vs cashed ${scaled.consolidated.cashedWithinHorizon}.`,
      subcontractorsNeeded > 0 ? `Delivery load (${peakSignings}/mo peak) exceeds the solo ceiling (${SOLO_SIGNING_CEILING}/mo) ⇒ ~${subcontractorsNeeded} subcontractor(s) + working capital.` : "Within solo delivery capacity (if the assumed conversions hold).",
    ],
  };
}

export { closeGapSigned, scaleTracks, SOLO_SIGNING_CEILING };
module.exports = { closeGapSigned, scaleTracks, SOLO_SIGNING_CEILING };
