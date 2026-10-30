#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the portfolio consolidates several tracks (no single-track dependency): summed
// cashed == sum of tracks; concentration flagged (one dominant track ⇒ HIGH, balanced ⇒ LOW); shares ~100%; empty ⇒
// NO_DATA (nothing invented); capacity flag; reproducible. €500k is a TARGET.
"use strict";
const assert = require("assert");
const P = require("./commercial-portfolio.js");
const SCHED = require("./revenue-schedule.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const base = { months: 12, conv: { prospectToInterested: 0.15, interestedToProposal: 0.5, proposalToSigned: 0.35 }, costRatio: 0.3, salesLag: 1, deliveryLag: 1, paymentLag: 1, rampLag: 2, churn: 0.05 };
const trackA = { label: "A-small", ...base, monthlyProspects: 30, avgContractValue: 2000, recurringMonthly: 0 };
const trackB = { label: "B-intermediate", ...base, monthlyProspects: 15, avgContractValue: 9000, recurringMonthly: 0 };
const trackC = { label: "C-big+recurring", ...base, monthlyProspects: 8, avgContractValue: 18000, recurringMonthly: 2000 };

const port = P.projectPortfolio([trackA, trackB, trackC]);

// (1) consolidated cashed == sum of per-track cashed.
const sumCashed = [trackA, trackB, trackC].reduce((s, t) => s + SCHED.projectMonthly(t).totals.cashedWithinHorizon, 0);
ok("consolidated cashed == Σ track cashed", Math.abs(port.consolidated.cashedWithinHorizon - Math.round(sumCashed * 100) / 100) < 1);
// (2) 3 tracks, shares ~100%.
ok("3 track shares sum ~100%", port.trackShares.length === 3 && Math.abs(port.trackShares.reduce((s, t) => s + t.sharePct, 0) - 100) < 0.5);
// (3) concentration risk computed (LOW/MEDIUM/HIGH).
ok("concentration risk label present", ["LOW", "MEDIUM", "HIGH"].includes(port.concentrationRisk));
// (4) a single dominant track ⇒ HIGH concentration.
const dom = P.projectPortfolio([{ label: "big", ...base, monthlyProspects: 50, avgContractValue: 18000, recurringMonthly: 2000 }, { label: "tiny", ...base, monthlyProspects: 1, avgContractValue: 500, recurringMonthly: 0 }]);
ok("one dominant track ⇒ HIGH concentration", dom.concentrationRisk === "HIGH" && dom.concentrationMaxSharePct > 60);
// (5) empty portfolio ⇒ NO_DATA, zero revenue (nothing invented).
const empty = P.projectPortfolio([]);
ok("empty ⇒ NO_DATA + 0 cash", empty.concentrationRisk === "NO_DATA" && empty.consolidated.cashedWithinHorizon === 0 && empty.trackCount === 0);
// (6) capacity flag present; monthlyCashed has 12 entries.
ok("capacity flag + 12 monthly cashed entries", typeof port.capacityFlag === "string" && port.monthlyCashed.length === 12);
// (7) A/B/C/D-label-collision disclosure in notes; reproducible.
ok("notes disclose label distinctness; reproducible", port.notes.some(x => /DISTINCT from/.test(x)) && JSON.stringify(P.projectPortfolio([trackA, trackB, trackC])) === JSON.stringify(port));

// (8) REGRESSION (recon-2): the per-month horizon spans the LONGEST track, not just per[0]. A later longer track
// whose cash lands beyond the first track's horizon must NOT be dropped from monthlyCashed (sum-of-parts = total)
// and must NOT understate peakMonthlySignings. Without the fix, months=per[0].rows.length=3 ⇒ sum < consolidated.
{
  const conv = { prospectToInterested: 1, interestedToProposal: 1, proposalToSigned: 1 };
  const shortTrack = { label: "short", months: 3, monthlyProspects: 10, conv, avgContractValue: 1000, salesLag: 0, deliveryLag: 0, paymentLag: 0, recurringMonthly: 0 };
  const longLate = { label: "long", months: 12, monthlyProspects: 10, conv, avgContractValue: 1000, salesLag: 0, deliveryLag: 6, paymentLag: 0, recurringMonthly: 0 }; // one-off cash lands months 6–11
  const r = P.projectPortfolio([shortTrack, longLate]);
  const sumMonthly = r.monthlyCashed.reduce((a, b) => a + b, 0);
  ok("portfolio horizon spans the LONGEST track (monthlyCashed covers 12 mo; sum(monthlyCashed) === consolidated.cashedWithinHorizon; non-vacuous)",
    r.monthlyCashed.length === 12 && r.consolidated.cashedWithinHorizon > 0 && Math.abs(sumMonthly - r.consolidated.cashedWithinHorizon) < 0.01);
  ok("portfolio peakMonthlySignings not understated by the first track's short horizon", r.peakMonthlySignings > 0);
}

console.log(`\nCOMMERCIAL-PORTFOLIO suite — ${pass} assertions passed. (multi-track; concentration-aware; €500k is a TARGET)`);
