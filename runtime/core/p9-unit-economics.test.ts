#!/usr/bin/env node
"use strict";
const assert = require("assert");
const P = require("./p9-unit-economics");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 13 P9 — AI UNIT ECONOMICS");

// cost per success vs per attempt: €10 / 100 attempts / 40 successes.
{
  const e = P.unitEconomics({ observedCostEur: 10, attempts: 100, successes: 40 });
  check(e.costPerAttempt === 0.1 && e.costPerSuccess === 0.25, "cost/attempt €0.10, cost/success €0.25 (success is the real unit)");
  check(e.successRate === 0.4 && e.wasteRatio === 0.6 && e.viable === true, "successRate 0.4, wasteRatio 0.6, viable");
  check(e.costBasis === "OBSERVED", "unit economics computed on OBSERVED cost only");
}

// fail-closed: zero successes ⇒ costPerSuccess null (NOT 0), not viable.
{
  const e = P.unitEconomics({ observedCostEur: 5, attempts: 20, successes: 0 });
  check(e.costPerSuccess === null && e.viable === false, "zero successes ⇒ costPerSuccess null (undefined, never 0), not viable");
  check(e.wasteRatio === 1, "all attempts failed ⇒ wasteRatio 1.0");
}

// withinUnitBudget judged on cost-per-success, fail-closed on no success.
{
  const good = P.unitEconomics({ observedCostEur: 10, attempts: 100, successes: 50 }); // €0.20/success
  check(P.withinUnitBudget(good, 0.25) === true, "€0.20/success within €0.25 budget");
  check(P.withinUnitBudget(good, 0.1) === false, "€0.20/success exceeds €0.10 budget");
  const none = P.unitEconomics({ observedCostEur: 10, attempts: 100, successes: 0 });
  check(P.withinUnitBudget(none, 999) === false, "no success ⇒ NOT within budget (fail-closed, even with a huge budget)");
}

// successes capped at attempts (no impossible >100% success).
{
  const e = P.unitEconomics({ observedCostEur: 1, attempts: 5, successes: 99 });
  check(e.successes === 5 && e.successRate === 1, "successes capped at attempts (no >100% success)");
}

check(P.P9_UNIT_ECONOMICS_CONTRACT.invariants.some((i: any) => /OBSERVED cost ONLY/.test(i)), "contract documents OBSERVED-only");

console.log(failures === 0 ? "ALL PASS — SÉRIE 13 P9 UNIT ECONOMICS" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
