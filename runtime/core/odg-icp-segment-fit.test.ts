#!/usr/bin/env node
"use strict";
/* V206 §3 — ICP segment + offer↔segment fit (MODEL-ONLY). Proves: segment validation; explainable weighted fit;
 * fail-closed disqualifiers (un-built offer / over-budget); UNDETERMINED not fabricated; score ≠ qualified client. */
const F = require("./odg-icp-segment-fit.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

const seg = F.defineSegment({ id: "mid-market-saas", sector: "software", needs: ["reduce cloud cost", "finops visibility"], budgetBand: [10000, 50000], urgency: "HIGH", requiredCapabilities: ["finops", "cloud"] }).segment;
const strongOffer = { id: "o1", built: true, problem: "reduce cloud cost with finops visibility", priceLow: 15000, priceHigh: 30000, capabilities: ["finops", "cloud"] };

function main() {
  // segment validation
  check("defineSegment requires id/sector/needs (fail-closed)", F.defineSegment({ id: "x" }).ok === false && F.defineSegment({ id: "x", sector: "s", needs: ["n"] }).ok === true);
  check("missing budgetBand ⇒ segment valid but budget dimension UNDETERMINED later", F.defineSegment({ id: "x", sector: "s", needs: ["n"] }).segment.budgetBand === null);

  // strong fit
  const s = F.scoreOfferSegmentFit(strongOffer, seg);
  check("strong aligned+built+in-budget+urgent offer ⇒ STRONG, explainable breakdown", s.ok === true && s.band === "STRONG" && s.fitScore >= 70 && s.breakdown.length === 5 && s.disqualifiers.length === 0);
  check("breakdown is per-dimension + MODEL-ONLY honesty (score ≠ authorization)", s.breakdown.every((b: any) => b.dim && typeof b.points === "number" && typeof b.max === "number") && s.modelOnly === true && /score ≠ authorization/.test(s.honesty));

  // fail-closed: un-built offer ⇒ NO_FIT
  const unbuilt = F.scoreOfferSegmentFit({ ...strongOffer, built: false }, seg);
  check("un-built offer ⇒ NO_FIT (hard disqualifier, fitScore 0)", unbuilt.band === "NO_FIT" && unbuilt.fitScore === 0 && unbuilt.disqualifiers.some((d: string) => /not built/.test(d)));

  // fail-closed: price above segment budget ⇒ disqualified
  const overBudget = F.scoreOfferSegmentFit({ ...strongOffer, priceLow: 80000, priceHigh: 120000 }, seg);
  check("offer price above segment budget ⇒ NO_FIT (over-budget disqualifier)", overBudget.band === "NO_FIT" && overBudget.disqualifiers.some((d: string) => /exceeds segment budget/.test(d)));

  // UNDETERMINED not fabricated: no-budget segment + no-problem offer
  const segNoBudget = F.defineSegment({ id: "y", sector: "s", needs: ["automation"] }).segment;
  const u = F.scoreOfferSegmentFit({ id: "o2", built: true, capabilities: [] }, segNoBudget);
  check("missing criteria ⇒ UNDETERMINED dims recorded (not fabricated)", u.undetermined.some((d: string) => /budgetFit/.test(d)) && u.undetermined.some((d: string) => /needAlignment/.test(d)));

  // weak/moderate gradation (partial alignment, no urgency)
  const segLow = F.defineSegment({ id: "z", sector: "s", needs: ["reduce cloud cost"], budgetBand: [10000, 50000], urgency: "LOW", requiredCapabilities: ["finops"] }).segment;
  const mod = F.scoreOfferSegmentFit({ id: "o3", built: true, problem: "workflow automation tooling", priceLow: 15000, priceHigh: 30000, capabilities: [] }, segLow);
  check("no need-overlap / low urgency / no capability (built, in budget) ⇒ MODERATE (not STRONG)", mod.band === "MODERATE" && mod.fitScore < 70 && mod.fitScore >= 45);

  // honesty: a high score is never a qualified client
  check("STRONG fit is a HYPOTHESIS, not a qualified client / demand / sale", /not validated demand|segment ≠ real customer/.test(s.honesty));

  check("contract: not-a-new-engine, fail-closed, UNDETERMINED-not-fabricated, MODEL-ONLY", F.ICP_SEGMENT_FIT_CONTRACT.invariants.some((i: string) => /NOT a new commercial engine/.test(i)) && F.ICP_SEGMENT_FIT_CONTRACT.invariants.some((i: string) => /fail-closed/.test(i)) && F.ICP_SEGMENT_FIT_CONTRACT.invariants.some((i: string) => /never fabricated/.test(i)));
  check("deterministic", JSON.stringify(F.scoreOfferSegmentFit(strongOffer, seg).breakdown) === JSON.stringify(s.breakdown));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — icp-segment-fit (V206 §3: ICP segment definition + explainable weighted offer↔segment fit; fail-closed NO_FIT on un-built/over-budget; UNDETERMINED not fabricated; gradation; MODEL-ONLY, score ≠ qualified client; composes existing Speed-Marketing chain)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
