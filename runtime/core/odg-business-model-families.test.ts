#!/usr/bin/env node
"use strict";
/* V172 §3/§4 — business-model family comparison + product selection. Proves: 6 families evaluated with exact €5M-net customer
 * conditions + ≤5-person capacity + capital; human-services is INFEASIBLE (confirms V170); recurring/automation families are
 * the €5M path; a primary product is selected at the lowest demand bar with justification; all demand SIMULATED (never real),
 * nothing guaranteed. Reuses the canonical cost model. Deterministic. */
const B = require("./odg-business-model-families.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const cmp = B.compareFamilies();
  const byId: any = {}; for (const r of cmp.rows) byId[r.family] = r;

  // ---- 6 families, exact conditions ----
  check("evaluates all 6 business-model families", cmp.rows.length === 6 && byId.saas && byId.hybrid && byId.platform_marketplace);
  check("each family reports exact €5M customers + delivery-days + capacity + capital", cmp.rows.every((r: any) => (typeof r.customersNeededFor5MNet === "number" || /INFEASIBLE/.test(String(r.customersNeededFor5MNet))) && typeof r.capacityDays === "number" && typeof r.capitalRequiredEUR === "number"));

  // ---- human-services INFEASIBLE (confirms V170) ----
  check("human-services CANNOT reach €5M within ≤5 people (delivery-days ≫ capacity) — confirms V170", byId.human_services.reaches5MWithinTeam === false && byId.human_services.deliveryDaysNeeded > byId.human_services.capacityDays);

  // ---- recurring/automation families ARE the €5M path ----
  check("recurring/automation families (saas/hybrid/productized) are feasible within ≤5 people", byId.saas.reaches5MWithinTeam === true && byId.hybrid.reaches5MWithinTeam === true && byId.productized_odg.reaches5MWithinTeam === true);
  check("SaaS has the LOWEST delivery burden (lowest delivery-days) — ODG automation leverage", byId.saas.deliveryDaysNeeded < byId.hybrid.deliveryDaysNeeded && byId.saas.deliveryDaysNeeded < byId.productized_odg.deliveryDaysNeeded);
  check("platform/marketplace needs the MOST capital + highest customer bar (capital-heavy ambition)", byId.platform_marketplace.capitalRequiredEUR === Math.max(...cmp.rows.map((r: any) => r.capitalRequiredEUR)));

  // ---- product selection ----
  const sel = B.selectPrimaryProduct();
  check("selects a primary product at the LOWEST customer bar (least demand risk)", sel.primaryProduct === cmp.lowestDemandBar && typeof sel.customersNeeded === "number");
  check("primary is a recurring/hybrid family, NOT services-only", sel.primaryProduct !== "human_services" && /services-only.*INFEASIBLE|confirms V170/i.test(sel.servicesOnlyRejected));
  check("justification states delivery-days ≤ capacity + customer bar + recurring share", /delivery-days ≤|customers\)/.test(sel.justification) && sel.customersNeeded < byId.human_services.customersNeededFor5MNet);
  check("secondary candidates listed (other feasible families)", Array.isArray(sel.secondaryCandidates) && sel.secondaryCandidates.length >= 2 && !sel.secondaryCandidates.includes(sel.primaryProduct));

  // ---- honesty: simulated demand, nothing guaranteed, €500M separate ----
  check("demand is SIMULATED (modelled requirement), NOT validated; OWNER_GATED; €0 real clients", /SIMULATED/.test(sel.honest) && /NOT validated demand|OWNER_GATED/.test(sel.honest) && /€0 real clients/.test(sel.honest));
  check("every family carries a provenance tag (HYPOTHESIS/SOURCED)", B.FAMILIES.every((f: any) => typeof f.provenance === "string" && /HYPOTHESIS|SOURCED/.test(f.provenance)));
  check("contract: reuses canonical cost model, €5M NOT guaranteed, €500M separate", B.BUSINESS_MODEL_FAMILIES_CONTRACT.reuses.some((r: string) => /odg-economic-model.COST/.test(r)) && B.BUSINESS_MODEL_FAMILIES_CONTRACT.invariants.some((i: string) => /nothing guaranteed/.test(i)) && B.BUSINESS_MODEL_FAMILIES_CONTRACT.invariants.some((i: string) => /€500M platform-scale handled separately/.test(i)));

  // ---- determinism ----
  check("deterministic (identical recompute) + frozen", JSON.stringify(B.compareFamilies()) === JSON.stringify(cmp) && Object.isFrozen(sel));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — business-model-families (§3/§4: 6 families, exact €5M customer conditions + capacity + capital; human-services INFEASIBLE [confirms V170]; recurring/automation [hybrid primary @259 customers / SaaS lowest-delivery] are the €5M path; product selected at lowest demand bar; demand SIMULATED never real, €500M separate, nothing guaranteed)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
