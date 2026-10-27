#!/usr/bin/env node
/**
 * economic-profiles — tests STRUCTURAL levers that change the net-cash economics (mandate V18): different delivery-cost,
 * channel, and LEVY structures (micro-BNC social-on-turnover vs SASU IS-on-profit) + productization (near-zero marginal
 * delivery). For each named profile it computes the net factor (net available per €1 gross collected) and the gross cash
 * a €500k-NET target requires, then ranks profiles by net factor. This does NOT invent tax/social rates — they are
 * explicit HYPOTHESIS parameters per profile (SASU IS blended; distribution PFU optional), flagged for an expert-
 * comptable; it recalculates per structure rather than reusing the micro-solo factor blindly. Pure/deterministic.
 * €500k NET stays a TARGET; nothing achieved.
 */
"use strict";

function pct(v: any): number { return typeof v === "number" && v >= 0 && v <= 1 ? v : 0; }
function r2(x: number): number { return Math.round(x * 100) / 100; }

/**
 * Profile rates: acquisitionRate, deliveryCostRate, subcontractRate, commissionRate, badDebtRate (fractions of gross);
 * levyMode "micro" (socialRate on turnover + incomeTaxRate on net-before-tax) OR "sasu" (isRate on operating profit +
 * optional distributionTaxRate/PFU on what is distributed, distributeShare = fraction distributed).
 */
function netForProfile(gross: number, p: any): any {
  const g = typeof gross === "number" && gross >= 0 ? gross : 0;
  const r = p || {};
  const collected = g * (1 - pct(r.badDebtRate));
  const directCosts = g * (pct(r.acquisitionRate) + pct(r.deliveryCostRate) + pct(r.subcontractRate) + pct(r.commissionRate));
  const operatingNet = collected - directCosts;
  let social = 0, corporateTax = 0, incomeTax = 0, distributionTax = 0;
  if (r.levyMode === "sasu") {
    corporateTax = Math.max(0, operatingNet) * pct(r.isRate);                 // IS on profit (blended HYPOTHESIS)
    const afterIs = operatingNet - corporateTax;
    const distributed = Math.max(0, afterIs) * pct(r.distributeShare);
    distributionTax = distributed * pct(r.distributionTaxRate);               // PFU on distributed share
  } else {                                                                     // micro default
    social = g * pct(r.socialRate);                                           // social on TURNOVER
    incomeTax = Math.max(0, operatingNet - social) * pct(r.incomeTaxRate);
  }
  const netAvailable = operatingNet - social - corporateTax - incomeTax - distributionTax;
  const factor = g > 0 ? netAvailable / g : 0;
  return {
    grossCashed: r2(g), collected: r2(collected), directCosts: r2(directCosts), operatingNet: r2(operatingNet),
    levies: { social: r2(social), corporateTax: r2(corporateTax), incomeTax: r2(incomeTax), distributionTax: r2(distributionTax), mode: r.levyMode || "micro" },
    netAvailable: r2(netAvailable), netFactor: r2(factor),
  };
}

/** requiredGrossForNet(netTarget, profile): invert via an unrounded probe factor. */
function requiredGrossForNet(netTarget: number, p: any): any {
  const probe = netForProfile(1000000, p);
  const factor = probe.grossCashed > 0 ? probe.netAvailable / probe.grossCashed : 0;
  if (factor <= 0) return { achievable: false, requiredGrossCashed: null, note: "net factor ≤ 0 at these rates" };
  return { achievable: true, requiredGrossCashed: r2(netTarget / factor), netFactor: r2(factor) };
}

// Default comparison profiles (HYPOTHESIS rates — confirm with an expert-comptable; IS/PFU simplified blended).
const PROFILES: any[] = [
  { id: "A-micro-direct", label: "Direct high-margin (micro-BNC)", levyMode: "micro", acquisitionRate: 0.10, deliveryCostRate: 0.15, subcontractRate: 0, commissionRate: 0, badDebtRate: 0.05, socialRate: 0.256, incomeTaxRate: 0.15 },
  { id: "B-micro-mixed", label: "Mixed small+large (micro-BNC)", levyMode: "micro", acquisitionRate: 0.12, deliveryCostRate: 0.22, subcontractRate: 0.05, commissionRate: 0.05, badDebtRate: 0.06, socialRate: 0.256, incomeTaxRate: 0.15 },
  { id: "C-sasu-direct", label: "Direct high-margin (SASU, IS)", levyMode: "sasu", acquisitionRate: 0.10, deliveryCostRate: 0.15, subcontractRate: 0, commissionRate: 0, badDebtRate: 0.05, isRate: 0.20, distributeShare: 0.5, distributionTaxRate: 0.30 },
  { id: "D-partner", label: "Partner/distribution (revenue share)", levyMode: "sasu", acquisitionRate: 0.05, deliveryCostRate: 0.15, subcontractRate: 0, commissionRate: 0.25, badDebtRate: 0.04, isRate: 0.20, distributeShare: 0.5, distributionTaxRate: 0.30 },
  { id: "E-productized", label: "Productized/subscription (SASU, low marginal delivery)", levyMode: "sasu", acquisitionRate: 0.12, deliveryCostRate: 0.05, subcontractRate: 0, commissionRate: 0, badDebtRate: 0.03, isRate: 0.20, distributeShare: 0.4, distributionTaxRate: 0.30 },
];

/** compareProfiles(netTarget, profiles?): net factor + required gross per profile, ranked by net factor desc. */
function compareProfiles(netTarget = 500000, profiles?: any): any {
  const ps = Array.isArray(profiles) && profiles.length ? profiles : PROFILES;
  const rows = ps.map((p: any) => {
    const probe = netForProfile(1000000, p);
    const req = requiredGrossForNet(netTarget, p);
    return { id: p.id, label: p.label, levyMode: p.levyMode || "micro", netFactor: probe.netFactor, netAvailablePer1M: probe.netAvailable, requiredGrossForTarget: req.requiredGrossCashed, achievable: req.achievable };
  });
  const ranked = rows.slice().sort((a: any, b: any) => b.netFactor - a.netFactor);
  return {
    netTarget, rows, rankedByNetFactor: ranked.map((r: any) => r.id),
    best: ranked[0],
    notes: [
      "Net factor recomputed PER STRUCTURE — the micro-solo factor is NOT applied blindly. Rates are HYPOTHESIS; SASU IS (blended) + PFU are simplified — confirm with an expert-comptable.",
      "Structural levers that raise the net factor: SASU (no 25.6% social on turnover; IS on profit) + productization (near-zero marginal delivery) + avoiding stacked commission+subcontract.",
      "€500k NET remains a TARGET; even the best profile's requiredGross must still be COLLECTED in-period — compare to modeled year-1 cash (~€342-448k) before claiming reachability.",
    ],
  };
}

export { netForProfile, requiredGrossForNet, compareProfiles, PROFILES };
module.exports = { netForProfile, requiredGrossForNet, compareProfiles, PROFILES };
