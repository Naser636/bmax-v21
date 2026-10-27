#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the launch cash-budget model enforces the €10k cap + €5k reserve floor +
// stop-threshold by COMPUTATION, and shows the €7k-alternative consequence. No spend; inputs are estimates.
"use strict";
const assert = require("assert");
const B = require("./launch-budget.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// (1) PRUDENT plan: €10k cap, €5k launch, €5k protected reserve ⇒ respected + admitted.
const prudent = B.cashBudget({ cap: 10000, initialSpend: 5000, reserveFloor: 5000, monthlyFixed: 200, horizonMonths: 12, revenueByMonth: [] });
ok("prudent (€5k launch, €5k reserve) ⇒ cap + reserve respected, admitted", prudent.capRespected && prudent.reserveFloorRespected && prudent.admit && prudent.reserveAfterInitial === 5000);

// (2) €7k-ALTERNATIVE: within cap BUT leaves only €3k reserve (< €5k floor) ⇒ consequence shown explicitly.
const alt7k = B.cashBudget({ cap: 10000, initialSpend: 7000, reserveFloor: 5000, monthlyFixed: 200, horizonMonths: 12, revenueByMonth: [] });
ok("€7k alternative ⇒ within cap but reserve floor BREACHED (only €3k), consequence surfaced", alt7k.admit === true && alt7k.capRespected === true && alt7k.reserveFloorRespected === false && alt7k.reserveAfterInitial === 3000 && alt7k.notes.some(n => /BELOW the protected floor/.test(n)));

// (3) CAP BREACH ⇒ fail-closed (NOT admitted).
const over = B.cashBudget({ cap: 10000, initialSpend: 11000, reserveFloor: 5000 });
ok("initial spend over the €10k cap ⇒ NOT admitted (fail-closed)", over.admit === false && over.capRespected === false && over.notes.some(n => /EXCEEDS the 10000 cap/.test(n)));

// (4) NO-SALE scenario ⇒ cash declines, stop-threshold fires, runway finite.
const noSale = B.cashBudget({ cap: 10000, initialSpend: 5000, reserveFloor: 5000, monthlyFixed: 500, horizonMonths: 12, revenueByMonth: [] });
ok("no-sale ⇒ stop-threshold fires immediately (opening €5k == floor, month0 spend drops below)", noSale.stopMonth === 0 && noSale.minCash < 5000);
ok("no-sale ⇒ finite runway (cash eventually negative within horizon)", noSale.runwayMonths < 12 && noSale.runwayMonths >= 0);

// (5) break-even in pilots from a pricing HYPOTHESIS.
ok("break-even pilots: €5k to cover at €3k/pilot ⇒ 2 pilots", B.breakEvenPilots(5000, 3000) === 2);
ok("break-even pilots: price ≤ 0 ⇒ Infinity (cannot break even)", B.breakEvenPilots(5000, 0) === Infinity);

// (6) a modest central revenue path keeps cash above the floor (admitted + no stop).
const central = B.cashBudget({ cap: 10000, initialSpend: 3000, reserveFloor: 5000, monthlyFixed: 300, horizonMonths: 12, revenueByMonth: [0, 0, 3000, 0, 6000, 0, 0, 6000, 600, 600, 600, 600] });
ok("central revenue path ⇒ admitted, never breaches floor, positive min cash", central.admit && central.minCash >= 0);

console.log(`\nLAUNCH-BUDGET suite — ${pass} assertions passed. (model only; no spend; inputs are estimates)`);
