#!/usr/bin/env node
"use strict";

/*
 * V5 Stage 2 — Action/Contract/Policy admission gate. Locks the canonical deny-by-default contract
 * (FICHE_01 §13 "no authority/state/contract/policy => no action"; FICHE_07 §6 action contract; §11
 * reversibility R0–R4). Pure/deterministic; reuses Stage-1 validateStateTransition for the STATE check.
 *
 * Run directly: node runtime/core/action-gate.test.js
 */
const { evaluateAction, DECISION } = require("./action-gate");

let failures = 0;
function check(cond, label) {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

// A valid C03 expected-transition record (per state-transition.js REQUIRED_FIELDS + invariants).
const VALID_TRANSITION = {
  state_before: { v: 1 }, action: { do: "write" }, observed_effect: { wrote: true },
  state_after: { v: 2 }, state_version_before: 1, state_version_after: 2,
  difference: { v: { before: 1, after: 2 } }, evidence_refs: [], verification_status: "RECORDED",
};
// A fully-admissible consequential WRITE (R0, fully reversible) — the ALLOW baseline.
const ALLOWED = () => ({
  principal: "odg", verb: "apply", target: "runtime/x.js", actionClass: "WRITE",
  authority: { id: "AUTH-1" }, contract: { id: "C-1" }, policy: "LOCAL_FIRST",
  reversibility: "R0", expectedTransition: VALID_TRANSITION,
});

console.log("V5 STAGE 2 — ACTION/CONTRACT/POLICY GATE");

// ALLOW baseline.
check(evaluateAction(ALLOWED(), {}).decision === DECISION.ALLOW, "fully-authorized reversible WRITE ⇒ ALLOW");

// DENY on each missing admission dimension (deny-by-default).
{
  const a = ALLOWED(); delete a.authority;
  const d = evaluateAction(a, {});
  check(d.decision === DECISION.DENY && d.violations.some((v) => v.startsWith("AUTHORITY")), "no authority ⇒ DENY");
}
{
  const a = ALLOWED(); delete a.contract;
  check(evaluateAction(a, {}).decision === DECISION.DENY, "no valid contract ⇒ DENY");
}
{
  const a = ALLOWED(); delete a.policy;
  check(evaluateAction(a, {}).decision === DECISION.DENY, "no policy declared ⇒ DENY");
}
{
  const a = ALLOWED(); // policy present but NOT in the context's allowed set ⇒ incompatible.
  const d = evaluateAction(a, { allowedPolicies: ["SOME_OTHER_POLICY"] });
  check(d.decision === DECISION.DENY && d.violations.some((v) => v.includes("not compatible")), "incompatible policy ⇒ DENY");
}
{
  const a = ALLOWED(); delete a.expectedTransition;
  check(evaluateAction(a, {}).decision === DECISION.DENY, "consequential action with no expectedTransition ⇒ DENY");
}
{
  const a = ALLOWED(); a.expectedTransition = { ...VALID_TRANSITION, state_version_after: 1 }; // not strictly advancing
  const d = evaluateAction(a, {});
  check(d.decision === DECISION.DENY && d.checks.state.ok === false, "invalid expected state transition ⇒ DENY");
}
// Compatible policy via context ⇒ ALLOW (positive control for the compatibility check).
check(evaluateAction(ALLOWED(), { allowedPolicies: ["LOCAL_FIRST"] }).decision === DECISION.ALLOW, "policy compatible with context ⇒ ALLOW");

// ESCALATE: irreversible / human-required, otherwise fully authorized.
{
  const a = { ...ALLOWED(), actionClass: "DELETE" };
  const d = evaluateAction(a, {});
  check(d.decision === DECISION.ESCALATE && d.escalation.required === true, "DELETE (human-required class) ⇒ ESCALATE");
}
{
  const a = { ...ALLOWED(), reversibility: "R4" };
  check(evaluateAction(a, {}).decision === DECISION.ESCALATE, "reversibility R4 (irreversible) ⇒ ESCALATE");
}
{
  const a = { ...ALLOWED(), reversibility: "R4", authority: { id: "AUTH-1", human: true } };
  check(evaluateAction(a, {}).decision === DECISION.ALLOW, "irreversible WITH explicit human authority ⇒ ALLOW");
}
{
  const a = { ...ALLOWED(), risk: "HIGH" };
  check(evaluateAction(a, {}).decision === DECISION.ESCALATE, "HIGH risk ⇒ ESCALATE");
}

// Deny precedence: an unauthorized irreversible action is DENIED, never escalated.
{
  const a = { ...ALLOWED(), actionClass: "DELETE" }; delete a.authority;
  check(evaluateAction(a, {}).decision === DECISION.DENY, "unauthorized + irreversible ⇒ DENY (deny precedence over escalate)");
}

// Observational classes are not gated on authority/contract/policy.
{
  const d = evaluateAction({ principal: "odg", verb: "read", target: "x", actionClass: "READ" }, {});
  check(d.decision === DECISION.ALLOW && d.consequential === false, "observational READ (no authority/contract/policy) ⇒ ALLOW");
}
check(evaluateAction({ principal: "odg", verb: "analyze", target: "x", actionClass: "ANALYZE" }, {}).decision === DECISION.ALLOW, "ANALYZE ⇒ ALLOW (observational)");

// Malformed actions ⇒ DENY.
check(evaluateAction(null, {}).decision === DECISION.DENY, "non-object action ⇒ DENY");
check(evaluateAction({ actionClass: "WRITE" }, {}).decision === DECISION.DENY, "missing identity fields ⇒ DENY");
check(evaluateAction({ principal: "o", verb: "v", target: "t", actionClass: "BOGUS" }, {}).decision === DECISION.DENY, "unknown action class ⇒ DENY");

// Determinism: identical input ⇒ identical decision + violations.
{
  const a = ALLOWED(); delete a.authority;
  const d1 = evaluateAction(a, {}); const d2 = evaluateAction(a, {});
  check(d1.decision === d2.decision && JSON.stringify(d1.violations) === JSON.stringify(d2.violations), "deterministic: same input ⇒ same decision + violations");
}

console.log(failures === 0 ? "ALL PASS — V5 STAGE 2 ACTION GATE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
