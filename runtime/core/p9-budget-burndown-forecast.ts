#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 23 / WAVE-7 (P9 FinOps — world-research gap) — BUDGET BURN-DOWN FORECAST (proactive projected overspend).
 * PURE, deterministic. World reference: FinOps Foundation Forecasting capability + State of FinOps 2026 — "cloud
 * budget burn rate … helps predict whether you'll exceed your budget BEFORE the period ends"; acceptable forecast
 * variance Crawl ≤20% / Walk ≤15% / Run ≤12%; 2026 report: 73% of AI costs exceed budget ⇒ proactive forecasting is
 * the flagged priority. ODG's P9 budget controls are all REACTIVE — cost-engine.checkBudget / finops.budgetStop /
 * p9-unit-economics.withinUnitBudget fire only once the budget is ALREADY exceeded (grep-verified: no runRate /
 * projectedSpend / periodElapsed / willExceed / projectedBreach). This takes OBSERVED spend-to-date + the fraction of
 * the period elapsed, extrapolates the run-rate, and raises PROJECTED_BREACH BEFORE the budget is hit. Composes
 * cost-engine.checkBudget (the current OBSERVED/BREACHED leg) + the OBSERVED-vs-PROJECTED kind discipline (the
 * forecast is stamped PROJECTED, never OBSERVED). It triggers no stop — enforcement stays owner/cost-engine-gated.
 * Dual export.
 */

const COST = require("./cost-engine");                 // checkBudget — current OBSERVED budget state (the BREACHED leg)

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function num(v: any): number { return typeof v === "number" && isFinite(v) ? v : NaN; }
function round(n: number): number { return Number(n.toFixed(4)); }

const VERDICT = Object.freeze(["BREACHED", "PROJECTED_BREACH", "AT_RISK", "ON_TRACK", "UNKNOWN"]);
const VARIANCE_BAND = Object.freeze({ RUN: 0.12, WALK: 0.15, CRAWL: 0.20 });

/**
 * forecastBurndown({ observedSpendToDateEur, budgetEur, periodElapsedFraction, maturity? }) ->
 *   { verdict, runRateEur, projectedEndOfPeriodSpend, projectedOverspend, projectedBreachFraction, band, basis, reasons }.
 * Fail-closed: periodElapsedFraction ∉ (0,1], or non-finite spend/budget ⇒ UNKNOWN (never ON_TRACK on no evidence).
 */
function forecastBurndown(input: any): any {
  const o = isObj(input) ? input : {};
  const spend = num(o.observedSpendToDateEur);
  const budget = num(o.budgetEur);
  const elapsed = num(o.periodElapsedFraction);
  const maturity = typeof o.maturity === "string" && (VARIANCE_BAND as any)[o.maturity.toUpperCase()] !== undefined ? o.maturity.toUpperCase() : "WALK";
  const band = (VARIANCE_BAND as any)[maturity];
  const reasons: string[] = [];

  if (!(spend >= 0) || !(budget > 0) || !(elapsed > 0) || elapsed > 1) {
    reasons.push("need observedSpendToDate ≥ 0, budget > 0, and periodElapsedFraction ∈ (0,1] (fail-closed)");
    return Object.freeze({ verdict: "UNKNOWN", runRateEur: null, projectedEndOfPeriodSpend: null, projectedOverspend: null, projectedBreachFraction: null, band, basis: "PROJECTED", reasons: Object.freeze(reasons) });
  }

  // extrapolate the observed run-rate to the end of the period (fraction 1.0).
  const runRate = round(spend / elapsed);
  const projected = runRate;   // projectedEndOfPeriodSpend
  const projectedOverspend = round(Math.max(0, projected - budget));
  const projectedBreachFraction = projected > budget ? round(elapsed * budget / spend) : null;  // when in the period the budget is hit

  // the BREACHED leg is delegated to cost-engine (current OBSERVED state).
  const current = COST.checkBudget(spend, budget);
  let verdict: string;
  if (current.withinBudget === false) { verdict = "BREACHED"; reasons.push(`already over budget by €${current.overBy} (OBSERVED)`); }
  else if (projected > budget) { verdict = "PROJECTED_BREACH"; reasons.push(`run-rate €${runRate} projects €${projectedOverspend} over budget by period end (breach at fraction ${projectedBreachFraction})`); }
  else if (projected >= budget * (1 - band)) { verdict = "AT_RISK"; reasons.push(`projected €${projected} is within the ${maturity} variance band (${band}) of the €${budget} budget`); }
  else { verdict = "ON_TRACK"; reasons.push(`projected €${projected} comfortably under the €${budget} budget`); }

  return Object.freeze({
    verdict, runRateEur: runRate, projectedEndOfPeriodSpend: projected, projectedOverspend, projectedBreachFraction,
    band, basis: "PROJECTED",   // the forecast is MODELLED, never conflated with OBSERVED spend
    reasons: Object.freeze(reasons),
  });
}

const P9_BUDGET_BURNDOWN_CONTRACT = Object.freeze({
  id: "V124-P9-BUDGET-BURNDOWN-FORECAST",
  source: "SÉRIE 23/W7 P9 — proactive budget burn-rate forecast (FinOps Foundation Forecasting; State of FinOps 2026)",
  verdicts: VERDICT, varianceBand: VARIANCE_BAND,
  reuses: Object.freeze(["cost-engine.checkBudget (OBSERVED/BREACHED leg)", "OBSERVED-vs-PROJECTED cost-kind discipline (profession-p9-finops-reference)"]),
  notAuthority: "grades supplied spend-to-date into a PROJECTED verdict; it triggers no stop — enforcement stays owner/cost-engine-gated",
  invariants: Object.freeze([
    "run-rate = observed spend / fraction elapsed; projected end-of-period spend extrapolates to fraction 1.0",
    "projected > budget ⇒ PROJECTED_BREACH raised BEFORE the budget is actually hit (proactive)",
    "the forecast is always stamped basis:PROJECTED, never conflated with OBSERVED spend",
    "fail-closed: periodElapsedFraction ∉ (0,1] or non-finite spend/budget ⇒ UNKNOWN — never ON_TRACK on no evidence",
    "pure/deterministic: no clock, no I/O, no network; the BREACHED leg is delegated to cost-engine.checkBudget",
  ]),
});

module.exports = { forecastBurndown, P9_BUDGET_BURNDOWN_CONTRACT };

if (require.main === module) {
  const demo = forecastBurndown({ observedSpendToDateEur: 700, budgetEur: 1000, periodElapsedFraction: 0.5 });
  process.stdout.write(JSON.stringify({ ...P9_BUDGET_BURNDOWN_CONTRACT, demo: { verdict: demo.verdict, projectedEndOfPeriodSpend: demo.projectedEndOfPeriodSpend } }, null, 2) + "\n");
}

export {};
