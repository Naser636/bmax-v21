#!/usr/bin/env node
/**
 * launch-budget — a pure, testable 12-month CASH-BUDGET model (Track A). It does NOT spend, commit, or assume any
 * revenue — it projects cash from CALLER-supplied inputs so the €10k launch cap + protected reserve + stop-thresholds
 * are enforced BY COMPUTATION, not by prose. FAIL-CLOSED: a plan whose initial spend exceeds the cap is NOT admitted.
 * No clock, no IO, deterministic. All amounts are inputs (estimates the human confirms via real quotes); nothing here
 * authorises a payment.
 */
"use strict";

function num(v: any, d: number): number { return typeof v === "number" && isFinite(v) ? v : d; }
function r2(n: number): number { return Math.round(n * 100) / 100; }

export interface CashBudget {
  cap: number; initialSpend: number; monthlyFixed: number; reserveFloor: number; horizon: number;
  openingCash: number; reserveAfterInitial: number;
  capRespected: boolean; reserveFloorRespected: boolean;
  series: number[]; minCash: number; runwayMonths: number; stopMonth: number;
  admit: boolean; notes: string[];
}

/**
 * cashBudget(input): project monthly cash over the horizon.
 *   input = { cap=10000, initialSpend, monthlyFixed, reserveFloor=5000, horizonMonths=12, revenueByMonth:number[] }
 * - capRespected: initialSpend ≤ cap. admit = capRespected (fail-closed — a cap-exceeding plan is refused).
 * - reserveFloorRespected: cash left after the initial spend ≥ the protected reserve floor (the €5k discipline).
 * - runwayMonths: first month the projected cash goes negative (else horizon).
 * - stopMonth: first month projected cash drops BELOW the reserve floor ⇒ STOP-spending signal (−1 if never).
 */
function cashBudget(input: any): CashBudget {
  const i = input || {};
  const cap = num(i.cap, 10000);
  const initialSpend = num(i.initialSpend, 0);
  const monthlyFixed = num(i.monthlyFixed, 0);
  const reserveFloor = num(i.reserveFloor, 5000);
  const horizon = Math.max(1, num(i.horizonMonths, 12));
  const rev: number[] = Array.isArray(i.revenueByMonth) ? i.revenueByMonth : [];
  const notes: string[] = [];

  const capRespected = initialSpend <= cap;
  if (!capRespected) notes.push(`initial spend ${initialSpend} EXCEEDS the ${cap} cap — plan REFUSED (fail-closed)`);
  const openingCash = cap - initialSpend;                               // cash protected inside the cap after launch
  const reserveAfterInitial = openingCash;
  const reserveFloorRespected = reserveAfterInitial >= reserveFloor;
  if (!reserveFloorRespected) notes.push(`reserve after initial spend (${r2(reserveAfterInitial)}) is BELOW the protected floor (${reserveFloor}) — consequence of a higher initial spend`);

  let cash = openingCash, minCash = openingCash, runwayMonths = horizon, stopMonth = -1;
  const series: number[] = [];
  for (let m = 0; m < horizon; m++) {
    cash += (num(rev[m], 0)) - monthlyFixed;
    series.push(r2(cash));
    if (cash < minCash) minCash = cash;
    if (runwayMonths === horizon && cash < 0) runwayMonths = m;
    if (stopMonth === -1 && cash < reserveFloor) stopMonth = m;
  }
  return { cap, initialSpend, monthlyFixed, reserveFloor, horizon, openingCash: r2(openingCash), reserveAfterInitial: r2(reserveAfterInitial), capRespected, reserveFloorRespected, series, minCash: r2(minCash), runwayMonths, stopMonth, admit: capRespected, notes };
}

/** Pilots needed to cover a cost, given a per-pilot price hypothesis. Infinity if price ≤ 0. */
function breakEvenPilots(costToCover: number, avgPilotPrice: number): number {
  if (!(avgPilotPrice > 0)) return Infinity;
  return Math.ceil(num(costToCover, 0) / avgPilotPrice);
}

export { cashBudget, breakEvenPilots };
module.exports = { cashBudget, breakEvenPilots };
