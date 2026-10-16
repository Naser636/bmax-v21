#!/usr/bin/env node
/*
 * BOUNDED REMEDIATION EXECUTOR (V63 Capability B) — a PROPOSE-ONLY composition, NOT a new engine/writer.
 *
 * It composes the EXISTING authorities via INJECTED seams — it creates NO second authorization, NO new
 * writer, NO tenth primitive:
 *   - the ACTION GATE (runtime/core/action-gate.js evaluateAction) is the ONLY authority that may ALLOW a
 *     consequential change (deny-by-default). A model's confidence NEVER authorizes anything.
 *   - the PATCH-EXECUTOR (runtime/core/patch-executor.js) is the ONLY authorized writer. Bounded Remediation
 *     NEVER writes directly and, by default, does NOT even invoke the applier: it PROPOSES a change for
 *     acceptance. No merge, no deploy, no autonomous apply.
 *
 * Contract (linked to Root-Cause Intelligence, Capability A):
 *   - accepts ONLY an assessment with verdict "DIAGNOSED", a stable incidentId, and ≥1 evidenceRef
 *     (sufficiently substantiated) — otherwise BLOCKED (never remediate an unproven/inconclusive cause).
 *   - produces a MINIMAL plan, an EXACT write-set, measurable success criteria and a rollback.
 *   - verifies initial state, pre-existing failures and dependencies BEFORE proposing.
 *   - REFUSES (no proposal) when: the write-set exceeds the authorized paths; the action gate is not ALLOW;
 *     a critical pre-check fails; or the reproducible tests fail.
 *   - post-fix tests feed learning but NEVER declare recurrence-avoided on local tests alone.
 *
 * Pure: no fs, no process, no clock. Authorization / state / tests / applier are all delegated to seams, so
 * it is unit-testable with synthetic verdicts and performs ZERO real effect itself.
 */

"use strict";

export type RemediationDecision = "PROPOSED" | "BLOCKED" | "REFUSED";

export interface RemediationInput {
  writeSet: string[];            // exact files the fix would touch
  authorizedPaths: string[];     // the mission's authorized scope (SCOPE, never AUTHORITY)
  plan?: string[];               // minimal ordered fix steps
  proposedDiff?: string;         // the PROPOSED unified diff (never applied here)
  rollback?: string;             // how to revert
  successCriteria?: string[];    // measurable acceptance checks
  action?: any;                  // the consequential action descriptor handed to the action gate
}

export interface RemediationSeams {
  // Delegate to action-gate.evaluateAction(action, context) ⇒ { decision: "ALLOW"|"DENY"|"ESCALATE", ... }.
  authorize(action: any, context: any): any;
  // Observe the repository state BEFORE any change ⇒ { clean, preexistingFailures, missingDeps }.
  checkInitialState?(input: RemediationInput): any;
  // Run the reproducible tests for the proposed fix ⇒ { pass, results }.
  runTests?(input: RemediationInput): any;
  // The ONLY authorized writer (patch-executor). Present for completeness; NOT invoked in PROPOSE-ONLY mode.
  applier?(input: RemediationInput): any;
}

export interface RemediationProposal {
  incidentId: string;
  decision: RemediationDecision;
  reason: string;
  applied: false;                       // ALWAYS false — propose-only; acceptance + apply are a separate step
  mode: "PROPOSE_ONLY";
  plan: string[];
  writeSet: string[];
  authorizedPaths: string[];
  outOfScope: string[];                 // write-set entries outside the authorized paths (⇒ REFUSED if any)
  successCriteria: string[];
  rollback: string | null;
  diff: string | null;
  authorization: { decision: string; reason: string } | null;
  preChecks: any | null;
  testResults: any | null;
  recurrenceAvoided: null;              // NEVER asserted from local tests alone
  evidenceRefs: string[];
}

// Normalise authorized paths to prefix match (drop glob tails) — identical discipline to the executors'
// scope check: being inside a granted SCOPE is not AUTHORITY, but a write OUTSIDE scope is always refused.
function scopePrefixes(authorizedPaths: string[]): string[] {
  return (Array.isArray(authorizedPaths) ? authorizedPaths : [])
    .map((p) => p.replace(/[*].*$/, "").replace(/\/+$/, ""))
    .filter((p) => p.length > 0);
}
function inScope(file: string, prefixes: string[]): boolean {
  if (prefixes.length === 0) return false;
  const norm = String(file).replace(/\\/g, "/");
  return prefixes.some((pre) => norm === pre || norm.startsWith(pre + "/") || norm.startsWith(pre));
}

function base(incidentId: string, input: RemediationInput): RemediationProposal {
  return {
    incidentId,
    decision: "BLOCKED",
    reason: "",
    applied: false,
    mode: "PROPOSE_ONLY",
    plan: Array.isArray(input.plan) ? input.plan : [],
    writeSet: Array.isArray(input.writeSet) ? input.writeSet : [],
    authorizedPaths: Array.isArray(input.authorizedPaths) ? input.authorizedPaths : [],
    outOfScope: [],
    successCriteria: Array.isArray(input.successCriteria) ? input.successCriteria : [],
    rollback: typeof input.rollback === "string" ? input.rollback : null,
    diff: typeof input.proposedDiff === "string" ? input.proposedDiff : null,
    authorization: null,
    preChecks: null,
    testResults: null,
    recurrenceAvoided: null,
    evidenceRefs: [],
  };
}

/**
 * propose(assessment, input, seams) — build a PROPOSE-ONLY remediation proposal from a DIAGNOSED assessment.
 * Returns BLOCKED (insufficient diagnosis), REFUSED (scope/authorization/pre-check/test failure) or PROPOSED.
 * Writes NOTHING and never applies: acceptance + apply (via patch-executor) are a separate, gated step.
 */
export function propose(assessment: any, input: RemediationInput, seams: RemediationSeams): RemediationProposal {
  const incidentId = assessment && typeof assessment.incidentId === "string" ? assessment.incidentId : "";
  const p = base(incidentId, input || ({} as RemediationInput));
  p.evidenceRefs = assessment && Array.isArray(assessment.evidenceRefs) ? assessment.evidenceRefs : [];

  // 1) Linkage + sufficiency: only a DIAGNOSED, substantiated, identified assessment is remediable.
  if (!incidentId.trim()) { p.decision = "BLOCKED"; p.reason = "BLOCKED: no stable incidentId linking to a root-cause assessment"; return p; }
  if (!assessment || assessment.verdict !== "DIAGNOSED") { p.decision = "BLOCKED"; p.reason = `BLOCKED: assessment is not DIAGNOSED (verdict=${assessment && assessment.verdict}) — never remediate an inconclusive cause`; return p; }
  if (p.evidenceRefs.length === 0) { p.decision = "BLOCKED"; p.reason = "BLOCKED: assessment carries no evidenceRefs (insufficiently substantiated)"; return p; }
  if (!Array.isArray(input.writeSet) || input.writeSet.length === 0) { p.decision = "BLOCKED"; p.reason = "BLOCKED: empty write-set — nothing to propose"; return p; }
  if (!seams || typeof seams.authorize !== "function") { p.decision = "BLOCKED"; p.reason = "BLOCKED: no authorization seam (action gate) available"; return p; }

  // 2) Write-set confinement: any path OUTSIDE the authorized scope ⇒ REFUSED (scope is not authority).
  const prefixes = scopePrefixes(p.authorizedPaths);
  p.outOfScope = p.writeSet.filter((f) => !inScope(f, prefixes));
  if (p.outOfScope.length > 0) { p.decision = "REFUSED"; p.reason = `REFUSED: write-set exceeds authorized scope: ${p.outOfScope.join(", ")}`; return p; }

  // 3) Authorization: the ACTION GATE is the only authority (deny-by-default). Confidence never authorizes.
  const authAction = input.action || { type: "remediation", incidentId, writeSet: p.writeSet };
  const gate = seams.authorize(authAction, { incidentId, writeSet: p.writeSet, authorizedPaths: p.authorizedPaths }) || {};
  p.authorization = { decision: String(gate.decision || "DENY"), reason: String(gate.reason || "") };
  if (p.authorization.decision !== "ALLOW") {
    p.decision = p.authorization.decision === "ESCALATE" ? "BLOCKED" : "REFUSED";
    p.reason = `${p.decision}: action gate returned ${p.authorization.decision} — not authorized to propose an apply`;
    return p;
  }

  // 4) Initial-state pre-checks: a dirty tree, unexpected pre-existing failures, or missing deps ⇒ REFUSED.
  if (typeof seams.checkInitialState === "function") {
    const st = seams.checkInitialState(input) || {};
    p.preChecks = st;
    if (st.clean === false || (Array.isArray(st.preexistingFailures) && st.preexistingFailures.length > 0) || (Array.isArray(st.missingDeps) && st.missingDeps.length > 0)) {
      p.decision = "REFUSED"; p.reason = "REFUSED: initial-state pre-check failed (dirty tree / pre-existing failures / missing deps)"; return p;
    }
  }

  // 5) Reproducible tests: a failing critical check ⇒ REFUSED (never propose over red tests).
  if (typeof seams.runTests === "function") {
    const t = seams.runTests(input) || {};
    p.testResults = t;
    if (t.pass !== true) { p.decision = "REFUSED"; p.reason = "REFUSED: reproducible tests did not pass"; return p; }
  }

  // 6) PROPOSE-ONLY: everything checks out ⇒ a proposal for acceptance. NOTHING is applied here.
  p.decision = "PROPOSED";
  p.reason = "PROPOSED (propose-only): action gate ALLOW, write-set in scope, pre-checks + tests green. Acceptance + apply (via patch-executor) is a separate, explicitly-authorized step; recurrence-avoidance is NOT asserted from local tests.";
  return p;
}

module.exports = { propose };

// Module-scope marker (adds NO export): forces TypeScript MODULE scope (no global-script collisions).
export {};
