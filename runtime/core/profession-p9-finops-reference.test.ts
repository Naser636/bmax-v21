#!/usr/bin/env node
"use strict";
const assert = require("assert");
const P9 = require("./profession-p9-finops-reference");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V12.4 §43 P9 — FINOPS REFERENCE (E2/E3)");

// kinds kept strictly separate; unknown kind ⇒ SIMULATED (never OBSERVED).
{
  const c = P9.computeCosts([
    { kind: "OBSERVED", amountEur: 2, missionId: "m1" },
    { kind: "ESTIMATED", amountEur: 5 },
    { kind: "SIMULATED", amountEur: 100 },
    { kind: "BOGUS", amountEur: 7 },
  ]);
  check(c.byKind.OBSERVED === 2 && c.byKind.ESTIMATED === 5 && c.byKind.SIMULATED === 107, "kinds separate; unknown kind folded into SIMULATED (never OBSERVED)");
  check(c.perMissionObserved.m1 === 2, "cost-per-mission comes from OBSERVED only");
  check(c.conflated === true, "an invalid kind is surfaced as conflation risk");
}

// budget-stop fail-closed on OBSERVED spend.
{
  check(P9.budgetStop(12, 10).stop === true, "OBSERVED spend over budget ⇒ stop (fail-closed)");
  check(P9.budgetStop(8, 10).stop === false, "OBSERVED spend within budget ⇒ no stop");
}

// E2 clean reference: OBSERVED within budget, separation clean.
{
  const r = P9.runReferenceProject({ lineItems: [
    { kind: "OBSERVED", amountEur: 1, missionId: "m1" }, { kind: "ESTIMATED", amountEur: 50 },
  ], budgetEur: 10 });
  check(r.synthetic === true && r.profession === "P9" && r.separationAudit.clean === true && r.budget.stop === false && r.degraded === false, "E2: OBSERVED within budget, kinds clean ⇒ not degraded");
}

// E3: OBSERVED over budget ⇒ degraded (fail-closed surfaced).
{
  const r = P9.runReferenceProject({ lineItems: [ { kind: "OBSERVED", amountEur: 999, missionId: "m1" } ], budgetEur: 10 });
  check(r.budget.stop === true && r.degraded === true, "E3: OBSERVED over budget ⇒ budget-stop + degraded");
}

check(P9.P9_FINOPS_REFERENCE_CONTRACT.invariants.some((i: any) => /E5.*owner-gated NOT_RUN/.test(i)), "honesty: SYNTHETIC only, E5 owner-gated NOT_RUN");

// V253 §3 — forward run-rate forecast (early overrun warning), ESTIMATED not OBSERVED.
{
  // FORECAST_OVERRUN: €6 spent at 50% of the period ⇒ run-rate €12 > €10 budget, warned BEFORE the reactive stop (spent<budget).
  const f = P9.forecastBudget(6, 0.5, 10);
  check(f.ok === true && f.runRate === 12 && f.willExceed === true && f.alreadyOver === false && f.severity === "FORECAST_OVERRUN" && f.overrunForecast === 2, "forecast: €6 at 50% ⇒ run-rate €12 > €10 ⇒ FORECAST_OVERRUN warned BEFORE reactive stop (spent still < budget)");
  check(f.kind === "ESTIMATED", "forecast is labelled ESTIMATED, never OBSERVED (kinds stay separate)");
  // ON_TRACK: €4 at 50% ⇒ run-rate €8 < €10.
  const ok = P9.forecastBudget(4, 0.5, 10);
  check(ok.willExceed === false && ok.severity === "ON_TRACK" && ok.overrunForecast === 0, "forecast: €4 at 50% ⇒ run-rate €8 ⇒ ON_TRACK, no overrun");
  // OVER: already exceeded ⇒ severity OVER.
  const over = P9.forecastBudget(11, 0.5, 10);
  check(over.alreadyOver === true && over.severity === "OVER", "forecast: already over budget ⇒ severity OVER");
  // projected exhaustion fraction: at run-rate €12 on €10 budget, budget is hit at 10/12 ≈ 0.8333 of the period.
  check(Math.abs(f.projectedExhaustionFraction - 0.8333) < 0.001, "forecast: projected budget-exhaustion at ~0.833 of the period");
  // BOUNDARY: elapsedFraction=1 (full period) ⇒ run-rate == spent.
  const full = P9.forecastBudget(9, 1, 10);
  check(full.runRate === 9 && full.willExceed === false, "forecast boundary: elapsed=1 ⇒ run-rate equals observed spend");
  // FAIL-CLOSED: invalid inputs (elapsed 0, elapsed>1, negative spend, zero budget) ⇒ INVALID_INPUT, no throw.
  check(P9.forecastBudget(5, 0, 10).code === "INVALID_INPUT" && P9.forecastBudget(5, 1.5, 10).code === "INVALID_INPUT" && P9.forecastBudget(-1, 0.5, 10).code === "INVALID_INPUT" && P9.forecastBudget(5, 0.5, 0).code === "INVALID_INPUT", "forecast fail-closed: invalid elapsed/spend/budget ⇒ INVALID_INPUT (no throw)");
  check(JSON.stringify(P9.forecastBudget(6, 0.5, 10)) === JSON.stringify(f) && Object.isFrozen(f), "forecast deterministic + frozen");
  // INTEGRATION: runReferenceProject degrades on a forecast overrun even when OBSERVED spend is still within budget.
  const integ = P9.runReferenceProject({ lineItems: [{ kind: "OBSERVED", amountEur: 6, missionId: "m1" }], budgetEur: 10, elapsedFraction: 0.5 });
  check(integ.forecast && integ.forecast.willExceed === true && integ.budget.stop === false && integ.degraded === true, "integration: forecast overrun ⇒ degraded even though the reactive budget-stop has NOT fired");
  const integBase = P9.runReferenceProject({ lineItems: [{ kind: "OBSERVED", amountEur: 1, missionId: "m1" }], budgetEur: 10 });
  check(integBase.forecast === null && integBase.degraded === false, "integration: default path unchanged (no forecast unless elapsedFraction supplied)");
}

console.log(failures === 0 ? "ALL PASS — V12.4 §43 P9 FINOPS REFERENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
