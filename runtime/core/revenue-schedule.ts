#!/usr/bin/env node
/**
 * revenue-schedule — a MONTH-BY-MONTH 12-month projection (mandate V9 §2), not just an annual total. It models the real
 * timing that an annual aggregate hides: a prospect acquired in month m signs only after `salesLag`, is invoiced after
 * `deliveryLag`, and is cashed after `paymentLag`; recurring starts after `rampLag` and decays with monthly `churn`;
 * revenue that lands AFTER month 11 is OUTSIDE the 12-month horizon and is NOT counted as cashed-within-horizon. This
 * makes the honest gap explicit: cashed-within-12-months ≪ signed-bookings. Pure, deterministic, no clock. Supports
 * stress testing (delayed signings, slower delivery, higher churn, a lost renewal). €500k stays a TARGET; prices HYP.
 */
"use strict";

function n(v: number, d = 0): number { return typeof v === "number" && isFinite(v) && v >= 0 ? v : d; }
function pct(v: number): number { return typeof v === "number" && v >= 0 && v <= 1 ? v : 0; }
function r2(x: number): number { return Math.round(x * 100) / 100; }

/**
 * projectMonthly(a): a = {
 *   months=12, monthlyProspects, conv:{prospectToInterested, interestedToProposal, proposalToSigned},
 *   avgContractValue, recurringMonthly, costRatio, salesLag=1, deliveryLag=1, paymentLag=1, rampLag=2, churn=0 }.
 * Returns per-month rows + totals; cashedWithinHorizon is the honest within-12-month cash.
 */
function projectMonthly(a: any): any {
  const months = n(a && a.months, 12) || 12;
  const prospectsPerMonth = n(a && a.monthlyProspects);
  const conv = (a && a.conv) || {};
  const funnel = pct(conv.prospectToInterested) * pct(conv.interestedToProposal) * pct(conv.proposalToSigned);
  const acv = n(a && a.avgContractValue);
  const rec = n(a && a.recurringMonthly);
  const costRatio = pct(a && a.costRatio);
  const salesLag = Math.max(0, Math.floor(n(a && a.salesLag, 1)));
  const deliveryLag = Math.max(0, Math.floor(n(a && a.deliveryLag, 1)));
  const paymentLag = Math.max(0, Math.floor(n(a && a.paymentLag, 1)));
  const rampLag = Math.max(0, Math.floor(n(a && a.rampLag, 2)));
  const churn = pct(a && a.churn);

  const rows: any[] = [];
  for (let m = 0; m < months; m++) rows.push({ month: m, prospects: 0, signings: 0, signedBooked: 0, invoiced: 0, cashed: 0, recurringRecognized: 0 });

  for (let m = 0; m < months; m++) {
    rows[m].prospects = prospectsPerMonth;
    const signMonth = m + salesLag;
    if (signMonth >= months) continue;                                   // signs outside horizon
    const signings = prospectsPerMonth * funnel;
    rows[signMonth].signings += signings;
    rows[signMonth].signedBooked += signings * acv;                      // one-off booked at signing
    // one-off invoice + cash
    const invM = signMonth + deliveryLag, cashM = invM + paymentLag;
    if (invM < months) rows[invM].invoiced += signings * acv;
    if (cashM < months) rows[cashM].cashed += signings * acv;
    // recurring: each month t from signMonth+rampLag, decayed by churn, invoiced at t, cashed at t+paymentLag
    if (rec > 0) {
      for (let t = signMonth + rampLag; t < months; t++) {
        const active = signings * Math.pow(1 - churn, t - (signMonth + rampLag));
        const amt = rec * active;
        rows[t].recurringRecognized += amt;
        if (t < months) rows[t].invoiced += amt;
        const rc = t + paymentLag; if (rc < months) rows[rc].cashed += amt;
      }
    }
  }

  let cumCashed = 0, signedTotal = 0, invoicedTotal = 0, cashedTotal = 0, recTotal = 0;
  for (const row of rows) {
    row.prospects = r2(row.prospects); row.signings = r2(row.signings); row.signedBooked = r2(row.signedBooked);
    row.invoiced = r2(row.invoiced); row.cashed = r2(row.cashed); row.recurringRecognized = r2(row.recurringRecognized);
    cumCashed = r2(cumCashed + row.cashed); row.cumulativeCashed = cumCashed;
    signedTotal += row.signedBooked; invoicedTotal += row.invoiced; cashedTotal += row.cashed; recTotal += row.recurringRecognized;
  }
  const totals = { signedBooked: r2(signedTotal), invoicedWithinHorizon: r2(invoicedTotal), cashedWithinHorizon: r2(cashedTotal), recurringWithinHorizon: r2(recTotal), grossMargin: r2(cashedTotal * (1 - costRatio)) };
  const notes = [
    "Monthly, lag-aware: cashed-within-12-months is LOWER than signed bookings (sales+delivery+payment lag). Revenue landing after month 11 is NOT counted — honest within-horizon view.",
    "Signed ≠ invoiced ≠ cashed ≠ margin. €500k is a TARGET; conversions/prices are HYPOTHESIS until validated.",
  ];
  return { params: { months, prospectsPerMonth, funnel: r2(funnel), acv, rec, costRatio, salesLag, deliveryLag, paymentLag, rampLag, churn }, rows, totals, notes };
}

/** stressTest(a, stress): stress = { salesLagAdd, deliveryLagAdd, churnAdd }. Returns {base, stressed, deltaCashed}. */
function stressTest(a: any, stress: any): any {
  const s = stress || {};
  const base = projectMonthly(a);
  const stressedParams = Object.assign({}, a, {
    salesLag: n(a && a.salesLag, 1) + n(s.salesLagAdd),
    deliveryLag: n(a && a.deliveryLag, 1) + n(s.deliveryLagAdd),
    churn: Math.min(1, pct(a && a.churn) + pct(s.churnAdd)),
  });
  const stressed = projectMonthly(stressedParams);
  return { base: base.totals, stressed: stressed.totals, deltaCashed: r2(stressed.totals.cashedWithinHorizon - base.totals.cashedWithinHorizon) };
}

export { projectMonthly, stressTest };
module.exports = { projectMonthly, stressTest };
