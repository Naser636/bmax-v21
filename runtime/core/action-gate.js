#!/usr/bin/env node

"use strict";

/*
 * V5 STAGE 2 — ACTION / CONTRACT / POLICY GATE (deterministic admission gate).
 *
 * Canonical requirement (ODG_FINAL_MASTER_V5_FICHE_01.md §13 Authority Model, lines 105-108):
 *     "No authority: → no consequential action.
 *      No valid state: → no consequential claim.
 *      No valid contract: → no contractual claim.
 *      No compatible policy: → no action."
 * and the Universal Resolution Loop (FICHE_01 §15, line 132) runs the admission checks BEFORE execution:
 *     ... CHECK STATE → CHECK CONTRACT → CHECK POLICY → CHECK AUTHORITY → ... → EXECUTE ...
 * The Action Contract fields and classes are FICHE_07 §6; the reversibility ladder R0–R4 is FICHE_07 §11;
 * human authority for irreversible / high-risk / critical actions is FICHE_01 §13/§14.
 *
 * Phase 0 established the data (mission-loader transports plan.policies / plan.contract) and REACTIVE
 * scope observation (scope-observer runs AFTER a write). What was MISSING is the deterministic ADMISSION
 * decision: given a consequential action, evaluate STATE + CONTRACT + POLICY + AUTHORITY and return
 * ALLOW / DENY / ESCALATE — deny-by-default — so "no action may become authorized merely because it can
 * technically execute" (ODG_V5_ROADMAP_WITH_WORK_METHOD.md:1061).
 *
 * This module is that gate: a pure, deterministic `evaluateAction(action, context)`. It creates NO new
 * primitive/kernel/second state source — it composes the EXISTING Stage-1 canonical-state validator
 * (state-transition.validateStateTransition) for the STATE check and the transported contract/policy
 * data for the others. Additive and standalone, in the style of state-transition.js / scope-observer.js
 * (pure core + a read-only require.main CLI that only prints the contract descriptor). Wiring the gate
 * into the live execution point (before patch-executor WRITE) is a SEPARATE next increment — this step
 * proves the gate in isolation first.
 *
 * NOT a mission SUCCESS verdict and NOT a done_when proof; it is the ADMISSION decision for ONE action.
 */

const { validateStateTransition } = require("./state-transition");

// ---- Controlled vocabulary (frozen, FICHE_07 §6 / §11) ----------------------------------------
const ACTION_CLASSES = Object.freeze([
  "READ", "ANALYZE", "GENERATE", "WRITE", "COMMUNICATE", "TRANSACT", "DELETE", "IRREVERSIBLE",
]);
// Consequential = mutates external/canonical state or has outward effect ⇒ full admission required.
// READ / ANALYZE / GENERATE are observational/proposal-only ⇒ not gated on authority/contract/policy.
const CONSEQUENTIAL_CLASSES = Object.freeze(["WRITE", "COMMUNICATE", "TRANSACT", "DELETE", "IRREVERSIBLE"]);
// Classes that ALWAYS require human authority (FICHE_01 §13: irreversibility / capital / material).
const HUMAN_REQUIRED_CLASSES = Object.freeze(["DELETE", "TRANSACT", "IRREVERSIBLE"]);
const REVERSIBILITY = Object.freeze(["R0", "R1", "R2", "R3", "R4"]); // R0 fully reversible … R4 irreversible.
const HUMAN_REQUIRED_REVERSIBILITY = Object.freeze(["R3", "R4"]);     // hard-to-reverse / irreversible.
const HIGH_LEVELS = Object.freeze(["HIGH", "CRITICAL"]);
const DECISION = Object.freeze({ ALLOW: "ALLOW", DENY: "DENY", ESCALATE: "ESCALATE" });

// The four admission dimensions, in Universal-Resolution-Loop order.
const ADMISSION_DIMENSIONS = Object.freeze(["state", "contract", "policy", "authority"]);
// Identity fields every action must declare (FICHE_07 §6).
const IDENTITY_FIELDS = Object.freeze(["principal", "verb", "target"]);

const ACTION_CONTRACT = Object.freeze({
  id: "V5-STAGE2-ACTION-GATE",
  source: "FICHE_01 §13/§15, FICHE_07 §6/§11",
  loop: "CHECK STATE -> CHECK CONTRACT -> CHECK POLICY -> CHECK AUTHORITY -> (EXECUTE)",
  actionClasses: ACTION_CLASSES,
  consequentialClasses: CONSEQUENTIAL_CLASSES,
  reversibility: REVERSIBILITY,
  decisions: Object.freeze(Object.values(DECISION)),
  denyByDefault: true,
  rules: Object.freeze([
    "no authority => DENY consequential action",
    "no valid contract => DENY consequential action",
    "no compatible policy => DENY consequential action",
    "invalid/absent expected state transition => DENY consequential action",
    "irreversible (R3/R4) or DELETE/TRANSACT/IRREVERSIBLE or HIGH/CRITICAL risk/criticality => ESCALATE unless explicit human authority",
    "observational READ/ANALYZE/GENERATE => ALLOW when well-formed (not gated on authority/contract/policy)",
    "deterministic / pure",
  ]),
});

// ---- Type guards (shared style with state-transition.js) --------------------------------------
function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}
// A governance reference (authority / contract / policy) is "present" when it is a non-empty string
// or a non-empty object — identity alone is never authority, so emptiness is never a grant.
function isPresent(v) {
  if (isNonEmptyString(v)) return true;
  if (isPlainObject(v)) return Object.keys(v).length > 0;
  return false;
}
function policyKey(p) {
  if (isNonEmptyString(p)) return p;
  if (isPlainObject(p) && isNonEmptyString(p.id)) return p.id;
  if (isPlainObject(p) && isNonEmptyString(p.name)) return p.name;
  return null;
}
function authorityKey(a) {
  if (isNonEmptyString(a)) return a;
  if (isPlainObject(a) && isNonEmptyString(a.id)) return a.id;
  if (isPlainObject(a) && isNonEmptyString(a.principal)) return a.principal;
  return null;
}

// ---- The gate ---------------------------------------------------------------------------------
/**
 * evaluateAction(action, context) -> frozen decision record.
 *   decision      ALLOW | DENY | ESCALATE  (precedence: DENY > ESCALATE > ALLOW).
 *   actionClass   the recognized class, or null.
 *   consequential whether the class mutates state / has outward effect.
 *   checks        { state, contract, policy, authority }, each { ok, detail }.
 *   violations    deterministically-ordered reasons that force DENY (empty unless DENY).
 *   escalation    { required, reasons } — human-authority triggers (reasons present even when granted).
 *   evidence      the decision record used as the gate's evidence artifact (no I/O here).
 *
 * context (all optional):
 *   allowedPolicies   string[] — policy keys the current governance permits; when present, a
 *                     consequential action's policy MUST be a member ("no COMPATIBLE policy => no action").
 *   revokedAuthorities string[] — authority keys that are revoked/insufficient ⇒ DENY.
 *
 * Pure: no clock, no randomness, no I/O. Same (action, context) ⇒ same decision, always. Deny-by-default.
 */
function evaluateAction(action, context) {
  const ctx = isPlainObject(context) ? context : {};

  if (!isPlainObject(action)) {
    return Object.freeze({
      decision: DECISION.DENY,
      actionClass: null,
      consequential: false,
      checks: Object.freeze({}),
      violations: Object.freeze(["action: must be a non-null object"]),
      escalation: Object.freeze({ required: false, reasons: Object.freeze([]) }),
      evidence: Object.freeze({ decision: DECISION.DENY, reason: "malformed action" }),
    });
  }

  const violations = [];

  // Identity (FICHE_07 §6) — required for every action; absence is a malformed, non-admissible action.
  for (const f of IDENTITY_FIELDS) {
    if (!isNonEmptyString(action[f])) violations.push(f + ": required non-empty string");
  }

  const cls = action.actionClass;
  const classKnown = ACTION_CLASSES.includes(cls);
  if (!classKnown) {
    violations.push("actionClass: required one of " + ACTION_CLASSES.join(", "));
  }
  const consequential = classKnown && CONSEQUENTIAL_CLASSES.includes(cls);

  // ---- Admission checks, in Universal-Resolution-Loop order: STATE -> CONTRACT -> POLICY -> AUTHORITY.
  // Enforced (can fail) only for consequential actions; recorded as "not required" otherwise.
  const checks = {};

  // CHECK STATE — reuse the Stage-1 canonical-state validator (no second state source).
  if (action.expectedTransition !== undefined && action.expectedTransition !== null) {
    const v = validateStateTransition(action.expectedTransition);
    checks.state = { ok: v.ok, detail: v.ok ? "expected transition valid (C03)" : ("invalid expected transition: " + (v.errors[0] || "unknown")) };
  } else if (consequential) {
    checks.state = { ok: false, detail: "consequential action declares no expectedTransition" };
  } else {
    checks.state = { ok: true, detail: "no state transition required" };
  }

  // CHECK CONTRACT.
  checks.contract = consequential
    ? { ok: isPresent(action.contract), detail: isPresent(action.contract) ? "contract present" : "no valid contract" }
    : { ok: true, detail: "no contract required" };

  // CHECK POLICY — present AND compatible with the context's allowed set when one is supplied.
  if (!consequential) {
    checks.policy = { ok: true, detail: "no policy required" };
  } else if (!isPresent(action.policy)) {
    checks.policy = { ok: false, detail: "no policy declared" };
  } else if (Array.isArray(ctx.allowedPolicies) && !ctx.allowedPolicies.includes(policyKey(action.policy))) {
    checks.policy = { ok: false, detail: "policy not compatible with context governance" };
  } else {
    checks.policy = { ok: true, detail: "policy present and compatible" };
  }

  // CHECK AUTHORITY — declared, and not revoked by context.
  if (!consequential) {
    checks.authority = { ok: true, detail: "no authority required (observational action)" };
  } else if (!isPresent(action.authority)) {
    checks.authority = { ok: false, detail: "no authority" };
  } else if (Array.isArray(ctx.revokedAuthorities) && ctx.revokedAuthorities.includes(authorityKey(action.authority))) {
    checks.authority = { ok: false, detail: "authority revoked/insufficient in context" };
  } else {
    checks.authority = { ok: true, detail: "authority declared" };
  }

  // Deny-by-default: any failed admission dimension (consequential actions) forces DENY, in loop order.
  for (const dim of ADMISSION_DIMENSIONS) {
    if (!checks[dim].ok) violations.push(dim.toUpperCase() + ": " + checks[dim].detail);
  }

  // ---- Escalation: human authority is REQUIRED for irreversible / high-risk / critical actions
  // (FICHE_01 §13/§14), unless the action carries explicit human authority (authority.human === true).
  const reasons = [];
  if (classKnown && HUMAN_REQUIRED_CLASSES.includes(cls)) reasons.push("action class " + cls + " requires human authority");
  if (HUMAN_REQUIRED_REVERSIBILITY.includes(action.reversibility)) reasons.push("reversibility " + action.reversibility + " requires human authority");
  if (HIGH_LEVELS.includes(action.criticality)) reasons.push("criticality " + action.criticality + " requires human authority");
  if (HIGH_LEVELS.includes(action.risk)) reasons.push("risk " + action.risk + " requires human authority");
  const humanGranted = isPlainObject(action.authority) && action.authority.human === true;
  const escalationRequired = reasons.length > 0 && !humanGranted;

  // Decision precedence: a malformed / unauthorized action is DENIED before any escalation is considered.
  let decision;
  if (violations.length > 0) decision = DECISION.DENY;
  else if (escalationRequired) decision = DECISION.ESCALATE;
  else decision = DECISION.ALLOW;

  return Object.freeze({
    decision,
    actionClass: classKnown ? cls : null,
    consequential,
    checks: Object.freeze(checks),
    violations: Object.freeze(violations),
    escalation: Object.freeze({ required: escalationRequired, reasons: Object.freeze(reasons) }),
    evidence: Object.freeze({
      principal: isNonEmptyString(action.principal) ? action.principal : null,
      verb: isNonEmptyString(action.verb) ? action.verb : null,
      target: isNonEmptyString(action.target) ? action.target : null,
      actionClass: classKnown ? cls : null,
      authorityBasis: authorityKey(action.authority),
      decision,
      checks: Object.freeze({
        state: checks.state.ok, contract: checks.contract.ok, policy: checks.policy.ok, authority: checks.authority.ok,
      }),
    }),
  });
}

module.exports = {
  ACTION_CLASSES,
  CONSEQUENTIAL_CLASSES,
  HUMAN_REQUIRED_CLASSES,
  REVERSIBILITY,
  DECISION,
  ACTION_CONTRACT,
  evaluateAction,
};

// ---- Read-only CLI: prints the contract descriptor; mutates nothing. --------------------------
if (require.main === module) {
  process.stdout.write(JSON.stringify(ACTION_CONTRACT, null, 2) + "\n");
}
