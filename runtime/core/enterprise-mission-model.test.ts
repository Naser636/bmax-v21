#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves axis-E economics are HONEST: SOW completeness is fail-closed, price is DERIVED
// from scope (not a target), a price set above the scope band is flagged PRICE_EXCEEDS_SCOPE, under-cost is UNDERPRICED,
// capacity beyond solo triggers subcontracting, and nothing claims the mission is sold.
"use strict";
const assert = require("assert");
const M = require("./enterprise-mission-model.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const fullSow = {
  scope: "Enterprise AI-governance + supply-chain assurance programme",
  deliverables: ["gap assessment", "control mapping", "remediation roadmap"],
  milestones: [{ name: "assess", hours: 120, qaHours: 20 }, { name: "map", hours: 100, qaHours: 16, subcontractCost: 4000 }, { name: "roadmap", hours: 80, qaHours: 12 }],
  acceptanceCriteria: ["evidence-mapped controls", "signed-off roadmap"],
  exclusions: ["external audit fees", "tool licences"],
  assumptions: ["client provides repo access", "one business unit"],
  paymentSchedule: [{ milestone: "assess", pct: 40 }, { milestone: "map", pct: 30 }, { milestone: "roadmap", pct: 30 }],
  supportBoundary: "30 days post-delivery clarifications",
  changeControl: "written change request, re-estimated",
};

// (1) SOW completeness — full ⇒ complete; drop one ⇒ incomplete + names the missing section.
ok("SOW complete when all sections present", M.sowCompleteness(fullSow).complete === true);
const { exclusions, ...noExcl } = fullSow;
ok("SOW incomplete names the missing section (fail-closed)", M.sowCompleteness(noExcl).complete === false && M.sowCompleteness(noExcl).missing.includes("exclusions"));

// (2) price DERIVED from scope: hours(300)×95 + qa(48)×95 + subcontract 4000, ×1.15 risk.
const scope = M.priceFromScope(fullSow.milestones, { hourlyRate: 95, riskMarginPct: 0.15 });
const expectedCostBase = Math.round((300 * 95 + 48 * 95 + 4000) * 100) / 100;
ok("justified price derived from work (cost base × risk margin)", scope.costBase === expectedCostBase && scope.justifiedPrice === Math.round(expectedCostBase * 1.15 * 100) / 100 && scope.hours === 300 && scope.qaHours === 48);

// (3) a proposed price WITHIN the scope band ⇒ priceJustified, no PRICE_EXCEEDS_SCOPE.
const within = M.assessMission({ ...fullSow, proposedPrice: Math.round(scope.justifiedPrice), hourlyRate: 95, riskMarginPct: 0.15, soloCapacityHours: 2000 });
ok("proposed within band ⇒ priceJustified, margin computed", within.priceJustified === true && !within.flags.includes("PRICE_EXCEEDS_SCOPE") && within.grossMargin > 0);

// (4) price set to a TARGET above the band ⇒ PRICE_EXCEEDS_SCOPE, not justified.
const over = M.assessMission({ ...fullSow, proposedPrice: scope.justifiedPrice * 2, hourlyRate: 95, soloCapacityHours: 2000 });
ok("price-to-target above band ⇒ PRICE_EXCEEDS_SCOPE", over.flags.includes("PRICE_EXCEEDS_SCOPE") && over.priceJustified === false);

// (5) below delivery cost ⇒ UNDERPRICED (loss-making).
const under = M.assessMission({ ...fullSow, proposedPrice: 1000, hourlyRate: 95, soloCapacityHours: 2000 });
ok("below cost base ⇒ UNDERPRICED", under.flags.includes("UNDERPRICED") && under.priceJustified === false);

// (6) capacity beyond solo ⇒ CAPACITY_EXCEEDED (subcontracting need surfaced).
const tight = M.assessMission({ ...fullSow, proposedPrice: Math.round(scope.justifiedPrice), hourlyRate: 95, soloCapacityHours: 100 });
ok("hours > solo capacity ⇒ CAPACITY_EXCEEDED", tight.capacityExceeded === true && tight.flags.includes("CAPACITY_EXCEEDED"));

// (7) incomplete SOW ⇒ SOW_INCOMPLETE flag and not justified even at a sane price.
const incompleteAssess = M.assessMission({ ...noExcl, proposedPrice: Math.round(scope.justifiedPrice), hourlyRate: 95, soloCapacityHours: 2000 });
ok("incomplete SOW ⇒ SOW_INCOMPLETE + not justified", incompleteAssess.flags.includes("SOW_INCOMPLETE") && incompleteAssess.priceJustified === false);

// (8) payment schedule must total 100%.
const badPay = M.assessMission({ ...fullSow, paymentSchedule: [{ pct: 50 }, { pct: 30 }], proposedPrice: Math.round(scope.justifiedPrice), soloCapacityHours: 2000 });
ok("payment schedule ≠ 100% ⇒ PAYMENT_SCHEDULE_NOT_100", badPay.flags.includes("PAYMENT_SCHEDULE_NOT_100"));

// (9) above €50k reference ceiling ⇒ flagged (allowed only if genuinely justified, never silent).
const big = M.assessMission({ ...fullSow, milestones: [{ hours: 600, qaHours: 80 }], proposedPrice: 70000, hourlyRate: 95, soloCapacityHours: 5000 });
ok("above €50k reference ceiling ⇒ ABOVE_REFERENCE_CEILING flag", big.flags.includes("ABOVE_REFERENCE_CEILING"));

// (10) honesty note: priced scope ≠ sold mission; fail-closed input; deterministic.
ok("note: sizes a scope, does NOT claim sold; gross not net", /does NOT claim the mission is sold|demand.*validated/i.test(within.note));
ok("fail-closed: non-object ⇒ INVALID_INPUT", M.assessMission(null).code === "INVALID_INPUT" && M.sowCompleteness(42).code === "INVALID_INPUT");
ok("reproducible", JSON.stringify(M.assessMission(within)) !== "" && JSON.stringify(M.assessMission({ ...fullSow, proposedPrice: 30000, soloCapacityHours: 2000 })) === JSON.stringify(M.assessMission({ ...fullSow, proposedPrice: 30000, soloCapacityHours: 2000 })));

console.log(`\nENTERPRISE-MISSION-MODEL suite — ${pass} assertions passed. (scope-justified pricing, SOW fail-closed, capacity, no price-to-target, not-sold)`);
