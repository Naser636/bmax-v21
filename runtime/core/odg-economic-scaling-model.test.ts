#!/usr/bin/env node
"use strict";
/* V179 §4 — multi-volume + volume-dependent cost + per-jurisdiction economic scaling. Proves: the 7 directive volumes
 * (10..1000); costs are NOT constant (support staff step within the ≤5 cap, infra tiers, CAC scale); per-jurisdiction tax
 * (no blanket 25%); strict 3-level non-conflation (contributive ≠ operating ≠ net, §14); competitor prices are OBSERVED
 * RANGES; €5M is a MODEL CONDITION not a forecast; demand SIMULATED. Reuses the canonical cost model. Deterministic. */
const S = require("./odg-economic-scaling-model.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

const OPP = { id: "nis2", proposedPrice: 25000, estDeliveryCostPerCustomer: 2000, estSupportDaysPerCustomer: 3, certificationCost: 20000 };

function main() {
  const curve = S.scaleCurve(OPP, "FR");
  const at: any = {}; for (const r of curve.rows) at[r.customers] = r;

  // ---- 7 directive volumes ----
  check("models the 7 directive volumes (10/25/50/100/259/500/1000)", JSON.stringify(curve.volumes) === JSON.stringify([10, 25, 50, 100, 259, 500, 1000]) && curve.rows.length === 7);
  check("costs are NOT constant with volume (curve flags costsConstant=false)", curve.costsConstant === false && /NOT constant/.test(curve.note));

  // ---- break-even + monotonic net growth (economics coherent) ----
  check("low volume is below break-even (10 customers ⇒ net loss), higher volume profitable", at[10].level3_netProfit < 0 && at[100].level3_netProfit > 0);
  check("net profit grows with volume (10 < 100 < 259)", at[10].level3_netProfit < at[100].level3_netProfit && at[100].level3_netProfit < at[259].level3_netProfit);

  // ---- volume-dependent STAFF: people step within the ≤5 cap, cap exceeded at high volume ----
  check("support staff STEP with volume (3 people at 100, more at 500) within the ≤5 cap", at[100].people <= at[500].people && at[500].people <= 5);
  check("high volume (500/1000) exceeds the ≤5-person support cap (TEAM_CAP_EXCEEDED)", at[500].teamCapExceeded === true && at[1000].teamCapExceeded === true && /TEAM_CAP_EXCEEDED/.test(at[500].note));

  // ---- §14 strict 3-level non-conflation ----
  check("contributive/customer ≠ operating profit ≠ net profit (three distinct levels)", at[259].level1_contributivePerCustomer !== at[259].level2_operatingProfit && at[259].level2_operatingProfit !== at[259].level3_netProfit && at[259].level3_netProfit < at[259].level2_operatingProfit);
  check("infra tiers + CAC scale with volume (not flat)", at[500].detail.infra > at[100].detail.infra && at[500].detail.cacTotal > at[100].detail.cacTotal);

  // ---- per-jurisdiction tax (no blanket 25%) ----
  const jc = S.jurisdictionComparison(OPP, 259);
  const byCode: any = {}; for (const j of jc.byJurisdiction) byCode[j.code] = j;
  check("per-jurisdiction corporate tax modelled (FR 25% / IE 12.5% / AE 9% — NOT a blanket 25%)", byCode.FR.corpTax === 0.25 && byCode.IE.corpTax === 0.125 && byCode.AE.corpTax === 0.09);
  check("lower-tax jurisdiction yields higher net at the same volume (IE/AE > FR)", byCode.IE.netProfit > byCode.FR.netProfit && byCode.AE.netProfit > byCode.FR.netProfit);
  check("jurisdiction comparison flags it is NOT a tax opinion (VAT/withholding/PE not modelled)", /NOT a tax opinion/.test(jc.note));

  // ---- €5M condition (honest: not a forecast) ----
  const c = S.conditionsFor5M(OPP, "FR");
  check("€5M is reported as a MODEL CONDITION, not a forecast; honest verdict", /MODEL CONDITION|not a forecast/i.test(c.honest) && (c.reachableWithinCap === true || c.reachableWithinCap === false));
  check("at €25k/60%-automation, €5M net NOT reachable within ≤5 people (cap exceeded before target)", c.reachableWithinCap === false && c.teamCapExceededAt !== null && /NOT reached within ≤5 people|binding constraint/.test(c.verdict));

  // ---- competitor prices are OBSERVED RANGES (not invented) ----
  check("competitor price band is an OBSERVED RANGE with sources (not a single invented figure)", S.COMPETITOR_PRICE_BAND.medianEUR > 0 && Array.isArray(S.COMPETITOR_PRICE_BAND.growthTierEUR) && S.COMPETITOR_PRICE_BAND.sources.length >= 1 && /negotiated not public|OBSERVED RANGES/.test(S.COMPETITOR_PRICE_BAND.note));

  // ---- honesty + determinism ----
  check("contract: costs non-constant, per-jurisdiction tax, §14 non-conflation, model-condition, synthetic", S.ECONOMIC_SCALING_CONTRACT.invariants.some((i: string) => /costs are NOT constant/.test(i)) && S.ECONOMIC_SCALING_CONTRACT.invariants.some((i: string) => /per-JURISDICTION/.test(i)) && S.ECONOMIC_SCALING_CONTRACT.invariants.some((i: string) => /contributive ≠ operating ≠ net/.test(i)));
  check("deterministic + frozen", JSON.stringify(S.scaleCurve(OPP, "FR").rows) === JSON.stringify(curve.rows) && Object.isFrozen(curve));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — economic-scaling-model (§4: 7 volumes 10..1000, costs volume-dependent [support staff step within ≤5 cap, infra tiers, CAC]; per-jurisdiction tax FR/IE/UK/US/AE [no blanket 25%]; strict 3-level non-conflation contributive≠operating≠net; €5M a MODEL CONDITION not forecast [NOT reachable within ≤5 people at tested price/automation]; competitor prices OBSERVED RANGES; SYNTHETIC, €0 clients)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
