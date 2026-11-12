#!/usr/bin/env node
"use strict";
/*
 * V166 (§9/§18 — radar-driven capability: OpenTelemetry GenAI observability for ODG execution). PURE, deterministic,
 * fail-closed. Converts an ODG execution report (the REAL patch-execution.json shape emitted by patch-executor:
 * {mission, executed:[{action,status,authoredBy,appliedBy,objectiveId?,code?}]}) into OpenTelemetry GenAI
 * semantic-convention spans — closing a real observability gap (ODG produced rich execution evidence but no
 * standard-conformant trace export for plans/executions/tools/errors/provenance).
 *
 * Grounded in verified public references (radar, V141 grant, read-only, 2026-11-12):
 *  - OpenTelemetry GenAI semantic conventions v1.42 (June 2026), open-telemetry/semantic-conventions-genai:
 *    REQUIRED on every GenAI span: gen_ai.operation.name, gen_ai.provider.name. Agent/plan spans: operation ∈
 *    {invoke_agent, plan, create_agent}; span name "{operation} {agent.name}"; attrs gen_ai.agent.id/name.
 *    Execute-tool span: operation="execute_tool"; name "execute_tool {tool.name}"; attrs gen_ai.tool.name,
 *    gen_ai.tool.type ∈ {function, retrieval, extension}, gen_ai.tool.call.id. error.type ONLY when the op errored
 *    (well-known fallback "_OTHER"); span status ERROR on failure.
 *
 * HONEST: ODG is NOT an LLM provider — gen_ai.provider.name is set to a truthful "odg" (the executing agent system),
 * and ODG's own concordant attribution (actor-provenance vocabulary) is carried as odg.* attributes, NOT misrepresented
 * as model output. No telemetry is EXPORTED anywhere (no network, no collector) — this MINTS conformant spans only.
 */
const crypto = require("node:crypto");

// Exact OTel GenAI semantic-convention attribute keys (quoted from the spec — do not rename).
const GEN_AI = Object.freeze({
  OPERATION: "gen_ai.operation.name",
  PROVIDER: "gen_ai.provider.name",
  AGENT_ID: "gen_ai.agent.id",
  AGENT_NAME: "gen_ai.agent.name",
  TOOL_NAME: "gen_ai.tool.name",
  TOOL_TYPE: "gen_ai.tool.type",
  TOOL_CALL_ID: "gen_ai.tool.call.id",
  ERROR_TYPE: "error.type",
});
const OPERATIONS = Object.freeze(new Set(["create_agent", "invoke_agent", "plan", "execute_tool", "chat", "embeddings"]));
const TOOL_TYPES = Object.freeze(new Set(["function", "retrieval", "extension"]));

function hex(material: string, bytes: number): string { return crypto.createHash("sha256").update(material).digest("hex").slice(0, bytes * 2); }

// ODG actions map to OTel tool types deterministically: read/inspect-only ops are "retrieval", the rest are "function".
// Conservative + honest: unknown ⇒ "function" (the executing-op default), never invented.
function toolTypeFor(action: any): string {
  const a = String(action || "").toUpperCase();
  return /READ|INSPECT|DIAGNOSTIC|QUERY|GET|LIST|AUDIT/.test(a) ? "retrieval" : "function";
}

/* emitGenAiTrace(report, opts) — mint OTel GenAI spans from a REAL ODG execution report. Returns { traceId, spans }.
 * One root invoke_agent span + one execute_tool span per executed[] entry. Deterministic ids (sha256 of mission+index;
 * NO randomness). Fail-closed on a malformed report. */
function emitGenAiTrace(report: any, opts?: any): any {
  if (!report || typeof report !== "object" || typeof report.mission !== "string") return Object.freeze({ ok: false, code: "NO_REPORT", spans: Object.freeze([]) });
  const agentName = (opts && typeof opts.agentName === "string" && opts.agentName) || "odg";
  const executed: any[] = Array.isArray(report.executed) ? report.executed : [];
  const traceId = hex("trace:" + report.mission, 16);
  const rootId = hex("span:" + report.mission + ":root", 8);
  const anyFailed = executed.some((e) => e && e.status === "FAILED");

  const spans: any[] = [];
  // Root: invoke_agent {agent} (INTERNAL). Required attrs present; status reflects whether any tool failed.
  spans.push(Object.freeze({
    name: `invoke_agent ${agentName}`,
    kind: "INTERNAL",
    traceId, spanId: rootId, parentSpanId: null,
    status: anyFailed ? "ERROR" : "OK",
    attributes: Object.freeze({
      [GEN_AI.OPERATION]: "invoke_agent",
      [GEN_AI.PROVIDER]: "odg",
      [GEN_AI.AGENT_ID]: hex("agent:" + agentName, 8),
      [GEN_AI.AGENT_NAME]: agentName,
      "odg.mission": report.mission,
      "odg.executed.count": executed.length,
      ...(anyFailed ? { [GEN_AI.ERROR_TYPE]: "_OTHER" } : {}),
    }),
  }));

  // One execute_tool span per REAL executed[] entry (no fabricated spans; count is exact).
  executed.forEach((e: any, i: number) => {
    const action = (e && (e.action || e.objectiveId)) || "unknown";
    const failed = e && e.status === "FAILED";
    const attrs: any = {
      [GEN_AI.OPERATION]: "execute_tool",
      [GEN_AI.PROVIDER]: "odg",
      [GEN_AI.TOOL_NAME]: String(action),
      [GEN_AI.TOOL_TYPE]: toolTypeFor(action),
      [GEN_AI.TOOL_CALL_ID]: `${report.mission}-${i}`,
      // ODG honest attribution carried as odg.* (NOT misrepresented as model/provider output):
      "odg.status": (e && e.status) || "UNKNOWN",
      "odg.authored_by": (e && e.authoredBy) || "UNKNOWN",
      "odg.applied_by": (e && e.appliedBy) || null,
    };
    if (failed) attrs[GEN_AI.ERROR_TYPE] = (e && typeof e.code === "string" && e.code) ? e.code : "_OTHER";
    spans.push(Object.freeze({
      name: `execute_tool ${action}`,
      kind: "INTERNAL",
      traceId, spanId: hex("span:" + report.mission + ":" + i, 8), parentSpanId: rootId,
      status: failed ? "ERROR" : "OK",
      attributes: Object.freeze(attrs),
    }));
  });

  return Object.freeze({ ok: true, traceId, spans: Object.freeze(spans) });
}

/* validateConformance(spans) — independent conformance check against the OTel GenAI conventions (the validator does NOT
 * reuse the emitter; it re-derives the rules). Returns { ok, violations }. */
function validateConformance(spans: any): any {
  const violations: string[] = [];
  const list = Array.isArray(spans) ? spans : [];
  if (list.length === 0) violations.push("no spans");
  for (const s of list) {
    const a = (s && s.attributes) || {};
    const op = a[GEN_AI.OPERATION];
    if (!op || !OPERATIONS.has(op)) violations.push(`span "${s && s.name}" has missing/unknown ${GEN_AI.OPERATION}`);
    if (!a[GEN_AI.PROVIDER]) violations.push(`span "${s && s.name}" missing required ${GEN_AI.PROVIDER}`);
    // span name must begin with the operation name (OTel "{operation} {name}" convention)
    if (op && typeof s.name === "string" && s.name.split(" ")[0] !== op) violations.push(`span "${s.name}" name does not start with operation "${op}"`);
    if (op === "execute_tool") {
      if (!a[GEN_AI.TOOL_NAME]) violations.push(`execute_tool span missing ${GEN_AI.TOOL_NAME}`);
      if (!TOOL_TYPES.has(a[GEN_AI.TOOL_TYPE])) violations.push(`execute_tool span has invalid ${GEN_AI.TOOL_TYPE}="${a[GEN_AI.TOOL_TYPE]}"`);
      if (!a[GEN_AI.TOOL_CALL_ID]) violations.push(`execute_tool span missing ${GEN_AI.TOOL_CALL_ID}`);
    }
    // error.type present IFF the span errored (conditional-required: only on error, never otherwise)
    const hasErr = Object.prototype.hasOwnProperty.call(a, GEN_AI.ERROR_TYPE);
    if (s && s.status === "ERROR" && !hasErr) violations.push(`errored span "${s.name}" missing ${GEN_AI.ERROR_TYPE}`);
    if (s && s.status !== "ERROR" && hasErr) violations.push(`non-errored span "${s.name}" must NOT carry ${GEN_AI.ERROR_TYPE}`);
  }
  return Object.freeze({ ok: violations.length === 0, violations: Object.freeze(violations) });
}

const OTEL_GENAI_CONTRACT = Object.freeze({
  id: "V166-OTEL-GENAI-TRACE",
  purpose: "§9/§18 — mint OpenTelemetry GenAI semantic-convention spans from ODG's REAL execution report (plans/tools/errors/provenance observability)",
  worldReference: "OpenTelemetry GenAI semantic conventions v1.42 (open-telemetry/semantic-conventions-genai) — required gen_ai.operation.name + gen_ai.provider.name; invoke_agent/plan/execute_tool spans; gen_ai.tool.{name,type,call.id}; error.type only on error",
  invariants: Object.freeze([
    "consumes the REAL patch-execution report shape; mints EXACTLY one execute_tool span per executed[] entry (no fabricated spans)",
    "exact OTel GenAI attribute keys (gen_ai.operation.name/provider.name/agent.id/name/tool.name/tool.type/tool.call.id, error.type)",
    "HONEST: provider.name=\"odg\" (not an LLM provider); ODG attribution carried as odg.* (never misrepresented as model output)",
    "deterministic ids (sha256 of mission+index — NO randomness); fail-closed on a malformed report",
    "MINTS spans only — NO network/collector/export (no egress); the independent validator re-derives the conformance rules",
  ]),
});
module.exports = { emitGenAiTrace, validateConformance, toolTypeFor, GEN_AI, OPERATIONS, TOOL_TYPES, OTEL_GENAI_CONTRACT };
export {};
