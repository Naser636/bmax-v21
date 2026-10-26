#!/usr/bin/env node
"use strict";
/*
 * agent-governance-harness — a HERMETIC end-to-end driver that sequences one external-agent action through the
 * FULL governance lifecycle, REUSING third-party-agent-gate. It is NOT a second orchestrator and holds NO
 * execution authority: admission ALWAYS defers to the gate; execution is an INJECTED (simulated, in tests)
 * executor that stands in for ODG's real EXECUTOR; success ALWAYS requires INDEPENDENT verification, never the
 * agent's self-reported result. Pure/deterministic; injected clock; no network, no real agent.
 *
 * Lifecycle: contract+identity → proposal → gate verdict (ADMIT|DENY|ESCALATE) → [ESCALATE ⇒ simulated human
 * decision] → execute ONLY after admission → treat the executor's returned result as UNTRUSTED → independent
 * verification → record final state (+ history for cumulative drift) → recover on executor error/timeout WITHOUT
 * producing a false success. Every transition is appended to a traceable, sha-stamped record.
 */
import crypto from "node:crypto";
const gate: any = require("./third-party-agent-gate");
const prov: any = require("./evidence-provenance");
const identity: any = require("./agent-identity");

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const ORDER = ["GATE", "EXEC", "VERIFY"]; // the only valid admitted-path transition prefix

/**
 * contractShaOf — canonical hash of a contract's GOVERNANCE-relevant fields (stable field order). The
 * authenticated session's contractSha MUST equal this, so a session authenticated for contract A cannot be used
 * to run a different contract B (V12 tenant/contract-scoped admission).
 */
function contractShaOf(contract: any): string {
  const c = contract || {};
  return sha256(JSON.stringify([
    c.agentId ?? null, c.tenantId ?? null, c.objective ?? null,
    Array.isArray(c.allowedTools) ? c.allowedTools : null, Array.isArray(c.authorizedScope) ? c.authorizedScope : null,
    c.limits ?? null, c.requireHumanFor ?? null, c.allowedDependencies ?? null,
    c.forbiddenToolCombos ?? null, c.maxPerTool ?? null, c.paramSchemas ?? null, c.revoked ?? null,
  ]));
}

export interface HarnessDeps {
  executor: (proposal: any) => any;                                   // SIMULATED executor (hermetic); stands in for ODG's EXECUTOR
  verifier: (proposal: any, execResult: any) => { verified: boolean; reason: string }; // INDEPENDENT (checks evidence, not the agent's claim)
  humanDecision?: (proposal: any, verdict: any) => "approve" | "reject";               // only consulted on ESCALATE
}

/**
 * runStep — drive ONE proposal through the lifecycle. Returns outcome + trace + the next GateState (with history
 * appended so cumulative drift accrues across steps). Outcomes:
 *   DENIED · ESCALATED_REJECTED · ESCALATED_APPROVED_VERIFIED · ESCALATED_APPROVED_UNVERIFIED
 *   ADMITTED_VERIFIED · ADMITTED_UNVERIFIED · ERROR_RECOVERED
 * INVARIANTS: no executor call unless admitted (ADMIT, or ESCALATE→approve); success ONLY if the independent
 * verifier returns verified:true; any executor throw/timeout ⇒ ERROR_RECOVERED (no false success).
 */
function runStep(proposal: any, contract: any, state: any, deps: HarnessDeps): any {
  const trace: any[] = [];
  const s = state && typeof state === "object" ? state : { calls: 0, elapsedMs: 0 };
  const stamp = (phase: string, data: any) => trace.push({ phase, sha256: sha256(JSON.stringify({ phase, data })), data });

  // V9 — PRE-GATE cryptographic identity + session/contract binding. Identity ≠ permission: auth only AUTHENTICATES;
  // a failure here means NO gate call and NO execution. requireAuth with no auth ⇒ fail-closed.
  let authedTenant: any = undefined;   // AUTHORITATIVE tenant comes from the authenticated identity, never the proposal
  const authCfg = (deps as any).auth;
  if (authCfg || (deps as any).requireAuth) {
    const proposalSha256 = sha256(JSON.stringify({ a: proposal && proposal.agentId, t: proposal && proposal.tool, tp: proposal && proposal.targetPaths }));
    if (!authCfg) { stamp("AUTH", { ok: false, reason: "authentication required but none presented" }); stamp("OUTCOME", { outcome: "AUTH_DENIED", executed: false });
      return Object.freeze({ outcome: "AUTH_DENIED", executed: false, gateVerdict: null, execId: null, evidence: prov.stampProvenance({ phase: "AUTH", verdict: "AUTH_DENIED", executed: false, proposalSha256, order: ["AUTH", "OUTCOME"] }, { revision: (deps as any).revision }), trace, state: { ...s, history: [...(Array.isArray(s.history) ? s.history : [])] } });
    }
    const ares = identity.verifyAuth(authCfg.registry, { challenge: authCfg.challenge, signature: authCfg.signature, presentedPublicKeyPem: authCfg.presentedPublicKeyPem });
    stamp("AUTH", { ok: ares.ok, reason: ares.reason });                    // NEVER contains keys/secrets
    if (ares.ok) authedTenant = ares.identity ? (ares.identity.tenantId ?? null) : null;
    if (!ares.ok) { stamp("OUTCOME", { outcome: "AUTH_DENIED", executed: false });
      return Object.freeze({ outcome: "AUTH_DENIED", executed: false, gateVerdict: null, execId: null, authReason: ares.reason, evidence: prov.stampProvenance({ phase: "AUTH", verdict: "AUTH_DENIED", executed: false, proposalSha256, order: ["AUTH", "OUTCOME"] }, { revision: (deps as any).revision }), trace, state: { ...s, history: [...(Array.isArray(s.history) ? s.history : [])] } });
    }
    // V12 — TENANT/CONTRACT-SCOPED ADMISSION (only when authenticated): the authenticated session's contractSha
    // MUST equal the ACTUAL contract's hash (a session for contract A cannot run contract B), and the contract's
    // declared tenant MUST equal the authenticated tenant. Deny-first, PRE-gate, NO exec.
    const bindFail = (reason: string, tag: string) => { stamp("AUTH_BIND", { ok: false, reason }); stamp("OUTCOME", { outcome: tag, executed: false });
      return Object.freeze({ outcome: tag, executed: false, gateVerdict: null, execId: null, authReason: reason, evidence: prov.stampProvenance({ phase: "AUTH_BIND", verdict: tag, executed: false, tenantId: authedTenant ?? null, proposalSha256, order: ["AUTH", "AUTH_BIND", "OUTCOME"] }, { revision: (deps as any).revision }), trace, state: { ...s, history: [...(Array.isArray(s.history) ? s.history : [])] } }); };
    const actualContractSha = contractShaOf(contract);
    if (authCfg.challenge && authCfg.challenge.contractSha !== actualContractSha) return bindFail("authenticated session is bound to a different contract (contractSha mismatch) — admission refused", "CONTRACT_MISMATCH");
    if (contract && contract.tenantId != null && contract.tenantId !== authedTenant) return bindFail(`contract tenant != authenticated tenant — cross-tenant admission refused`, "TENANT_MISMATCH");
  }

  const verdict = gate.evaluateAgentAction(proposal, contract, s);          // admission ALWAYS via the gate (post-auth)
  stamp("GATE", { verdict: verdict.verdict, controlsFailed: verdict.controlsFailed, record: verdict.record });
  // tenant (authoritative = authenticated identity; else caller-asserted deps.tenantId; else null). Proposal-
  // supplied tenant is NEVER trusted.
  const tenantId = authedTenant !== undefined ? authedTenant : (((deps as any).tenantId) ?? null);
  // deterministic execution id (no clock): binds proposal + TENANT to its evidence + prevents cross-exec/cross-tenant reuse.
  const execId = sha256(`${verdict.record.proposalSha256}:${s.calls}:${(contract && contract.agentId) || ""}:${tenantId ?? ""}`);

  const advanceState = (executed: boolean) => ({
    calls: s.calls + (executed ? 1 : 0),
    elapsedMs: s.elapsedMs,
    revoked: !!s.revoked,
    history: [...(Array.isArray(s.history) ? s.history : []), { tool: proposal && proposal.tool, targetPaths: proposal && proposal.targetPaths }],
  });
  const done = (outcome: string, executed: boolean, extra?: any) => {
    stamp("OUTCOME", { outcome, executed });
    // Lot A — seal an evidence BUNDLE binding the whole chain to this execId (tamper-evident via provenance).
    // V14 — authBound is TRUE only when the authenticated + contract/tenant-bound pre-gate path fully passed
    // (authedTenant is set solely after verifyAuth.ok AND the contractSha/tenant bind checks; any failure returns
    // early). A bare policy ADMIT (no deps.auth) leaves authedTenant undefined ⇒ authBound:false. This sealed flag
    // is what authorizeExecution() requires — a direct/unauthenticated ADMIT can therefore NEVER authorize execution.
    const authBound = authedTenant !== undefined;
    const bundle = prov.stampProvenance({
      execId, tenantId: tenantId ?? null, agentId: (proposal && proposal.agentId) || null, objective: (contract && contract.objective) || null,
      proposalSha256: verdict.record.proposalSha256, verdict: verdict.verdict, executed,
      authBound, contractSha: contractShaOf(contract),
      resultDigest: (extra && extra.resultDigest) || null, verified: !!(extra && extra.verified),
      order: trace.map((t: any) => t.phase),
    }, { revision: (deps as any).revision });
    return Object.freeze({ outcome, executed, gateVerdict: verdict.verdict, execId, tenantId: tenantId ?? null, authBound, evidence: bundle, trace, state: advanceState(executed), ...(extra || {}) });
  };

  // DENY ⇒ NO execution, period.
  if (verdict.verdict === "DENY") return done("DENIED", false);

  // ESCALATE ⇒ suspend for a (simulated) human decision; no execution without approval.
  if (verdict.verdict === "ESCALATE") {
    const decision = typeof deps.humanDecision === "function" ? deps.humanDecision(proposal, verdict) : "reject";
    stamp("HUMAN", { decision });
    if (decision !== "approve") return done("ESCALATED_REJECTED", false);
  }

  // Admitted (ADMIT or ESCALATE→approve): execute the INJECTED executor, recover on error, verify INDEPENDENTLY.
  let execResult: any;
  try {
    execResult = (deps.executor as any)(proposal, execId);
    stamp("EXEC", { execId, ok: !!(execResult && execResult.ok), note: "executor result is UNTRUSTED until independently verified" });
  } catch (e: any) {
    stamp("EXEC_ERROR", { error: String(e && e.message ? e.message : e) });
    return done("ERROR_RECOVERED", true, { verified: false }); // recovered; NO false success
  }
  const resultDigest = sha256(JSON.stringify(execResult ?? null));
  const v = (deps.verifier as any)(proposal, execResult, execId) || { verified: false, reason: "no verifier result" };
  // Lot A — bind the evidence to THIS execution: if the verifier asserts an execId/resultDigest, they MUST match.
  let verified = v.verified === true; const bindNotes: string[] = [];
  if (v.boundExecId !== undefined && v.boundExecId !== execId) { verified = false; bindNotes.push("evidence execId does not bind to this execution (foreign/replayed)"); }
  if (v.resultDigest !== undefined && v.resultDigest !== resultDigest) { verified = false; bindNotes.push("evidence resultDigest != actual result (crypto-valid-but-wrong-result)"); }
  stamp("VERIFY", { execId, resultDigest, verified, reason: [v.reason, ...bindNotes].filter(Boolean).join("; ") });
  const approved = verdict.verdict === "ESCALATE";
  const base = approved ? "ESCALATED_APPROVED" : "ADMITTED";
  return done(`${base}_${verified ? "VERIFIED" : "UNVERIFIED"}`, true, { verified, resultDigest, verifyReason: [v.reason, ...bindNotes].filter(Boolean).join("; ") });
}

/** runSequence — drive an ordered list of proposals, threading state (history/calls) so cumulative drift accrues. */
function runSequence(proposals: any[], contract: any, initialState: any, deps: HarnessDeps): any {
  let st = initialState || { calls: 0, elapsedMs: 0, history: [] };
  const steps: any[] = [];
  let stopped = false; let stoppedAt = -1; let stopReason: string | null = null;
  const list = Array.isArray(proposals) ? proposals : [];
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    // V16 — PER-STEP authorization/context: if authForStep is provided, resolve a FRESH auth for THIS step (its own
    // challenge/nonce). Because the gate's identity layer consumes each nonce once, step 1's proof can NEVER drive
    // step 2 (replay ⇒ AUTH_DENIED ⇒ halt). Without authForStep, deps is used as-is (unauthenticated sequence).
    const stepDeps = typeof (deps as any).authForStep === "function"
      ? Object.assign({}, deps, { auth: (deps as any).authForStep(i, p) })
      : deps;
    const r = runStep(p, contract, st, stepDeps);
    steps.push(r);
    st = r.state;
    // V16 — HALT on a blocking step: anything that is not an independently-verified execution (deny, auth-deny,
    // contract/tenant mismatch, escalate-reject, error-recovered, unverified) STOPS the sequence ⇒ NO later step
    // runs. NOTE: this is a halt, NOT a transaction — steps already executed BEFORE the failure are NOT rolled back.
    if (r.verified !== true) { stopped = true; stoppedAt = i; stopReason = r.outcome; break; }
  }
  return { steps, finalState: st, stopped, stoppedAt, stopReason, completed: !stopped, ranCount: steps.length };
}

/**
 * verifyEvidenceBundle — INDEPENDENT re-verification of a sealed step bundle. Checks: provenance integrity
 * (tamper), ADMIT↔exec consistency, valid transition order, and (if expectedExecId given) that the bundle binds
 * to THAT execution (foreign/replayed evidence rejected). Returns {ok, reasons}. FAIL-CLOSED on malformed input.
 */
function verifyEvidenceBundle(bundle: any, opts?: any): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!bundle || typeof bundle !== "object") return { ok: false, reasons: ["absent/malformed bundle"] };
  const pv = prov.verifyProvenance(bundle);
  if (!pv.ok) reasons.push(`provenance: ${pv.reason}`);                       // tamper / modified-after-sealing
  const expectedExecId = opts && opts.expectedExecId;
  if (expectedExecId !== undefined && bundle.execId !== expectedExecId) reasons.push("execId does not match the expected execution (foreign/replayed evidence)");
  // TENANT isolation (V11): a bundle may only be attributed to its own tenant. Fail-closed if the caller asserts
  // a tenant and the bundle's tenant is absent or different ⇒ rejects cross-tenant evidence reuse.
  const expectedTenantId = opts && opts.expectedTenantId;
  if (expectedTenantId !== undefined) {
    if (!("tenantId" in bundle)) reasons.push("bundle carries no tenantId — cannot attribute to a tenant (fail-closed)");
    else if (bundle.tenantId !== expectedTenantId) reasons.push(`tenant mismatch (bundle tenant ${JSON.stringify(bundle.tenantId)} != expected ${JSON.stringify(expectedTenantId)}) — cross-tenant evidence rejected`);
  }
  // ADMIT↔exec consistency
  if (bundle.executed === true && !["ADMIT", "ESCALATE"].includes(bundle.verdict)) reasons.push(`execution recorded but verdict was "${bundle.verdict}" (execution without an authorizing verdict)`);
  if (bundle.verdict === "ADMIT" && bundle.executed !== true) reasons.push("ADMIT verdict but no corresponding execution");
  if (bundle.verdict === "DENY" && bundle.executed === true) reasons.push("DENY verdict but execution occurred");
  // transition order: must start GATE; if executed, must include EXEC (or EXEC_ERROR) then OUTCOME
  const ord = Array.isArray(bundle.order) ? bundle.order : [];
  // A sealed chain may start at AUTH (authenticated pre-gate path) or GATE (unauthenticated policy eval); any other
  // first phase is malformed. Whenever execution occurred, a GATE admission MUST be present in the chain.
  if (!(ord[0] === "GATE" || ord[0] === "AUTH")) reasons.push("invalid transition order (must start at AUTH or GATE)");
  if (bundle.executed === true && !ord.includes("GATE")) reasons.push("executed but no GATE admission recorded");
  if (bundle.executed === true && !(ord.includes("EXEC") || ord.includes("EXEC_ERROR"))) reasons.push("executed but no EXEC transition recorded");
  if (bundle.verified === true && !ord.includes("VERIFY")) reasons.push("verified:true but no VERIFY transition");
  return { ok: reasons.length === 0, reasons };
}

/**
 * authorizeExecution — V14 AUTHENTICATED EXECUTION BOUNDARY. The SOLE sanctioned, re-verifiable gate an
 * executor-invoker MUST pass before running anything on the strength of a sealed admission bundle. It deliberately
 * does NOT trust a bare `authenticated` flag, a caller-supplied tenantId, or an isolated ADMIT verdict: it
 * RE-VERIFIES the sealed, provenance-protected evidence AT EXECUTION TIME and binds it to the EXACT expected
 * context the caller intends to act in. Fail-closed — any doubt ⇒ not authorized ⇒ the caller MUST NOT execute.
 *
 *   expected = { tenantId, contractSha, agentId?, execId? }  (tenantId + contractSha are REQUIRED; undefined ⇒ deny)
 *
 * This is what closes the "direct/unauthenticated ADMIT ⇒ execution" bypass: a bundle whose admission was not
 * authenticated + contract/tenant-bound carries authBound:false and is refused here, regardless of its ADMIT verdict.
 */
function authorizeExecution(evidence: any, expected: any): { authorized: boolean; reason: string } {
  const exp = expected && typeof expected === "object" ? expected : {};
  // 1) sealed-evidence integrity + execId/tenant binding (re-uses the INDEPENDENT verifier; fail-closed on malformed/tampered)
  const ev = verifyEvidenceBundle(evidence, { expectedTenantId: exp.tenantId, expectedExecId: exp.execId });
  if (!ev.ok) return { authorized: false, reason: `evidence re-verification failed: ${ev.reasons.join("; ")}` };
  // 2) an AUTHORIZING verdict actually produced execution authority (ADMIT or human-approved ESCALATE), with execution recorded
  if (!["ADMIT", "ESCALATE"].includes(evidence.verdict)) return { authorized: false, reason: `verdict "${evidence.verdict}" does not authorize execution` };
  if (evidence.executed !== true) return { authorized: false, reason: "bundle records no authorized execution" };
  // 3) CORE V14 PROPERTY — the admission must have been AUTHENTICATED + contract/tenant-bound. A bare policy ADMIT
  //    (no auth) is authBound:false and is REFUSED, closing the direct-ADMIT→execution bypass. Not a caller bool.
  if (evidence.authBound !== true) return { authorized: false, reason: "admission was not authenticated + contract/tenant-bound (authBound!=true) — a bare/unauthenticated ADMIT cannot authorize execution" };
  // 4) bind to the EXACT expected contract/tenant/agent — sealed values MUST equal the caller's declared context
  if (!("contractSha" in evidence)) return { authorized: false, reason: "bundle carries no contractSha — cannot bind to a contract (fail-closed)" };
  if (exp.contractSha === undefined || evidence.contractSha !== exp.contractSha) return { authorized: false, reason: "contract binding mismatch (sealed contractSha != expected) — admission was for a different contract" };
  if (exp.tenantId === undefined || evidence.tenantId !== exp.tenantId) return { authorized: false, reason: "tenant binding mismatch (sealed tenant != expected) — admission belongs to a different tenant" };
  if (exp.agentId !== undefined && evidence.agentId !== exp.agentId) return { authorized: false, reason: "agent binding mismatch (sealed agent != expected)" };
  return { authorized: true, reason: "authenticated, contract- and tenant-bound admission re-verified at execution time" };
}

/**
 * createGovernedExecutor — V15 EXECUTOR BOUNDARY. Wraps a raw executor so the ONLY way to invoke it through the
 * returned handle is to present an authorization that `authorizeExecution` accepts. The raw executor is captured in
 * this closure and is NOT a property of the handle — so, GIVEN ONLY THE HANDLE, there is no path to run it without a
 * verified, context-bound authorization (a runtime guarantee via lexical scope — NOT a TypeScript type, and NOT a
 * convention). The handle is frozen and exposes exactly { execute, stats }.
 *
 * HONEST LIMIT (documented, not hidden): this cannot stop a consumer who still holds their OWN reference to the raw
 * executor from calling it directly — that is OUTSIDE this module's control. The sanctioned pattern is to hand the
 * consumer ONLY the governed handle (never the raw function). Inside module-controlled paths, runStep remains the
 * gated invoker (auth + binding + gate ADMIT before any call); this boundary is the sanctioned surface for
 * OUT-OF-HARNESS execution driven by a prior authenticated step's sealed evidence.
 *
 *   execute(proposal, authorization, expected) — authorization = { evidence } (a sealed harness bundle);
 *   expected = { tenantId, contractSha, agentId?, execId? }. Refuses (NO raw call) unless authorizeExecution passes.
 */
function createGovernedExecutor(rawExecutor: any): { execute: (proposal: any, authorization: any, expected: any) => any; stats: () => { executions: number; refusals: number } } {
  if (typeof rawExecutor !== "function") throw new TypeError("createGovernedExecutor requires a function executor");
  let executions = 0; let refusals = 0;                                   // rawExecutor lives ONLY in this scope
  return Object.freeze({
    execute(proposal: any, authorization: any, expected: any) {
      const az = authorizeExecution(authorization && authorization.evidence, expected);
      if (!az.authorized) { refusals += 1; return Object.freeze({ executed: false, authorized: false, reason: az.reason, result: null }); }
      executions += 1;
      const result = rawExecutor(proposal, (expected && expected.execId) || undefined);   // reached ONLY after authorization
      return Object.freeze({ executed: true, authorized: true, reason: az.reason, result });
    },
    stats() { return { executions, refusals }; },
  });
}

export { runStep, runSequence, verifyEvidenceBundle, authorizeExecution, createGovernedExecutor, contractShaOf, sha256 };
module.exports = { runStep, runSequence, verifyEvidenceBundle, authorizeExecution, createGovernedExecutor, contractShaOf, sha256 };
