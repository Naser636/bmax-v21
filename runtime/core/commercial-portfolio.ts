#!/usr/bin/env node
/**
 * commercial-portfolio — consolidates SEVERAL commercial tracks into one monthly projection so the €500k program does
 * NOT depend on a single offer/client/channel (mandate V11 §2/§3/§6). Each track is a revenue-schedule params object
 * (REUSED — projectMonthly); this sums their monthly signed/invoiced/cashed, computes each track's contribution share,
 * and flags CONCENTRATION risk (over-dependence on one track) + a delivery-capacity check. NOTE on A/B/C/D: the labels
 * here are caller-supplied track names (V11 "voies" = small / intermediate / big+recurring / partner). They are DISTINCT
 * from other A/B/C/D meanings in the repo (niche-scoring switchDecision strategies; revenue-channels SOLO/RECURRING/
 * PARTNER/SUBCONTRACT; FIELD_DOSSIER niches) — this module does not redefine those. €500k is a TARGET; all HYPOTHESIS.
 * Pure, deterministic.
 */
"use strict";

const SCHED = require("./revenue-schedule.js");

const CONCURRENT_DELIVERY_CEILING = 3;   // HYPOTHESIS: a solo can run ~3 deliveries at once

function r2(x: number): number { return Math.round(x * 100) / 100; }

/** projectPortfolio(tracks): tracks = [{ label, ...projectMonthly params }]. Consolidates; flags concentration + capacity. */
function projectPortfolio(tracks: any): any {
  const list = Array.isArray(tracks) ? tracks : [];
  const per = list.map((t: any) => {
    const proj = SCHED.projectMonthly(t || {});
    return { label: (t && t.label) || "?", totals: proj.totals, rows: proj.rows };
  });
  // Horizon = the LONGEST track's month count, not just the first track's. Using per[0] alone silently dropped a
  // later/longer track's cash + signings from the per-month views (monthlyCashed, peakMonthlySignings) while they
  // stayed in `consolidated` (summed from each track's full totals) — breaking sum-of-parts = total AND understating
  // peakMonthlySignings ⇒ under-stating delivery-capacity need downstream (revenue-target-path). The `p.rows[m] ? …`
  // guards already tolerate shorter tracks, so widening the window is safe.
  const months = per.length ? per.reduce((mx: number, p: any) => Math.max(mx, p.rows.length), 0) || 12 : 12;
  const monthlyCashed = Array.from({ length: months }, (_, m) => r2(per.reduce((s: number, p: any) => s + (p.rows[m] ? p.rows[m].cashed : 0), 0)));
  const consolidated = per.reduce((acc: any, p: any) => ({
    signedBooked: r2(acc.signedBooked + p.totals.signedBooked),
    invoicedWithinHorizon: r2(acc.invoicedWithinHorizon + p.totals.invoicedWithinHorizon),
    cashedWithinHorizon: r2(acc.cashedWithinHorizon + p.totals.cashedWithinHorizon),
    grossMargin: r2(acc.grossMargin + p.totals.grossMargin),
  }), { signedBooked: 0, invoicedWithinHorizon: 0, cashedWithinHorizon: 0, grossMargin: 0 });

  const totalCash = consolidated.cashedWithinHorizon;
  const trackShares = per.map((p: any) => ({ label: p.label, cashed: p.totals.cashedWithinHorizon, sharePct: totalCash > 0 ? r2((p.totals.cashedWithinHorizon / totalCash) * 100) : 0 }));
  const maxShare = trackShares.reduce((m: number, t: any) => Math.max(m, t.sharePct), 0);
  const concentrationRisk = per.length === 0 ? "NO_DATA" : maxShare > 60 ? "HIGH" : maxShare > 40 ? "MEDIUM" : "LOW";

  // Delivery-capacity check: peak concurrent signings-in-delivery across the horizon vs the ceiling (coarse).
  const peakMonthlySignings = Array.from({ length: months }, (_, m) => per.reduce((s: number, p: any) => s + (p.rows[m] ? p.rows[m].signings : 0), 0)).reduce((a, b) => Math.max(a, b), 0);
  const capacityFlag = peakMonthlySignings > CONCURRENT_DELIVERY_CEILING ? `peak ${r2(peakMonthlySignings)} signings/mo may exceed solo delivery capacity (~${CONCURRENT_DELIVERY_CEILING} concurrent) — needs subcontracting/partners` : "within solo delivery capacity";

  const notes = [
    per.length === 0 ? "no tracks supplied — zero revenue, NO_DATA (nothing invented)" : "portfolio of HYPOTHESIS tracks; €500k is a TARGET; validate every assumption against real pipeline data.",
    "Diversification reduces single-track dependency; HIGH concentration (>60% of cash from one track) = fragility. Signed≠invoiced≠cashed≠margin.",
    "A/B/C/D 'voies' labels are caller-supplied and DISTINCT from niche-scoring strategies, revenue-channels scenarios, and FIELD_DOSSIER niches.",
  ];
  return { trackCount: per.length, consolidated, trackShares, concentrationMaxSharePct: maxShare, concentrationRisk, monthlyCashed, peakMonthlySignings: r2(peakMonthlySignings), capacityFlag, notes };
}

export { projectPortfolio, CONCURRENT_DELIVERY_CEILING };
module.exports = { projectPortfolio, CONCURRENT_DELIVERY_CEILING };
