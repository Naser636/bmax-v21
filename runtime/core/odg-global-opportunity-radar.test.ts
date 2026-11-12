#!/usr/bin/env node
"use strict";
/* V174 Addendum-A §6/§7/§11 — global opportunity-ranking engine. Proves: opportunities ranked by an EXPLICIT weighted grid
 * (weights exported, sum≈1); OBSERVED buy-signal opportunities (EAA/CRA, real sources) = VALIDATED_MARKET_SIGNAL; HYPOTHESIS/
 * no-buy-signal = INSUFFICIENTLY_VALIDATED (NOT inflated, lower-scored); a validated MARKET signal ≠ a validated sale; Top-N
 * lists; provenance (source/url/date) recorded; deterministic. No fabricated demand; €5M NOT guaranteed. */
const R = require("./odg-global-opportunity-radar.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const r = R.rankings();
  const byId: any = {}; for (const s of r.scored) byId[s.id] = s;

  // ---- explicit weighted grid ----
  const wsum = Object.values(R.WEIGHTS).reduce((a: any, b: any) => a + b, 0);
  check("explicit scoring weights exported + sum to 1.0 (no hidden grid)", Math.abs((wsum as number) - 1.0) < 1e-9 && Object.keys(R.WEIGHTS).length >= 10);
  check("every opportunity scored 0..100 + ranked", r.scored.length >= 6 && r.scored.every((s: any) => s.score >= 0 && s.score <= 100) && r.scored[0].score >= r.scored[r.scored.length - 1].score);

  // ---- OBSERVED buy-signal opportunities = VALIDATED_MARKET_SIGNAL with real sources ----
  check("EAA accessibility (OBSERVED regulatory deadline) ⇒ VALIDATED_MARKET_SIGNAL w/ real sources", byId["eaa-accessibility-eu"].validationTier === "VALIDATED_MARKET_SIGNAL" && byId["eaa-accessibility-eu"].provenance === "OBSERVED_EVIDENCE" && byId["eaa-accessibility-eu"].sources.length >= 1 && /2026-11-12/.test(byId["eaa-accessibility-eu"].consultedDate));
  check("CRA/SBOM (OBSERVED regulatory deadline) ⇒ VALIDATED_MARKET_SIGNAL w/ real sources", byId["cra-sbom-eu"].validationTier === "VALIDATED_MARKET_SIGNAL" && byId["cra-sbom-eu"].sources.some((u: string) => /http/.test(u)));

  // ---- HYPOTHESIS / no buy-signal ⇒ INSUFFICIENTLY_VALIDATED (NOT inflated) ----
  check("HYPOTHESIS opportunities (finops/btp/data) ⇒ INSUFFICIENTLY_VALIDATED", byId["finops-cloud-global"].validationTier === "INSUFFICIENTLY_VALIDATED" && byId["btp-saas-eu"].validationTier === "INSUFFICIENTLY_VALIDATED" && byId["data-eng-global"].validationTier === "INSUFFICIENTLY_VALIDATED");
  check("no inflation: a no-buy-signal opportunity scores below the OBSERVED regulatory ones", byId["btp-saas-eu"].score < byId["eaa-accessibility-eu"].score && byId["btp-saas-eu"].score < byId["cra-sbom-eu"].score);
  check("validated vs insufficient counts are honest (both non-zero)", r.validatedCount >= 2 && r.insufficientCount >= 2 && r.validatedCount + r.insufficientCount === r.scored.length);

  // ---- market-signal ≠ sale (the §5 distinction preserved) ----
  check("a VALIDATED_MARKET_SIGNAL caveat states it is NOT a validated sale/customer", /NOT a validated sale|prospect is not a client/.test(byId["eaa-accessibility-eu"].caveat));
  check("an INSUFFICIENTLY_VALIDATED caveat says do-not-treat-as-solvent-demand", /do not treat as solvent demand|INSUFFICIENTLY/.test(byId["finops-cloud-global"].caveat));

  // ---- Top-N lists (§6) ----
  check("produces Top-10 global + Top-5 fast/recurring/high-margin/ODG-deliverable", r.top10Global.length >= 5 && r.top5FastAccessible.length === 5 && r.top5Recurring.length === 5 && r.top5HighMargin.length === 5 && r.top5OdgDeliverable.length === 5);
  check("the top global opportunities are the OBSERVED regulatory-compliance ones ( grounded, not hypothesis)", r.top10Global.slice(0, 2).every((id: string) => byId[id].provenance === "OBSERVED_EVIDENCE"));
  check("the cross-sector reusable compliance product is surfaced (§4 transversal)", !!byId["reg-compliance-automation-cross"] && byId["reg-compliance-automation-cross"].metier === "CROSS");

  // ---- honesty + determinism ----
  check("contract: explicit grid, no inflation, market-signal≠sale, provenance separated, no fabricated demand", R.GLOBAL_OPPORTUNITY_RADAR_CONTRACT.invariants.some((i: string) => /INSUFFICIENTLY_VALIDATED/.test(i)) && R.GLOBAL_OPPORTUNITY_RADAR_CONTRACT.invariants.some((i: string) => /NOT a validated sale/.test(i)) && R.GLOBAL_OPPORTUNITY_RADAR_CONTRACT.invariants.some((i: string) => /no fabricated demand/.test(i)));
  check("radar provenance names the real WebSearch sources (EAA + CRA) + grant", /EAA|accessibility/.test(R.GLOBAL_OPPORTUNITY_RADAR_CONTRACT.radarProvenance) && /CRA|SBOM/.test(R.GLOBAL_OPPORTUNITY_RADAR_CONTRACT.radarProvenance) && /grant V141/.test(R.GLOBAL_OPPORTUNITY_RADAR_CONTRACT.radarProvenance));
  check("deterministic + frozen", JSON.stringify(R.rankings().top10Global) === JSON.stringify(r.top10Global) && Object.isFrozen(r));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — global-opportunity-radar (§6/§7/§11: explicit weighted grid ranks worldwide opportunities; OBSERVED regulatory buy-signals [EAA accessibility + CRA/SBOM, real sources 2026-11-12] = VALIDATED_MARKET_SIGNAL and top-ranked; HYPOTHESIS/no-signal = INSUFFICIENTLY_VALIDATED, lower-scored, NOT inflated; market-signal ≠ sale; Top-10 + Top-5 lists; no fabricated demand, €5M NOT guaranteed)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
