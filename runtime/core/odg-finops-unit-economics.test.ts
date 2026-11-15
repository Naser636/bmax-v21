#!/usr/bin/env node
"use strict";
/* IMP-M3-FOCUS-UNIT-ECON — unit economics over COST SSOT; margins distinct; external billing OWNER_GATED. */
const U = require("./odg-finops-unit-economics.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const r = U.showback({ units: 100, revenuePerUnitEur: 500, directCostPerUnitEur: 200, allocatedFixedEur: 10000 });
  check("stands on the COST SSOT (odg-economic-model), not a 2nd cost model", /odg-economic-model\.COST \(SSOT\)/.test(r.costBasis));
  check("per-unit gross margin = revenue − direct (300, 60%)", r.perUnit.grossMargin === 300 && r.perUnit.grossMarginPct === 0.6);
  check("margins DISTINCT: contribution (300×100=30000) ≠ net (−10000 fixed = 20000)", r.aggregate.contributionTotal === 30000 && r.aggregate.netContribution === 20000 && /never conflated/i.test(r.marginLadder));
  check("external cloud-billing integration OWNER_GATED (not integrated)", r.externalBilling.status === "OWNER_GATED");
  check("FOCUS columns present (vendor-neutral schema)", r.focusColumns.includes("EffectiveCost") && r.focusColumns.includes("ChargeCategory"));

  check("fail-closed: missing units/revenue/cost ⇒ NOT_MEASURED", U.showback({}).status === "NOT_MEASURED");
  check("contract + honesty (COST SSOT reuse; margins distinct)", U.FINOPS_UNIT_ECONOMICS_CONTRACT.invariants.some((i: string) => /no 2nd cost model/.test(i)) && /never conflated/.test(r.honesty));
  check("deterministic", JSON.stringify(U.showback({ units: 100, revenuePerUnitEur: 500, directCostPerUnitEur: 200, allocatedFixedEur: 10000 }).aggregate) === JSON.stringify(r.aggregate));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — finops-unit-economics (IMP-M3: unit economics over COST SSOT; gross≠contribution≠net; external billing OWNER_GATED)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
