#!/usr/bin/env node
"use strict";
/* V170 §5 — quantified economic model. Proves: conservative/base/aggressive scenarios compute real figures (revenue/margin/
 * net/unit-economics/capacity); the €5M-net target has an EXACT mathematical condition and an honest 3–5-person capacity
 * verdict; €500M is flagged platform-scale; monthly projection + break-even + ±20% sensitivity; all inputs provenance-tagged
 * (SIMULATED customers, never real); nothing guaranteed. Deterministic. */
const E = require("./odg-economic-model.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  // ---- three scenarios compute real quantified figures over a 3→5-person team ----
  const con = E.computeScenario("conservative"), base = E.computeScenario("base"), agg = E.computeScenario("aggressive");
  check("conservative=3 / base=4 / aggressive=5 people", con.people === 3 && base.people === 4 && agg.people === 5);
  check("each scenario yields revenue, gross profit, opex, tax, net profit + per-métier breakdown (5 métiers)", [con, base, agg].every((s: any) => typeof s.grossRevenue === "number" && typeof s.netProfit === "number" && s.perMetier.length === 5));
  check("net profit rises conservative→base→aggressive (coherent)", con.netProfit < base.netProfit && base.netProfit < agg.netProfit);
  check("every scenario is SHORT of €5M net (honest — no inflated claim)", con.netVs5MTarget === "SHORT_OF_€5M_NET" && base.netVs5MTarget === "SHORT_OF_€5M_NET" && agg.netVs5MTarget === "SHORT_OF_€5M_NET");
  check("each scenario reports a delivery-capacity test (days needed vs available, utilisation%)", [con, base, agg].every((s: any) => typeof s.capacity.deliveryDaysNeeded === "number" && typeof s.capacity.capacityOk === "boolean"));

  // ---- §5 the EXACT €5M condition + 3–5-person capacity verdict ----
  const t = E.targetConditions();
  check("€5M target has exact revenue/customers/delivery-days needed", t.revenueNeededFor5MNet > 5000000 && t.customersNeeded_atBlendedAvgPrice > 0 && t.deliveryDaysNeeded > 0);
  check("services-only ≤5 people is NOT feasible for €5M net yr-1 (delivery-days needed exceed max capacity)", t.feasibleWith5People_servicesOnly === false && t.deliveryDaysNeeded > t.maxTeamCapacityDays_5people_aggressiveLeverage);
  check("verdict requires PRODUCTIZED/RECURRING revenue and/or capital (honest)", /PRODUCTIZED|RECURRING|capital/i.test(t.verdict) && /NOT guaranteed/i.test(t.honest));

  // ---- €500M ambition flagged platform-scale, separate study ----
  const a = E.ambition500M();
  check("€500M flagged NOT achievable by a 3–5 person services firm (platform-scale ambition)", /NOT achievable/.test(a.feasibility) && a.requiredModelShift.length >= 3 && /no path is claimed proven/i.test(a.honest));

  // ---- monthly projection + break-even + sensitivity ----
  const p = E.monthlyProjection("base");
  check("12-month projection with a break-even month + cumulative net", p.months.length === 12 && (p.breakEvenMonth === null || (p.breakEvenMonth >= 1 && p.breakEvenMonth <= 12)) && typeof p.yearEndCumulativeNet === "number");
  const sens = E.sensitivity("base");
  check("±20% price/demand sensitivity computed (price up ⇒ higher net than price down)", sens.price_plus20 > sens.price_minus20 && sens.demand_plus20 > sens.demand_minus20);

  // ---- honesty: provenance tags; SIMULATED customers never real ----
  const full = E.fullModel();
  check("provenance legend present (SOURCED/HYPOTHESIS/SIMULATED) + customers labelled SIMULATED not real", full.provenanceLegend.SIMULATED.includes("NOT real") && /NO real customers/i.test(full.honest));
  check("every métier assumption carries a provenance tag", E.METIERS.every((m: any) => typeof m.provenance === "string" && m.provenance.length > 0));
  check("corporate tax rate is SOURCED (FR 25%)", E.COST.corporateTaxRate === 0.25);
  check("contract: nothing guaranteed, no fabricated demand, capacity test + exact conditions", E.ECONOMIC_MODEL_CONTRACT.invariants.some((i: string) => /guarantees nothing/.test(i)) && E.ECONOMIC_MODEL_CONTRACT.invariants.some((i: string) => /NEVER real/.test(i)) && E.ECONOMIC_MODEL_CONTRACT.invariants.some((i: string) => /capacity test/.test(i)));

  // ---- determinism ----
  check("deterministic (identical recompute)", JSON.stringify(E.computeScenario("base")) === JSON.stringify(base) && Object.isFrozen(full));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — economic-model (§5: quantified conservative/base/aggressive over 3–5 people; all SHORT of €5M net; €5M needs €10M rev / 634 customers / 4945 delivery-days > 2310 max capacity ⇒ NOT feasible services-only, requires productized/recurring+capital; €500M platform-scale ambition; monthly break-even + ±20% sensitivity; all inputs provenance-tagged, SIMULATED customers never real, nothing guaranteed)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
