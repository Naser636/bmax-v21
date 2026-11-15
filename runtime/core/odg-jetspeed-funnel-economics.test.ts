#!/usr/bin/env node
"use strict";
/* V204 §8 — JetSpeed funnel + unit-economics (MODEL-ONLY). Proves: §8C metrics (CTR/CAC/LTV/payback/ROMI) over a
 * synthetic funnel; §8E fail-closed adversarial guards; §8D scenarios; composes business-model-families; no real campaign. */
const J = require("./odg-jetspeed-funnel-economics.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

// healthy synthetic funnel against the real SaaS family baseline (arpu 24000, GM 0.85, churn 0.10 ⇒ LTV 204000)
const healthy = { familyId: "saas", synthetic: { impressions: 100000, clicks: 3000, leads: 600, qualified: 120, won: 20 }, spend: 100000, costComponents: { delivery: 1, support: 1, tax: 1 } };

function main() {
  const h = J.funnelMetrics(healthy);
  check("§8C metrics derived: CTR + stage rates + CAC(=spend/won) + LTV + payback + ROMI", h.ok === true && h.rates.ctr === 0.03 && h.economics.cac === 5000 && h.economics.ltv === 204000 && h.economics.ltvCacRatio === 40.8 && h.economics.paybackMonths > 0 && h.economics.romi > 0);
  check("healthy funnel (LTV:CAC ≥ 3, margin > 0, converts, costs declared) ⇒ HEALTHY", h.verdict === "HEALTHY" && h.flags.length === 0);
  check("MODEL-ONLY + EUR + projection≠realized stated", h.modelOnly === true && h.currency === "EUR" && /projection is NOT a realized profit|projection ≠ realized/i.test(h.honesty));
  check("reuses business-model-families baseline (not a new economic model)", h.baseline.familyId === "saas" && h.baseline.arpu === 24000);

  // §8E adversarial: negative margin ⇒ NOT_VIABLE
  const neg = J.funnelMetrics({ baseline: { arpu: 20000, grossMargin: -0.1, churn: 0.1 }, synthetic: { impressions: 1000, clicks: 100, leads: 50, qualified: 20, won: 5 }, spend: 1000, costComponents: { delivery: 1, support: 1, tax: 1 } });
  check("§8E negative margin ⇒ NOT_VIABLE (NEGATIVE_MARGIN)", neg.verdict === "NOT_VIABLE" && neg.flags.includes("NEGATIVE_MARGIN"));

  // §8E CAC ≥ LTV ⇒ NOT_VIABLE (huge spend, tiny won)
  const cacHigh = J.funnelMetrics({ familyId: "saas", synthetic: { impressions: 1000, clicks: 100, leads: 50, qualified: 20, won: 1 }, spend: 500000, costComponents: { delivery: 1, support: 1, tax: 1 } });
  check("§8E CAC ≥ LTV ⇒ NOT_VIABLE (CAC_EXCEEDS_LTV)", cacHigh.verdict === "NOT_VIABLE" && cacHigh.flags.includes("CAC_EXCEEDS_LTV"));

  // §8E no conversions ⇒ NOT_VIABLE, CAC undefined (null, not fabricated)
  const noConv = J.funnelMetrics({ familyId: "saas", synthetic: { impressions: 1000, clicks: 50, leads: 10, qualified: 2, won: 0 }, spend: 5000, costComponents: { delivery: 1, support: 1, tax: 1 } });
  check("§8E no conversions ⇒ NOT_VIABLE, CAC null (not fabricated)", noConv.verdict === "NOT_VIABLE" && noConv.flags.includes("NO_CONVERSIONS") && noConv.economics.cac === null);

  // §8E forgotten costs ⇒ flagged, NEEDS_REVIEW (never silently zeroed)
  const fc = J.funnelMetrics({ familyId: "saas", synthetic: healthy.synthetic, spend: 100000 });
  check("§8E forgotten costs ⇒ flagged NEEDS_REVIEW (full NET not computed, not zeroed)", fc.flags.some((f: string) => /FORGOTTEN_COSTS/.test(f)) && fc.verdict !== "HEALTHY");

  // §8E low conversion ⇒ flagged
  const low = J.funnelMetrics({ familyId: "saas", synthetic: { impressions: 1000000, clicks: 2000, leads: 200, qualified: 20, won: 1 }, spend: 2000, costComponents: { delivery: 1, support: 1, tax: 1 }, conversionFloor: 0.0002 });
  check("§8E low conversion (below floor) ⇒ flagged", low.flags.includes("LOW_CONVERSION"));

  // invalid funnel: later stage exceeds earlier ⇒ INVALID (fail-closed)
  const bad = J.funnelMetrics({ familyId: "saas", synthetic: { impressions: 100, clicks: 200, leads: 10, qualified: 5, won: 1 }, spend: 100 });
  check("invalid funnel (clicks > impressions) ⇒ INVALID (fail-closed)", bad.ok === false && bad.verdict === "INVALID");

  // §8D scenarios low/central/high
  const sc = J.scenarios(healthy);
  check("§8D low/central/high scenarios computed over the synthetic funnel (central === base won)", sc.central.economics.cac === 5000 && sc.low.economics.cac >= sc.central.economics.cac && sc.high.economics.cac <= sc.central.economics.cac && /not forecasts/i.test(sc.honesty));

  check("contract: MODEL-ONLY, not-a-new-engine, CAC-derived, fail-closed", J.JETSPEED_FUNNEL_CONTRACT.invariants.some((i: string) => /MODEL-ONLY/.test(i)) && J.JETSPEED_FUNNEL_CONTRACT.invariants.some((i: string) => /NOT a new commercial engine/.test(i)) && J.JETSPEED_FUNNEL_CONTRACT.invariants.some((i: string) => /CAC is DERIVED/.test(i)));
  check("deterministic", JSON.stringify(J.funnelMetrics(healthy).economics) === JSON.stringify(h.economics));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — jetspeed-funnel-economics (V204 §8: CTR/CAC/LTV/payback/ROMI over a SYNTHETIC funnel reusing business-model-families; §8E negative-margin/CAC≥LTV/no-conversions ⇒ NOT_VIABLE, forgotten-costs/low-conversion flagged; invalid funnel fail-closed; §8D scenarios; MODEL-ONLY, no real campaign)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
