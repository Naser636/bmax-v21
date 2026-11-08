#!/usr/bin/env node
"use strict";

/*
 * WI-P10-19 — compliance-scenario. Locks: identify deny-by-default, risk classification, obligation GAP
 * detection, anti-overclaim reuse (certification claims refused), verdict ALWAYS NOT_CERTIFIED, verifier
 * independence, determinism. Pure. Run: node_modules/.bin/tsx runtime/core/compliance-scenario.test.ts
 */
const assert = require("assert");
const C = require("./compliance-scenario");

let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }

console.log("WI-P10-19 — COMPLIANCE SCENARIO");

// deny-by-default identify
check(C.runComplianceScenario({}).status === "INSUFFICIENT", "no system ⇒ INSUFFICIENT (deny-by-default)");
// risk classification
check(C.classifyRisk({ aiRole: "high-risk biometric" }).tier === "HIGH", "high-risk role ⇒ HIGH");
check(C.classifyRisk({ aiRole: "social scoring" }).tier === "PROHIBITED", "prohibited role ⇒ PROHIBITED");
check(C.classifyRisk({}).tier === "UNDETERMINED", "no aiRole ⇒ UNDETERMINED");

// obligations GAP + verdict NOT_CERTIFIED always
{
  const r = C.runComplianceScenario({
    system: { name: "SysA", aiRole: "high-risk" },
    obligations: [{ id: "O1", required: true, evidenceRefs: ["ev1"] }, { id: "O2", required: true, evidenceRefs: [] }, { id: "O3", required: false }],
    claims: ["We prepared a risk assessment", "SysA is ISO 27001 certified", "We achieved certification"],
  });
  check(r.verdict === "NOT_CERTIFIED", "verdict ALWAYS NOT_CERTIFIED (software assistance)");
  check(r.status === "GAPS" && JSON.stringify(r.gaps) === JSON.stringify(["O2"]), "required obligation without evidence ⇒ GAP O2");
  check(r.obligations.find((o: any) => o.id === "O1").state === "MET" && r.obligations.find((o: any) => o.id === "O3").state === "NOT_APPLICABLE", "O1 MET, O3 NOT_APPLICABLE");
  check(r.refusedClaims.includes("SysA is ISO 27001 certified") && r.refusedClaims.includes("We achieved certification"), "anti-overclaim refuses certification claims (reuses hardened assertNotCertified)");
  check(!r.refusedClaims.includes("We prepared a risk assessment"), "legitimate factual claim NOT refused");
  check(r.verifierIndependent === true, "verifier independent of the subject");
}

// prohibited ⇒ BLOCKED
check(C.runComplianceScenario({ system: { name: "S", aiRole: "manipulative social scoring" } }).status === "BLOCKED_PROHIBITED", "prohibited practice ⇒ BLOCKED_PROHIBITED");

// clean ⇒ READY_FOR_REVIEW (still NOT_CERTIFIED)
{
  const r = C.runComplianceScenario({ system: { name: "S", aiRole: "limited chatbot" }, obligations: [{ id: "O1", required: true, evidenceRefs: ["e"] }], claims: [] });
  check(r.status === "READY_FOR_REVIEW" && r.verdict === "NOT_CERTIFIED", "all obligations met ⇒ READY_FOR_REVIEW, still NOT_CERTIFIED");
}

// determinism
check(JSON.stringify(C.runComplianceScenario({ system: { name: "S", aiRole: "high-risk" } })) === JSON.stringify(C.runComplianceScenario({ system: { name: "S", aiRole: "high-risk" } })), "deterministic scenario");

console.log(failures === 0 ? "ALL PASS — WI-P10-19 COMPLIANCE SCENARIO" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

// Module-scope marker (TS2451/TS2588 guard).
export {};
