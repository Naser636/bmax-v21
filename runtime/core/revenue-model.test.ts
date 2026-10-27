#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the revenue model's maths toward the €500k TARGET: signed/invoiced/cashed kept
// distinct, recurring not double-counted, payment lag reduces cashed, honest gap reported, fail-closed. All inputs are
// HYPOTHESIS (no client, no validated price); the model never claims the target is achieved.
"use strict";
const assert = require("assert");
const R = require("./revenue-model.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };
const T = 500000;

// (1) contractsForTarget maths
ok("€500k at €25k/contract ⇒ 20 contracts", R.contractsForTarget(T, 25000) === 20);
ok("€500k at €0 ⇒ Infinity (cannot reach)", R.contractsForTarget(T, 0) === Infinity);

// (2) AMBITIOUS (high-value B2B): 20 contracts @ €25k one-off spread over the year ⇒ signed ≥ €500k.
const ambNew = [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0, 0]; // 20 contracts
const amb = R.projectRevenue({ newContractsByMonth: ambNew, avgContractValue: 25000, recurringPerContractMonthly: 0, invoiceDelayMonths: 0, cashDelayMonths: 0 });
ok("ambitious 20×€25k ⇒ signed ≈ €500k (meets target)", amb.signed12 === 500000);

// (3) HIGH-VALUE + RECURRING: fewer, larger contracts + MRR ⇒ can reach €500k; recurring counted ONCE/active month.
const hv = R.projectRevenue({ newContractsByMonth: [1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0], avgContractValue: 40000, recurringPerContractMonthly: 2000, churnMonthly: 0, invoiceDelayMonths: 0, cashDelayMonths: 0 });
// 8×€40k one-off = €320k; recurring from month after each signing, counted once/month.
ok("high-value+recurring signed computed, recurring not double-counted", hv.signed12 > 320000 && hv.recurringSeries[0] === 0 && hv.recurringSeries[1] === 2000);

// (4) CASHED < SIGNED under a payment lag when signings fall late in the year (revenue beyond month 12 dropped).
const lateNew = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 10]; // 20 contracts signed in months 10–11
const lag = R.projectRevenue({ newContractsByMonth: lateNew, avgContractValue: 25000, cashDelayMonths: 2 });
ok("payment lag on late signings ⇒ cashed12 < signed12 (honest, no over-count)", lag.signed12 === 500000 && lag.cashed12 < lag.signed12 && lag.notes.some(n => /payment lag/.test(n)));

// (5) PRUDENT scenario does NOT meet €500k ⇒ honest gap reported (not hidden, not silently lowered).
const paths = R.pathsToTarget([
  { name: "prudent", confidence: "low (no evidence)", input: { newContractsByMonth: [0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0], avgContractValue: 6000 } },
  { name: "ambitious", confidence: "hypothesis (unvalidated)", input: { newContractsByMonth: ambNew, avgContractValue: 25000 } },
], T);
const prudent = paths.find(p => p.name === "prudent");
const ambitious = paths.find(p => p.name === "ambitious");
ok("prudent scenario ⇒ does NOT meet €500k, gap reported honestly", prudent.meetsSigned === false && prudent.gapSigned > 400000);
ok("ambitious scenario ⇒ meets €500k signed (maths only, confidence labelled)", ambitious.meetsSigned === true && /hypothesis/.test(ambitious.confidence));

// (6) fail-closed: no value ⇒ zero revenue, note recorded.
const zero = R.projectRevenue({ newContractsByMonth: [5, 5], avgContractValue: 0, recurringPerContractMonthly: 0 });
ok("no contract value ⇒ zero revenue (fail-closed)", zero.signed12 === 0 && zero.notes.some(n => /zero revenue/.test(n)));

console.log(`\nREVENUE-MODEL suite — ${pass} assertions passed. (maths only; HYPOTHESIS inputs; target NOT claimed achieved)`);
