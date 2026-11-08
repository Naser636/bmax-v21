#!/usr/bin/env node
"use strict";
const assert = require("assert");
const D = require("./deployment-readiness");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("P5 — DEPLOYMENT READINESS (local, no deployment)");

function fullEvidence(over?: any): any {
  return Object.assign({
    config: { DB_URL: "x", PORT: "8080" }, requiredConfig: ["DB_URL", "PORT"],
    build: { reproducible: true, lockfilePinned: true },
    dependencies: { resolved: true, unresolved: [] },
    artifacts: [{ present: true, sha256: "abc123" }],
    tests: { passed: true, exitCode: 0 },
    security: { sbom: true, secretsScanned: true, licensesOk: true },
    observability: { traces: true, metrics: true, logs: true },
    rollback: { planPresent: true, tested: true },
    integrity: true,
    sourceCommit: "deadbeef", evidenceRefs: ["ev1"],
    env: { NODE_ENV: "production" }, requiredEnv: ["NODE_ENV"],
  }, over || {});
}

// full evidence ⇒ READY.
{
  const r = D.evaluateReadiness(fullEvidence());
  check(r.state === "READY" && r.ready === true && r.blockers.length === 0 && r.deployed === false, "full evidence ⇒ READY (and nothing deployed)");
}

// deny-by-default: empty evidence ⇒ NOT_READY with all 11 blockers.
{
  const r = D.evaluateReadiness({});
  check(r.state === "NOT_READY" && r.blockers.length === 11, "empty evidence ⇒ NOT_READY (all 11 controls blocked, fail-closed)");
}

// each single missing control ⇒ NOT_READY with that specific blocker.
{
  const cases: any = {
    config: { requiredConfig: [] },
    reproducibility: { build: { reproducible: false, lockfilePinned: true } },
    dependencies: { dependencies: { resolved: true, unresolved: ["left-pad"] } },
    artifacts: { artifacts: [{ present: true }] }, // missing sha256
    tests: { tests: { passed: true, exitCode: 1 } },
    security: { security: { sbom: true, secretsScanned: false, licensesOk: true } },
    observability: { observability: { traces: true, metrics: false, logs: true } },
    rollback: { rollback: { planPresent: true, tested: false } },
    integrity: { integrity: false },
    traceability: { evidenceRefs: [] },
    envPrereqs: { requiredEnv: [] },
  };
  for (const control of Object.keys(cases)) {
    const r = D.evaluateReadiness(fullEvidence(cases[control]));
    check(r.ready === false && r.blockers.includes(control), `missing ${control} ⇒ NOT_READY (blocker: ${control})`);
  }
}

// integrity via a provenance stamp: a verified stamp passes; the absence of both stamp and flag fails.
{
  const stamped = require("./evidence-provenance").stampProvenance({ x: 1 }, { at: "t", sourceRevision: "r" });
  const r = D.evaluateReadiness(fullEvidence({ integrity: undefined, provenanceStamp: stamped }));
  check(r.checks.integrity.ok === true, "integrity passes when a verifiable provenance stamp is supplied");
  const tampered = { ...stamped, x: 2 };
  check(D.evaluateReadiness(fullEvidence({ integrity: undefined, provenanceStamp: tampered })).checks.integrity.ok === false, "a tampered provenance stamp ⇒ integrity FAILS");
}

console.log(failures === 0 ? "ALL PASS — P5 DEPLOYMENT READINESS" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
