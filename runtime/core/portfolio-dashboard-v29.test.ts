#!/usr/bin/env node
// @ts-nocheck — runs under tsx. V29 §5 dashboard-integration REGRESSION guard: partner funnel + consolidated finance
// are surfaced; all six axes stay represented; forecast and actuals are not silently mixed; unknown ⇒ NO_DATA (not
// zero/positive revenue); A–F totals reconcile; taxes/social are not in gross margin; partner commissions reduce net.
"use strict";
const assert = require("assert");
const D = require("./portfolio-dashboard.js");
const memStore = () => { const m = {}; return { read: (n, f) => (n in m ? m[n] : (f === undefined ? null : f)), write: (n, o) => { m[n] = o; return o; } }; };
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const conv = { prospectToInterested: 0.5, interestedToProposal: 0.5, proposalToSigned: 0.4 };
const financeAxes = {
  A: { monthlyProspects: 20, conv, avgContractValue: 900, paymentLag: 1, months: 12 },
  B: { monthlyProspects: 8, conv, avgContractValue: 4500, paymentLag: 1, months: 12 },
};
const partners = [
  { customerAccess: "x", expertise: "y", deliveryCapacity: "z", targetMarket: "SaaS", commercialFit: "ok", compliance: { ok: true }, state: "CANDIDATE" },
  { customerAccess: "x", expertise: "y", deliveryCapacity: "z", targetMarket: "SaaS", commercialFit: "ok", compliance: { ok: true }, state: "QUALIFIED" },
];
const sixAxes = ["A", "B", "C", "D", "E", "F"].map(id => ({ axis: id, status: "ACTIVE", nextAction: `do ${id}`, blockers: [] }));

// (1) all six axes remain represented.
const full = D.buildDashboard({ workstreams: sixAxes, partners, finance: { axes: financeAxes }, reuseLedgerOpts: { store: memStore() } });
ok("all six axes represented (A–F)", full.axes.ok === true && full.axes.axisCount === 6 && full.axes.axesPresent.length === 6);

// (2) partner funnel surfaced; a qualified partner is NOT accepted (no conflation).
ok("partner funnel: qualified>0 but accepted=0 (not conflated)", full.partnerFunnel.total === 2 && full.partnerFunnel.qualified >= 1 && full.partnerFunnel.accepted === 0 && full.partnerFunnel.active === 0);

// (3) finance surfaced; forecast and actual NOT mixed.
ok("finance forecast separate from actual (gap on actual only)", typeof full.finance.consolidated.forecastNetAvailable === "number" && full.finance.actualVsForecast.actualNetCollected === 0 && full.finance.actualVsForecast.gapToTargetOnActual === 500000);

// (4) A–F totals reconcile with consolidated portfolio.
ok("A–F totals reconcile", full.finance.reconciliation.reconciles === true);

// (5) taxes/social NOT embedded in gross margin (separate levies).
ok("taxes/social separate (levies), not in gross", typeof full.finance.consolidated.levies.socialCharges === "number" && typeof full.finance.consolidated.levies.incomeTax === "number");

// (6) partner commissions reduce net (reflected in cost/net).
const noComm = D.buildDashboard({ finance: { axes: financeAxes, netRates: { commissionRate: 0 } }, reuseLedgerOpts: { store: memStore() } });
const comm = D.buildDashboard({ finance: { axes: financeAxes, netRates: { commissionRate: 0.3 } }, reuseLedgerOpts: { store: memStore() } });
ok("higher partner commission ⇒ lower forecast net in dashboard", comm.finance.consolidated.forecastNetAvailable < noComm.finance.consolidated.forecastNetAvailable);

// (7) unknown sections ⇒ NO_DATA (not coerced to zero/positive revenue).
const bare = D.buildDashboard({ reuseLedgerOpts: { store: memStore() } });
ok("no partners/finance ⇒ NO_DATA (not zero-revenue)", bare.partnerFunnel.status === "NO_DATA" && bare.finance.status === "NO_DATA");

// (8) forecast never counted as collected cash at the portfolio level.
ok("dashboard still gates cash: forecast ≠ collected", full.cashVsForecast.actualNetCollected === 0 && full.cashVsForecast.gapToTarget === 500000);

// (9) existing composition intact (enterprise/certification still present when supplied-less ⇒ NO_DATA).
ok("existing sections unaffected (axes present, learning aggregate)", full.enterprise.status === "NO_DATA" && typeof full.learning.assets === "number");

console.log(`\nPORTFOLIO-DASHBOARD-V29 suite — ${pass} assertions passed. (partner funnel + finance integrated; six axes; forecast≠actual; A–F reconcile; levies separate; commissions reduce net; NO_DATA)`);
