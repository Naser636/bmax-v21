#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves channel economics layered on revenue-schedule: SOLO net==gross (no channel cost);
// PARTNER commission reduces net cash; SUBCONTRACT raises throughput (gross) but its cost cuts margin; compareChannels
// ranks A/B/C/D; requiredForTargetCash back-solves prospects + flags solo-ceiling breach; nothing claims €500k achieved.
"use strict";
const assert = require("assert");
const C = require("./revenue-channels.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const base = { months: 12, monthlyProspects: 40, conv: { prospectToInterested: 0.18, interestedToProposal: 0.5, proposalToSigned: 0.4 }, avgContractValue: 18000, recurringMonthly: 2000, costRatio: 0.3, salesLag: 1, deliveryLag: 1, paymentLag: 1, rampLag: 2, churn: 0.05 };

// (1) SOLO (no channel cost) ⇒ netCashed == grossCashed, channelCost 0.
const solo = C.channelProjection({ ...base, recurringMonthly: 0 }, { type: "SOLO" });
ok("SOLO ⇒ channelCost 0, net==gross", solo.channelCost === 0 && solo.netCashed === solo.grossCashed);
// (2) PARTNER commission reduces net cash below gross; partner volume raises gross vs solo-same-prospects.
const partner = C.channelProjection(base, { type: "PARTNER", commissionRate: 0.3, prospectsMultiplier: 1.5 });
ok("PARTNER ⇒ channelCost>0, netCashed<grossCashed", partner.channelCost > 0 && partner.netCashed < partner.grossCashed);
ok("PARTNER prospectsMultiplier raises effectiveProspects", partner.effectiveProspects === 40 * 1.5);
// (3) SUBCONTRACT raises throughput (gross up) but subcontract cost cuts margin; capacity lifts ceiling.
const sub = C.channelProjection(base, { type: "SUBCONTRACT", subcontractCostRatio: 0.4, capacityMultiplier: 2 });
const soloRec = C.channelProjection(base, { type: "SOLO_RECURRING" });
ok("SUBCONTRACT capacityMultiplier ⇒ higher grossCashed than 1x", sub.grossCashed > soloRec.grossCashed);
ok("SUBCONTRACT cost ⇒ marginPctOfGross lower than SOLO_RECURRING", sub.marginPctOfGross < soloRec.marginPctOfGross && sub.feasibleWithinCapacity === true);

// (4) compareChannels ⇒ 4 results ranked by netMargin.
const cmp = C.compareChannels(base);
ok("compareChannels ⇒ 4 results + ranking + HYPOTHESIS note", cmp.results.length === 4 && cmp.rankedByNetMargin.length === 4 && cmp.notes.some(x => /HYPOTHESIS/.test(x)));

// (5) requiredForTargetCash back-solves prospects for €500k cashed + flags solo-ceiling breach.
const req = C.requiredForTargetCash(base, 500000);
ok("requiredForTargetCash ⇒ a required prospects/mo (or not achievable)", (req.achievable && req.requiredMonthlyProspects > 0) || req.achievable === false);
ok("€500k cashed needs MORE prospects than the modest base + honest capacity flag", req.achievable === true && req.requiredMonthlyProspects > base.monthlyProspects && typeof req.exceedsSoloCeiling === "boolean");
// a tiny base cannot cash €500k even at maxProspects (price too low) ⇒ achievable false.
ok("very low price ⇒ target cash not achievable (honest)", C.requiredForTargetCash({ ...base, avgContractValue: 500, recurringMonthly: 0 }, 500000, 500).achievable === false);

// (6) reproducible; capacity note present for over-ceiling solo.
ok("reproducible", JSON.stringify(C.compareChannels(base)) === JSON.stringify(cmp));

console.log(`\nREVENUE-CHANNELS suite — ${pass} assertions passed. (channel economics; conservative net; €500k is a TARGET)`);
