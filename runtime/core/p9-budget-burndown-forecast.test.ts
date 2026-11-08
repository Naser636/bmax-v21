#!/usr/bin/env node
"use strict";
const assert = require("assert");
const F = require("./p9-budget-burndown-forecast");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 23/W7 — P9 BUDGET BURN-DOWN FORECAST");
// run-rate projects a breach BEFORE the budget is hit.
{
  const r = F.forecastBurndown({ observedSpendToDateEur: 700, budgetEur: 1000, periodElapsedFraction: 0.5 });
  check(r.verdict === "PROJECTED_BREACH" && r.projectedEndOfPeriodSpend === 1400, `run-rate 1400 ⇒ PROJECTED_BREACH (got ${r.verdict})`);
  check(r.basis === "PROJECTED", "forecast stamped PROJECTED (never OBSERVED)");
}
// already over ⇒ BREACHED (delegated to cost-engine).
check(F.forecastBurndown({ observedSpendToDateEur: 1100, budgetEur: 1000, periodElapsedFraction: 0.9 }).verdict === "BREACHED", "already over ⇒ BREACHED");
// within variance band ⇒ AT_RISK.
{
  const r = F.forecastBurndown({ observedSpendToDateEur: 450, budgetEur: 1000, periodElapsedFraction: 0.5, maturity: "WALK" });
  check(r.verdict === "AT_RISK", `projected 900 within WALK band of 1000 ⇒ AT_RISK (got ${r.verdict})`);
}
// comfortably under ⇒ ON_TRACK.
check(F.forecastBurndown({ observedSpendToDateEur: 200, budgetEur: 1000, periodElapsedFraction: 0.5 }).verdict === "ON_TRACK", "projected 400 ⇒ ON_TRACK");
// fail-closed: elapsed 0 ⇒ UNKNOWN (never ON_TRACK on no evidence).
check(F.forecastBurndown({ observedSpendToDateEur: 100, budgetEur: 1000, periodElapsedFraction: 0 }).verdict === "UNKNOWN", "elapsed 0 ⇒ UNKNOWN");
check(F.forecastBurndown({ observedSpendToDateEur: -5, budgetEur: 1000, periodElapsedFraction: 0.5 }).verdict === "UNKNOWN", "negative spend ⇒ UNKNOWN");
check(F.P9_BUDGET_BURNDOWN_CONTRACT.invariants.some((i: any) => /never ON_TRACK on no evidence/.test(i)), "contract: never ON_TRACK on no evidence");
console.log(failures === 0 ? "ALL PASS — SÉRIE 23/W7 P9 BUDGET BURN-DOWN" : "FAILURES: " + failures);
process.exit(failures === 0 ? 0 : 1);
export {};
