#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V46 — ORGANIZATION COMPARISON MODEL (reproducible). PURE, deterministic. Tests the 5 org scenarios (A-E)
 * against the double constraint: NET (after FR IS) >= €500k AND revenue < €1,000,000 HT in year 1, with MINIMUM personnel
 * and MAXIMUM ODG automation. The binding constraint modeled here is SALES THROUGHPUT (how many deals can actually be
 * closed per month), not delivery (ODG automates delivery ⇒ low human time/deal). ALL conversion/sales-capacity rates are
 * SIMULATED ASSUMPTIONS — observed = 0 (no authorized prospecting). No network, no mutation. Run: `odg-org-model.ts`.
 */

function isTaxFR(ebt: number): number { return 0.15 * Math.min(Math.max(ebt, 0), 42500) + 0.25 * Math.max(ebt - 42500, 0); }

const AVG_ONEOFF = 8000, RECURRING_ATTACH = 0.35, RECURRING_MO = 800;
const FR_OVERHEAD_YR = 73000, MISC_YR = 20000, CAC_PER_DEAL = 1200;
const OWNER_DELIVERY_DAYS = 0.5;   // ODG-automated: human review+client-comms per deal (vs 4 manual) — the automation dividend

// each org: monthly SALES capacity (deals closable/mo, ramped start→end) + annual fixed people cost + delivery-hands note.
const orgs: any = {
  "A owner+ODG only":            { salesStart: 2, salesEnd: 4,  peopleCostYr: 0,      note: "owner sells+delivers (ODG automates delivery); sales is the hard cap" },
  "B +part-time MA senior":      { salesStart: 3, salesEnd: 6,  peopleCostYr: 12250,  note: "senior half-time (€24.5k×0.5) frees the owner to sell more" },
  "C +commercial":               { salesStart: 5, salesEnd: 12, peopleCostYr: 12250 + 55000, note: "a dedicated commercial lifts closed-deal throughput" },
  "D +commercial +on-demand specialists": { salesStart: 6, salesEnd: 14, peopleCostYr: 12250 + 55000 + 40000, note: "specialists (subcontract) handle spikes/expertise; variable" },
  "E scale after real contracts":{ salesStart: 8, salesEnd: 20, peopleCostYr: 12250 + 55000 + 40000 + 49000, note: "only after real contracts justify it (not year-1 default)" },
};

function run(o: any): any {
  const months = 12; let revenue = 0, recurringClients = 0, newClients = 0, deliveryDays = 0;
  for (let m = 0; m < months; m++) {
    const closable = o.salesStart + (o.salesEnd - o.salesStart) * (m / (months - 1));   // sales capacity ramps
    const closed = closable;                                   // sales-capacity-bound (funnel assumed to supply it)
    newClients += closed;
    const oneOff = closed * AVG_ONEOFF;
    const mrr = recurringClients * RECURRING_MO;
    recurringClients += closed * RECURRING_ATTACH;
    deliveryDays += closed * OWNER_DELIVERY_DAYS;
    revenue += oneOff + mrr;
  }
  const marketing = newClients * CAC_PER_DEAL;
  const opex = o.peopleCostYr + marketing + FR_OVERHEAD_YR + MISC_YR;
  const ebt = revenue - opex; const is = isTaxFR(ebt); const net = ebt - is;
  // delivery feasibility: owner+ODG give ~1 person's delivery days/yr (~180); orgs with a senior add ~90 (half-time).
  const deliveryCapacity = 180 + (o.peopleCostYr >= 12250 ? 90 : 0) + (o.peopleCostYr >= 67250 ? 0 : 0);
  return {
    newClients: Math.round(newClients), revenue: Math.round(revenue), opex: Math.round(opex), marketing: Math.round(marketing),
    ebt: Math.round(ebt), is: Math.round(is), net: Math.round(net), ownerAfterPFU: Math.round((net > 0 ? net * 0.7 : net)),
    deliveryDaysNeeded: Math.round(deliveryDays), deliveryCapacity, deliveryFeasible: deliveryDays <= deliveryCapacity,
    net500k: net >= 500000, revUnder1M: revenue < 1000000, BOTH: net >= 500000 && revenue < 1000000, note: o.note,
  };
}

const out: any = { "//": "V46 org comparison. SALES-capacity-bound. ALL rates SIMULATED (observed sales = 0). Constraint: NET>=500k AND rev<1M, year 1, min personnel.", orgs: {} };
for (const k of Object.keys(orgs)) out.orgs[k] = run(orgs[k]);
process.stdout.write(JSON.stringify(out, null, 2) + "\n");
export {};
