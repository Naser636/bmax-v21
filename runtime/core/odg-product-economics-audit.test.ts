#!/usr/bin/env node
"use strict";
/* V178 §5 — audit + correct the V177 product-design economics. Proves: the per-customer figure is CONTRIBUTIVE margin (NOT
 * net profit); the proper 3-level breakdown (contributive → operating → net) is computed; the NIS2 €26,500 is re-derived
 * formula-by-formula and its label corrected; every assumption is provenance-tagged; BUILDABLE_NOW ≠ validated demand; net
 * profit is volume-dependent (SIMULATED), not a forecast. Reuses the canonical cost model. Deterministic. */
const A = require("./odg-product-economics-audit.js");
const D = require("./odg-product-design-engine.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  // ---- V177 mislabel corrected ----
  const s = D.designProduct({ id: "x", metier: "P3", demandEvidence: "OBSERVED", buySignal: "REGULATORY_DEADLINE", regulatory: "VOLUNTARY", estBuildDays: 100, estDeliveryCostPerCustomer: 2000, estSupportDaysPerCustomer: 3, proposedPrice: 30000, candidateFeatures: [{ name: "f", value: 5, buildCost: 3, essential: true }] });
  check("V177 engine now exposes contributiveMarginPerCustomer (NOT netMarginPerCustomer) + marginKind", typeof s.economics.contributiveMarginPerCustomer === "number" && s.economics.marginKind === "CONTRIBUTIVE_NOT_NET" && s.economics.netMarginPerCustomer === undefined);

  // ---- NIS2 example verified formula-by-formula ----
  const v = A.verifyNis2Example();
  check("NIS2 €26,500 re-derived: 30000 − 2000 − (3×500) = 26500 (matches V177)", v.recomputedContributiveMargin === 26500 && v.matches === true && v.v177Figure === 26500);
  check("the figure is CONTRIBUTIVE margin, and V177's 'netMargin' label is flagged OVERSTATED + corrected", /OVERSTATED/.test(v.v177LabelWas) && v.correctedLabel === "contributiveMarginPerCustomer");
  check("formula string shows the components (price/delivery/support)", /price.*30,000.*delivery.*2,000.*support/.test(v.formula));
  check("every assumption is provenance-tagged (HYPOTHESIS/SIMULATED), no confirmed price", v.assumptions.length >= 5 && v.assumptions.every((a: string) => /HYPOTHESIS|SIMULATED|SOURCED/.test(a)));

  // ---- 3-level breakdown (contributive ≠ operating ≠ net) ----
  const d = A.auditDossier({ id: "nis2", metier: "P3", demandEvidence: "OBSERVED", buySignal: "REGULATORY_DEADLINE", regulatory: "VOLUNTARY", estBuildDays: 120, estDeliveryCostPerCustomer: 2000, estSupportDaysPerCustomer: 3, proposedPrice: 30000, candidateFeatures: [{ name: "x", value: 5, buildCost: 3, essential: true }] }, { customers: 100, cacPerCustomer: 3000, people: 3, certificationCost: 20000, infraPerYear: 60000 });
  check("three distinct levels: contributive/customer < operating profit, operating > net profit", d.level1_contributiveMarginPerCustomer === 26500 && d.level2_operatingProfit > 0 && d.level3_netProfit < d.level2_operatingProfit && d.level3_netProfit > 0);
  check("net profit = operating × (1 − tax) (tax applied once, not conflated)", Math.abs(d.level3_netProfit - (d.level2_operatingProfit - d.breakdown.tax)) <= 1 && d.breakdown.tax > 0);
  check("operating = Σ contributive − salaries − infra − cert − CAC (fixed/acquisition deducted)", d.breakdown.totalContributive === 26500 * 100 && d.breakdown.salaries > 0 && d.breakdown.cacTotal === 300000 && d.level2_operatingProfit === d.breakdown.totalContributive - d.breakdown.fixedCosts - d.breakdown.cacTotal);
  check("net profit is VOLUME-dependent (SIMULATED), far from the €26,500-per-customer figure — no conflation", d.level3_netProfit !== 26500 && /SIMULATED volume|not a forecast/.test(d.honest));

  // ---- BUILDABLE_NOW ≠ sale ----
  check("BUILDABLE_NOW verdict carried but explicitly NOT validated demand / guaranteed sale", d.verdict === "BUILDABLE_NOW" && /BUILDABLE_NOW ≠ guaranteed sale|not validated demand/i.test(d.honest));

  // ---- honesty + determinism ----
  check("contract: distinguishes contributive/operating/net, corrects V177 mislabel, synthetic, no confirmed price", A.PRODUCT_ECONOMICS_AUDIT_CONTRACT.invariants.some((i: string) => /CONTRIBUTIVE margin.*OPERATING profit.*NET profit/.test(i)) && A.PRODUCT_ECONOMICS_AUDIT_CONTRACT.invariants.some((i: string) => /netMarginPerCustomer → contributiveMarginPerCustomer/.test(i)) && A.PRODUCT_ECONOMICS_AUDIT_CONTRACT.invariants.some((i: string) => /SYNTHETIC/.test(i)));
  check("deterministic + frozen", JSON.stringify(A.verifyNis2Example()) === JSON.stringify(v) && Object.isFrozen(d));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — product-economics-audit (§5: V177 mislabel CORRECTED [netMarginPerCustomer → contributiveMarginPerCustomer]; NIS2 €26,500 re-derived = contributive margin NOT net profit; proper 3-level breakdown [contributive €26.5k/cust → operating → net], net profit volume-dependent + tax-adjusted; every assumption provenance-tagged; BUILDABLE_NOW ≠ sale; SYNTHETIC, €0 clients)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
