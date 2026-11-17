#!/usr/bin/env node
"use strict";
/* V272 §7 — ODG reproducible country-ranking. Hand-computed transparent scores (FR 71.25 / ES 66.0 / DE 62.78 with a missing
 * criterion renormalised), INSUFFICIENT_EVIDENCE gating (low coverage / no provenance — never ranked 0), direction inversion,
 * confidence from ACTUAL weight, reuse of research-ranking, determinism. All inputs are PLANNING estimates. SYNTHETIC. */
const CR = require("./odg-country-ranking.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

const crit = (score: number, status: string, source: string) => ({ score, status, source });
function main() {
  const input = {
    minCoverage: 0.6,
    countries: [
      { code: "FR", name: "France", provenanceRef: "eurostat:2026", criteria: {
        marketSize: crit(80, "ACTUAL", "eurostat"), purchasingPower: crit(85, "ESTIMATED", "insee"), languageFit: crit(100, "ESTIMATED", "odg"),
        competitionIntensity: crit(70, "ESTIMATED", "radar"), regulatoryComplexity: crit(60, "ESTIMATED", "legal"), paymentInfra: crit(90, "ESTIMATED", "gov"), entryCost: crit(40, "ESTIMATED", "model") } },
      { code: "ES", name: "Spain", provenanceRef: "eurostat:2026", criteria: {
        marketSize: crit(70, "ESTIMATED", "x"), purchasingPower: crit(70, "ESTIMATED", "x"), languageFit: crit(90, "ESTIMATED", "x"),
        competitionIntensity: crit(50, "ESTIMATED", "x"), regulatoryComplexity: crit(50, "ESTIMATED", "x"), paymentInfra: crit(70, "ESTIMATED", "x"), entryCost: crit(50, "ESTIMATED", "x") } },
      { code: "DE", name: "Germany", provenanceRef: "eurostat:2026", criteria: {
        marketSize: crit(90, "ESTIMATED", "x"), purchasingPower: crit(80, "ESTIMATED", "x"), languageFit: crit(40, "ESTIMATED", "x"),
        competitionIntensity: crit(60, "ESTIMATED", "x"), regulatoryComplexity: crit(50, "ESTIMATED", "x"), entryCost: crit(50, "ESTIMATED", "x"),
        paymentInfra: crit(0, "UNKNOWN", "x") } },   // UNKNOWN ⇒ missing ⇒ renormalised (NOT counted as 0)
      { code: "XX", name: "LowCoverage", provenanceRef: "x", criteria: { marketSize: crit(99, "ESTIMATED", "x") } },  // coverage 0.25 < 0.6
      { code: "YY", name: "NoProvenance", criteria: {   // fully known but NO provenanceRef
        marketSize: crit(99, "ESTIMATED", "x"), purchasingPower: crit(99, "ESTIMATED", "x"), languageFit: crit(99, "ESTIMATED", "x"),
        competitionIntensity: crit(0, "ESTIMATED", "x"), regulatoryComplexity: crit(0, "ESTIMATED", "x"), paymentInfra: crit(99, "ESTIMATED", "x"), entryCost: crit(0, "ESTIMATED", "x") } },
    ],
  };
  const r = CR.rankCountries(input);
  check("ok; criteria weights sum to 1.0; basis is PLANNING_ESTIMATE (not actual market performance)", r.ok && Math.abs(r.totalWeight - 1.0) < 1e-9 && /PLANNING_ESTIMATE/.test(r.basis) && /NOT actual market/.test(r.basis));

  // hand-computed: FR 71.25, ES 66.0, DE 62.78 (missing paymentInfra renormalised over 0.90 weight).
  const byCode = (c: string) => r.ranking.find((x: any) => x.code === c);
  check("ranking: 3 eligible countries ranked FR(1) > ES(2) > DE(3)", r.rankedCount === 3 && r.ranking[0].code === "FR" && r.ranking[0].rank === 1 && r.ranking[1].code === "ES" && r.ranking[2].code === "DE");
  check("FR score = 71.25 (all 7 criteria known, coverage 1.0)", byCode("FR").score === 71.25 && byCode("FR").coverage === 1);
  check("ES score = 66.0 (coverage 1.0)", byCode("ES").score === 66);
  check("DE score = 62.78 — paymentInfra UNKNOWN RENORMALISED over 0.90 weight (NOT counted as 0), coverage 0.90, missing listed",
    byCode("DE").score === 62.78 && byCode("DE").coverage === 0.9 && byCode("DE").missing.indexOf("paymentInfra") >= 0);

  // direction inversion: FR competitionIntensity raw 70 (lower_better) ⇒ benefit 30; entryCost raw 40 ⇒ benefit 60.
  const frComp = byCode("FR").contributions.find((c: any) => c.key === "competitionIntensity");
  const frEntry = byCode("FR").contributions.find((c: any) => c.key === "entryCost");
  check("direction inversion: competitionIntensity raw 70 ⇒ benefit 30; entryCost raw 40 ⇒ benefit 60 (lower-is-better inverted)",
    frComp.rawScore === 70 && frComp.benefitScore === 30 && frEntry.rawScore === 40 && frEntry.benefitScore === 60);

  // confidence: FR has one ACTUAL criterion (marketSize, weight .25) ⇒ confidence = (0.25/1.0)×1.0 = 0.25.
  check("confidence from ACTUAL weight: FR = 0.25 (only marketSize is ACTUAL; the rest ESTIMATED)", byCode("FR").confidence === 0.25);

  // INSUFFICIENT_EVIDENCE: low coverage + no provenance ⇒ excluded, NOT ranked, NEVER scored as 0.
  check("XX (coverage 0.25 < 0.6) excluded as INSUFFICIENT_EVIDENCE_LOW_COVERAGE — not ranked, not 0",
    r.excluded.some((e: any) => e.code === "XX" && e.status === "INSUFFICIENT_EVIDENCE_LOW_COVERAGE") && !r.ranking.some((x: any) => x.code === "XX"));
  check("YY (full criteria but NO provenanceRef) excluded as INSUFFICIENT_EVIDENCE_NO_PROVENANCE — fail-closed, not ranked",
    r.excluded.some((e: any) => e.code === "YY" && e.status === "INSUFFICIENT_EVIDENCE_NO_PROVENANCE") && !r.ranking.some((x: any) => x.code === "YY"));
  check("excludedCount 2, rankedCount 3 (5 countries in ⇒ 3 ranked + 2 excluded, nothing dropped silently)", r.excludedCount === 2 && r.rankedCount === 3);

  // fail-closed + determinism + contract.
  check("fail-closed: no countries ⇒ NO_COUNTRIES", CR.rankCountries({ countries: [] }).code === "NO_COUNTRIES");
  check("deterministic + frozen (same input ⇒ byte-identical ranking)", JSON.stringify(CR.rankCountries(input)) === JSON.stringify(CR.rankCountries(input)) && Object.isFrozen(CR.CRITERIA));
  check("reuses research-ranking (no 2nd scoring engine); missing never 0; insufficient⇒not ranked; planning estimates only",
    CR.COUNTRY_RANKING_CONTRACT.reuses.some((x: string) => /research-ranking/.test(x)) && CR.COUNTRY_RANKING_CONTRACT.invariants.some((i: string) => /RENORMALISED over known criteria/.test(i)) && CR.COUNTRY_RANKING_CONTRACT.invariants.some((i: string) => /no 2nd scoring/.test(i)) && CR.COUNTRY_RANKING_CONTRACT.invariants.some((i: string) => /NOT actual market/.test(i)));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-country-ranking (V272 §7: reproducible transparent-criteria country ranking reusing research-ranking; FR 71.25 > ES 66.0 > DE 62.78 [DE paymentInfra UNKNOWN renormalised over 0.90, never 0]; direction inversion; confidence from ACTUAL weight 0.25; INSUFFICIENT_EVIDENCE [low-coverage XX + no-provenance YY] excluded not ranked 0; planning estimates only — no real traction claimed)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
