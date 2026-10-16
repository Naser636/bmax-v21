#!/usr/bin/env node
"use strict";

/*
 * INCIDENT TRIAGE (§V S3) — hermetic proof that the consumer INTEGRATES A (assess) + B (propose) end-to-end,
 * propose-only. All authorities are INJECTED fakes ⇒ NO real self-diagnostic / root-cause-engine / action-gate
 * is touched, NO fs / process / network. Proves: never fabricate a cause (INCONCLUSIVE ⇒ no proposal);
 * DIAGNOSED ⇒ B consulted; deny-by-default (action gate is the sole authority); scope confinement; A→B
 * linkage (incidentId + evidenceRefs flow); and — critically — the applier is NEVER invoked (propose-only).
 *
 * Run: node_modules/.bin/tsx src/runtime/incident-triage.test.ts
 */

const path = require("path");
const REPO = process.cwd();
const { triage } = require(path.join(REPO, "src", "runtime", "incident-triage.ts"));

let failures = 0;
const check = (c: boolean, l: string) => { if (c) console.log(`  PASS ${l}`); else { failures++; console.log(`  FAIL ${l}`); } };

console.log("INCIDENT TRIAGE (§V S3) — hermetic integration proof");

// Fake A seam (runtime-divergence): DIAGNOSED when divergences present, else none.
const diagnosedRuntime = { runtimeDiagnose: () => ({ divergences: [{ check: "build-gate", candidateCauses: ["stale dep"], smallestDiscriminatingCheck: "npm ci" }] }) };
const cleanRuntime = { runtimeDiagnose: () => ({ divergences: [] }) };
// Fake B seams.
const allow = { authorize: () => ({ decision: "ALLOW", reason: "authorized" }) };
const deny = { authorize: () => ({ decision: "DENY", reason: "no authority" }) };
// An applier that MUST never run in propose-only mode (throws if invoked).
let applierCalls = 0;
const allowWithApplier = { authorize: () => ({ decision: "ALLOW", reason: "authorized" }), applier: () => { applierCalls++; throw new Error("applier invoked — propose-only violated"); } };

const runtimeIncident = { incidentId: "INC-1", failureClass: "runtime-divergence", evidenceRefs: ["runtime/generated/x.json"] };
const inScopeRem = { writeSet: ["runtime/core/x.ts"], authorizedPaths: ["runtime/core/"], action: { principal: "human", verb: "fix", target: "runtime/core/x.ts" } };

// (1) stable incidentId required
let threw = false; try { triage({ incident: { failureClass: "runtime-divergence" } } as any); } catch { threw = true; }
check(threw, "missing incidentId ⇒ throws (stable id required)");

// (2) INCONCLUSIVE ⇒ B never consulted, proposal null
const t2 = triage({ incident: runtimeIncident }, { rootCause: cleanRuntime, remediation: deny });
check(t2.assessment.verdict === "INCONCLUSIVE" && t2.proposal === null, "no divergence ⇒ INCONCLUSIVE + NO proposal (never remediate an inconclusive cause)");
check(t2.applied === false && t2.mode === "PROPOSE_ONLY", "INCONCLUSIVE result still applied:false / PROPOSE_ONLY");

// (3) DIAGNOSED but no remediation input ⇒ B BLOCKED on empty write-set (honest), applied:false
const t3 = triage({ incident: runtimeIncident }, { rootCause: diagnosedRuntime, remediation: allow });
check(t3.assessment.verdict === "DIAGNOSED", "divergence ⇒ A DIAGNOSED");
check(t3.proposal && t3.proposal.decision === "BLOCKED" && t3.proposal.applied === false, "DIAGNOSED + empty write-set ⇒ B BLOCKED, applied:false");

// (4) DIAGNOSED + in-scope write-set + gate ALLOW ⇒ B PROPOSED (propose-only)
const t4 = triage({ incident: runtimeIncident, remediation: inScopeRem }, { rootCause: diagnosedRuntime, remediation: allow });
check(t4.proposal && t4.proposal.decision === "PROPOSED" && t4.proposal.applied === false && t4.proposal.mode === "PROPOSE_ONLY", "DIAGNOSED + in-scope + ALLOW ⇒ B PROPOSED, applied:false");
// A→B linkage
check(t4.proposal.incidentId === "INC-1" && JSON.stringify(t4.proposal.evidenceRefs) === JSON.stringify(["runtime/generated/x.json"]), "A→B linkage: incidentId + evidenceRefs flow from assessment into proposal");

// (5) DIAGNOSED + out-of-scope write-set ⇒ B REFUSED (scope is not authority)
const t5 = triage({ incident: runtimeIncident, remediation: { writeSet: ["src/secret.ts"], authorizedPaths: ["runtime/core/"], action: inScopeRem.action } }, { rootCause: diagnosedRuntime, remediation: allow });
check(t5.proposal && t5.proposal.decision === "REFUSED" && t5.proposal.outOfScope.includes("src/secret.ts"), "out-of-scope write-set ⇒ B REFUSED (deny-by-default on scope)");

// (6) DIAGNOSED + gate DENY ⇒ B REFUSED (action gate is the sole authority)
const t6 = triage({ incident: runtimeIncident, remediation: inScopeRem }, { rootCause: diagnosedRuntime, remediation: deny });
check(t6.proposal && (t6.proposal.decision === "REFUSED" || t6.proposal.decision === "BLOCKED") && t6.proposal.authorization.decision === "DENY", "gate DENY ⇒ B not PROPOSED (deny-by-default; confidence never authorizes)");

// (7) PROPOSE-ONLY: the applier is NEVER invoked even on a PROPOSED path
const t7 = triage({ incident: runtimeIncident, remediation: inScopeRem }, { rootCause: diagnosedRuntime, remediation: allowWithApplier });
check(t7.proposal.decision === "PROPOSED" && applierCalls === 0 && t7.applied === false, "applier NEVER invoked on PROPOSED (propose-only guaranteed)");

// (8) release-gate class via injected fake ⇒ DIAGNOSED with evidenceFile added to evidenceRefs
const t8 = triage(
  { incident: { incidentId: "INC-2", failureClass: "release-gate" }, remediation: inScopeRem },
  { rootCause: { releaseGateDiagnose: () => ({ status: "DIAGNOSED", rootCause: { gate: "build", responsibleComponent: { evidenceProducer: "build", decisionAuthority: "release-mgr", evidenceFile: "runtime/generated/build.json" } } }) }, remediation: allow }
);
check(t8.assessment.verdict === "DIAGNOSED" && t8.assessment.authority === "root-cause-engine" && t8.proposal.decision === "PROPOSED", "release-gate class ⇒ A DIAGNOSED via root-cause-engine ⇒ B PROPOSED");

console.log(failures === 0 ? "ALL PASS — incident-triage (§V S3)" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

// Module-scope marker (adds NO export): forces TypeScript MODULE scope (no global-script collisions).
export {};
