#!/usr/bin/env node
"use strict";
/*
 * V188 §1/§2/§3 — sovereign ODG→provider delegation chain + bounded provider contract. PURE, deterministic, fail-closed.
 *
 * NOT a second orchestrator — a state-machine + contract layer COMPOSING the existing components (mission-scheduler,
 * campaign-lifecycle, delegate-isolation, provider-sandbox, evaluator-independence, provider-capability-contract). It
 * encodes the authority separation: ODG decides WHAT/WHY/ORDER/PERMISSIONS/CRITERIA; the provider (Claude Code) decides
 * only HOW within a bounded contract and CANNOT self-authorize, self-expand scope, self-accept or self-close.
 *
 * Chain: ODG_MISSION_CREATED → ODG_MISSION_AUTHORIZED → PROVIDER_CONTRACT_ISSUED → PROVIDER_ACCEPTED →
 *        PROVIDER_EXECUTION → PROVIDER_RESULT_RETURNED → ODG_VERIFICATION → INDEPENDENT_REVIEW → ODG_ACCEPTANCE →
 *        CANONICAL_CLOSURE. Every transition is actor-checked (deny-by-default).
 */

const STATES = Object.freeze(["CREATED", "AUTHORIZED", "CONTRACT_ISSUED", "PROVIDER_ACCEPTED", "EXECUTION", "RESULT_RETURNED", "ODG_VERIFIED", "INDEPENDENT_REVIEWED", "ODG_ACCEPTED", "CANONICAL_CLOSED", "REFUSED", "CORRECTION_REQUESTED"]);
const ACTORS = Object.freeze(["ODG", "PROVIDER", "INDEPENDENT"]);
// paths the provider can NEVER write, regardless of write_set (protected canonical sources).
const ALWAYS_PROTECTED = Object.freeze(["runtime/governance/ROADMAP.json", "docs/odg/closure-register.json"]);

// the §1.1 provider contract the technical provider accepts — bounded role, enumerated limits.
const PROVIDER_CONTRACT_TERMS = Object.freeze({
  accepted: true, role: "TECHNICAL_PROVIDER_ONLY",
  notAuthorityFor: Object.freeze(["CTO", "roadmap_owner", "mission_authority", "authorization_authority", "radar_owner", "memory_owner", "canonical_registers", "closure_decision", "self_authorization", "self_independence"]),
  decides: "only HOW to realise a bounded mission; may signal impossibility or propose a technical improvement; may NOT unilaterally change the mandate",
});

function step(st: any, patch: any): any { return Object.freeze({ ...st, ...patch, history: Object.freeze([...(st.history || []), st.state]) }); }
function refuse(st: any, by: string, reason: string): any { return step(st, { state: "REFUSED", refusedBy: by, reason }); }

/* ODG authority — create + authorize. Provider cannot do these. */
function createMission(mission: any): any {
  return Object.freeze({ state: "CREATED", missionId: mission.id, objective: mission.objective, reason: mission.reason, authority: "ODG", history: Object.freeze([]) });
}
function authorize(st: any, actor: string): any {
  if (actor !== "ODG") return refuse(st, actor, "ONLY_ODG_AUTHORIZES");
  if (st.state !== "CREATED") return refuse(st, actor, "BAD_STATE");
  return step(st, { state: "AUTHORIZED" });
}

/* ODG issues a bounded contract (§2.3). Provider cannot issue its own. */
function issueContract(st: any, actor: string, contract: any): any {
  if (actor !== "ODG") return refuse(st, actor, "ONLY_ODG_ISSUES_CONTRACT");
  if (st.state !== "AUTHORIZED") return refuse(st, actor, "BAD_STATE");
  const required = ["objective", "scope", "writeSet", "protectedPaths", "permissions", "requiredTests", "acceptanceCriteria", "stopConditions"];
  const missing = required.filter((k) => contract[k] == null);
  if (missing.length) return refuse(st, actor, `INCOMPLETE_CONTRACT:${missing.join(",")}`);
  const protectedPaths = Object.freeze([...new Set([...(contract.protectedPaths || []), ...ALWAYS_PROTECTED])]);
  return step(st, { state: "CONTRACT_ISSUED", contract: Object.freeze({ ...contract, writeSet: Object.freeze(contract.writeSet.slice()), protectedPaths }) });
}

/* Provider accepts the bounded contract. */
function providerAccept(st: any, actor: string): any {
  if (actor !== "PROVIDER") return refuse(st, actor, "ONLY_PROVIDER_ACCEPTS");
  if (st.state !== "CONTRACT_ISSUED") return refuse(st, actor, "BAD_STATE");
  return step(st, { state: "PROVIDER_ACCEPTED" });
}

/* Provider executes — each file change is checked against the contract write_set + protected paths. Scope cannot expand. */
function execute(st: any, actor: string, changes: any[]): any {
  if (actor !== "PROVIDER") return refuse(st, actor, "ONLY_PROVIDER_EXECUTES");
  if (st.state !== "PROVIDER_ACCEPTED" && st.state !== "EXECUTION") return refuse(st, actor, "BAD_STATE");
  const ws = st.contract.writeSet, prot = st.contract.protectedPaths;
  for (const c of (changes || [])) {
    if (prot.includes(c.file)) return refuse(st, actor, `PROTECTED_PATH_WRITE:${c.file}`);
    if (!ws.includes(c.file)) return refuse(st, actor, `OUT_OF_WRITE_SET:${c.file}`); // no silent scope expansion
  }
  return step(st, { state: "EXECUTION", changes: Object.freeze((changes || []).map((c: any) => Object.freeze(c))) });
}

/* Provider returns a complete deliverable (§2.4). Missing fields ⇒ cannot be verified. */
function returnResult(st: any, actor: string, deliverable: any): any {
  if (actor !== "PROVIDER") return refuse(st, actor, "ONLY_PROVIDER_RETURNS");
  if (st.state !== "EXECUTION") return refuse(st, actor, "BAD_STATE");
  const required = ["summary", "files", "diff", "testsRun", "testOutputs", "risks", "limits", "commit", "reproEvidence"];
  const missing = required.filter((k) => deliverable[k] == null);
  if (missing.length) return refuse(st, actor, `INCOMPLETE_DELIVERABLE:${missing.join(",")}`);
  return step(st, { state: "RESULT_RETURNED", deliverable: Object.freeze({ ...deliverable }) });
}

/* ODG verification + independent review + acceptance + closure — provider can do NONE of these. */
function odgVerify(st: any, actor: string, ok: boolean): any {
  if (actor !== "ODG") return refuse(st, actor, "ONLY_ODG_VERIFIES");
  if (st.state !== "RESULT_RETURNED") return refuse(st, actor, "BAD_STATE");
  return ok ? step(st, { state: "ODG_VERIFIED" }) : step(st, { state: "CORRECTION_REQUESTED", reason: "verification failed" });
}
function independentReview(st: any, actor: string, review: any): any {
  if (actor !== "INDEPENDENT") return refuse(st, actor, "REVIEW_MUST_BE_INDEPENDENT_NOT_PROVIDER");
  if (st.state !== "ODG_VERIFIED") return refuse(st, actor, "BAD_STATE");
  const avail = review && review.available === true;
  return step(st, { state: "INDEPENDENT_REVIEWED", independentReview: Object.freeze(avail ? { available: true, verdict: review.verdict } : { available: false, status: "NOT_AVAILABLE" }) });
}
function accept(st: any, actor: string): any {
  if (actor !== "ODG") return refuse(st, actor, "ONLY_ODG_ACCEPTS");         // provider never self-accepts
  if (st.state !== "INDEPENDENT_REVIEWED") return refuse(st, actor, "BAD_STATE");
  return step(st, { state: "ODG_ACCEPTED" });
}
function canonicalClose(st: any, actor: string): any {
  if (actor !== "ODG") return refuse(st, actor, "ONLY_ODG_CLOSES");          // provider never self-closes
  if (st.state !== "ODG_ACCEPTED") return refuse(st, actor, "BAD_STATE");
  return step(st, { state: "CANONICAL_CLOSED", closureNote: "canonical closure is ODG's; provider cannot write the register (ALWAYS_PROTECTED)" });
}

/* §3.1 — which rules are technically ENFORCED (deterministic here) vs NON_ENFORCED (need a compensating control). */
function enforcementAudit(): any {
  return Object.freeze([
    { rule: "no write outside the contract write_set", status: "ENFORCED", by: "execute() OUT_OF_WRITE_SET refusal" },
    { rule: "no write to ROADMAP.json / closure-register.json", status: "ENFORCED", by: "ALWAYS_PROTECTED in execute()" },
    { rule: "provider cannot authorize / accept / close", status: "ENFORCED", by: "actor checks (ONLY_ODG_*)" },
    { rule: "independent review must not be the provider", status: "ENFORCED", by: "independentReview() actor check" },
    { rule: "no auto-acceptance of a deliverable", status: "ENFORCED", by: "accept() requires ODG + INDEPENDENT_REVIEWED state" },
    { rule: "no internet research bypassing the radar", status: "NON_ENFORCED", compensating: "V187 radar-collection-adapter owns the path + provider discipline + audit trail; module-level code cannot block a human-operated tool" },
    { rule: "no real deploy/systemd/secret/payment", status: "NON_ENFORCED", compensating: "environment sandbox + owner-gates + Truth-Lock + this contract; declared NON_ENFORCED honestly" },
  ]);
}

const SOVEREIGN_DELEGATION_CONTRACT = Object.freeze({
  id: "V188-SOVEREIGN-DELEGATION",
  purpose: "§1/§2/§3 — native ODG→provider delegation chain + bounded contract; compose existing components, build no 2nd orchestrator",
  invariants: Object.freeze([
    "authority separation: ODG authorizes/verifies/accepts/closes; PROVIDER only executes within the contract",
    "provider cannot self-authorize, expand scope, self-accept or self-close (deny-by-default actor + write_set + protected-path checks)",
    "ROADMAP.json + closure-register.json are ALWAYS_PROTECTED — never provider-writable",
    "independent review must be a distinct actor; absent ⇒ NOT_AVAILABLE (never a provider self-check)",
    "rules that cannot be code-enforced are declared NON_ENFORCED with a compensating control; deterministic; no 2nd orchestrator",
  ]),
});

module.exports = { STATES, ACTORS, ALWAYS_PROTECTED, PROVIDER_CONTRACT_TERMS, createMission, authorize, issueContract, providerAccept, execute, returnResult, odgVerify, independentReview, accept, canonicalClose, enforcementAudit, SOVEREIGN_DELEGATION_CONTRACT };
export {};
