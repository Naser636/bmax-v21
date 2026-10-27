#!/usr/bin/env node
// @ts-nocheck — runs under tsx. V33: proves the owner decision queue is surfaced in the dashboard — populated, empty,
// and multi-decision; correct material metadata + default-safe no-response; routine tasks NEVER routed to the owner;
// six axes + finance reconciliation + actual-vs-forecast preserved; NO_DATA when no candidates supplied.
"use strict";
const assert = require("assert");
const D = require("./portfolio-dashboard.js");
const memStore = () => { const m = {}; return { read: (n, f) => (n in m ? m[n] : (f === undefined ? null : f)), write: (n, o) => { m[n] = o; return o; } }; };
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const conv = { prospectToInterested: 0.5, interestedToProposal: 0.5, proposalToSigned: 0.4 };
const financeAxes = { A: { monthlyProspects: 20, conv, avgContractValue: 900, paymentLag: 1, months: 12 } };
const sixAxes = ["A", "B", "C", "D", "E", "F"].map(id => ({ axis: id, status: "ACTIVE", nextAction: `do ${id}`, blockers: [] }));
const material = { title: "Sign MSA with PROSPECT-001", material: true, signatureRequired: true, maxFinancialExposureEUR: 14000, recommendation: "sign — scope-justified", whyDecisionNeeded: "legal commitment", risks: ["liability"], ifRejected: "no engagement, no cost", ifNoAnswer: "no signature (safe default)" };
const routine = [{ title: "run tests", material: false }, { title: "follow up lead", material: false }, { title: "reconcile receipt", material: false }];

// (1) NO_DATA when no candidates supplied.
ok("no candidates ⇒ ownerDecisions NO_DATA", D.buildDashboard({ reuseLedgerOpts: { store: memStore() } }).ownerDecisions.status === "NO_DATA");

// (2) empty state when candidates exist but none material.
const emptyq = D.buildDashboard({ ownerDecisionCandidates: routine, reuseLedgerOpts: { store: memStore() } });
ok("only routine ⇒ 0 owner decisions + explicit empty state + routine routed away", emptyq.ownerDecisions.count === 0 && /No material owner decisions/i.test(emptyq.ownerDecisions.emptyState) && emptyq.ownerDecisions.routedAwayCount === 3);

// (3) populated: one material decision surfaced with full metadata.
const one = D.buildDashboard({ ownerDecisionCandidates: [material, ...routine], reuseLedgerOpts: { store: memStore() } });
const req = one.ownerDecisions.decisions[0];
ok("one material decision surfaced with full metadata", one.ownerDecisions.count === 1 && req.recommendation && req.whyDecisionNeeded && typeof req.maxFinancialExposureEUR === "number" && req.risks.length > 0 && req.ifRejected && req.ifNoAnswer && req.signatureRequired === true && req.options.join(",") === "APPROVE,REJECT");
ok("routine NOT surfaced to owner (regression guard)", one.ownerDecisions.routedAwayCount === 3 && one.ownerDecisions.count === 1);

// (4) multiple material decisions.
const refund = { title: "Approve €300 refund", material: true, maxFinancialExposureEUR: 300, recommendation: "refund — scope dispute", whyDecisionNeeded: "financial exposure", risks: ["goodwill"], ifRejected: "dispute", ifNoAnswer: "no refund (safe)" };
const multi = D.buildDashboard({ ownerDecisionCandidates: [material, refund, ...routine], reuseLedgerOpts: { store: memStore() } });
ok("multiple material decisions surfaced; routine still excluded", multi.ownerDecisions.count === 2 && multi.ownerDecisions.routedAwayCount === 3);

// (5) default-safe: note states no-response authorizes nothing.
ok("no-response authorizes NOTHING (default-safe note)", /No response authorizes NOTHING|default-safe/i.test(one.ownerDecisions.note));

// (6) six axes + finance reconciliation + actual-vs-forecast preserved alongside owner queue.
const fullv = D.buildDashboard({ workstreams: sixAxes, finance: { axes: financeAxes }, ownerDecisionCandidates: [material], reuseLedgerOpts: { store: memStore() } });
ok("six axes represented + finance reconciles + forecast≠actual + owner queue all coexist", fullv.axes.axisCount === 6 && fullv.finance.reconciliation.reconciles === true && fullv.finance.actualVsForecast.actualNetCollected === 0 && fullv.cashVsForecast.gapToTarget === 500000 && fullv.ownerDecisions.count === 1);

// (7) incomplete material item is NOT surfaced as a valid decision (fail-closed via owner-console).
const bad = D.buildDashboard({ ownerDecisionCandidates: [{ title: "x", material: true, maxFinancialExposureEUR: 5 }], reuseLedgerOpts: { store: memStore() } });
ok("incomplete material ⇒ not surfaced as a valid request (routed away)", bad.ownerDecisions.count === 0 && bad.ownerDecisions.routedAwayCount === 1);

// (8) deterministic + no invented decisions (count reflects only supplied candidates).
ok("no invented decisions (count = supplied material only)", D.buildDashboard({ ownerDecisionCandidates: [], reuseLedgerOpts: { store: memStore() } }).ownerDecisions.count === 0);

console.log(`\nPORTFOLIO-DASHBOARD-OWNER suite — ${pass} assertions passed. (owner queue populated/empty/multi; default-safe; routine excluded; six axes + finance preserved; NO_DATA)`);
