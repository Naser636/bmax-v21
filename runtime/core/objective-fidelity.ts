#!/usr/bin/env node
/**
 * objective-fidelity — V47 Lot D (register G-01): anti-drift guard that preserves the OWNER's objective and refuses
 * false-completion. A pure POLICY/EVIDENCE evaluator (no orchestrator, no new primitive) the governance layer can call.
 *
 * It enforces, from actual deliverable evidence (never a self-report):
 *   - a mission is COMPLETE only when EVERY required outcome is VERIFIED with evidence;
 *   - a claim of completion while any mandatory outcome is unverified is REJECTED (reject false completion);
 *   - a genuinely accepted mission is NOT blocked (no false negatives);
 *   - a proposed scope that drops required outcomes is SILENT_NARROWING unless an explicit, authorized, evidence-
 *     backed scope-change record covers each dropped outcome;
 *   - unresolved mandatory outcomes are always carried forward with their blocker + unblock action.
 *
 * Outcome states (caller-supplied, evidence-bearing): VERIFIED | IMPLEMENTED_UNVERIFIED | BLOCKED | NOT_STARTED.
 * "A local test suite passing" is NOT acceptance: an outcome is VERIFIED only if its deliverable carries state
 * VERIFIED *and* non-empty evidence. Fail-closed on malformed input.
 */
"use strict";

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
const OUTCOME_STATES = ["VERIFIED", "IMPLEMENTED_UNVERIFIED", "BLOCKED", "NOT_STARTED"];

/** normalizeContract(c): validate the owner-objective contract. Returns {ok, contract} | {ok:false, reason}. */
function normalizeContract(c: any): any {
  if (!isObj(c)) return { ok: false, reason: "contract object required" };
  if (typeof c.objectiveId !== "string" || !c.objectiveId) return { ok: false, reason: "objectiveId required" };
  if (typeof c.statement !== "string" || !c.statement) return { ok: false, reason: "objective statement required" };
  const required = Array.isArray(c.requiredOutcomes) ? c.requiredOutcomes : [];
  if (required.length === 0) return { ok: false, reason: "at least one requiredOutcome is mandatory" };
  for (const o of required) if (!isObj(o) || typeof o.id !== "string" || !o.id) return { ok: false, reason: "each requiredOutcome needs a string id" };
  return { ok: true, contract: {
    objectiveId: c.objectiveId, statement: c.statement,
    requiredOutcomes: required.map((o: any) => ({ id: o.id, acceptance: o.acceptance || null, mandatory: o.mandatory !== false })),
    constraints: Array.isArray(c.constraints) ? c.constraints : [],
    nonGoals: Array.isArray(c.nonGoals) ? c.nonGoals : [],
    authorizationBoundaries: Array.isArray(c.authorizationBoundaries) ? c.authorizationBoundaries : [],
  } };
}

/** indexDeliverables(list): map outcomeId → {state, evidence}. Unknown states are coerced to NOT_STARTED (fail-closed). */
function indexDeliverables(list: any): Record<string, any> {
  const out: Record<string, any> = {};
  for (const d of (Array.isArray(list) ? list : [])) {
    if (!isObj(d) || typeof d.outcomeId !== "string") continue;
    const state = OUTCOME_STATES.includes(d.state) ? d.state : "NOT_STARTED";
    const evidence = typeof d.evidence === "string" ? d.evidence.trim() : (Array.isArray(d.evidence) ? d.evidence.filter(Boolean) : "");
    const hasEvidence = typeof evidence === "string" ? evidence.length > 0 : evidence.length > 0;
    out[d.outcomeId] = { state, evidence, hasEvidence, unblock: typeof d.unblock === "string" ? d.unblock : null };
  }
  return out;
}

/** An outcome counts as satisfied ONLY if its deliverable is VERIFIED *and* carries evidence. */
function outcomeSatisfied(d: any): boolean { return !!d && d.state === "VERIFIED" && d.hasEvidence === true; }

/**
 * assessCompletion(contract, deliverables): the ground-truth verdict from evidence.
 * Returns { verdict: COMPLETE|INCOMPLETE, satisfied[], unsatisfied[{id,state,reason}], carryForward[] }.
 */
function assessCompletion(contractInput: any, deliverables: any): any {
  const n = normalizeContract(contractInput);
  if (!n.ok) return { ok: false, code: "INVALID_INPUT", reason: n.reason };
  const idx = indexDeliverables(deliverables);
  const satisfied: string[] = [], unsatisfied: any[] = [], carryForward: any[] = [];
  for (const o of n.contract.requiredOutcomes) {
    const d = idx[o.id];
    if (outcomeSatisfied(d)) { satisfied.push(o.id); continue; }
    const state = d ? d.state : "NOT_STARTED";
    const reason = !d ? "no deliverable reported"
      : d.state === "VERIFIED" && !d.hasEvidence ? "marked VERIFIED but NO evidence (a test count is not acceptance)"
      : d.state === "BLOCKED" ? "blocked — mandatory, carried forward"
      : `state ${d.state} — not VERIFIED`;
    if (o.mandatory) unsatisfied.push({ id: o.id, state, reason });
    carryForward.push({ id: o.id, state, reason, unblock: (d && d.unblock) || "resolve dependency / supply verified evidence" });
  }
  const verdict = unsatisfied.length === 0 ? "COMPLETE" : "INCOMPLETE";
  return { ok: true, verdict, objectiveId: n.contract.objectiveId, satisfied, unsatisfied, carryForward,
    note: "COMPLETE requires EVERY mandatory outcome VERIFIED with evidence. Unresolved outcomes are carried forward with an unblock action." };
}

/**
 * evaluateCompletionClaim(contract, claim): reject FALSE completion without blocking a GENUINE one.
 * claim = { status: "COMPLETE"|..., deliverables }. Returns ACCEPT | REJECT_FALSE_COMPLETION | ACKNOWLEDGE_INCOMPLETE.
 */
function evaluateCompletionClaim(contractInput: any, claim: any): any {
  if (!isObj(claim)) return { ok: false, code: "INVALID_INPUT", reason: "claim object required" };
  const assessed = assessCompletion(contractInput, claim.deliverables);
  if (!assessed.ok) return assessed;
  const claimsComplete = String(claim.status || "").toUpperCase() === "COMPLETE";
  if (claimsComplete && assessed.verdict === "COMPLETE") {
    return { ok: true, decision: "ACCEPT", verdict: assessed.verdict, satisfied: assessed.satisfied, reason: "all mandatory outcomes VERIFIED with evidence" };
  }
  if (claimsComplete && assessed.verdict === "INCOMPLETE") {
    return { ok: true, decision: "REJECT_FALSE_COMPLETION", verdict: assessed.verdict, unsatisfied: assessed.unsatisfied, carryForward: assessed.carryForward,
      reason: `completion claimed but ${assessed.unsatisfied.length} mandatory outcome(s) not VERIFIED with evidence` };
  }
  // Did not claim complete: acknowledge honest incompleteness (and pass through a genuine completion if under-claimed).
  return { ok: true, decision: assessed.verdict === "COMPLETE" ? "ACCEPT" : "ACKNOWLEDGE_INCOMPLETE", verdict: assessed.verdict, carryForward: assessed.carryForward, reason: "claim not COMPLETE; evidence assessed on its merits" };
}

/**
 * detectDrift(contract, proposedOutcomeIds, authorizedScopeChanges?): flag SILENT_NARROWING when the proposed scope
 * drops a mandatory outcome without an authorized, evidence-backed scope-change record for it.
 */
function detectDrift(contractInput: any, proposedOutcomeIds: any, authorizedScopeChanges: any = []): any {
  const n = normalizeContract(contractInput);
  if (!n.ok) return { ok: false, code: "INVALID_INPUT", reason: n.reason };
  const proposed = new Set(Array.isArray(proposedOutcomeIds) ? proposedOutcomeIds : []);
  const authorized = new Map<string, any>();
  for (const s of (Array.isArray(authorizedScopeChanges) ? authorizedScopeChanges : [])) {
    if (isObj(s) && typeof s.outcomeId === "string" && s.authorized === true && (typeof s.evidence === "string" ? s.evidence.trim() : s.evidence)) authorized.set(s.outcomeId, s);
  }
  const dropped: string[] = [], silentlyNarrowed: string[] = [], authorizedDrop: string[] = [];
  for (const o of n.contract.requiredOutcomes) {
    if (!o.mandatory || proposed.has(o.id)) continue;
    dropped.push(o.id);
    if (authorized.has(o.id)) authorizedDrop.push(o.id); else silentlyNarrowed.push(o.id);
  }
  const verdict = silentlyNarrowed.length > 0 ? "SILENT_NARROWING" : (dropped.length > 0 ? "AUTHORIZED_SCOPE_CHANGE" : "FAITHFUL");
  return { ok: true, verdict, objectiveId: n.contract.objectiveId, dropped, silentlyNarrowed, authorizedDrop,
    note: "A mandatory outcome may be dropped ONLY with an explicit authorized + evidence-backed scope change. Otherwise it is silent narrowing and must be refused." };
}

export { normalizeContract, assessCompletion, evaluateCompletionClaim, detectDrift, OUTCOME_STATES };
module.exports = { normalizeContract, assessCompletion, evaluateCompletionClaim, detectDrift, OUTCOME_STATES };
