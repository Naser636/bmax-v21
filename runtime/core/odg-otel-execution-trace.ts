#!/usr/bin/env node
"use strict";
/*
 * V167 (§16/§17 — wire OpenTelemetry to ODG's REAL execution paths + a collector-safe governed exporter). PURE,
 * deterministic, fail-closed. Builds on V166 odg-otel-genai-trace (reuses its span emitter — NO parallel emitter).
 *
 * §16: compose a COMPLETE execution trace from ODG's real artifacts — the patch-execution report (missions/tools/errors)
 *   AND, when a delegation happened, the V157 provider-governance sealed-evidence bundle (the ODG→provider HANDOFF:
 *   execId + contractSha + agentId). Durations are carried ONLY when the artifacts actually contain timing — never fabricated.
 * §17: EXPORT the trace as OTLP/JSON, but only to an AVAILABLE, PERMITTED destination; with NO collector it must behave
 *   correctly (no egress, return the payload); it REDACTS sensitive opt-in content before export (protect secrets/data) and
 *   bounds payload size (protect cost). No real network egress is performed here — a test-only _post seam injects transport.
 *
 * Grounded in verified public references (radar, V141 grant VALID→2026-11-19, read-only, 2026-11-12):
 *  - OTLP/JSON (opentelemetry.io/docs/specs/otlp + opentelemetry-proto examples): resourceSpans → resource + scopeSpans →
 *    scope + spans; span {traceId:32hex, spanId:16hex, parentSpanId, name, kind:int (INTERNAL=1,SERVER=2,CLIENT=3),
 *    startTimeUnixNano/endTimeUnixNano:decimal-string, status:{code} (UNSET=0,OK=1,ERROR=2)}; attributes = [{key,
 *    value:{stringValue|intValue|boolValue}}].
 */
const GENAI = require("./odg-otel-genai-trace.js");

const SPAN_KIND = Object.freeze({ INTERNAL: 1, SERVER: 2, CLIENT: 3 });
const STATUS_CODE = Object.freeze({ UNSET: 0, OK: 1, ERROR: 2 });
// Sensitive opt-in content that must NEVER leave the process on export (OTel GenAI opt-in message/prompt attributes +
// any odg secret-ish keys). Redacted before OTLP egress to protect secrets/data.
const SENSITIVE_KEYS = Object.freeze(new Set([
  "gen_ai.input.messages", "gen_ai.output.messages", "gen_ai.system_instructions", "gen_ai.prompt", "gen_ai.completion",
  "odg.secret", "odg.token", "odg.credential", "odg.key",
]));
const MAX_PAYLOAD_BYTES = 5 * 1024 * 1024; // cost guard

/* composeExecutionTrace(opts) — full OTel GenAI trace from REAL ODG artifacts. Reuses V166 emitGenAiTrace for the
 * mission's root + execute_tool spans; when providerEvidence is present, inserts an honest ODG→provider HANDOFF span. */
function composeExecutionTrace(opts?: any): any {
  const o = opts || {};
  const base = GENAI.emitGenAiTrace(o.patchExecution, { agentName: o.agentName || "odg" });
  if (!base.ok) return Object.freeze({ ok: false, code: "NO_EXECUTION", spans: Object.freeze([]) });
  const spans: any[] = base.spans.map((s: any) => ({ ...s, attributes: { ...s.attributes } }));
  const root = spans[0];

  const ev = o.providerEvidence;
  if (ev && typeof ev === "object" && (typeof ev.execId === "string" || typeof ev.agentId === "string")) {
    // HANDOFF: ODG delegated to a technical provider. Insert an invoke_agent span for the provider as a child of the ODG
    // root, carrying the sealed-evidence provenance (execId/contractSha/agentId). Re-parent the tool spans under it — the
    // tools were executed within the delegated scope. Honest: provider.name="technical_provider" (NOT ODG, NOT an LLM).
    const handoffId = GENAI.GEN_AI ? hashId("handoff:" + (ev.execId || ev.agentId || "x")) : "handoff";
    const handoff: any = {
      name: "invoke_agent technical_provider",
      kind: "INTERNAL",
      traceId: root.traceId, spanId: handoffId, parentSpanId: root.spanId,
      status: root.status,
      attributes: {
        "gen_ai.operation.name": "invoke_agent",
        "gen_ai.provider.name": "technical_provider",
        "gen_ai.agent.id": String(ev.agentId || "unknown"),
        "gen_ai.agent.name": "technical_provider",
        "odg.handoff.exec_id": String(ev.execId || "unknown"),
        "odg.handoff.contract_sha": String(ev.contractSha || "unknown"),
        "odg.handoff.sealed": ev.sealed === true || typeof ev.execId === "string",
        ...(root.status === "ERROR" ? { "error.type": "_OTHER" } : {}),
      },
    };
    // re-parent every execute_tool span onto the handoff span
    for (const s of spans) if (s.attributes["gen_ai.operation.name"] === "execute_tool") s.parentSpanId = handoffId;
    spans.splice(1, 0, handoff);
  }

  // Durations (§16): carry ONLY when the real report provided them; otherwise omit (never fabricate time).
  const timing = o.timing && typeof o.timing === "object" ? o.timing : null;
  if (timing) for (const s of spans) { const t = timing[s.spanId]; if (t && Number.isFinite(t.startUnixNano) && Number.isFinite(t.endUnixNano)) { s.startTimeUnixNano = String(t.startUnixNano); s.endTimeUnixNano = String(t.endUnixNano); } }

  const frozen = spans.map((s: any) => Object.freeze({ ...s, attributes: Object.freeze(s.attributes) }));
  return Object.freeze({ ok: true, traceId: root.traceId, spans: Object.freeze(frozen) });
}

function hashId(material: string): string { return require("node:crypto").createHash("sha256").update(material).digest("hex").slice(0, 16); }

function attrValue(v: any): any {
  if (typeof v === "boolean") return { boolValue: v };
  if (typeof v === "number" && Number.isInteger(v)) return { intValue: String(v) };
  return { stringValue: v == null ? "" : String(v) };
}

/* toOtlp(trace, opts) — convert composed spans to OTLP/JSON ResourceSpans (the wire shape a collector accepts). */
function toOtlp(trace: any, opts?: any): any {
  if (!trace || !trace.ok || !Array.isArray(trace.spans)) return Object.freeze({ resourceSpans: Object.freeze([]) });
  const serviceName = (opts && opts.serviceName) || "odg";
  const spans = trace.spans.map((s: any) => {
    const span: any = {
      traceId: s.traceId, spanId: s.spanId,
      name: s.name,
      kind: SPAN_KIND[s.kind as keyof typeof SPAN_KIND] || SPAN_KIND.INTERNAL,
      status: { code: s.status === "ERROR" ? STATUS_CODE.ERROR : STATUS_CODE.OK },
      attributes: Object.keys(s.attributes).map((k) => ({ key: k, value: attrValue(s.attributes[k]) })),
    };
    if (s.parentSpanId) span.parentSpanId = s.parentSpanId;
    if (s.startTimeUnixNano) span.startTimeUnixNano = s.startTimeUnixNano;
    if (s.endTimeUnixNano) span.endTimeUnixNano = s.endTimeUnixNano;
    return span;
  });
  return Object.freeze({ resourceSpans: [{ resource: { attributes: [{ key: "service.name", value: { stringValue: serviceName } }] }, scopeSpans: [{ scope: { name: "odg.otel-genai", version: "v167" }, spans }] }] });
}

/* redactOtlp(otlp) — strip sensitive opt-in content attributes before any export (§17 protect secrets/data). Returns the
 * redacted payload + the list of redacted keys. Pure (does not mutate the input). */
function redactOtlp(otlp: any): any {
  const redacted: string[] = [];
  const rs = (otlp && Array.isArray(otlp.resourceSpans)) ? otlp.resourceSpans : [];
  const out = { resourceSpans: rs.map((r: any) => ({
    resource: r.resource,
    scopeSpans: (r.scopeSpans || []).map((sc: any) => ({
      scope: sc.scope,
      spans: (sc.spans || []).map((sp: any) => ({ ...sp, attributes: (sp.attributes || []).filter((a: any) => { if (SENSITIVE_KEYS.has(a.key)) { redacted.push(a.key); return false; } return true; }) })),
    })),
  })) };
  return { payload: out, redactedKeys: redacted };
}

/* exportTrace(otlp, sink, opts) — GOVERNED, collector-safe export (§17). Redacts secrets, bounds payload (cost), and
 * NEVER performs real network egress unless a test-only _post transport is injected AND the sink is explicitly permitted.
 * With no collector ⇒ no egress, returns the (redacted) payload. */
function exportTrace(otlp: any, sink?: any, opts?: any): any {
  const { payload, redactedKeys } = redactOtlp(otlp);
  const bytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
  if (bytes > MAX_PAYLOAD_BYTES) return Object.freeze({ exported: false, reason: `payload ${bytes}B exceeds cost bound ${MAX_PAYLOAD_BYTES}B`, redactedKeys: Object.freeze(redactedKeys), payloadBytes: bytes });

  const s = sink || { type: "none" };
  if (s.type === "none") return Object.freeze({ exported: false, reason: "no collector configured — no egress (payload buffered in-return)", sink: "none", redactedKeys: Object.freeze(redactedKeys), payloadBytes: bytes, payload: Object.freeze(payload) });
  if (s.type === "memory") { if (Array.isArray(s.buffer)) s.buffer.push(payload); return Object.freeze({ exported: true, sink: "memory", redactedKeys: Object.freeze(redactedKeys), payloadBytes: bytes, spanCount: countSpans(payload) }); }
  if (s.type === "otlp") {
    // Real OTLP egress is only allowed with a present endpoint AND an injected governed transport (no fabricated
    // endpoint/credential; default deny ⇒ protects secrets/cost). This environment has no governed collector.
    const post = opts && typeof opts._post === "function" ? opts._post : null;
    if (!s.endpoint || !post) return Object.freeze({ exported: false, reason: "OTLP egress not permitted (no governed collector endpoint/transport available) — refused, no fabricated destination", sink: "otlp", redactedKeys: Object.freeze(redactedKeys), payloadBytes: bytes });
    const res = post(s.endpoint, payload, { "content-type": "application/json", ...(s.token ? { authorization: `Bearer ${s.token}` } : {}) });
    return Object.freeze({ exported: res && res.ok === true, sink: "otlp", endpoint: s.endpoint, status: res && res.status, redactedKeys: Object.freeze(redactedKeys), payloadBytes: bytes });
  }
  return Object.freeze({ exported: false, reason: `unknown sink type "${s.type}"`, redactedKeys: Object.freeze(redactedKeys), payloadBytes: bytes });
}

function countSpans(payload: any): number { let n = 0; for (const r of payload.resourceSpans || []) for (const sc of r.scopeSpans || []) n += (sc.spans || []).length; return n; }

const OTEL_EXECUTION_TRACE_CONTRACT = Object.freeze({
  id: "V167-OTEL-EXECUTION-TRACE",
  purpose: "§16/§17 — compose a full OTel trace from ODG's REAL execution + provider-handoff artifacts; export as OTLP/JSON via a collector-safe, secret-redacting, cost-bounded governed exporter",
  reuses: ["odg-otel-genai-trace.ts emitGenAiTrace (V166) — the REAL span emitter; NO parallel emitter"],
  worldReference: "OTLP/JSON 1.11.x (opentelemetry.io/docs/specs/otlp + opentelemetry-proto examples): resourceSpans/scopeSpans/spans; kind INTERNAL=1; status.code OK=1/ERROR=2; attributes [{key,value:{stringValue|intValue|boolValue}}]",
  invariants: Object.freeze([
    "composes the ODG→provider HANDOFF span from the V157 sealed-evidence bundle (execId/contractSha/agentId); provider.name=\"technical_provider\" (NOT ODG/LLM)",
    "durations carried ONLY when the real artifacts contain timing — never fabricated (no Date.now)",
    "OTLP/JSON shape conformant (resourceSpans/scopeSpans; kind INTERNAL=1; status OK=1/ERROR=2; typed keyValue attributes)",
    "EXPORT is collector-safe: no collector ⇒ NO egress (returns redacted payload); REDACTS sensitive opt-in content before export; bounds payload size (cost)",
    "NO real network egress (default deny; no fabricated endpoint/credential); a test-only _post seam injects transport; deterministic + fail-closed",
  ]),
});
module.exports = { composeExecutionTrace, toOtlp, redactOtlp, exportTrace, SPAN_KIND, STATUS_CODE, SENSITIVE_KEYS, OTEL_EXECUTION_TRACE_CONTRACT };
export {};
