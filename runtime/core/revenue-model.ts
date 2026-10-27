#!/usr/bin/env node
/**
 * revenue-model — a pure, testable 12-month revenue projection for the CTO's €500k strategic TARGET. It computes, from
 * CALLER inputs (all HYPOTHESIS unless cited), the three DISTINCT figures the directive demands kept separate:
 * SIGNED, INVOICED and CASHED. It does NOT double-count recurring (recognised once per active month), it respects a
 * sales-cycle/payment lag (revenue beyond the 12-month window is NOT counted), and it NEVER claims the target is met —
 * it only states, per scenario, whether the MATHS reach it and by how much the evidence (currently zero clients) falls
 * short. No clock, no IO, deterministic, fail-closed on invalid inputs.
 */
"use strict";

function nn(v: any, d: number): number { return typeof v === "number" && isFinite(v) && v >= 0 ? v : d; }
function r0(n: number): number { return Math.round(n); }

export interface RevenueProjection {
  signed12: number; invoiced12: number; cashed12: number;
  oneOffSeries: number[]; recurringSeries: number[]; activeContractsEnd: number; notes: string[];
}

/**
 * projectRevenue(input): monthly model over 12 months.
 *   input = { newContractsByMonth:number[], avgContractValue, recurringPerContractMonthly, churnMonthly,
 *             invoiceDelayMonths, cashDelayMonths }
 * One-off is recognised at the signing month; a contract contributes recurring from the NEXT month, decayed by churn;
 * invoiced/cashed shift the signed stream by the given lags and DROP anything falling beyond month 11 (no over-count).
 */
function projectRevenue(input: any): RevenueProjection {
  const i = input || {};
  const M = 12;
  const newC: number[] = Array.isArray(i.newContractsByMonth) ? i.newContractsByMonth.map((x: any) => nn(x, 0)) : [];
  const v = nn(i.avgContractValue, 0);
  const mrr = nn(i.recurringPerContractMonthly, 0);
  const churn = Math.min(1, nn(i.churnMonthly, 0));
  const invDelay = Math.round(nn(i.invoiceDelayMonths, 0));
  const cashDelay = Math.round(nn(i.cashDelayMonths, 0));
  const notes: string[] = [];
  if (v === 0 && mrr === 0) notes.push("no contract value supplied — zero revenue (fail-closed)");

  const oneOff: number[] = new Array(M).fill(0);
  const recurring: number[] = new Array(M).fill(0);
  let active = 0;
  for (let m = 0; m < M; m++) {
    recurring[m] = active * mrr;                                        // earned from already-active contracts (once)
    oneOff[m] = (newC[m] || 0) * v;                                     // one-off recognised at signing
    active = active * (1 - churn) + (newC[m] || 0);                     // churn, then this month's new become active
  }
  const signedStream = oneOff.map((o, m) => o + recurring[m]);
  const signed12 = r0(signedStream.reduce((a, b) => a + b, 0));
  let invoiced12 = 0, cashed12 = 0;
  for (let m = 0; m < M; m++) {
    if (m + invDelay <= M - 1) invoiced12 += signedStream[m];
    if (m + cashDelay <= M - 1) cashed12 += signedStream[m];
  }
  if (cashDelay > 0) notes.push(`cashed < signed: a ${cashDelay}-month payment lag drops revenue falling beyond month 12`);
  return { signed12, invoiced12: r0(invoiced12), cashed12: r0(cashed12), oneOffSeries: oneOff.map(r0), recurringSeries: recurring.map(r0), activeContractsEnd: Math.round(active), notes };
}

/** Evaluate named scenarios against a target (default €500,000 signed). Honest gap reported (never hidden). */
function pathsToTarget(scenarios: any[], target = 500000): any[] {
  return (Array.isArray(scenarios) ? scenarios : []).map((s) => {
    const p = projectRevenue(s.input);
    return { name: s.name, signed12: p.signed12, cashed12: p.cashed12, meetsSigned: p.signed12 >= target, meetsCashed: p.cashed12 >= target, gapSigned: Math.max(0, target - p.signed12), confidence: s.confidence || "unknown (no market evidence)" };
  });
}

/** Contracts needed to reach a signed target with pure one-off value (ignores recurring). Infinity if value ≤ 0. */
function contractsForTarget(target: number, avgContractValue: number): number {
  if (!(avgContractValue > 0)) return Infinity;
  return Math.ceil(nn(target, 0) / avgContractValue);
}

export { projectRevenue, pathsToTarget, contractsForTarget };
module.exports = { projectRevenue, pathsToTarget, contractsForTarget };
