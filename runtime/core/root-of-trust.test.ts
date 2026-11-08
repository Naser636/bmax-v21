#!/usr/bin/env node
"use strict";
const assert = require("assert");
const RT = require("./root-of-trust");
const EP = require("./evidence-provenance");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V12.4 §10-§11 — ROOT OF TRUST / G0 (tamper tests)");

function validTransition(): any {
  return { state_before: { phase: "P0", missions_open: 2 }, action: { type: "RECORD_TRANSITION", by: "C03-contract" }, observed_effect: { missions_open: 1 }, state_after: { phase: "P0", missions_open: 1 }, state_version_before: 7, state_version_after: 8, difference: { missions_open: { before: 2, after: 1 } }, evidence_refs: ["ev1"], verification_status: "RECORDED" };
}
const fullAdmission = { expectedTransition: validTransition(), contract: { id: "c1" }, policy: { id: "p1" }, authority: { mission: "m1" } };

// protected-target recognition.
check(RT.isProtectedTarget("runtime/governance/ROADMAP.json") === true && RT.isProtectedTarget("runtime/constitution/runtime-constitution.json") === true && RT.isProtectedTarget("runtime/policies/x.json") === true, "G0 perimeter recognizes governance/constitution/policies paths");
check(RT.isProtectedTarget("runtime/core/frontier-radar.ts") === false, "a normal source path is NOT in the G0 perimeter");

// (1) protected change, NO authorization ⇒ BLOCKED (detectable + traceable).
{
  const r = RT.admitGovernanceChange({ actor: "agent-x", target: "runtime/governance/ROADMAP.json", actionClass: "WRITE" }, {});
  check(r.admitted === false && r.blocked === true && r.detectable === true && r.traceable === true && !!r.audit, "protected G0 change without authorization ⇒ BLOCKED (detectable+traceable)");
}
// (2) protected change, SELF authorization ⇒ BLOCKED (scope ≠ authority).
{
  const r = RT.admitGovernanceChange({ actor: "agent-x", target: "runtime/policies/p.json", actionClass: "WRITE", elevatedAuthorization: { by: "agent-x", approved: true } }, {});
  check(r.blocked === true && /self-authorization/.test(r.reason), "self-authorization of a protected change ⇒ BLOCKED");
  const r2 = RT.admitGovernanceChange({ actor: "agent-x", target: "runtime/policies/p.json", actionClass: "WRITE", elevatedAuthorization: { by: "odg", selfAuthored: true, approved: true } }, {});
  check(r2.blocked === true, "selfAuthored flag ⇒ BLOCKED");
}
// (3) protected change, EXTERNAL elevated authorization + full POLICY admission ⇒ ADMITTED.
{
  const r = RT.admitGovernanceChange({ actor: "agent-x", target: "runtime/governance/ROADMAP.json", actionClass: "WRITE", elevatedAuthorization: { by: "odg-cto", approved: true, admission: fullAdmission } }, {});
  check(r.admitted === true && r.policyDecision === "ALLOW" && r.protectedTarget === true, "protected change WITH external elevation + full POLICY admission ⇒ ADMITTED");
  // same external elevation but WITHOUT the POLICY admission ⇒ still DENY (consequential write needs admission).
  const r2 = RT.admitGovernanceChange({ actor: "agent-x", target: "runtime/governance/ROADMAP.json", actionClass: "WRITE", elevatedAuthorization: { by: "odg-cto", approved: true } }, {});
  check(r2.admitted === false, "external elevation alone (no POLICY admission) ⇒ still DENIED (deny-by-default)");
}
// (4) non-protected target follows POLICY (not G0-blocked).
{
  const r = RT.admitGovernanceChange({ actor: "agent-x", target: "runtime/core/x.ts", actionClass: "WRITE", elevatedAuthorization: { admission: fullAdmission } }, {});
  check(r.protectedTarget === false && r.blocked === false, "non-protected target is not G0-blocked (follows POLICY)");
}

// (5–11) the §11.2 tamper vectors — each on a protected target ⇒ BLOCKED, detectable, traceable.
{
  const pathVectors = ["DIRECT", "INDIRECT", "BY_AGENT", "BY_PROVIDER", "BY_TOOL", "BY_DEPENDENCY", "BY_CONFIG", "BY_CONTRACT", "BY_EVALUATOR"];
  for (const v of pathVectors) {
    const r = RT.classifyTamperAttempt({ vector: v, actor: "attacker", target: v === "BY_EVALUATOR" ? "baselines/eval.json" : v === "BY_CONFIG" ? "runtime/policies/p.json" : "runtime/governance/ROADMAP.json", actionClass: "WRITE" }, {});
    check(r.blocked === true && r.detectable === true && r.traceable === true, `tamper vector ${v} on a protected target ⇒ BLOCKED + detectable + traceable`);
  }
}
// BY_EVIDENCE_FALSIFICATION — a tampered provenance stamp is detected ⇒ refused; a valid stamp is not falsified.
{
  const stamped = EP.stampProvenance({ x: 1 }, { at: "t", sourceRevision: "r" });
  const tampered = { ...stamped, x: 2 };
  check(RT.classifyTamperAttempt({ vector: "BY_EVIDENCE_FALSIFICATION", provenanceStamp: tampered }, {}).blocked === true, "BY_EVIDENCE_FALSIFICATION: tampered provenance ⇒ DETECTED + refused");
  check(RT.classifyTamperAttempt({ vector: "BY_EVIDENCE_FALSIFICATION", provenanceStamp: stamped }, {}).blocked === false, "a genuine (untampered) provenance stamp is not flagged as falsification");
}
// BY_UNVERIFIED_RESTORATION — recovery from an unverified state refused; verified state allowed.
{
  check(RT.classifyTamperAttempt({ vector: "BY_UNVERIFIED_RESTORATION", verifiedState: false }, {}).blocked === true, "BY_UNVERIFIED_RESTORATION: restore from an unverified state ⇒ BLOCKED");
  check(RT.classifyTamperAttempt({ vector: "BY_UNVERIFIED_RESTORATION", verifiedState: true }, {}).blocked === false, "restore from a verified state ⇒ allowed");
}

// §11.1 protected invariants + perimeter are enumerated; G0 is not a tenth primitive; no second authorizer.
{
  check(RT.PROTECTED_INVARIANTS.some((i: any) => /nine primitives/.test(i)) && RT.PROTECTED_INVARIANTS.some((i: any) => /self-authorization/.test(i)), "G0 enumerates protected invariants (nine primitives, no self-authorization)");
  check(RT.TAMPER_VECTORS.length === 11, "all 11 §11.2 tamper vectors enumerated");
  check(RT.ROOT_OF_TRUST_CONTRACT.reuses.some((r: any) => /action-gate/.test(r)) && /not a tenth primitive/.test(RT.ROOT_OF_TRUST_CONTRACT.notAuthority), "G0 composes the single authorizer (action-gate); it is NOT a tenth primitive, no second authorizer");
}

console.log(failures === 0 ? "ALL PASS — V12.4 §10-§11 ROOT OF TRUST / G0" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
