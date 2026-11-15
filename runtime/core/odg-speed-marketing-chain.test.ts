#!/usr/bin/env node
"use strict";
/* V209 — Speed-Marketing E2E chain: defineSegment → scoreOfferSegmentFit → funnelMetrics. Proves the full path,
 * the NO_FIT stop, UNDETERMINED propagation, MODEL-ONLY honesty; composes existing (no 2nd pipeline). */
const C = require("./odg-speed-marketing-chain.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

const segmentSpec = { id: "mid-market-saas", sector: "software", needs: ["reduce cloud cost", "finops visibility"], budgetBand: [10000, 50000], urgency: "HIGH", requiredCapabilities: ["finops", "cloud"] };
const strongOffer = { id: "o1", built: true, problem: "reduce cloud cost with finops visibility", priceLow: 15000, priceHigh: 30000, capabilities: ["finops", "cloud"] };
const healthyFunnel = { familyId: "saas", synthetic: { impressions: 100000, clicks: 3000, leads: 600, qualified: 120, won: 20 }, spend: 100000, costComponents: { delivery: 1, support: 1, tax: 1 } };

function main() {
  // full path: STRONG fit + HEALTHY economics ⇒ complete + MODEL_PROMISING
  const full = C.assessChain({ segmentSpec, offer: strongOffer, funnel: healthyFunnel });
  check("E2E complete: STRONG fit ⇒ proceeds to economics", full.stage === "complete" && full.proceed === true && full.fit.band === "STRONG");
  check("economics modelled (CAC/LTV:CAC) ⇒ MODEL_PROMISING (still MODEL-ONLY)", full.economics.verdict === "HEALTHY" && full.economics.cac === 5000 && full.verdict === "MODEL_PROMISING");
  check("result is a HYPOTHESIS, never a qualified client/sale", /never a qualified client/.test(full.honesty));

  // NO_FIT stops BEFORE economics (un-built offer)
  const unbuilt = C.assessChain({ segmentSpec, offer: { ...strongOffer, built: false }, funnel: healthyFunnel });
  check("un-built offer ⇒ STOPPED_NO_FIT, economics NOT modelled (null)", unbuilt.verdict === "STOPPED_NO_FIT" && unbuilt.proceed === false && unbuilt.economics === null);

  // over-budget offer ⇒ NO_FIT stop
  const over = C.assessChain({ segmentSpec, offer: { ...strongOffer, priceLow: 80000, priceHigh: 120000 }, funnel: healthyFunnel });
  check("over-budget offer ⇒ STOPPED_NO_FIT (fail-closed before economics)", over.verdict === "STOPPED_NO_FIT" && over.economics === null);

  // invalid segment ⇒ stops at segment stage
  check("invalid ICP segment ⇒ INVALID_SEGMENT (fail-closed)", C.assessChain({ segmentSpec: { id: "x" }, offer: strongOffer, funnel: healthyFunnel }).verdict === "INVALID_SEGMENT");

  // NOT_VIABLE economics (CAC≥LTV) on a fitting offer ⇒ MODEL_NOT_VIABLE
  const badEcon = C.assessChain({ segmentSpec, offer: strongOffer, funnel: { familyId: "saas", synthetic: { impressions: 1000, clicks: 100, leads: 50, qualified: 20, won: 1 }, spend: 500000, costComponents: { delivery: 1, support: 1, tax: 1 } } });
  check("fitting offer but CAC≥LTV ⇒ MODEL_NOT_VIABLE (chain surfaces the economic failure)", badEcon.proceed === true && badEcon.verdict === "MODEL_NOT_VIABLE");

  // UNDETERMINED propagation (segment without budget ⇒ budgetFit undetermined flows through)
  const undSeg = { id: "y", sector: "s", needs: ["automation"], urgency: "HIGH", requiredCapabilities: ["x"] };
  const und = C.assessChain({ segmentSpec: undSeg, offer: { id: "o", built: true, problem: "automation", priceLow: 1, priceHigh: 2, capabilities: ["x"] }, funnel: healthyFunnel });
  check("UNDETERMINED (no segment budget) is propagated through the chain", Array.isArray(und.undetermined) && und.undetermined.some((u: string) => /budgetFit/.test(u)));

  check("contract: composes existing, no 2nd pipeline, fail-closed, MODEL-ONLY", C.SPEED_MARKETING_CHAIN_CONTRACT.invariants.some((i: string) => /NOT a second commercial pipeline/.test(i)) && C.SPEED_MARKETING_CHAIN_CONTRACT.invariants.some((i: string) => /STOPS before any economics/.test(i)));
  check("deterministic", JSON.stringify(C.assessChain({ segmentSpec, offer: strongOffer, funnel: healthyFunnel }).verdict) === JSON.stringify(full.verdict));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — speed-marketing-chain (V209 §2: E2E defineSegment→fit→funnel; NO_FIT STOPS before economics; UNDETERMINED propagated; MODEL_PROMISING/NOT_VIABLE; composes existing, no 2nd pipeline; score≠client)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
