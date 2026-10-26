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

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const ORDER = ["GATE", "EXEC", "VERIFY"]; // the only valid admitted-path transition prefix

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

  const verdict = gate.evaluateAgentAction(proposal, contract, s);          // admission ALWAYS via the gate
  stamp("GATE", { verdict: verdict.verdict, controlsFailed: verdict.controlsFailed, record: verdict.record });
  // deterministic execution id (no clock): binds this step's proposal to its evidence + prevents cross-exec reuse.
  const execId = sha256(`${verdict.record.proposalSha256}:${s.calls}:${(contract && contract.agentId) || ""}`);

  const advanceState = (executed: boolean) => ({
    calls: s.calls + (executed ? 1 : 0),
    elapsedMs: s.elapsedMs,
    revoked: !!s.revoked,
    history: [...(Array.isArray(s.history) ? s.history : []), { tool: proposal && proposal.tool, targetPaths: proposal && proposal.targetPaths }],
  });
  const done = (outcome: string, executed: boolean, extra?: any) => {
    stamp("OUTCOME", { outcome, executed });
    // Lot A — seal an evidence BUNDLE binding the whole chain to this execId (tamper-evident via provenance).
    const bundle = prov.stampProvenance({
      execId, agentId: (proposal && proposal.agentId) || null, objective: (contract && contract.objective) || null,
      proposalSha256: verdict.record.proposalSha256, verdict: verdict.verdict, executed,
      resultDigest: (extra && extra.resultDigest) || null, verified: !!(extra && extra.verified),
      order: trace.map((t: any) => t.phase),
    }, { revision: (deps as any).revision });
    return Object.freeze({ outcome, executed, gateVerdict: verdict.verdict, execId, evidence: bundle, trace, state: advanceState(executed), ...(extra || {}) });
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
  for (const p of (Array.isArray(proposals) ? proposals : [])) { const r = runStep(p, contract, st, deps); steps.push(r); st = r.state; }
  return { steps, finalState: st };
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
  // ADMIT↔exec consistency
  if (bundle.executed === true && !["ADMIT", "ESCALATE"].includes(bundle.verdict)) reasons.push(`execution recorded but verdict was "${bundle.verdict}" (execution without an authorizing verdict)`);
  if (bundle.verdict === "ADMIT" && bundle.executed !== true) reasons.push("ADMIT verdict but no corresponding execution");
  if (bundle.verdict === "DENY" && bundle.executed === true) reasons.push("DENY verdict but execution occurred");
  // transition order: must start GATE; if executed, must include EXEC (or EXEC_ERROR) then OUTCOME
  const ord = Array.isArray(bundle.order) ? bundle.order : [];
  if (ord[0] !== "GATE") reasons.push("invalid transition order (does not start at GATE)");
  if (bundle.executed === true && !(ord.includes("EXEC") || ord.includes("EXEC_ERROR"))) reasons.push("executed but no EXEC transition recorded");
  if (bundle.verified === true && !ord.includes("VERIFY")) reasons.push("verified:true but no VERIFY transition");
  return { ok: reasons.length === 0, reasons };
}

export { runStep, runSequence, verifyEvidenceBundle, sha256 };
module.exports = { runStep, runSequence, verifyEvidenceBundle, sha256 };
