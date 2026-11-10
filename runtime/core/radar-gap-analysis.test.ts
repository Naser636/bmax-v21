#!/usr/bin/env node
"use strict";
const R = require("./radar-gap-analysis");
let failures = 0; function check(c: any, l: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + l + "\n"); } }
const caps = [{ id: "fdir-engine", competencies: ["fault", "recovery"] }, { id: "plan-evaluator", competencies: ["planning", "decision"] }];
// (1) undemonstrated ⇒ INSUFFICIENTLY_DEMONSTRATED (a claim is not a proof).
check(R.analyzeOpportunity({ title: "hype", competencies: ["ai"], demonstrated: false }, caps).classification === "INSUFFICIENTLY_DEMONSTRATED", "undemonstrated ⇒ INSUFFICIENTLY_DEMONSTRATED (not promoted)");
// (2) fully covered ⇒ ALREADY_AVAILABLE (redundant, not proposed).
{
  const a = R.analyzeOpportunity({ title: "generic fdir", competencies: ["fault", "recovery"], demonstrated: true }, caps);
  check(a.classification === "ALREADY_AVAILABLE" && a.proposalEligible === false && a.matchedCapability === "fdir-engine", "fully covered ⇒ ALREADY_AVAILABLE, not proposed");
}
// (3) demonstrated improvement of a named existing capability ⇒ IMPROVEMENT (proposable).
{
  const a = R.analyzeOpportunity({ title: "better planner", competencies: ["planning"], demonstrated: true, improvesExisting: "plan-evaluator" }, caps);
  check(a.classification === "IMPROVEMENT" && a.proposalEligible === true, "demonstrated improvement of an existing cap ⇒ IMPROVEMENT (proposable)");
}
// (4) genuinely new + demonstrated + not covered ⇒ USEFUL_NEW (proposable).
{
  const a = R.analyzeOpportunity({ title: "formal verification", competencies: ["formal-methods", "model-checking"], demonstrated: true }, caps);
  check(a.classification === "USEFUL_NEW" && a.proposalEligible === true, "new demonstrated non-covered ⇒ USEFUL_NEW (proposable)");
}
// (5) mostly-overlapping ⇒ REDUNDANT (avoid decorative additions).
{
  const a = R.analyzeOpportunity({ title: "fault thing", competencies: ["fault", "newish"], demonstrated: true }, caps);
  check(a.classification === "REDUNDANT", "mostly overlapping an existing cap ⇒ REDUNDANT");
}
// (6) toProposal: eligible ⇒ PROPOSED (authorized:false, grants no permission); not eligible ⇒ null.
{
  const useful = R.analyzeOpportunity({ title: "fv", competencies: ["formal-methods"], demonstrated: true }, caps);
  const p = R.toProposal({ title: "fv" }, useful);
  check(p && p.status === "PROPOSED" && p.authorized === false && p.grantsNoPermission === true, "an eligible opportunity ⇒ PROPOSED, authorized:false (never self-authorizes)");
  check(R.toProposal({ title: "x" }, R.analyzeOpportunity({ competencies: ["fault", "recovery"], demonstrated: true }, caps)) === null, "a covered/ineligible opportunity ⇒ no proposal");
}
// (7) Radar self-evaluation measures RELEVANCE, not volume.
{
  const se = R.radarSelfEvaluation([{ classification: "USEFUL_NEW", integrated: true }, { classification: "ALREADY_AVAILABLE" }, { classification: "INSUFFICIENTLY_DEMONSTRATED" }, { classification: "IMPROVEMENT", integrated: false }]);
  check(se.proposals === 4 && se.integrated === 1 && se.rejectedRedundant === 1 && se.undemonstrated === 1 && Math.abs(se.relevanceRate - 0.5) < 0.01, "Radar self-eval measures useful/redundant/undemonstrated/integrated (relevance, not volume)");
}
check(/a claim is not a proof/i.test(JSON.stringify(R.RADAR_GAP_ANALYSIS_CONTRACT.invariants)), "contract: a claim is not a proof");
check(/discovery ≠ authorization|no self-promotion/i.test(JSON.stringify(R.RADAR_GAP_ANALYSIS_CONTRACT.invariants)), "contract: no self-promotion");
if (failures === 0) process.stdout.write("ALL PASS — V12.4 RADAR GAP ANALYSIS\n");
process.exit(failures === 0 ? 0 : 1);
export {};
