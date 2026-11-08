#!/usr/bin/env node
"use strict";
const assert = require("assert");
const EI = require("./evaluator-independence");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V12.4 §36/§49 — EVALUATOR INDEPENDENCE");

const indep = { builder: { id: "B", model: "m1", data: "d1", evaluator: "e1", evidenceAccess: "ea1", environment: "env1" }, verifier: { id: "V", model: "m2", data: "d2", evaluator: "e2", evidenceAccess: "ea2", environment: "env2" } };
check(EI.auditIndependence(indep).verdict === "INDEPENDENT", "distinct model/data/evaluator/evidence ⇒ INDEPENDENT");

// self-certification: verifier == builder ⇒ COMPROMISED.
check(EI.auditIndependence({ builder: { id: "X", model: "m1" }, verifier: { id: "X", model: "m2" } }).verdict === "COMPROMISED" && EI.auditIndependence({ builder: { id: "X" }, verifier: { id: "X" } }).selfCertification === true, "verifier == builder (self-certification) ⇒ COMPROMISED");

// shared CRITICAL dimension (same model) ⇒ COMPROMISED.
{
  const r = EI.auditIndependence({ builder: { id: "B", model: "SAME", data: "d1" }, verifier: { id: "V", model: "SAME", data: "d2" } });
  check(r.verdict === "COMPROMISED" && r.criticalShared.some((s: any) => s.dimension === "model"), "shared critical model between builder and verifier ⇒ COMPROMISED");
  const rd = EI.auditIndependence({ builder: { id: "B", data: "SAMEDATA" }, verifier: { id: "V", data: "SAMEDATA" } });
  check(rd.verdict === "COMPROMISED", "shared critical data ⇒ COMPROMISED");
}

// shared NON-critical dimension (same environment only) ⇒ WEAK.
check(EI.auditIndependence({ builder: { id: "B", model: "m1", environment: "SHARED" }, verifier: { id: "V", model: "m2", environment: "SHARED" } }).verdict === "WEAK", "shared non-critical environment only ⇒ WEAK");

// fail-closed: missing a role ⇒ INSUFFICIENT_DATA.
check(EI.auditIndependence({ builder: { id: "B" } }).verdict === "INSUFFICIENT_DATA", "missing verifier profile ⇒ INSUFFICIENT_DATA (fail-closed)");
check(EI.auditIndependence({}).verdict === "INSUFFICIENT_DATA", "no profiles ⇒ INSUFFICIENT_DATA");

// honesty: independence is demonstrated, not assumed from multiple agents.
check(/DEMONSTRATED/.test(EI.EVALUATOR_INDEPENDENCE_CONTRACT.invariants.join(" ")), "contract states independence is DEMONSTRATED, not assumed (§49)");

console.log(failures === 0 ? "ALL PASS — V12.4 §36/§49 EVALUATOR INDEPENDENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
