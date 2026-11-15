#!/usr/bin/env node
"use strict";
/*
 * V204 §8 — JETSPEED MARKETING: funnel + unit-economics simulator. MODEL-ONLY, PURE, deterministic. NOT a new
 * commercial engine / CRM / second economic model: it COMPOSES odg-business-model-families (arpu/grossMargin/churn
 * baselines) and mirrors commercial-pipeline's funnel staging, computing the §8C acquisition metrics (CTR, stage
 * conversion, CAC, LTV, LTV:CAC, payback, ROMI, contribution) over a SYNTHETIC funnel dataset, with §8E fail-closed
 * adversarial guards and §8D low/central/high scenarios.
 *
 * STRICT honesty: EUR-only (no implicit FX, per economic-unit's rule); the dataset is SYNTHETIC — no send, no spend, no
 * contact, no real campaign; a projection is NEVER a realized profit; CAC is DERIVED from the funnel (spend/won), not an
 * assumed input. Missing cost components are FLAGGED, never silently zeroed. Dual export.
 */

const BMF = require("./odg-business-model-families.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function num(v: any, d = NaN): number { return typeof v === "number" && isFinite(v) ? v : d; }
function round(n: number): number { return Number.isFinite(n) ? Number(n.toFixed(4)) : null as any; }
function rate(a: number, b: number): number { return b > 0 ? round(a / b) : 0; }

function baselineOf(input: any): any {
  if (isObj(input.baseline)) return input.baseline; // explicit override (e.g. adversarial tests)
  const fam = (BMF.FAMILIES || []).find((f: any) => f.id === input.familyId);
  return fam ? { arpu: fam.arpu, grossMargin: fam.grossMargin, churn: fam.churn, familyId: fam.id, provenance: fam.provenance } : null;
}

const LTV_CAC_HEALTHY = 3;       // declared healthy threshold (LTV:CAC ≥ 3 is the common SaaS rule of thumb)
const REQUIRED_COST_KEYS = Object.freeze(["delivery", "support", "tax"]);

/* funnelMetrics(input) -> rates + economics + fail-closed verdict. input = {
 *   familyId | baseline:{arpu,grossMargin,churn}, synthetic:{impressions,clicks,leads,qualified,won}, spend (EUR),
 *   costComponents?:{delivery,support,tax}, conversionFloor? }. */
function funnelMetrics(input: any): any {
  const i = isObj(input) ? input : {};
  const s = isObj(i.synthetic) ? i.synthetic : {};
  const base = baselineOf(i);
  const flags: string[] = [];
  if (!base) return Object.freeze({ ok: false, verdict: "INVALID", flags: Object.freeze(["UNKNOWN_FAMILY — pass a known familyId or an explicit baseline"]), modelOnly: true });

  const impressions = num(s.impressions, 0), clicks = num(s.clicks, 0), leads = num(s.leads, 0), qualified = num(s.qualified, 0), won = num(s.won, 0);
  const chain = [impressions, clicks, leads, qualified, won];
  if (chain.some((n) => n < 0 || !Number.isFinite(n))) return Object.freeze({ ok: false, verdict: "INVALID", flags: Object.freeze(["NEGATIVE_OR_NONFINITE_COUNT"]), modelOnly: true });
  for (let k = 1; k < chain.length; k++) if (chain[k] > chain[k - 1]) return Object.freeze({ ok: false, verdict: "INVALID", flags: Object.freeze(["NON_MONOTONIC_FUNNEL — a later stage exceeds an earlier one"]), modelOnly: true });

  const spend = num(i.spend, 0);
  const arpu = num(base.arpu, 0), gm = num(base.grossMargin, 0), churn = num(base.churn, 0);
  const grossProfitPerCustomer = round(arpu * gm);
  const ltv = churn > 0 ? round(arpu * gm / churn) : round(arpu * gm);   // recurring ⇒ 1/churn lifetime; else single purchase
  const cac = won > 0 ? round(spend / won) : Infinity;                   // DERIVED from the funnel, not assumed
  const ltvCac = (cac > 0 && isFinite(cac)) ? round(ltv / cac) : 0;
  const paybackMonths = (isFinite(cac) && grossProfitPerCustomer > 0) ? round(cac / (grossProfitPerCustomer / 12)) : Infinity;
  const romi = spend > 0 ? round((won * grossProfitPerCustomer - spend) / spend) : 0;
  const contribution = round(won * grossProfitPerCustomer - spend);
  const overallConversion = rate(won, impressions);
  const conversionFloor = num(i.conversionFloor, 0.0002);

  // §8E fail-closed adversarial guards
  if (gm <= 0) flags.push("NEGATIVE_MARGIN");
  if (won <= 0) flags.push("NO_CONVERSIONS");
  if (isFinite(cac) && cac >= ltv) flags.push("CAC_EXCEEDS_LTV");
  if (isFinite(cac) && ltvCac < LTV_CAC_HEALTHY && ltvCac > 0) flags.push("LTV_CAC_BELOW_THRESHOLD");
  if (impressions > 0 && overallConversion < conversionFloor) flags.push("LOW_CONVERSION");
  const costKeys = isObj(i.costComponents) ? Object.keys(i.costComponents) : [];
  const missingCosts = REQUIRED_COST_KEYS.filter((k) => !costKeys.includes(k));
  if (missingCosts.length) flags.push("FORGOTTEN_COSTS — acquisition economics only; full NET not computed (" + missingCosts.join("/") + " undeclared)");

  const hard = flags.some((f) => /NEGATIVE_MARGIN|NO_CONVERSIONS|CAC_EXCEEDS_LTV/.test(f));
  const verdict = hard ? "NOT_VIABLE" : (flags.length ? "NEEDS_REVIEW" : "HEALTHY");

  return Object.freeze({
    ok: true, verdict, modelOnly: true, currency: "EUR",
    baseline: Object.freeze({ arpu, grossMargin: gm, churn, familyId: base.familyId || null, provenance: base.provenance || "OVERRIDE" }),
    rates: Object.freeze({ ctr: rate(clicks, impressions), leadRate: rate(leads, clicks), qualRate: rate(qualified, leads), winRate: rate(won, qualified), overallConversion }),
    economics: Object.freeze({ spend: round(spend), grossProfitPerCustomer, ltv, cac: isFinite(cac) ? cac : null, ltvCacRatio: ltvCac, paybackMonths: isFinite(paybackMonths) ? paybackMonths : null, romi, contribution }),
    flags: Object.freeze(flags),
    honesty: "SYNTHETIC dataset — no real send/spend/contact/campaign; CAC derived from the funnel; a projection is NOT a realized profit; EUR-only (no implicit FX).",
  });
}

/* scenarios(input, mult?) -> {low, central, high}. §8D. Documented multipliers scale conversions (won) + spend. */
function scenarios(input: any, mult: any): any {
  const m = isObj(mult) ? mult : { low: { won: 0.6, spend: 1.1 }, central: { won: 1.0, spend: 1.0 }, high: { won: 1.5, spend: 0.95 } };
  const s = isObj(input) && isObj(input.synthetic) ? input.synthetic : {};
  const scale = (name: string) => funnelMetrics({ ...input, synthetic: { ...s, won: Math.min(num(s.won, 0) * m[name].won, num(s.qualified, 0)) }, spend: num(input.spend, 0) * m[name].spend });
  return Object.freeze({ low: scale("low"), central: scale("central"), high: scale("high"), assumptions: Object.freeze(m), honesty: "low/central/high are MODEL assumptions over a SYNTHETIC funnel, not forecasts." });
}

const JETSPEED_FUNNEL_CONTRACT = Object.freeze({
  id: "V204-JETSPEED-FUNNEL-ECONOMICS",
  purpose: "§8 — MODEL-ONLY funnel + unit-economics (CTR/CAC/LTV/payback/ROMI) with fail-closed adversarial guards; composes the existing commercial/economic mechanisms",
  invariants: Object.freeze([
    "MODEL-ONLY: no send/spend/contact/real campaign; synthetic datasets; projection ≠ realized profit",
    "NOT a new commercial engine/CRM/economic model — reuses odg-business-model-families baselines; EUR-only (no implicit FX)",
    "CAC is DERIVED from the funnel (spend/won), never an assumed input; missing cost components are FLAGGED not zeroed",
    "fail-closed: negative margin / CAC≥LTV / no conversions ⇒ NOT_VIABLE; below-threshold / low-conversion / forgotten-costs ⇒ NEEDS_REVIEW",
    "deterministic; low/central/high are declared assumptions, not forecasts",
  ]),
});

module.exports = { funnelMetrics, scenarios, LTV_CAC_HEALTHY, JETSPEED_FUNNEL_CONTRACT };
export {};
