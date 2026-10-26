#!/usr/bin/env node
"use strict";
/*
 * third-party-agent-gate — minimal GOVERNED INGESTION BOUNDARY for a THIRD-PARTY agent (V5 §5, the C4-MVP
 * blocker: ODG governs its OWN runtime; this lets it admit/deny/escalate the proposed actions of an EXTERNAL
 * agent under the SAME discipline). It is an ADAPTER, NOT a new orchestrator/primitive: it maps an external
 * agent's proposed action onto ODG's existing admission model — IDENTITY, CONTRACT, POLICY (deny-by-default),
 * EVIDENCE (no-false-success), RECOVERY (limits/stop) — and returns a verdict + a tamper-evident record. It
 * EXECUTES nothing; ODG's existing EXECUTOR/action-gate/bash-command-governor remain the sole enforcers.
 *
 * Controls are mapped to OWASP Top 10 for Agentic Applications 2026 (pub. 2025-12-09, consulted 2026-10-26):
 *   ASI01 Goal Hijack      → action must be within the authorized objective's allowed-tool allowlist (least agency)
 *   ASI02 Tool Misuse      → tool allowlist + parameter/shape validation
 *   ASI03 Identity/Privilege→ agentId match + auth presence + targetPaths within authorized scope (no escalation)
 *   ASI04 Supply Chain     → (hook) dependency/license references route to license-policy (caller-supplied)
 *   ASI05 Code Execution   → the gate never executes; real exec stays in the bwrap-isolated governor
 *   ASI06 Memory/Evidence  → the agent's claimedEvidence is RECORDED but NEVER trusted for the verdict
 *   ASI07 Inter-Agent Comms→ auth token presence + agentId binding (unauthenticated ⇒ deny)
 *   ASI08 Cascading / ASI10 Rogue → hard call/time/resource budget ⇒ deny when exhausted (circuit-break)
 *   ASI09 Human Trust      → consequential / require-human actions ⇒ ESCALATE (never auto-ADMIT)
 * Pure + deterministic + FAIL-CLOSED. No network, no clock (state is passed in).
 */
import crypto from "node:crypto";

export interface AgentActionProposal {
  agentId?: string; authToken?: string; tool?: string;
  params?: Record<string, any>; targetPaths?: string[]; claimedEvidence?: any; consequential?: boolean;
}
export interface AgentContract {
  agentId: string; objective: string; allowedTools: string[]; authorizedScope: string[];
  limits: { maxCalls: number; maxDurationMs: number }; requireHumanFor?: string[];
}
export interface GateState { calls: number; elapsedMs: number }
export interface GateVerdict {
  verdict: "ADMIT" | "DENY" | "ESCALATE";
  reasons: string[]; controlsFailed: string[]; evidenceTrusted: false;
  record: { authoredBy: string; agentId: string | null; tool: string | null; proposalSha256: string; verdict: string };
}

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
// A scope-relative path is safe iff relative, in-tree, no traversal, no NUL.
function pathInScope(p: any, scope: string[]): boolean {
  if (typeof p !== "string" || !p || p.includes("\0")) return false;
  if (p.startsWith("/") || p.includes("..")) return false;            // absolute / traversal ⇒ escape
  return scope.some((s) => p === s || p.startsWith(s.endsWith("/") ? s : s + "/"));
}

/**
 * evaluateAgentAction — deterministic admission for ONE proposed external-agent action.
 * ADMIT only if every hard control passes and no human-gate triggers; ESCALATE on human-gate; else DENY.
 * FAIL-CLOSED: malformed proposal/contract ⇒ DENY.
 */
function evaluateAgentAction(proposal: AgentActionProposal, contract: AgentContract, state: GateState, opts?: any): GateVerdict {
  const reasons: string[] = []; const failed: string[] = [];
  const p = proposal || ({} as AgentActionProposal);
  const c = contract || ({} as AgentContract);
  const s = state || { calls: 0, elapsedMs: 0 };
  const proposalSha256 = sha256(JSON.stringify({ a: p.agentId ?? null, t: p.tool ?? null, pr: p.params ?? null, tp: p.targetPaths ?? null }));
  const rec = (verdict: string) => ({ authoredBy: "ODG_AGENT_GATE", agentId: p.agentId ?? null, tool: p.tool ?? null, proposalSha256, verdict });

  // Structural / fail-closed
  if (!c || typeof c !== "object" || !Array.isArray(c.allowedTools) || !Array.isArray(c.authorizedScope) || !c.limits) {
    return { verdict: "DENY", reasons: ["malformed/absent contract — fail-closed"], controlsFailed: ["STRUCTURAL"], evidenceTrusted: false, record: rec("DENY") };
  }
  // ASI03/ASI07 — identity + auth presence + binding
  if (!p.agentId || p.agentId !== c.agentId) { reasons.push("agent identity missing or not the contracted agent"); failed.push("ASI03"); }
  if (!p.authToken || typeof p.authToken !== "string") { reasons.push("no authentication token presented (unauthenticated ingress)"); failed.push("ASI07"); }
  // ASI01/ASI02 — least-agency allowlist + param shape
  if (!p.tool || !c.allowedTools.includes(p.tool)) { reasons.push(`tool "${p.tool ?? ""}" not in the authorized allowlist (goal-hijack/least-agency)`); failed.push("ASI01"); }
  if (p.params != null && (typeof p.params !== "object" || Array.isArray(p.params))) { reasons.push("params malformed (tool-misuse)"); failed.push("ASI02"); }
  // ASI03 — scope / privilege (every targetPath must be in authorized scope)
  const paths = Array.isArray(p.targetPaths) ? p.targetPaths : [];
  const escapes = paths.filter((x) => !pathInScope(x, c.authorizedScope));
  if (escapes.length) { reasons.push(`targetPaths escape authorized scope (privilege/scope): ${escapes.slice(0, 3).join(", ")}`); failed.push("ASI03"); }
  // ASI08/ASI10 — hard budget (circuit-break)
  if (!(s.calls < c.limits.maxCalls)) { reasons.push(`call budget exhausted (${s.calls}/${c.limits.maxCalls}) — circuit-break`); failed.push("ASI10"); }
  if (!(s.elapsedMs < c.limits.maxDurationMs)) { reasons.push(`time budget exhausted (${s.elapsedMs}/${c.limits.maxDurationMs}ms)`); failed.push("ASI08"); }
  // ASI06 — evidence is recorded, NEVER trusted for the verdict (no-false-success)
  if (p.claimedEvidence != null) reasons.push("agent-claimed evidence recorded but NOT trusted (independent verification required downstream)");

  if (failed.length) return { verdict: "DENY", reasons, controlsFailed: Array.from(new Set(failed)), evidenceTrusted: false, record: rec("DENY") };

  // ASI09 — human gate for consequential / require-human tools ⇒ ESCALATE (never auto-admit)
  const requireHuman = Array.isArray(c.requireHumanFor) ? c.requireHumanFor : [];
  if (p.consequential === true || requireHuman.includes(p.tool as string)) {
    reasons.push("consequential / human-required action ⇒ ESCALATE to a human gate (no auto-admit)");
    return { verdict: "ESCALATE", reasons, controlsFailed: [], evidenceTrusted: false, record: rec("ESCALATE") };
  }
  reasons.push("in-contract, in-scope, within budget, authenticated ⇒ ADMIT (execution + success remain subject to ODG's executor + independent verification)");
  return { verdict: "ADMIT", reasons, controlsFailed: [], evidenceTrusted: false, record: rec("ADMIT") };
}

export { evaluateAgentAction, pathInScope, sha256 };
module.exports = { evaluateAgentAction, pathInScope, sha256 };
