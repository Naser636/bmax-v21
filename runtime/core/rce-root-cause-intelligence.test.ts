#!/usr/bin/env node
"use strict";
const assert = require("assert");
const R = require("./rce-root-cause-intelligence");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V5 PHASE 3 / RCE-04 — ROOT-CAUSE INTELLIGENCE");
const model = { entities: { n1: {}, n2: {}, n3: {}, n4: {} }, relations: { r1: { from: "n1", to: "n2", type: "causes" }, r2: { from: "n2", to: "n3", type: "causes" }, r3: { from: "n2", to: "n4", type: "causes" } } };

// a well-supported source (broad downstream) ⇒ ROOT_CAUSE_IDENTIFIED, not the symptom.
{
  const r = R.classifyCausalChain({ symptom: "test fails", model, hypotheses: [
    { id: "h-root", nodeId: "n1", evidence: { reproduces: true, isolated: true, corroborated: true } },
    { id: "h-symptom", nodeId: "n3", evidence: { reproduces: true, isolated: true } },
  ] });
  check(r.verdict === "ROOT_CAUSE_IDENTIFIED" && r.rootCause.id === "h-root", `source selected as root (got ${r.rootCause && r.rootCause.id})`);
  check(r.rootCause.layer === "SYSTEMIC_CAUSE", `n1 (0 upstream, 3 downstream) ⇒ SYSTEMIC_CAUSE (got ${r.rootCause.layer})`);
  check(r.rankedHypotheses.find((h: any) => h.id === "h-symptom").layer === "SYMPTOM", "leaf n3 ⇒ SYMPTOM");
}
// a symptom alone ⇒ INCONCLUSIVE (a symptom is never returned as root).
{
  const r = R.classifyCausalChain({ model, hypotheses: [{ id: "h-symptom", nodeId: "n3", evidence: { reproduces: true, isolated: true } }] });
  check(r.verdict === "INCONCLUSIVE" && r.rootCause === null, "symptom-only ⇒ INCONCLUSIVE (symptom never root)");
}
// not reproduced ⇒ confidence halved ⇒ below threshold ⇒ INCONCLUSIVE (fail-closed).
{
  const r = R.classifyCausalChain({ model, hypotheses: [{ id: "h", nodeId: "n1", evidence: { reproduces: false, isolated: true, corroborated: true } }] });
  check(r.verdict === "INCONCLUSIVE", "unreproduced root hypothesis ⇒ INCONCLUSIVE (fail-closed)");
}
// explicit CONTRACT_DEFECT flag ⇒ layer CONTRACT_DEFECT + eligible when supported.
{
  const r = R.classifyCausalChain({ hypotheses: [{ id: "h", evidence: { contractDefect: true, reproduces: true, isolated: true, corroborated: true } }] });
  check(r.verdict === "ROOT_CAUSE_IDENTIFIED" && r.rootCause.layer === "CONTRACT_DEFECT", "contract-defect flag ⇒ CONTRACT_DEFECT root");
}
// no hypotheses ⇒ INCONCLUSIVE.
check(R.classifyCausalChain({ hypotheses: [] }).verdict === "INCONCLUSIVE", "no hypotheses ⇒ INCONCLUSIVE");
// confidence: reproduces+isolated+corroborated = 1.0; not reproduced halves.
check(R.confidenceOf({ reproduces: true, isolated: true, corroborated: true }) === 1 && R.confidenceOf({ reproduces: false, isolated: true, corroborated: true }) === 0.3, "confidence math (1.0 full; halved w/o reproduction)");
check(R.RCE_ROOT_CAUSE_CONTRACT.invariants.some((i: any) => /never a fabricated root cause/.test(i)), "contract: never fabricated root cause");
console.log(failures === 0 ? "ALL PASS — V5 RCE-04 ROOT-CAUSE INTELLIGENCE" : "FAILURES: " + failures);
process.exit(failures === 0 ? 0 : 1);
export {};
