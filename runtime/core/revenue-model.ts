/**
 * revenue-model — PURE rentability/scenario calculator for the ODG_100K_REVENUE_ENGINE campaign (internal
 * tool, §6.C). It DERIVES figures from EXPLICIT assumptions the caller supplies — it fabricates no revenue,
 * no client, no sale. Every output is an ESTIMATION conditional on its inputs; nothing here is "encaissé".
 *
 * French solo-service context (assumptions, to be confirmed — NOT legal advice):
 *   - micro-entreprise BNC (prestations libérales) annual CA ceiling ≈ 77 700 € (2026). Above it ⇒ société
 *     (EURL/SASU) required — a human/legal decision with its own cost; flagged by `exceedsMicroCeiling`.
 *   - `chargeRatePct` = social charges (+ optional versement libératoire / IR) as a % of CA — caller supplies
 *     the rate matching the chosen status (micro ≈ 23 %; société differs). No status is assumed as truth.
 */

const MICRO_BNC_CEILING_EUR = 77700; // 2026 micro-entreprise BNC prestations de services ceiling (assumption)

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

module.exports = { revenueScenario, daysForTargetCa, scenariosToTarget, MICRO_BNC_CEILING_EUR, round2 };
export {};
