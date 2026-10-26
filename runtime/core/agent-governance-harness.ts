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

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

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

  const advanceState = (executed: boolean) => ({
    calls: s.calls + (executed ? 1 : 0),
    elapsedMs: s.elapsedMs,
    revoked: !!s.revoked,
    history: [...(Array.isArray(s.history) ? s.history : []), { tool: proposal && proposal.tool, targetPaths: proposal && proposal.targetPaths }],
  });
  const done = (outcome: string, executed: boolean, extra?: any) => {
    stamp("OUTCOME", { outcome, executed });
    return Object.freeze({ outcome, executed, gateVerdict: verdict.verdict, trace, state: advanceState(executed), ...(extra || {}) });
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
    execResult = deps.executor(proposal);
    stamp("EXEC", { ok: !!(execResult && execResult.ok), note: "executor result is UNTRUSTED until independently verified" });
  } catch (e: any) {
    stamp("EXEC_ERROR", { error: String(e && e.message ? e.message : e) });
    return done("ERROR_RECOVERED", true, { verified: false }); // recovered; NO false success
  }
  const v = deps.verifier(proposal, execResult) || { verified: false, reason: "no verifier result" };
  stamp("VERIFY", { verified: v.verified === true, reason: v.reason });
  const approved = verdict.verdict === "ESCALATE";
  const base = approved ? "ESCALATED_APPROVED" : "ADMITTED";
  return done(`${base}_${v.verified === true ? "VERIFIED" : "UNVERIFIED"}`, true, { verified: v.verified === true, verifyReason: v.reason });
}

/** runSequence — drive an ordered list of proposals, threading state (history/calls) so cumulative drift accrues. */
function runSequence(proposals: any[], contract: any, initialState: any, deps: HarnessDeps): any {
  let st = initialState || { calls: 0, elapsedMs: 0, history: [] };
  const steps: any[] = [];
  for (const p of (Array.isArray(proposals) ? proposals : [])) { const r = runStep(p, contract, st, deps); steps.push(r); st = r.state; }
  return { steps, finalState: st };
}

export { runStep, runSequence, sha256 };
module.exports = { runStep, runSequence, sha256 };
