#!/usr/bin/env node
"use strict";
/* V182 §4.3 — marketing. Proves: transparent segmentation (fit≠demand); positioning abstains without evidence; unproven
 * claims block publishability; generation never authorizes publish/ad/contact (OWNER_GATED); CAC non-conflation. */
const M = require("./odg-marketing-engine.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  // ---- segmentation ----
  const seg = M.segment([{ id: "midmarket", needIntensity: 0.9, reachability: 0.6, budgetSignal: 0.8, evidence: "OBSERVED" }, { id: "micro", needIntensity: 0.3, reachability: 0.9, budgetSignal: 0.2 }]);
  check("segments ranked by transparent fit; top is midmarket", seg.segments[0].id === "midmarket" && seg.segments[0].fit >= seg.segments[1].fit);
  check("high fit is NOT presented as validated demand", /NOT validated demand/.test(seg.note) && seg.segments[1].evidence === "HYPOTHESIS");

  // ---- positioning abstains without evidence ----
  check("positioning abstains without evidenced differentiators", M.positioning({ id: "p" }, { id: "s" }).grounded === false && /abstain/.test(M.positioning({ id: "p" }, { id: "s" }).note));
  check("positioning grounded when evidenced differentiators exist", M.positioning({ id: "p", evidencedDifferentiators: ["page-level citations", "governed no-fabrication"] }, { id: "s" }).grounded === true);

  // ---- claim audit ----
  const dirty = M.claimAudit("We are the best and guarantee 100% results, 50% faster");
  check("unproven claims detected (best/guarantee/100%/50% faster)", dirty.clean === false && dirty.unproven.length >= 2);
  check("claim survives only with an evidence reference", M.claimAudit("50% faster", { "50% faster": "benchmark#123" }).clean === true);
  check("clean copy passes", M.claimAudit("A governed compliance assistant with page-level citations.").clean === true);

  // ---- content generation gated ----
  const draft = M.generateContent({ channel: "email", body: "We are the N°1 leader", evidenceRefs: {} });
  check("generated content is DRAFT, not publishable with unproven claims, OWNER_GATED note", draft.status === "DRAFT" && draft.publishable === false && /OWNER_GATED/.test(draft.note));
  const clean = M.generateContent({ channel: "web", body: "Readiness assessment with evidence provenance." });
  check("clean content is publishable=true but still only a DRAFT (no auto-publish)", clean.publishable === true && clean.status === "DRAFT");

  // ---- campaign is owner-gated ----
  const camp = M.campaignPlan({ channels: ["email", "web"], contents: [draft, clean] });
  check("campaignPlan is OWNER_GATED, not executed, flags unproven-claim block", camp.status === "OWNER_GATED" && camp.executed === false && camp.blockedByUnprovenClaims === true && /OWNER_GATED/.test(camp.note));

  // ---- CAC non-conflation ----
  const cac = M.attributeCAC(30000, 10, 21000);
  check("CAC computed = spend/acquired", cac.cac === 3000 && cac.totalContribution === 210000 && cac.contributionNetOfCac === 180000);
  check("CAC explicitly NOT margin/net (non-conflation)", /NOT margin, NOT net profit/.test(cac.note) && /still NOT operating\/net/.test(cac.note));
  check("acquired=0 ⇒ cac null (no divide-by-zero fabrication)", M.attributeCAC(5000, 0, 1000).cac === null);

  // ---- contract ----
  check("contract: generation≠publish-authorization + unproven-claims-block + CAC non-conflation", M.MARKETING_CONTRACT.invariants.some((i: string) => /OWNER_GATED/.test(i)) && M.MARKETING_CONTRACT.invariants.some((i: string) => /BLOCK publishability/.test(i)) && M.MARKETING_CONTRACT.invariants.some((i: string) => /CAC ≠ contribution ≠ margin ≠ net/.test(i)));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — marketing-engine (§4.3: transparent segmentation [fit≠demand]; positioning abstains without evidence; unproven claims block publishability; generation never authorizes publish/ad/contact [OWNER_GATED]; CAC ≠ margin ≠ net)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
