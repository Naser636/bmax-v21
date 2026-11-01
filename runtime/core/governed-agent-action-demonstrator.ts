#!/usr/bin/env node
/**
 * governed-agent-action-demonstrator — ONE composed governed agentic-action run for profession P2
 * (AI, ML & Agentic Engineering). CTO Master Campaign V3, Wave-2 integrated demonstrator.
 *
 * ORCHESTRATES already-MERGED modules (NO new capability, NO new primitive):
 *   1. evaluate a third-party agent's proposed action against its contract → third-party-agent-gate.evaluateAgentAction
 *      (fail-closed deny-by-default: malformed/absent contract ⇒ DENY; returns ADMIT | DENY | ESCALATE)
 *   2. charter the gate verdict with method + (optional) ground-truth provenance → charter-record.makeCharter
 *   3. (optional) measure the decision evaluator's false-success resistance → misleading-case-corpus.scoreResistance
 *   4. compose one verdict: GOVERNED_AGENT_DECISION (+ gateVerdict, authenticated, chartered, resistance, gaps)
 *
 * HONEST SCOPE: this governs an agent ACTION (ADMIT/DENY/ESCALATE) — it does NOT itself execute anything, and it
 * NEVER upgrades a DENY/ESCALATE to execution authority (that requires a sealed, authenticated, contract/tenant-
 * bound evidence bundle re-verified by agent-governance-harness.authorizeExecution — out of this demonstrator's
 * scope). FAIL-CLOSED. PURE compute (proposal/contract/state passed in; no network/clock). NOTE: the charter seal
 * (charter-record → evidence-provenance) reads git HEAD for provenance unless a `revision` is injected —
 * fail-closed + per-process cached, never network. ADDITIVE. Dual export.
 */
"use strict";

const GATE = require("./third-party-agent-gate.js");
const CH = require("./charter-record.js");
const MCC = require("./misleading-case-corpus.js");

const SCHEMA = "odg.governed-agent-action-demonstrator.v1";
const BASIS = "AGENT_ACTION_GOVERNANCE_NOT_EXECUTION";
const VERDICT = Object.freeze({ DECIDED: "GOVERNED_AGENT_DECISION", INCOMPLETE: "GOVERNED_AGENT_INCOMPLETE" });
const MA_OF: Record<string, string> = { ADMIT: "ACCEPT", DENY: "REJECT", ESCALATE: "UNKNOWN" };

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/**
 * runGovernedAgentAction(input) — gate → charter → (optional resistance). input:
 *   { proposal, contract, state?, evaluateFn?, method?, groundTruth?, key?, revision?, runId? }
 * NEVER throws on bad input (fail-closed: missing proposal/contract ⇒ the gate itself denies).
 */
function runGovernedAgentAction(input: any): any {
  if (!isObj(input)) return { ok: false, schema: SCHEMA, verdict: VERDICT.INCOMPLETE, code: "INVALID_INPUT", reason: "input object required", basis: BASIS };
  const gaps: string[] = [];
  const steps: any = {};

  // STEP 1 — the governance gate (fail-closed deny-by-default).
  const gate = GATE.evaluateAgentAction(input.proposal, input.contract, input.state || { calls: 0, elapsedMs: 0 });
  steps.gate = gate;
  const gateVerdict = gate && gate.verdict ? gate.verdict : "DENY";
  if (gateVerdict === "DENY") gaps.push(`action DENIED (fail-closed): ${Array.isArray(gate.reasons) ? gate.reasons.join("; ") : "denied"}.`);
  else if (gateVerdict === "ESCALATE") gaps.push(`action ESCALATED to a human — not auto-admitted: ${Array.isArray(gate.reasons) ? gate.reasons.join("; ") : "escalation required"}.`);
  if (gate && gate.authenticated !== true) gaps.push("proposal not authenticated — a bare/unauthenticated admission cannot authorize execution (authorizeExecution would refuse).");

  // STEP 2 — charter the verdict (MA-shaped; ADMIT→ACCEPT, DENY→REJECT, ESCALATE→UNKNOWN).
  const charter = CH.makeCharter({
    subject: `agent action ${input.proposal && input.proposal.tool ? input.proposal.tool : "(tool?)"} by ${input.proposal && input.proposal.agentId ? input.proposal.agentId : "(agent?)"}`,
    method: isObj(input.method) || typeof input.method === "string" ? input.method : "third-party-agent-gate.evaluateAgentAction (OWASP-Agentic, deny-by-default)",
    verdict: { verdict: MA_OF[gateVerdict] || "UNKNOWN" },
    groundTruth: input.groundTruth,
    key: input.key, revision: input.revision, runId: input.runId,
  });
  steps.charter = charter;
  const chartered = !!(charter && charter.ok);
  if (!chartered) gaps.push(`charter not produced: ${charter && charter.reason ? charter.reason : "unknown"}.`);

  // STEP 3 — (optional) false-success resistance of a supplied decision evaluator (honest measurement).
  let resistance: any = null;
  if (typeof input.evaluateFn === "function") {
    const r = MCC.scoreResistance(input.evaluateFn);
    steps.resistance = r;
    if (r && r.ok) { resistance = { total: r.total, fooled: r.fooled, falseSuccessRate: r.falseSuccessRate }; if (r.fooled > 0) gaps.push(`decision evaluator fooled on ${r.fooled}/${r.total} misleading case(s) (falseSuccessRate ${r.falseSuccessRate}) — honest resistance gap.`); }
  }

  return {
    ok: true,
    schema: SCHEMA,
    verdict: VERDICT.DECIDED,
    basis: BASIS,
    summary: {
      gateVerdict,
      authenticated: !!(gate && gate.authenticated === true),
      evidenceTrusted: !!(gate && gate.evidenceTrusted === true),
      executionAuthorized: false, // this demonstrator never grants execution authority (see note)
      chartered,
      resistance,
      gapCount: gaps.length,
    },
    gaps,
    steps,
    note: "Composed governed agentic action: fail-closed gate (ADMIT/DENY/ESCALATE) → chartered verdict → optional false-success-resistance probe. Governs the DECISION only — never executes, and never grants execution authority (that needs a sealed, authenticated, contract/tenant-bound bundle re-verified by agent-governance-harness.authorizeExecution).",
  };
}

export { runGovernedAgentAction, SCHEMA, VERDICT, BASIS };
module.exports = { runGovernedAgentAction, SCHEMA, VERDICT, BASIS };
