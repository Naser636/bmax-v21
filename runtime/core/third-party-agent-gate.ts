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
 *   ASI01 Goal Hijack/Drift→ allowlist (least agency) + STRUCTURAL drift controls: reject agent-supplied governance
 *                            mutations (contract/identity/permissions are never agent-writable), honor revocation,
 *                            and cap cumulative distinct targets (slow-drift). This is INVARIANT-based, NOT semantic
 *                            intent understanding — a structurally-valid-but-semantically-off action is NOT caught
 *                            here (consequential ones route to the human gate). No external model, no network.
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
const licensePolicy: any = require("./license-policy");
const attest: any = require("./supply-chain-attest");

export interface AgentActionProposal {
  agentId?: string; authToken?: string; tool?: string;
  params?: Record<string, any>; targetPaths?: string[]; claimedEvidence?: any; consequential?: boolean;
  declaredDependencies?: any[];                       // ASI04: deps/tools the agent declares it will use
}
export interface AgentContract {
  agentId: string; objective: string; allowedTools: string[]; authorizedScope: string[];
  limits: { maxCalls: number; maxDurationMs: number; maxDistinctTargets?: number }; requireHumanFor?: string[];
  paramSchemas?: Record<string, any>;                 // ASI02: per-tool versioned schema (optional)
  allowedDependencies?: string[];                     // ASI04: dependency allowlist (deny-by-default)
  supplyChainTarget?: string;                         // license-policy target (default commercial-closed)
  revoked?: boolean;                                  // ASI01: contract revoked ⇒ deny everything
  forbiddenToolCombos?: string[][];                   // ASI01-combinatorial: tool-SETS whose co-occurrence is out of scope
  maxPerTool?: Record<string, number>;               // ASI01-combinatorial: per-tool invocation cap (non-idempotent accrual)
}
// ASI01: agent-supplied top-level fields that would attempt to redefine governance are NEVER authorization.
const GOVERNANCE_MUTATION_FIELDS = ["objective", "contract", "permissions", "authorizedScope", "allowedTools", "limits", "grant", "elevate", "requireHumanFor", "allowedDependencies"];
export interface GateState { calls: number; elapsedMs: number; revoked?: boolean; history?: Array<{ tool?: string; targetPaths?: string[] }> }
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

// ───────────────────────── Lot B — ASI02 per-tool parameter schemas (explicit, versioned) ─────────────────────────
export interface ParamSchema {
  version: string;
  allowExtra: boolean;                               // false ⇒ unexpected fields are REJECTED
  fields: Record<string, { type: "string" | "number" | "boolean" | "object"; required?: boolean; max?: number; pattern?: string }>;
}
/**
 * validateParams — type/required/extra-field/format/size validation against an explicit versioned schema.
 * Returns {ok, errors}. FAIL-CLOSED: no schema for a declared-schema'd tool ⇒ caller treats as deny (ASI02).
 */
function validateParams(tool: string, params: any, schema?: ParamSchema): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!schema || typeof schema !== "object" || !schema.fields) return { ok: true, errors: [] }; // no schema declared ⇒ shape-only (handled upstream)
  const p = params && typeof params === "object" && !Array.isArray(params) ? params : null;
  if (!p) return { ok: false, errors: [`params for "${tool}" must be a plain object`] };
  for (const [k, spec] of Object.entries(schema.fields)) {
    const v = (p as any)[k];
    if (v === undefined || v === null) { if (spec.required) errors.push(`missing required field "${k}"`); continue; }
    const t = Array.isArray(v) ? "object" : typeof v;
    if (t !== spec.type) { errors.push(`field "${k}" expected ${spec.type}, got ${t}`); continue; }
    if (spec.type === "string") {
      if (typeof spec.max === "number" && (v as string).length > spec.max) errors.push(`field "${k}" exceeds max length ${spec.max}`);
      if (spec.pattern && !new RegExp(spec.pattern).test(v as string)) errors.push(`field "${k}" fails format ${spec.pattern}`);
    }
    if (spec.type === "number" && typeof spec.max === "number" && (v as number) > spec.max) errors.push(`field "${k}" exceeds max ${spec.max}`);
  }
  if (!schema.allowExtra) {
    for (const k of Object.keys(p)) if (!(k in schema.fields)) errors.push(`unexpected field "${k}" (schema v${schema.version} forbids extras)`);
  }
  return { ok: errors.length === 0, errors };
}

// ───────────────────────── Lot A — ASI04 supply-chain evaluation (reuse license-policy + supply-chain-attest) ─────
export interface DeclaredDependency { name?: string; version?: string; license?: string; attestation?: any; envelope?: any; publicKeyPem?: string; }
/**
 * evaluateDependencies — ASI04. For each declared dependency: allowlist (deny unknown), license adoption via
 * license-policy (deny non-commercial/unknown for the target), and INTEGRITY only if a signed attestation+key
 * cryptographically verify via supply-chain-attest.verifyStatement (else integrity=UNVERIFIED, never claimed).
 * The agent's own declaration is NEVER independent proof. FAIL-CLOSED: any deny/unknown/malformed ⇒ overall deny.
 */
function evaluateDependencies(deps: any, contract: AgentContract, opts?: any): { ok: boolean; reasons: string[]; failed: string[]; records: any[] } {
  const reasons: string[] = []; const failed: string[] = []; const records: any[] = [];
  const target = (opts && opts.supplyChainTarget) || "commercial-closed";
  const allow = Array.isArray((contract as any).allowedDependencies) ? (contract as any).allowedDependencies : [];
  const list = Array.isArray(deps) ? deps : null;
  if (list === null) { return { ok: false, reasons: ["declaredDependencies malformed (not an array)"], failed: ["ASI04"], records: [] }; }
  for (const d of list) {
    const dep = (d || {}) as DeclaredDependency;
    const key = `${dep.name ?? "?"}@${dep.version ?? "?"}`;
    if (!dep.name || typeof dep.name !== "string") { reasons.push(`dependency malformed (no name)`); failed.push("ASI04"); records.push({ key, decision: "DENY", why: "malformed" }); continue; }
    if (!allow.includes(dep.name)) { reasons.push(`dependency "${dep.name}" not in allowedDependencies (deny-by-default)`); failed.push("ASI04"); records.push({ key, decision: "DENY", why: "unknown/not-allowlisted" }); continue; }
    const lic = licensePolicy.adoptionVerdict(dep.license, { target });
    if (lic.adoptable !== true) { reasons.push(`dependency "${key}" license verdict adoptable=${lic.adoptable} (${lic.reason})`); failed.push("ASI04"); records.push({ key, decision: "DENY", why: "license", licenseFamily: lic.license.family }); continue; }
    // INTEGRITY: only a cryptographically-verified signed attestation counts; otherwise UNVERIFIED (not claimed).
    let integrity = "UNVERIFIED";
    if (dep.attestation && dep.envelope && dep.publicKeyPem) {
      try { integrity = attest.verifyStatement(dep.attestation, dep.envelope, dep.publicKeyPem, {}).ok === true ? "VERIFIED" : "INVALID"; }
      catch { integrity = "INVALID"; }
    }
    if (integrity === "INVALID") { reasons.push(`dependency "${key}" attestation INVALID (tampered/bad signature)`); failed.push("ASI04"); records.push({ key, decision: "DENY", why: "attestation-invalid" }); continue; }
    records.push({ key, decision: "ADMIT", license: lic.license.spdxId, integrity, note: integrity === "UNVERIFIED" ? "no signed attestation — integrity NOT verified (agent declaration is not proof)" : "attestation cryptographically verified" });
  }
  return { ok: failed.length === 0, reasons, failed: Array.from(new Set(failed)), records };
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
  // ASI01 — objective drift (STRUCTURAL/invariant-based; NOT semantic intent understanding — see header)
  if (c.revoked === true || s.revoked === true) { reasons.push("contract/session revoked — no further action admitted"); failed.push("ASI01"); }
  const mutated = GOVERNANCE_MUTATION_FIELDS.filter((f) => Object.prototype.hasOwnProperty.call(p, f));
  if (mutated.length) { reasons.push(`agent proposal attempts to redefine governance (${mutated.join(",")}) — untrusted content is NEVER authorization; the agent cannot change its own contract/identity/permissions`); failed.push("ASI01"); }
  if (typeof c.limits.maxDistinctTargets === "number") {
    const seen = new Set<string>();
    for (const h of (Array.isArray(s.history) ? s.history : [])) for (const tp of (h && Array.isArray(h.targetPaths) ? h.targetPaths : [])) seen.add(tp);
    for (const tp of paths) seen.add(tp);
    if (seen.size > c.limits.maxDistinctTargets) { reasons.push(`cumulative distinct targets ${seen.size} > ${c.limits.maxDistinctTargets} — combined effect exits mission scope (slow drift)`); failed.push("ASI01"); }
  }
  // ASI01 combinatorial — tool-SEQUENCE invariants over history+current (not just path counts)
  {
    const hist = Array.isArray(s.history) ? s.history : [];
    const toolCounts: Record<string, number> = {};
    const toolSet = new Set<string>();
    for (const h of hist) { const t = h && h.tool; if (typeof t === "string") { toolCounts[t] = (toolCounts[t] || 0) + 1; toolSet.add(t); } }
    if (typeof p.tool === "string") { toolCounts[p.tool] = (toolCounts[p.tool] || 0) + 1; toolSet.add(p.tool); }
    // forbidden co-occurrence: a combo whose tools ALL now appear ⇒ dangerous cumulative effect / indirect bypass
    for (const combo of (Array.isArray(c.forbiddenToolCombos) ? c.forbiddenToolCombos : [])) {
      if (Array.isArray(combo) && combo.length && combo.every((t) => toolSet.has(t))) { reasons.push(`forbidden tool combination co-occurred [${combo.join("+")}] — combined effect out of scope / indirect bypass`); failed.push("ASI01"); break; }
    }
    // per-tool invocation cap (non-idempotent accrual / permission accumulation)
    const caps = c.maxPerTool && typeof c.maxPerTool === "object" ? c.maxPerTool : {};
    for (const [t, cap] of Object.entries(caps)) { if (typeof cap === "number" && (toolCounts[t] || 0) > cap) { reasons.push(`tool "${t}" invoked ${toolCounts[t]}× > cap ${cap} (non-idempotent accrual)`); failed.push("ASI01"); break; } }
  }
  // ASI06 — evidence is recorded, NEVER trusted for the verdict (no-false-success)
  if (p.claimedEvidence != null) reasons.push("agent-claimed evidence recorded but NOT trusted (independent verification required downstream)");
  // ASI02 — per-tool parameter schema (only when the contract declares one for this tool; deny-first on allowlist above)
  const schema = c.paramSchemas && p.tool ? c.paramSchemas[p.tool] : undefined;
  if (schema) {
    const pv = validateParams(p.tool as string, p.params, schema);
    if (!pv.ok) { reasons.push(`parameter-schema validation failed: ${pv.errors.slice(0, 3).join("; ")}`); failed.push("ASI02"); }
  }
  // ASI04 — supply-chain: evaluate any declared dependencies (reuse license-policy + supply-chain-attest)
  if (p.declaredDependencies != null) {
    const dv = evaluateDependencies(p.declaredDependencies, c, { supplyChainTarget: c.supplyChainTarget });
    if (!dv.ok) { reasons.push(...dv.reasons); failed.push(...dv.failed); }
    else if (dv.records.length) reasons.push(`dependencies admitted (${dv.records.map((r: any) => r.integrity === "VERIFIED" ? r.key + "✓" : r.key + "~unverified").join(", ")})`);
  }

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

export { evaluateAgentAction, evaluateDependencies, validateParams, pathInScope, sha256 };
module.exports = { evaluateAgentAction, evaluateDependencies, validateParams, pathInScope, sha256 };
