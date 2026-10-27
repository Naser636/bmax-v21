#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the dashboard (V28) genuinely CONSUMES the enterprise-mission-model output:
// per-mission sizing (price/hours/capacity/margin/flags), an aggregate summary (capacity shortfalls, price-not-
// justified, flagged), the MODELED≠qualified≠signed≠collected distinction with taxes shown separately, and NO_DATA.
"use strict";
const assert = require("assert");
const D = require("./portfolio-dashboard.js");
const memStore = () => { const m = {}; return { read: (n, f) => (n in m ? m[n] : (f === undefined ? null : f)), write: (n, o) => { m[n] = o; return o; } }; };
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const fullMission = (ref, proposedPrice, soloCapacityHours) => ({
  ref, scope: "s", deliverables: ["d"], milestones: [{ hours: 100, qaHours: 10, subcontractCost: 2000 }],
  acceptanceCriteria: ["a"], exclusions: ["e"], assumptions: ["x"], paymentSchedule: [{ pct: 100 }],
  supportBoundary: "b", changeControl: "c", proposedPrice, hourlyRate: 95, soloCapacityHours,
});

// (1) valid sizing surfaced per mission.
const d = D.buildDashboard({ missions: [fullMission("E1", 15000, 2000)], reuseLedgerOpts: { store: memStore() } });
const row = d.enterprise[0];
ok("per-mission sizing surfaced (price/hours/capacity/margin/flags/stage)", row.ref === "E1" && typeof row.justifiedPrice === "number" && typeof row.totalHours === "number" && typeof row.soloCapacityHours === "number" && typeof row.grossMargin === "number" && Array.isArray(row.flags) && row.stage === "MODELED");

// (2) aggregate summary present + MODELED distinction + taxes separate note.
ok("enterpriseSummary aggregates + stage distinction + taxes separate", d.enterpriseSummary.count === 1 && d.enterpriseSummary.modeled === 1 && typeof d.enterpriseSummary.totalJustifiedPrice === "number" && /MODELED/.test(d.enterpriseSummary.stageDistinction) && /Taxes\/social/i.test(d.enterpriseSummary.stageDistinction));

// (3) capacity shortfall surfaced.
const tight = D.buildDashboard({ missions: [fullMission("E2", 15000, 50)], reuseLedgerOpts: { store: memStore() } });
ok("capacity shortfall flagged in rows + summary", tight.enterprise[0].capacityExceeded === true && tight.enterpriseSummary.capacityShortfalls.includes("E2"));

// (4) price exceeding modeled scope flagged + listed as not justified.
const over = D.buildDashboard({ missions: [fullMission("E3", 100000, 5000)], reuseLedgerOpts: { store: memStore() } });
ok("price-exceeds-scope flagged + priceNotJustified lists it", over.enterprise[0].flags.includes("PRICE_EXCEEDS_SCOPE") && over.enterpriseSummary.priceNotJustified.includes("E3") && over.enterpriseSummary.flagged.some(f => f.ref === "E3"));

// (5) invalid mission element ⇒ error row, not a crash; an incomplete-SOW mission ⇒ ok row flagged (not justified).
const bad = D.buildDashboard({ missions: [null], reuseLedgerOpts: { store: memStore() } });
ok("invalid mission element ⇒ error row (no crash)", bad.enterprise[0].error === "INVALID_INPUT" && bad.ok === true);
const incomplete = D.buildDashboard({ missions: [{ ref: "INC", dependencies: [], milestones: [{ hours: 10 }], proposedPrice: 5000, soloCapacityHours: 2000 }], reuseLedgerOpts: { store: memStore() } });
ok("incomplete-SOW mission ⇒ ok row, SOW_INCOMPLETE flag, not justified", incomplete.enterprise[0].flags.includes("SOW_INCOMPLETE") && incomplete.enterprise[0].priceJustified === false);

// (6) NO_DATA when no missions supplied.
const none = D.buildDashboard({ reuseLedgerOpts: { store: memStore() } });
ok("no missions ⇒ enterprise + enterpriseSummary NO_DATA", none.enterprise.status === "NO_DATA" && none.enterpriseSummary.status === "NO_DATA");

// (7) a modeled mission is NOT counted as cash — gap still full target.
ok("modeled missions never count as collected cash", d.cashVsForecast.actualNetCollected === 0 && d.cashVsForecast.gapToTarget === 500000);

// (8) deterministic.
ok("reproducible", JSON.stringify(D.buildDashboard({ missions: [fullMission("E1", 15000, 2000)], reuseLedgerOpts: { store: memStore() } }).enterpriseSummary) === JSON.stringify(d.enterpriseSummary));

console.log(`\nPORTFOLIO-DASHBOARD-ENTERPRISE suite — ${pass} assertions passed. (dashboard consumes enterprise-mission sizing+capacity; MODELED≠cash; taxes separate; NO_DATA)`);
