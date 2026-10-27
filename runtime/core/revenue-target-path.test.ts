#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves gap-closure: a modest base mix is scaled so SIGNED ≥ €500k; the solver reports
// scale, cash<signed (lag), the subcontractor gap when delivery load exceeds the solo ceiling, and honest infeasibility
// when the target cannot be reached; zero base ⇒ not achievable; reproducible. €500k is a TARGET; conversions not tuned.
"use strict";
const assert = require("assert");
const T = require("./revenue-target-path.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const base = { months: 12, conv: { prospectToInterested: 0.12, interestedToProposal: 0.5, proposalToSigned: 0.35 }, costRatio: 0.3, salesLag: 1, deliveryLag: 1, paymentLag: 1, rampLag: 2, churn: 0.05 };
const mix = [
  { label: "A-small", ...base, monthlyProspects: 40, avgContractValue: 2500, recurringMonthly: 0 },
  { label: "B-intermediate", ...base, monthlyProspects: 14, avgContractValue: 10000, recurringMonthly: 0 },
  { label: "C-big+recurring", ...base, monthlyProspects: 7, avgContractValue: 22000, recurringMonthly: 1500 },
];

// (1) base signs < 500k ⇒ solver scales up to reach SIGNED ≥ 500k.
const r = T.closeGapSigned(mix, 500000);
ok("achievable: scaled to SIGNED ≥ 500k, scaleFactor > 1", r.achievable === true && r.scaleFactor > 1 && r.signed >= 500000);
// (2) CASH within horizon < signed (lag) — honest.
ok("cashedWithinHorizon < signed (lag)", r.cashedWithinHorizon < r.signed && r.signedMinusCashGap > 0);
// (3) delivery load exceeds solo ceiling ⇒ subcontractors needed.
ok("peak signings > solo ceiling ⇒ subcontractorsNeeded > 0", r.peakMonthlySignings > r.soloSigningCeiling ? r.subcontractorsNeeded > 0 : r.subcontractorsNeeded === 0);
ok("scaling raises monthly prospect load", r.monthlyProspectsTotal > (40 + 14 + 7));
// (4) honest notes: TARGET + cash<signed.
ok("notes: TARGET not result + cash<signed + capacity", r.notes.some(n => /TARGET, not a result/.test(n)) && r.notes.some(n => /CASH within the 12-month horizon is LOWER/.test(n)));
// (5) infeasible: tiny prices can't reach 500k even at maxScale (delivery/price too low within capacity math) — honest.
const tiny = [{ label: "x", ...base, monthlyProspects: 1, avgContractValue: 100, recurringMonthly: 0 }];
const inf = T.closeGapSigned(tiny, 500000, 5);
ok("maxScale too small ⇒ achievable false (honest)", inf.achievable === false && inf.scaleFactor === null);
// (6) zero base ⇒ not achievable.
ok("zero-price base ⇒ not achievable", T.closeGapSigned([{ label: "z", ...base, monthlyProspects: 10, avgContractValue: 0 }], 500000).achievable === false);
// (7) reproducible.
ok("reproducible", JSON.stringify(T.closeGapSigned(mix, 500000)) === JSON.stringify(r));

console.log(`\nREVENUE-TARGET-PATH suite — ${pass} assertions passed. (gap closure; signed≥target; cash<signed; subcontractor gap)`);
