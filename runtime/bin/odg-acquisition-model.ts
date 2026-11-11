#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V45.3 — ACQUISITION & PROFIT MODEL (reproducible). PURE, deterministic. Computes a 12-month monthly funnel +
 * P&L for the FR SAS + Morocco team, to test the V45.3 double constraint: NET profit (after FR IS) >= €500k AND revenue
 * < €1,000,000 HT, in YEAR 1. ALL rates here are SIMULATED ASSUMPTIONS — there is NO authorized prospecting, so NO
 * conversion has been OBSERVED (observed = 0). The model separates assumptions from any observed data and reports whether
 * the constraints are simultaneously satisfiable, and under what funnel/team. No network, no mutation. Run: `odg-acquisition-model.ts`.
 */

function isTaxFR(ebt: number): number { return 0.15 * Math.min(Math.max(ebt, 0), 42500) + 0.25 * Math.max(ebt - 42500, 0); }

// one scenario = a full set of SIMULATED assumptions.
function run(s: any): any {
  const months = 12;
  // Monthly new-lead generation ramps linearly from leadsStart to leadsEnd.
  const leadsOf = (m: number) => s.leadsStart + (s.leadsEnd - s.leadsStart) * (m / (months - 1));
  let recurringClients = 0;                       // accumulates (for MRR)
  let revenue = 0, oneOffRev = 0, recurringRev = 0, newClientsTotal = 0, deliveryDaysDemand = 0;
  const monthly: any[] = [];
  for (let m = 0; m < months; m++) {
    const leads = leadsOf(m);
    const qualified = leads * s.qualifyRate;
    const booked = qualified * s.bookRate;
    const closed = booked * s.closeRate;           // new one-off clients this month
    newClientsTotal += closed;
    const oneOff = closed * s.avgOneOff;
    oneOffRev += oneOff;
    // a fraction attach to recurring from the month AFTER close.
    const newRecurring = closed * s.recurringAttach;
    const mrr = recurringClients * s.recurringMonthly;   // recurring billed this month from prior cohort
    recurringRev += mrr;
    recurringClients += newRecurring;
    deliveryDaysDemand += closed * s.deliveryDaysPerDeal;
    const rev = oneOff + mrr;
    revenue += rev;
    monthly.push({ month: m + 1, leads: Math.round(leads), qualified: +qualified.toFixed(1), closed: +closed.toFixed(2), newClients: +closed.toFixed(2), oneOff: Math.round(oneOff), mrr: Math.round(mrr), revenue: Math.round(rev) });
  }
  // COSTS (annual). Team: delivery FTEs sized to demand; FR overhead + marketing (CAC × closed) + misc.
  const deliveryCapacityDaysPerFTE = s.workDaysPerYearPerFTE;   // usable delivery days/FTE/yr
  const deliveryFTEneeded = Math.ceil(deliveryDaysDemand / deliveryCapacityDaysPerFTE);
  const teamFTE = Math.max(s.minTeamFTE, deliveryFTEneeded);
  const teamCost = teamFTE * s.loadedCostPerFTE;               // MA loaded cost/FTE/yr
  const marketing = newClientsTotal * s.cacPerDeal;           // CAC × deals
  const frOverhead = s.frOverheadPerYear;
  const opex = teamCost + marketing + frOverhead + s.miscPerYear;
  const ebt = revenue - opex;
  const is = isTaxFR(ebt);
  const net = ebt - is;
  const ownerPersonalAfterPFU = net > 0 ? net * 0.70 : net;
  return {
    assumptionsOnly: true, observedConversion: 0,
    yearRevenue: Math.round(revenue), oneOffRev: Math.round(oneOffRev), recurringRev: Math.round(recurringRev),
    newClients: Math.round(newClientsTotal), deliveryDaysDemand: Math.round(deliveryDaysDemand), deliveryFTEneeded, teamFTE,
    opex: Math.round(opex), teamCost: Math.round(teamCost), marketing: Math.round(marketing), frOverhead, ebt: Math.round(ebt), is: Math.round(is), net: Math.round(net), ownerPersonalAfterPFU: Math.round(ownerPersonalAfterPFU),
    constraint_net500k: net >= 500000, constraint_revUnder1M: revenue < 1000000, bothSatisfied: net >= 500000 && revenue < 1000000,
    deliveryFeasible: deliveryFTEneeded <= s.maxFeasibleFTE,
    monthly,
  };
}

// Common assumptions (SIMULATED; blend of P3-Pro ~€7k + P11-Pro ~€11k + entries ⇒ avg one-off ~€8k; recurring €800/mo).
const BASE = { avgOneOff: 8000, recurringAttach: 0.35, recurringMonthly: 800, deliveryDaysPerDeal: 4, workDaysPerYearPerFTE: 180, loadedCostPerFTE: 24500, minTeamFTE: 2, maxFeasibleFTE: 12, frOverheadPerYear: 73000, miscPerYear: 20000, cacPerDeal: 1200 };

// SCENARIOS differ by funnel volume + conversion rates (all SIMULATED).
const scenarios: any = {
  prudent:  { ...BASE, leadsStart: 40,  leadsEnd: 120, qualifyRate: 0.20, bookRate: 0.30, closeRate: 0.25 },
  central:  { ...BASE, leadsStart: 120, leadsEnd: 400, qualifyRate: 0.22, bookRate: 0.33, closeRate: 0.28 },
  ambitieux:{ ...BASE, leadsStart: 300, leadsEnd: 1000, qualifyRate: 0.25, bookRate: 0.35, closeRate: 0.30 },
};

const out: any = { "//": "V45.3 reproducible acquisition+profit model. ALL rates SIMULATED (no authorized prospecting ⇒ observedConversion=0). Tests: NET>=500k AND revenue<1M in year 1.", scenarios: {} };
for (const k of Object.keys(scenarios)) out.scenarios[k] = run(scenarios[k]);

// Solver: what single funnel just hits net=500k, and is revenue<1M then?
let solved: any = null;
for (let leadsEnd = 200; leadsEnd <= 3000; leadsEnd += 50) {
  const r = run({ ...BASE, leadsStart: Math.round(leadsEnd * 0.35), leadsEnd, qualifyRate: 0.22, bookRate: 0.33, closeRate: 0.28 });
  if (r.net >= 500000) { solved = { leadsEnd, ...r }; break; }
}
out.solverNet500k = solved ? { leadsEndNeeded: solved.leadsEnd, newClients: solved.newClients, yearRevenue: solved.yearRevenue, net: solved.net, revUnder1M: solved.constraint_revUnder1M, teamFTE: solved.teamFTE, deliveryFeasible: solved.deliveryFeasible } : "net>=500k not reached within the swept funnel range";

process.stdout.write(JSON.stringify(out, null, 2) + "\n");
export {};
