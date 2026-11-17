#!/usr/bin/env node
"use strict";
/* V274 §5.A/§12 — market-entry decision connecting V272 country-ranking → V271 decision engine. Asserts: top-ranked country ⇒
 * level-C decision (human approval, never autonomous, executionResult null); empty/insufficient ranking ⇒ level-A gather-
 * evidence (no decision on nothing); low confidence surfaced; planning-estimate honesty. SYNTHETIC. */
const M = require("./odg-market-entry-decision.js");
const CR = require("./odg-country-ranking.js");
const DEC = require("./odg-executive-decision-engine.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

const crit = (score: number, status: string) => ({ score, status, source: "x" });
const FULL = (ms: number, pp: number, lf: number, ci: number, rc: number, pi: number, ec: number) => ({
  marketSize: crit(ms, "ESTIMATED"), purchasingPower: crit(pp, "ESTIMATED"), languageFit: crit(lf, "ESTIMATED"),
  competitionIntensity: crit(ci, "ESTIMATED"), regulatoryComplexity: crit(rc, "ESTIMATED"), paymentInfra: crit(pi, "ESTIMATED"), entryCost: crit(ec, "ESTIMATED"),
});

function main() {
  // rank three countries (FR top per V272 math), then propose entry.
  const ranking = CR.rankCountries({ countries: [
    { code: "FR", name: "France", provenanceRef: "eurostat", criteria: FULL(80, 85, 100, 70, 60, 90, 40) },  // score 71.25
    { code: "ES", name: "Spain", provenanceRef: "eurostat", criteria: FULL(70, 70, 90, 50, 50, 70, 50) },     // 66.0
    { code: "DE", name: "Germany", provenanceRef: "eurostat", criteria: FULL(90, 80, 40, 60, 50, 60, 50) },   // 63.5
  ] });
  check("precondition: ranking ok with FR top", ranking.ok && ranking.ranking[0].code === "FR");

  const p = M.proposeMarketEntry(ranking, { minConfidence: 0.5 });
  check("hasCandidate true; top country FR carried with score/coverage/confidence", p.ok && p.hasCandidate === true && p.topCountry.code === "FR" && p.topCountry.score === 71.25);
  check("market entry ⇒ authority level C (human approval), requiresApproval true, executionResult null (never autonomous)",
    p.decision.authorityLevel === "C" && p.decision.requiresApproval === true && p.decision.executionResult === null);
  check("decision recommends HUMAN approval for FR entry preparation; no external commitment", /HUMAN approval/.test(p.decision.recommendedAction) && /FR/.test(p.decision.recommendedAction) && /no external commitment/.test(p.note));
  check("runner-up ES surfaced for comparison", p.runnerUp && p.runnerUp.code === "ES");
  check("honesty: confidence all-ESTIMATED ⇒ 0, below floor 0.5 ⇒ lowConfidence flagged + risk notes estimates-not-traction",
    p.topCountry.confidence === 0 && p.lowConfidence === true && p.decision.risks.some((x: string) => /planning-estimate|estimates/.test(x)));

  // empty / insufficient ranking ⇒ level-A GATHER_EVIDENCE, NOT a market-entry decision on nothing.
  const none = M.proposeMarketEntry({ ok: true, ranking: [] }, {});
  check("empty ranking ⇒ level-A GATHER_EVIDENCE (no decision on insufficient evidence), requiresApproval false, hasCandidate false",
    none.hasCandidate === false && none.decision.authorityLevel === "A" && none.decision.requiresApproval === false && none.decision.id === "DEC_MARKET_ENTRY_EVIDENCE");
  const insufficient = CR.rankCountries({ countries: [{ code: "XX", provenanceRef: "x", criteria: { marketSize: crit(99, "ESTIMATED") } }] });  // coverage 0.25 ⇒ excluded
  check("a ranking where every country is INSUFFICIENT_EVIDENCE ⇒ gather-evidence (not entry)", insufficient.rankedCount === 0 && M.proposeMarketEntry(insufficient, {}).hasCandidate === false);

  // rankAndPropose convenience + determinism + contract.
  const combo = M.rankAndPropose({ countries: [{ code: "FR", provenanceRef: "e", criteria: FULL(80, 85, 100, 70, 60, 90, 40) }] }, { minConfidence: 0 });
  check("rankAndPropose: ranks then proposes a level-C entry decision for the top country in one call", combo.ok && combo.ranking.ranking[0].code === "FR" && combo.proposal.decision.authorityLevel === "C");
  check("deterministic + frozen", JSON.stringify(M.proposeMarketEntry(ranking, { minConfidence: 0.5 })) === JSON.stringify(p) && Object.isFrozen(p));
  check("contract: reuses V272 ranking + V271 decision; entry always level C; no decision on insufficient evidence; planning estimates only; no new engine",
    M.MARKET_ENTRY_DECISION_CONTRACT.reuses.some((x: string) => /V272/.test(x)) && M.MARKET_ENTRY_DECISION_CONTRACT.reuses.some((x: string) => /V271/.test(x)) &&
    M.MARKET_ENTRY_DECISION_CONTRACT.invariants.some((i: string) => /ALWAYS authority level C/.test(i)) && M.MARKET_ENTRY_DECISION_CONTRACT.invariants.some((i: string) => /NEVER a market-entry decision on an INSUFFICIENT/.test(i)) && M.MARKET_ENTRY_DECISION_CONTRACT.invariants.some((i: string) => /no new scoring\/decision engine/.test(i)));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-market-entry-decision (V274 §5.A/§12: connects V272 country-ranking → V271 decision engine; top FR ⇒ level-C human-approval decision [never autonomous, executionResult null]; empty/insufficient ranking ⇒ level-A gather-evidence [no decision on nothing]; low confidence surfaced; planning estimates only — no measured traction; no new engine)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
