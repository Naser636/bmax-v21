#!/usr/bin/env node
"use strict";

/*
 * V12.4 §10–§11 — ROOT OF TRUST / G0 admission + tamper classification. PURE. It creates NO new authorizer: it
 * ENUMERATES the G0 protected perimeter (references, policies, governance subtree, evaluators/baselines, protocol,
 * settings) and COMPOSES the EXISTING guards — action-gate (the single POLICY authorizer), evidence-provenance (tamper
 * detection), and the protected-governance rule enforced at the real write point by patch-executor/capability-executors
 * ("authorized_paths is SCOPE, not AUTHORITY; a patch cannot self-authorize a governance write") — into one fail-closed
 * admission over the §11.2 tamper vectors.
 *
 * Invariant: a change to a protected G0 target is BLOCKED unless an EXTERNAL elevated authorization (by an authority
 * that is NOT the requesting actor, explicitly approved) is present AND POLICY ALLOWs it; self-authorization,
 * evidence falsification, and restoration from an unverified state are refused. Every attempt is DETECTABLE and
 * TRACEABLE (returns a structured audit record). G0 is a governance/protection LAYER, NOT a tenth primitive. Dual export.
 */

const AG = require("./action-gate");
const EP = require("./evidence-provenance");

// The G0 protected perimeter (path prefixes the protocol marks human-approval-only / protection-critical).
const PROTECTED_PATHS = Object.freeze([
  "runtime/constitution/", "runtime/policies/", "runtime/governance/", "runtime/governance/ROADMAP.json",
  "docs/odg-operational/ODG_MASTER_ROADMAP_V12.4.md", "runtime/governance/directives/",
  "evaluators/", "baselines/", ".odg/baselines/", "ODG_AUTONOMOUS_WORK_PROTOCOL.json", ".claude/settings",
]);
// The G0 protected invariants (never weakened by a self-authorized change).
const PROTECTED_INVARIANTS = Object.freeze([
  "exactly nine primitives (no tenth)", "no self-authorization / no self-elevation of permission",
  "no modification of a protected evaluator/baseline to pass a test", "canonical references are versioned",
  "evidence is tamper-evident (provenance-bound)", "recovery only from a verified state",
]);
// §11.2 tamper vectors.
const TAMPER_VECTORS = Object.freeze([
  "DIRECT", "INDIRECT", "BY_AGENT", "BY_PROVIDER", "BY_TOOL", "BY_DEPENDENCY", "BY_CONFIG",
  "BY_CONTRACT", "BY_EVALUATOR", "BY_EVIDENCE_FALSIFICATION", "BY_UNVERIFIED_RESTORATION",
]);

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }

/** isProtectedTarget(path) -> boolean. A path under the G0 perimeter. */
function isProtectedTarget(target: any): boolean {
  if (!isStr(target)) return false;
  const t = target.replace(/^\.?\//, "");
  return PROTECTED_PATHS.some((p: string) => { const pp = p.replace(/^\.?\//, ""); return t === pp || t.startsWith(pp); });
}

// An elevated authorization is valid only if granted by an EXTERNAL authority (not the requesting actor) and approved.
function externallyElevated(actor: any, auth: any): boolean {
  return isObj(auth) && isStr(auth.by) && auth.by !== actor && auth.by !== "self" && auth.selfAuthored !== true && auth.approved === true;
}

/**
 * admitGovernanceChange(request, context) -> structured admission. request: { actor, target, actionClass,
 * elevatedAuthorization?, provenanceStamp? }. FAIL-CLOSED: a protected target is admitted ONLY with an external
 * elevated authorization AND a POLICY ALLOW. Every decision is detectable + traceable (audit record returned).
 */
function admitGovernanceChange(request: any, context: any): any {
  const r = isObj(request) ? request : {};
  const protectedTarget = isProtectedTarget(r.target);
  // A governance WRITE is consequential ⇒ action-gate DENIES it without the full admission (STATE/CONTRACT/POLICY/
  // AUTHORITY). An external elevated authorization MAY carry those admission fields; thread them through so a genuinely
  // authorized change can reach ALLOW, while a bare self/absent authorization stays DENIED. This is composition, not bypass.
  const adm = isObj(r.elevatedAuthorization) && isObj(r.elevatedAuthorization.admission) ? r.elevatedAuthorization.admission : {};
  const policy = AG.evaluateAction({
    principal: isStr(r.actor) ? r.actor : "unknown", verb: "modify", target: isStr(r.target) ? r.target : "unknown",
    actionClass: isStr(r.actionClass) ? r.actionClass : "WRITE",
    expectedTransition: adm.expectedTransition, contract: adm.contract, policy: adm.policy, authority: adm.authority,
  }, isObj(context) ? context : {});
  const elevated = externallyElevated(r.actor, r.elevatedAuthorization);
  const selfAttempt = isObj(r.elevatedAuthorization) && (r.elevatedAuthorization.by === r.actor || r.elevatedAuthorization.selfAuthored === true);
  const admitted = protectedTarget ? (elevated && policy.decision === AG.DECISION.ALLOW) : (policy.decision === AG.DECISION.ALLOW);
  const reason = !protectedTarget ? "non-protected target: POLICY " + policy.decision
    : selfAttempt ? "BLOCKED: self-authorization of a protected G0 change (scope ≠ authority)"
    : !elevated ? "BLOCKED: protected G0 target requires an EXTERNAL elevated authorization"
    : policy.decision !== AG.DECISION.ALLOW ? "BLOCKED: POLICY " + policy.decision
    : "admitted: external elevated authorization + POLICY ALLOW";
  return Object.freeze({
    admitted, protectedTarget, policyDecision: policy.decision, selfAttempt,
    blocked: !admitted && protectedTarget,
    detectable: true, traceable: true,
    audit: Object.freeze({ actor: r.actor || null, target: r.target || null, protectedTarget, admitted, at: isObj(context) ? context.now || null : null, reason }),
    reason,
  });
}

/**
 * classifyTamperAttempt(attempt) -> { vector, blocked, detectable, traceable, reason }. Maps a §11.2 tamper vector to
 * the guard that refuses it. BY_EVIDENCE_FALSIFICATION uses evidence-provenance; BY_UNVERIFIED_RESTORATION requires a
 * verified state; all path/config/contract/evaluator vectors go through admitGovernanceChange (protected ⇒ fail-closed).
 */
function classifyTamperAttempt(attempt: any, context: any): any {
  const a = isObj(attempt) ? attempt : {};
  const vec = isStr(a.vector) ? a.vector : "DIRECT";
  if (vec === "BY_EVIDENCE_FALSIFICATION") {
    const v = (() => { try { return EP.verifyProvenance(a.provenanceStamp); } catch { return { ok: false }; } })();
    const blocked = !(v && v.ok === true); // a tampered/invalid provenance stamp is detected ⇒ the falsified evidence is refused
    return Object.freeze({ vector: vec, blocked, detectable: true, traceable: true, reason: blocked ? "evidence falsification DETECTED (provenance invalid) ⇒ refused" : "provenance verified (no falsification in this stamp)" });
  }
  if (vec === "BY_UNVERIFIED_RESTORATION") {
    const blocked = a.verifiedState !== true;
    return Object.freeze({ vector: vec, blocked, detectable: true, traceable: true, reason: blocked ? "BLOCKED: restoration from an UNVERIFIED state refused (recovery requires a verified state)" : "restoration from a verified state (allowed)" });
  }
  // DIRECT / INDIRECT / BY_AGENT / BY_PROVIDER / BY_TOOL / BY_DEPENDENCY / BY_CONFIG / BY_CONTRACT / BY_EVALUATOR
  const adm = admitGovernanceChange({ actor: a.actor, target: a.target, actionClass: a.actionClass || "WRITE", elevatedAuthorization: a.elevatedAuthorization, provenanceStamp: a.provenanceStamp }, context);
  return Object.freeze({ vector: vec, blocked: adm.blocked, detectable: adm.detectable, traceable: adm.traceable, reason: adm.reason, audit: adm.audit });
}

const ROOT_OF_TRUST_CONTRACT = Object.freeze({
  id: "V124-G0-ROOT-OF-TRUST",
  source: "V12.4 §10–§11 — G0 governance root: protections + tamper admission (compose-only)",
  protectedPaths: PROTECTED_PATHS, protectedInvariants: PROTECTED_INVARIANTS, tamperVectors: TAMPER_VECTORS,
  reuses: Object.freeze(["action-gate (single POLICY authorizer)", "evidence-provenance (tamper detection)", "patch-executor/capability-executors protected-governance rule (enforced at the write point)"]),
  notAuthority: "G0 is a governance/protection LAYER, not a tenth primitive; it creates NO new authorizer — it enumerates the perimeter and composes existing guards",
  invariants: Object.freeze([
    "a protected G0 target is BLOCKED unless an EXTERNAL elevated authorization (by a non-actor authority, approved) AND POLICY ALLOW are both present",
    "self-authorization / self-elevation of a protected change is refused (scope ≠ authority)",
    "evidence falsification is detected via evidence-provenance; recovery is refused from an unverified state",
    "every tamper attempt is DETECTABLE and TRACEABLE (returns a structured audit record)",
    "G0 is NOT a tenth primitive; no second authorizer is created",
  ]),
});

module.exports = { PROTECTED_PATHS, PROTECTED_INVARIANTS, TAMPER_VECTORS, ROOT_OF_TRUST_CONTRACT, isProtectedTarget, admitGovernanceChange, classifyTamperAttempt };

if (require.main === module) { process.stdout.write(JSON.stringify(ROOT_OF_TRUST_CONTRACT, null, 2) + "\n"); }

export {};
