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

function round2(n) { return Math.round(n * 100) / 100; }

/**
 * One scenario. inputs: { tjm, billableDays, chargeRatePct, fixedCostsAnnual }.
 * Returns derived CA + charges + a net-before-income-tax figure, all ESTIMATIONS.
 */
function revenueScenario(inp) {
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
    caBilled,                 // CA facturé (= encaissé only once actually paid — NOT proven here)
    charges,                  // social charges (+ optional VL) at the supplied rate
    fixedCostsAnnual: fixed,
    netBeforeIncomeTax,       // ESTIMATION before any remaining income tax, pre-paid-invoice
    exceedsMicroCeiling: caBilled > MICRO_BNC_CEILING_EUR,
    exceedsVatFranchise: caBilled > VAT_FRANCHISE_SERVICES_EUR,
    note: "ESTIMATION only — conditional on inputs; caBilled is billed, not collected; net excludes residual income tax.",
  };
}

/**
 * Billable days required to reach a target CA at a given TJM (rounded up to whole days).
 */
function daysForTargetCa(targetCa, tjm) {
  const t = Number(targetCa), r = Number(tjm);
  if (!Number.isFinite(t) || !Number.isFinite(r) || r <= 0) return null;
  return Math.ceil(t / r);
}

/**
 * Build prudent/central/favorable scenarios toward a CA target. `variants` is an array of
 * { label, tjm, billableDays, chargeRatePct, fixedCostsAnnual }. Returns each scenario + the
 * days-to-target at its TJM, so the acquisition/utilisation burden is explicit (not hidden).
 */
function scenariosToTarget(targetCa, variants) {
  const list = Array.isArray(variants) ? variants : [];
  return list.map((v) => {
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

module.exports = { revenueScenario, daysForTargetCa, scenariosToTarget, MICRO_BNC_CEILING_EUR, VAT_FRANCHISE_SERVICES_EUR, round2 };
