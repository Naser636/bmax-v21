#!/usr/bin/env node
/**
 * net-cash-model — converts GROSS cash collected into NET CASH AVAILABLE after every cost + levy, per the CTO's V17
 * definition (€500k must be money actually received, net of acquisition / delivery / subcontract / commissions /
 * refunds-unpaid, with social charges + income tax shown SEPARATELY). It keeps every layer distinct so run-rate,
 * signed, invoiced, cashed, operating-net and net-available are never conflated, and inverts to the gross cash a NET
 * target requires. Rates are HYPOTHESIS (France micro-BNC defaults, labelled). It does NOT tune rates to hit the target
 * and never claims the target met. Pure, deterministic. Social is modelled on turnover (micro regime); income tax is a
 * separate, flagged estimate (depends on personal situation).
 */
"use strict";

function pct(v: any): number { return typeof v === "number" && v >= 0 && v <= 1 ? v : 0; }
function r2(x: number): number { return Math.round(x * 100) / 100; }

const DEFAULT_RATES = {
  acquisitionRate: 0.10,    // marketing/sales cost as % of gross
  deliveryCostRate: 0.20,   // delivery cost (incl. imputed time) as % of gross
  subcontractRate: 0.0,     // paid to subcontractors as % of gross (hybrid > 0)
  commissionRate: 0.0,      // partner commission as % of gross (channel > 0)
  badDebtRate: 0.05,        // unpaid / refunds as % of billed ⇒ reduces collected
  socialRate: 0.256,        // micro-BNC libéral social charges on TURNOVER (HYPOTHESIS; confirm URSSAF)
  incomeTaxRate: 0.15,      // SEPARATE estimate on net-before-tax (flagged; depends on personal situation)
};

/** netFromGross(grossCashed, rates?): decompose gross → collected → operating-net → net-available (levies separate). */
function netFromGross(grossCashed: number, rates?: any): any {
  const g = typeof grossCashed === "number" && grossCashed >= 0 ? grossCashed : 0;
  const r = Object.assign({}, DEFAULT_RATES, rates || {});
  const collected = r2(g * (1 - pct(r.badDebtRate)));                                   // unpaid/refunds removed
  const directCosts = r2(g * (pct(r.acquisitionRate) + pct(r.deliveryCostRate) + pct(r.subcontractRate) + pct(r.commissionRate)));
  const operatingNet = r2(collected - directCosts);
  const socialCharges = r2(g * pct(r.socialRate));                                      // micro: on turnover
  const netBeforeTax = r2(operatingNet - socialCharges);
  const incomeTax = r2(Math.max(0, netBeforeTax) * pct(r.incomeTaxRate));
  const netAvailable = r2(netBeforeTax - incomeTax);
  const netFactor = g > 0 ? r2(netAvailable / g) : 0;                                   // net-available per €1 gross
  return {
    grossCashed: r2(g), collected, directCosts, operatingNet,
    levies: { socialCharges, incomeTax, note: "social on turnover (micro-BNC HYPOTHESIS, confirm URSSAF); income tax SEPARATE estimate — depends on personal situation + structure" },
    netBeforeTax, netAvailable, netFactor,
  };
}

/** requiredGrossForNet(netTarget, rates?): invert — the GROSS cash collected needed to net `netTarget` available. */
function requiredGrossForNet(netTarget = 500000, rates?: any): any {
  const probe = 1000000;
  const sample = netFromGross(probe, rates);                                            // linear model ⇒ factor from a probe
  const factor = sample.grossCashed > 0 ? sample.netAvailable / sample.grossCashed : 0; // UNROUNDED for precise inversion
  if (factor <= 0) return { netTarget, achievable: false, note: "net factor ≤ 0 (costs+levies exceed gross) — not achievable at these rates", requiredGrossCashed: null };
  const requiredGrossCashed = r2(netTarget / factor);
  return {
    netTarget, achievable: true, netFactorPerEuroGross: r2(factor), requiredGrossCashed,
    grossToNetMultiple: r2(requiredGrossCashed / netTarget),
    note: `to NET ${netTarget} available, need ~${requiredGrossCashed} GROSS cash COLLECTED in-period (≈${r2(requiredGrossCashed / netTarget)}× the net target); signed/invoiced are higher still (lag). HYPOTHESIS rates.`,
  };
}

export { netFromGross, requiredGrossForNet, DEFAULT_RATES };
module.exports = { netFromGross, requiredGrossForNet, DEFAULT_RATES };
