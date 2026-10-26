// @ts-nocheck
// SHARED-CORE OpenTelemetry export (Domain-A/B) — build vendor-neutral OTLP/JSON trace spans with GenAI semantic
// conventions, WITHOUT a network dependency or a heavy SDK. Realises the benchmark-register decision: instrument to
// OpenTelemetry/OpenInference (speakable by Langfuse & Phoenix) rather than to any single vendor SDK. Pure,
// deterministic (caller supplies ids + nanosecond timestamps — NO clock/uuid here), €0. Output is valid OTLP JSON
// that any OTel-compatible collector can ingest; emitting over the wire is a separate, authorized step.

// OTLP attribute encoding: {key, value:{stringValue|intValue|boolValue|doubleValue}}.
export function attr(key, v) {
  if (typeof v === 'boolean') return { key, value: { boolValue: v } };
  if (typeof v === 'number') return Number.isInteger(v) ? { key, value: { intValue: v } } : { key, value: { doubleValue: v } };
  return { key, value: { stringValue: String(v) } };
}
const attrs = (obj) => Object.entries(obj || {}).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => attr(k, v));

// GenAI semantic-convention attributes (gen_ai.*). All optional; undefined fields are dropped.
export function genAiAttributes({ system, requestModel, operation, inputTokens, outputTokens, responseModel } = {}) {
  return attrs({
    'gen_ai.system': system, 'gen_ai.operation.name': operation,
    'gen_ai.request.model': requestModel, 'gen_ai.response.model': responseModel,
    'gen_ai.usage.input_tokens': inputTokens, 'gen_ai.usage.output_tokens': outputTokens,
  });
}

// Build one OTLP span. status: 'OK' | 'ERROR' | 'UNSET'. times are integer nanoseconds (caller-supplied).
export function span({ traceId, spanId, parentSpanId, name, startNano, endNano, attributes = {}, kind = 'SPAN_KIND_INTERNAL', status = 'UNSET' } = {}) {
  if (!traceId || !spanId || !name) throw new Error('INVALID_SPAN: traceId, spanId, name required');
  const STATUS = { OK: 1, ERROR: 2, UNSET: 0 };
  return {
    traceId, spanId, ...(parentSpanId ? { parentSpanId } : {}), name, kind,
    startTimeUnixNano: String(startNano ?? 0), endTimeUnixNano: String(endNano ?? startNano ?? 0),
    attributes: Array.isArray(attributes) ? attributes : attrs(attributes),
    status: { code: STATUS[status] ?? 0 },
  };
}

// Wrap spans into a full OTLP ExportTraceServiceRequest payload.
export function toOTLP(spans, { serviceName = 'odg', resourceAttributes = {}, scopeName = 'odg.shared-core', scopeVersion = '1.0.0' } = {}) {
  return {
    resourceSpans: [{
      resource: { attributes: [attr('service.name', serviceName), ...attrs(resourceAttributes)] },
      scopeSpans: [{ scope: { name: scopeName, version: scopeVersion }, spans }],
    }],
  };
}

// Convenience: turn an orchestration step list [{id,status,evidence}] into OTLP spans under one trace.
export function spansFromSteps(steps, { traceId, baseNano = 0, stepNano = 1000 } = {}) {
  return steps.map((s, i) => span({
    traceId, spanId: `${traceId}-${String(i + 1).padStart(4, '0')}`, name: s.id,
    startNano: baseNano + i * stepNano, endNano: baseNano + (i + 1) * stepNano,
    attributes: { 'odg.step.status': s.status, ...(s.reason ? { 'odg.step.reason': s.reason } : {}) },
    status: s.status === 'DONE' || s.status === 'DUPLICATE' ? 'OK' : (s.status === 'FAILED' ? 'ERROR' : 'UNSET'),
  }));
}
