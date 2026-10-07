#!/usr/bin/env node
"use strict";

/*
 * V5 Stage 2 — PATCH → ACTION CONTRACT compiler + admission bridge (live wiring of action-gate.js).
 *
 * The Patch Executor's `edits` branch is the one CONSEQUENTIAL WRITE path (it mutates files under
 * authorized_paths). FICHE_01 §13/§15 require an admission decision (STATE→CONTRACT→POLICY→AUTHORITY)
 * BEFORE that mutation. This module compiles a truthful Action Contract (FICHE_07 §6) for a WRITE edit
 * from the data actually available at patch-execution, then runs action-gate.evaluateAction.
 *
 * TWO HARD RULES (FICHE_01):
 *   1. authorized_paths is SCOPE, never AUTHORITY. authority/contract/policy are taken ONLY from explicit
 *      action-contract fields on the patch — they are NEVER derived from the fact that a path is in
 *      authorized_paths. A legacy patch that declares no authority therefore carries no authority, and
 *      the gate DENIES it (deny-by-default) — it is NOT silently granted.
 *   2. No fabricated evidence / no manufactured authority.
 *
 * OBSERVE-THEN-ENFORCE (backward compatibility):
 *   - A patch is ENFORCED when it declares an explicit Action Contract (authority present) OR the plan
 *     opts in (plan.enforceActionGate === true) OR env ODG_ENFORCE_ACTION_GATE=1. Under enforcement a
 *     non-ALLOW decision BLOCKS the mutation.
 *   - Otherwise the patch is OBSERVED: the gate decision is still computed and recorded as audit
 *     evidence (truthfully, typically DENY "no authority"), but the legacy WRITE still executes so
 *     existing valid pipelines are not bricked. The `enforced:false` flag makes this visible — it is an
 *     audited compatibility state, never a hidden bypass and never a success claim.
 *
 * Pure except for reading process.env (enforcement opt-in); no disk writes, no clock, no randomness.
 */

const { evaluateAction } = require("./action-gate");

// Compile a truthful Action Contract for ONE WRITE edit. Explicit fields may live on `patch.actionContract`
// or directly on the patch; derivable identity/scope/class/reversibility are filled from real data.
// authority / contract / policy are read ONLY from explicit fields (never from authorized_paths).
function compileActionContract(patch, edit, plan) {
  const p = patch && typeof patch === "object" ? patch : {};
  const ac = p.actionContract && typeof p.actionContract === "object" ? p.actionContract : {};
  const pick = (k) => (ac[k] !== undefined ? ac[k] : p[k]);
  const authorizedPaths = plan && Array.isArray(plan.authorizedPaths) ? plan.authorizedPaths : [];
  return {
    principal: pick("principal") || "odg-runtime", // the executing principal (truthful, not an authority grant)
    verb: pick("verb") || p.action || "WRITE",
    target: edit && typeof edit.target === "string" ? edit.target : "",
    scope: authorizedPaths, // SCOPE only — explicitly NOT authority
    actionClass: pick("actionClass") || "WRITE",
    // Governance dimensions — explicit ONLY. undefined for a legacy patch ⇒ gate DENY (never granted).
    authority: pick("authority"),
    contract: pick("contract"),
    policy: pick("policy"),
    criticality: pick("criticality"),
    risk: pick("risk"),
    // A file write is normally git-compensable (R1) unless the patch declares otherwise; never silently R0.
    reversibility: pick("reversibility") || "R1",
    expectedTransition: pick("expectedTransition"),
    idempotencyKey: pick("idempotencyKey"),
    expectedEvidence: pick("expectedEvidence"),
    acceptance: pick("acceptance"),
    recovery: pick("recovery"),
  };
}

// True when the patch carries an explicit Action Contract (so enforcement is appropriate).
function hasExplicitActionContract(patch) {
  if (!patch || typeof patch !== "object") return false;
  if (patch.actionContract && typeof patch.actionContract === "object") return true;
  return patch.authority !== undefined; // an explicitly-declared authority = an action-contract patch
}

// Classify a non-ALLOW gate decision as RESUMABLE (a legitimate authorization that is simply not granted
// YET — the action can proceed once a human/operator supplies it) vs a HARD refusal (a contract/policy/
// state defect, a malformed action, a MISUSED authority — expired/cross-mission/revoked — or an ESCALATE
// for an irreversible/high-risk action). The RESUMABLE class is the ONLY one that may be recorded as a
// per-action BLOCKED (⇒ PARTIAL, resumable); everything else stays a FAILED action (⇒ total BLOCKED).
// This keeps least-privilege intact: permission reuse (expired/cross-mission/revoked) is NEVER rescued
// into a friendly resumable state, and an irreversible/high-risk ESCALATE fails CLOSED (zero mutation,
// hard stop) exactly as before — matching the mission scenario, which is "the requested authorization /
// capability is UNAVAILABLE (absent)", not escalation of a dangerous action.
//   - DENY whose SOLE deficiency is authority ABSENCE ("no authority") ⇒ resumable (not yet granted).
//   - ESCALATE (irreversible / high-risk needs human authority)        ⇒ hard (unchanged fail-closed).
//   - any other DENY (incl. expired/cross-mission/revoked authority)   ⇒ hard.
function classifyRefusal(gate) {
  if (!gate || gate.decision === "ALLOW") return { refused: false, resumable: false, reason: null };
  if (gate.decision === "ESCALATE") {
    const reasons = (gate.escalation && gate.escalation.reasons) || [];
    return { refused: true, resumable: false, reason: "requires human authority: " + reasons.join("; ") };
  }
  // DENY. Resumable only when the authority is simply ABSENT and no other dimension / identity failed.
  const c = gate.checks || {};
  const authAbsent = !!(c.authority && c.authority.ok === false && c.authority.detail === "no authority");
  const othersOk = !!(c.state && c.state.ok && c.contract && c.contract.ok && c.policy && c.policy.ok);
  const dimPrefixes = ["STATE:", "CONTRACT:", "POLICY:", "AUTHORITY:"];
  const nonDimViolations = (gate.violations || []).filter((v) => !dimPrefixes.some((p) => v.startsWith(p)));
  const resumable = authAbsent && othersOk && nonDimViolations.length === 0;
  return {
    refused: true,
    resumable,
    reason: resumable ? "authority not yet granted for this action" : (gate.violations || []).join("; "),
  };
}

// Admit a WRITE edit: compile the Action Contract and evaluate the gate. Returns a decision record with
// `enforced` (whether a non-ALLOW must block) alongside the raw gate result. Never mutates anything.
// The gate ctx carries the CURRENT mission identity (plan.mission) and an injected clock (plan.now,
// epoch ms) so the gate can reject cross-mission and expired authority reuse — both inert when the
// comparand is absent (the gate never invents a mission id or a clock). `refusal` classifies a non-ALLOW
// for the executor: resumable ⇒ per-action BLOCKED; hard ⇒ FAILED.
function admitPatchEdit(patch, edit, plan, env) {
  const e = env && typeof env === "object" ? env : (typeof process !== "undefined" ? process.env : {});
  const action = compileActionContract(patch, edit, plan);
  const ctx = {};
  if (plan && Array.isArray(plan.allowedPolicies)) ctx.allowedPolicies = plan.allowedPolicies;
  if (plan && Array.isArray(plan.revokedAuthorities)) ctx.revokedAuthorities = plan.revokedAuthorities;
  if (plan && typeof plan.mission === "string" && plan.mission) ctx.missionId = plan.mission;
  if (plan && Number.isFinite(plan.now)) ctx.now = plan.now;
  const gate = evaluateAction(action, ctx);
  const enforce =
    hasExplicitActionContract(patch) ||
    (plan && plan.enforceActionGate === true) ||
    (e && e.ODG_ENFORCE_ACTION_GATE === "1");
  return {
    target: action.target,
    decision: gate.decision,
    enforced: enforce === true,
    violations: gate.violations,
    escalation: gate.escalation,
    checks: gate.checks,
    refusal: classifyRefusal(gate),
  };
}

module.exports = { compileActionContract, hasExplicitActionContract, admitPatchEdit, classifyRefusal };
