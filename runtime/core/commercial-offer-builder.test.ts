#!/usr/bin/env node
"use strict";
/* V143 — commercial-offer-builder battery. Proves an offer is COMMERCIALISABLE only when the capability is genuinely
 * built+validated with proof and valid pricing; otherwise NOT_YET_DELIVERABLE with the exact missing work. No client/sale/
 * revenue/margin invented (prices are HYPOTHESES). Reuses the canonical pricing-grid (rate floor + margin). */
const O = require("./commercial-offer-builder.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }
const base = (over: any = {}) => Object.assign({
  opportunity: { id: "CRA-SBOM", segment: "EU software publishers (CRA scope)", problem: "CRA SBOM + evidence obligations", demandEvidence: { source: "https://anchore.com/sbom/eu-cra/" } },
  capability: { maturity: "VALIDATED_LOCAL", missingWork: [], proof: ["p3-cra-evidence", "sbom-audit-service"], required: ["P3", "P8"] },
  pricing: { id: "cra", scope: "CRA SBOM evidence package", days: 5, priceBandEur: [5000, 8000], minMargin: 30 },
  costs: { dailyCostEur: 300 }, deliverables: ["SBOM audit", "CRA dossier"], limits: ["evidence prep, NOT legal certification"],
}, over);

function main() {
  // 1 — fully built+validated+proof+valid pricing ⇒ COMMERCIALISABLE with hypothesis day-rate + margin.
  const d = O.buildOffer(base());
  check("1 built+validated+proof+valid pricing ⇒ COMMERCIALISABLE, 0 blockers", d.status === "COMMERCIALISABLE" && d.blockers.length === 0 && d.priceScenarios.impliedDayRate.min >= 400);
  check("1 prices/margins are labelled HYPOTHESIS (no realized revenue)", /HYPOTHESIS/.test(d.priceScenarios.basis) && typeof d.priceScenarios.marginHypothesisPct === "number");

  // 2 — missing work ⇒ NOT_YET_DELIVERABLE with the exact missing work surfaced.
  const m = O.buildOffer(base({ capability: { maturity: "VALIDATED_LOCAL", missingWork: ["ISO 27001 certification (OG-05, owner-gated)"], proof: ["x"] } }));
  check("2 missing work ⇒ NOT_YET_DELIVERABLE, missing work surfaced", m.status === "NOT_YET_DELIVERABLE" && m.missingWork.length === 1 && m.blockers.some((b: any) => /missing work/.test(b)));

  // 3 — no proof ⇒ NOT_YET_DELIVERABLE (a service cannot be announced available without evidence).
  check("3 no proof ⇒ NOT_YET_DELIVERABLE (no announce-without-evidence)", O.buildOffer(base({ capability: { maturity: "VALIDATED_LOCAL", missingWork: [], proof: [] } })).status === "NOT_YET_DELIVERABLE");

  // 4 — capability NOT built/validated (bare claim / low maturity) ⇒ NOT_YET_DELIVERABLE.
  check("4 unbuilt capability (maturity R1) ⇒ NOT_YET_DELIVERABLE", O.buildOffer(base({ capability: { maturity: "R1", missingWork: [], proof: ["x"] } })).status === "NOT_YET_DELIVERABLE");

  // 5 — invalid pricing (implied day-rate below the floor) ⇒ blocked.
  const cheap = O.buildOffer(base({ pricing: { id: "c", scope: "s", days: 10, priceBandEur: [1000, 2000], minMargin: 30 } }));
  check("5 implied day-rate below floor ⇒ NOT_YET_DELIVERABLE (pricing blocked)", cheap.status === "NOT_YET_DELIVERABLE" && cheap.blockers.some((b: any) => /pricing invalid|day-rate/.test(b)));

  // 6 — fail-closed: garbage input ⇒ NOT_YET_DELIVERABLE, no throw.
  check("6 garbage input ⇒ NOT_YET_DELIVERABLE (fail-closed, no throw)", O.buildOffer(null).status === "NOT_YET_DELIVERABLE" && O.buildOffer({}).status === "NOT_YET_DELIVERABLE");

  // 7 — shortlist ranks COMMERCIALISABLE first; NOT_YET offers are kept (honest), not hidden.
  const sl = O.shortlist([m, d]);
  check("7 shortlist ranks COMMERCIALISABLE first; NOT_YET kept (honest)", sl.ranked[0].status === "COMMERCIALISABLE" && sl.commercialisable === 1 && sl.notYetDeliverable === 1);

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — commercial-offer-builder (COMMERCIALISABLE only if built+validated+proof+valid-pricing; else NOT_YET with exact gaps; no revenue invented)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
