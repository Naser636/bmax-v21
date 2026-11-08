#!/usr/bin/env node
"use strict";
const assert = require("assert");
const R = require("./frontier-radar-self-improvement");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V5 PHASE 6 / M-CH4-02 — RADAR SELF-IMPROVEMENT");
// measures relevance/noise; improvements PROPOSED; selfAuthorized false.
{
  const r = R.assessRadarCycle({ discoveries: [{ id: "a", relevant: true }, { id: "b", relevant: false }, { id: "c", relevant: true }], groundTruth: { knownMissed: ["z"] } });
  check(r.measurable === true && Math.abs(r.metrics.relevance - 0.6667) < 1e-3, `relevance = 2/3 (got ${r.metrics.relevance})`);
  check(r.selfAuthorized === false, "selfAuthorized false — radar cannot modify its own authorizations");
  check(r.proposals.every((p: any) => p.status === "PROPOSED"), "every improvement is PROPOSED (never self-applied)");
}
// high noise ⇒ tighten-classifier proposal.
{
  const r = R.assessRadarCycle({ discoveries: [{ id: "a", relevant: true }, { id: "b", relevant: false }, { id: "c", relevant: false }, { id: "d", relevant: false }] });
  check(r.proposals.some((p: any) => p.kind === "tighten-classifier"), "noise > 0.3 ⇒ tighten-classifier proposal");
}
// relevance regression vs prior ⇒ revert proposal.
{
  const r = R.assessRadarCycle({ discoveries: [{ id: "a", relevant: true }, { id: "b", relevant: false }], priorMetrics: { relevance: 0.9, noise: 0.1, missRate: 0 } });
  check(r.deltaVsPrior.relevance < 0 && r.proposals.some((p: any) => p.kind === "revert-last-classifier-change"), "relevance regressed ⇒ revert proposal");
}
// gamed improvement ⇒ withheld.
{
  const r = R.assessRadarCycle({ discoveries: [{ id: "a", relevant: true }], integritySignals: { gaming: { metric: { before: 0.5, after: 0.99 }, manipulationMarker: true } } });
  check(r.proposals.some((p: any) => p.kind === "withhold-improvement"), "integrity DETECTED ⇒ improvement withheld");
}
// fail-closed: no verified discoveries ⇒ NOT_MEASURED (never fabricated).
check(R.assessRadarCycle({ discoveries: [{ id: "a" }] }).measurable === false, "no verified discoveries ⇒ NOT_MEASURED (fail-closed)");
check(R.assessRadarCycle({}).measurable === false, "empty ⇒ not measurable");
check(R.RADAR_SELF_IMPROVEMENT_CONTRACT.invariants.some((i: any) => /never self-applies/i.test(i)), "contract: never self-applies / no self-authorization");
console.log(failures === 0 ? "ALL PASS — V5 M-CH4-02 RADAR SELF-IMPROVEMENT" : "FAILURES: " + failures);
process.exit(failures === 0 ? 0 : 1);
export {};
