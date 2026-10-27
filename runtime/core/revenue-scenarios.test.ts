#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves scenarios compute REQUIRED volume from explicit assumptions (not tuned),
// distinguish signed/cashed/margin, flag feasibility honestly vs a solo ceiling, and never claim the €500k target is
// achieved. Higher price ⇒ fewer contracts; weaker conversion ⇒ more prospects; reproducible.
"use strict";
const assert = require("assert");
const S = require("./revenue-scenarios.js");
const RM = require("./revenue-model.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const prudent = { avgContractValue: 3000, costRatio: 0.3, conv: { prospectToInterested: 0.1, interestedToProposal: 0.4, proposalToSigned: 0.3 } };
const central = { avgContractValue: 9000, recurringMonthly: 1000, costRatio: 0.3, conv: { prospectToInterested: 0.15, interestedToProposal: 0.5, proposalToSigned: 0.35 } };
const ambitious = { avgContractValue: 18000, recurringMonthly: 2000, costRatio: 0.3, conv: { prospectToInterested: 0.2, interestedToProposal: 0.5, proposalToSigned: 0.4 } };

const out = S.buildScenarios({ prudent, central, ambitious }, 500000);
const by = (n) => out.scenarios.find(s => s.name === n);

// (1) three scenarios computed; target carried; hypothesis flagged.
ok("3 scenarios + target 500000 + hypothesis", out.scenarios.length === 3 && out.target === 500000 && out.scenarios.every(s => s.hypothesis === true));
// (2) contractsNeeded matches revenue-model.contractsForTarget on valuePerContract.
ok("contractsNeeded = contractsForTarget(target, valuePerContract)", by("central").contractsNeeded === RM.contractsForTarget(500000, by("central").valuePerContract));
// (3) higher price ⇒ fewer contracts needed (prudent needs more than ambitious).
ok("prudent needs more contracts than ambitious (price effect)", by("prudent").contractsNeeded > by("ambitious").contractsNeeded);
// (4) weaker overall conversion ⇒ more prospects per contract (prudent funnel < ambitious funnel).
ok("prudent needs more prospects than ambitious (conversion + price)", by("prudent").prospectsNeeded > by("ambitious").prospectsNeeded);
// (5) feasibility labelled honestly (prudent, tiny price + weak conv, should be the hardest).
ok("prudent feasibility is INFEASIBLE_SOLO or STRETCH (not rosy)", ["INFEASIBLE_SOLO", "STRETCH"].includes(by("prudent").feasibility));
ok("every scenario has an explicit feasibility + why", out.scenarios.every(s => s.feasibility && s.why));
// (6) margin computed from costRatio; signed≠cashed kept conceptually (recurring lag-aware).
ok("gross margin from costRatio (70% at 0.3)", by("central").grossMarginPct === 70 && by("central").valuePerContract > by("central").assumptions.avgContractValue);
// (7) missing assumptions ⇒ UNDETERMINED (no fabrication).
ok("zero price/conv ⇒ UNDETERMINED", S.assessScenario({ name: "x", avgContractValue: 0, conv: {} }).feasibility === "UNDETERMINED");
// (7b) AUDIT FIX: recurring recognised CONSERVATIVELY (even acquisition), NOT best-case — so value/contract is LOWER
// and contracts needed is HIGHER than the naive best-case. No artificial favourability.
const cc = by("central");
ok("conservative recurring < best-case (even acquisition)", cc.valuePerContract < cc.valuePerContractBestCase && cc.recurringMonthsRecognized === (12 - 2) / 2);
ok("conservative value/contract = acv + recurringMonthly×((months−2)/2)", cc.valuePerContract === 9000 + 1000 * 5);
ok("conservative model needs MORE contracts than best-case would", RM.contractsForTarget(500000, cc.valuePerContract) > RM.contractsForTarget(500000, cc.valuePerContractBestCase));
// (7c) no recurring ⇒ best-case == conservative (pure one-off, no bias).
ok("no recurring ⇒ bestCase == conservative", (() => { const r = S.assessScenario({ name: "oneoff", avgContractValue: 5000, conv: { prospectToInterested: 0.2, interestedToProposal: 0.5, proposalToSigned: 0.4 } }); return r.valuePerContract === r.valuePerContractBestCase && r.valuePerContract === 5000; })());

// (8) target never asserted achieved; notes say TARGET not forecast; reproducible.
ok("notes: TARGET not forecast; reproducible", out.notes.some(n => /TARGET, not a forecast/.test(n)) && JSON.stringify(S.buildScenarios({ prudent, central, ambitious }, 500000)) === JSON.stringify(out));

console.log(`\nREVENUE-SCENARIOS suite — ${pass} assertions passed. (explicit assumptions; honest feasibility; €500k is a TARGET)`);
