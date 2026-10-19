/**
 * revenue-model — PURE rentability/scenario calculator for the ODG_100K_REVENUE_ENGINE campaign (internal
 * tool, §6.C). It DERIVES figures from EXPLICIT assumptions the caller supplies — it fabricates no revenue,
 * no client, no sale. Every output is an ESTIMATION conditional on its inputs; nothing here is "encaissé".
 *
 * French solo-service context (assumptions, to be confirmed — NOT legal advice):
 *   - micro-entreprise BNC (prestations de services) annual CA ceiling = 83 600 € (2026, sourced). Above it
 *     (2 consecutive years) ⇒ société (EURL/SASU) required — a human/legal decision; flagged `exceedsMicroCeiling`.
 *   - TVA franchise threshold for services = 37 500 € (seuil majoré 41 250 €, 2026): above it TVA (20%) must be
 *     charged — neutral for B2B clients (they reclaim) but an operational obligation; flagged `exceedsVatFranchise`.
 *   - `chargeRatePct` = social charges (+ optional versement libératoire / IR) as a % of CA — caller supplies
 *     the rate matching the chosen status (micro ≈ 23 %; société differs). No status is assumed as truth.
 */

const MICRO_BNC_CEILING_EUR = 83600;   // 2026 micro-entreprise BNC prestations de services CA ceiling (sourced)
const VAT_FRANCHISE_SERVICES_EUR = 37500; // 2026 TVA franchise threshold, services (majoré 41 250 €)

function round2(n: number): number { return Math.round(n * 100) / 100; }

function revenueScenario(inp: any): any {
  const i = inp && typeof inp === "object" ? inp : {};
  const tjm = Number(i.tjm);
  const days = Number(i.billableDays);
  const chargeRatePct = Number(i.chargeRatePct);
  const fixed = Number(i.fixedCostsAnnual) || 0;
  if (![tjm, days, chargeRatePct].every((x) => Number.isFinite(x) && x >= 0)) {
    return { ok: false, reason: "tjm, billableDays, chargeRatePct must be finite non-negative numbers" };
  }
  const caBilled = round2(tjm * days);
  const charges = round2(caBilled * (chargeRatePct / 100));
  const netBeforeIncomeTax = round2(caBilled - charges - fixed);
  return {
    ok: true,
    assumptions: { tjm, billableDays: days, chargeRatePct, fixedCostsAnnual: fixed },
    caBilled,
    charges,
    fixedCostsAnnual: fixed,
    netBeforeIncomeTax,
    exceedsMicroCeiling: caBilled > MICRO_BNC_CEILING_EUR,
    exceedsVatFranchise: caBilled > VAT_FRANCHISE_SERVICES_EUR,
    note: "ESTIMATION only — conditional on inputs; caBilled is billed, not collected; net excludes residual income tax.",
  };
}

function daysForTargetCa(targetCa: any, tjm: any): number | null {
  const t = Number(targetCa), r = Number(tjm);
  if (!Number.isFinite(t) || !Number.isFinite(r) || r <= 0) return null;
  return Math.ceil(t / r);
}

function scenariosToTarget(targetCa: any, variants: any): any[] {
  const list = Array.isArray(variants) ? variants : [];
  return list.map((v: any) => {
    const s = revenueScenario(v);
    return {
      label: v && v.label,
      ...s,
      daysToTargetCa: daysForTargetCa(targetCa, v && v.tjm),
      targetCa: Number(targetCa),
      meetsTargetCa: s.ok ? s.caBilled >= Number(targetCa) : false,
    };
  });
}

/**
 * Reproducible plan for a REVENUE TARGET over a period (§5 mandatory math). Given an average contract value, a
 * HYPOTHETICAL prospect→client conversion rate (no observed data ⇒ clearly a hypothesis), the delivery days per
 * contract and the real delivery capacity (days available in the period), it derives: contracts needed, qualified
 * prospects needed, the max contracts actually DELIVERABLE, and whether the target is capacity-feasible. It never
 * claims the conversion is observed. `capacityExceeded:true` is the honest "needs more than one person" signal.
 */
function targetPlan(inp: any): any {
  const i = inp && typeof inp === "object" ? inp : {};
  const target = Number(i.targetRevenue);
  const avg = Number(i.avgContractValue);
  const conv = Number(i.conversionRate);
  const deliveryDays = Number(i.deliveryDaysPerContract);
  const capacityDays = Number(i.capacityDaysPerPeriod);
  if (![target, avg, conv, deliveryDays, capacityDays].every((x) => Number.isFinite(x) && x >= 0) || avg <= 0 || conv <= 0 || deliveryDays <= 0) {
    return { ok: false, reason: "targetRevenue, avgContractValue>0, conversionRate(0..1]>0, deliveryDaysPerContract>0, capacityDaysPerPeriod required" };
  }
  const contractsNeeded = Math.ceil(target / avg);
  const prospectsNeeded = Math.ceil(contractsNeeded / conv);
  const maxDeliverable = Math.floor(capacityDays / deliveryDays);
  const capacityExceeded = contractsNeeded > maxDeliverable;
  return {
    ok: true,
    assumptions: { targetRevenue: target, avgContractValue: avg, conversionRate: conv, deliveryDaysPerContract: deliveryDays, capacityDaysPerPeriod: capacityDays },
    contractsNeeded,
    prospectsNeeded,
    maxDeliverable,
    capacityExceeded,
    extraCapacityNeededContracts: capacityExceeded ? contractsNeeded - maxDeliverable : 0,
    note: "conversionRate is a HYPOTHESIS (no observed data). capacityExceeded=true means the target exceeds solo delivery capacity.",
  };
}

module.exports = { revenueScenario, daysForTargetCa, scenariosToTarget, targetPlan, MICRO_BNC_CEILING_EUR, VAT_FRANCHISE_SERVICES_EUR, round2 };
export {};
