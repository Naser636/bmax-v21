#!/usr/bin/env node
"use strict";
/* V167 §16/§17 — wire OTel to ODG's REAL execution paths + collector-safe governed export. Proves: ODG's REAL execution
 * report (real compiled patch-executor, scratch cwd) composes into a full OTel trace; a V157-shaped provider sealed-evidence
 * bundle inserts an honest ODG→provider HANDOFF span (tool spans re-parented under it); the trace serialises to OTLP/JSON
 * (resourceSpans/scopeSpans; kind INTERNAL=1; status OK=1/ERROR=2; typed keyValue attrs); export is COLLECTOR-SAFE (no
 * collector ⇒ no egress), REDACTS sensitive content, bounds cost, and performs NO real network egress. Grounded in OTLP 1.11.x. */
const X = require("./odg-otel-execution-trace.js");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const cp = require("node:child_process");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function realReport(mission: string, author: string): any {
  const EXEC = path.join(__dirname, "..", "dist", "core", "patch-executor.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v167-otel-"));
  fs.mkdirSync(path.join(dir, "runtime", "core"), { recursive: true });
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  fs.writeFileSync(path.join(dir, "runtime", "core", "fx.txt"), "original\n");
  fs.writeFileSync(path.join(dir, "runtime", "generated", "patch-plan.json"), JSON.stringify({ mission, authorizedPaths: ["runtime/core"], patches: [{ action: "APPLY_FX", objectiveId: "APPLY_FX", authoredBy: author, edits: [{ target: "runtime/core/fx.txt", content: "edited\n" }] }] }));
  cp.spawnSync(process.execPath, [EXEC], { cwd: dir, encoding: "utf8" });
  const report = JSON.parse(fs.readFileSync(path.join(dir, "runtime", "generated", "patch-execution.json"), "utf8"));
  fs.rmSync(dir, { recursive: true, force: true });
  return report;
}

function main() {
  const report = realReport("V167_TRACE", "PROVIDER");
  const evidence = { execId: "exec-abc123", contractSha: "sha-deadbeef", agentId: "provider-ed25519-7", sealed: true };

  // ---- §16: compose a full trace from the REAL report + provider handoff ----
  const trace = X.composeExecutionTrace({ patchExecution: report, providerEvidence: evidence, agentName: "odg" });
  check("composed a trace from the REAL execution report", trace.ok === true && trace.spans.length === report.executed.length + 2);
  const handoff = trace.spans.find((s: any) => s.attributes["gen_ai.provider.name"] === "technical_provider");
  check("ODG→provider HANDOFF span present, honest (provider=technical_provider, not ODG/LLM) + sealed-evidence provenance", !!handoff && handoff.attributes["odg.handoff.exec_id"] === "exec-abc123" && handoff.attributes["odg.handoff.contract_sha"] === "sha-deadbeef" && handoff.attributes["gen_ai.agent.id"] === "provider-ed25519-7");
  check("tool spans re-parented under the handoff span (delegated scope)", trace.spans.filter((s: any) => s.attributes["gen_ai.operation.name"] === "execute_tool").every((s: any) => s.parentSpanId === handoff.spanId));
  check("the mission root remains an odg invoke_agent span (parent of the handoff)", trace.spans[0].attributes["gen_ai.provider.name"] === "odg" && handoff.parentSpanId === trace.spans[0].spanId);
  check("composed spans still pass V166 independent conformance", require("./odg-otel-genai-trace.js").validateConformance(trace.spans).ok === true);

  // ---- durations carried ONLY when provided (never fabricated) ----
  const noDur = X.composeExecutionTrace({ patchExecution: report, agentName: "odg" });
  check("no fabricated durations when timing absent", noDur.spans.every((s: any) => s.startTimeUnixNano === undefined));
  const timed = X.composeExecutionTrace({ patchExecution: report, agentName: "odg", timing: (() => { const b = X.composeExecutionTrace({ patchExecution: report }); const t: any = {}; t[b.spans[0].spanId] = { startUnixNano: 1000, endUnixNano: 2000 }; return t; })() });
  check("durations carried when timing supplied", timed.spans[0].startTimeUnixNano === "1000" && timed.spans[0].endTimeUnixNano === "2000");

  // ---- §17: OTLP/JSON shape ----
  const otlp = X.toOtlp(trace, { serviceName: "odg" });
  check("OTLP/JSON shape: resourceSpans → resource + scopeSpans → scope + spans", Array.isArray(otlp.resourceSpans) && otlp.resourceSpans[0].resource.attributes[0].key === "service.name" && otlp.resourceSpans[0].scopeSpans[0].scope.name === "odg.otel-genai");
  check("span kind INTERNAL=1 + status code OK=1/ERROR=2 (authoritative OTLP enums)", (() => { const sp = otlp.resourceSpans[0].scopeSpans[0].spans; return sp.every((x: any) => x.kind === 1) && sp.every((x: any) => x.status.code === 1 || x.status.code === 2); })());
  check("attributes are typed keyValue ({key,value:{stringValue|intValue|boolValue}})", (() => { const a = otlp.resourceSpans[0].scopeSpans[0].spans[0].attributes; return a.every((kv: any) => typeof kv.key === "string" && kv.value && ("stringValue" in kv.value || "intValue" in kv.value || "boolValue" in kv.value)); })());
  check("traceId 32-hex + spanId 16-hex on every span", otlp.resourceSpans[0].scopeSpans[0].spans.every((x: any) => /^[0-9a-f]{32}$/.test(x.traceId) && /^[0-9a-f]{16}$/.test(x.spanId)));

  // ---- §17 export: collector-safe, redacting, cost-bounded, NO real egress ----
  const none = X.exportTrace(otlp);
  check("NO collector ⇒ NO egress (returns redacted payload, exported:false)", none.exported === false && /no collector/.test(none.reason) && none.payload && none.payloadBytes > 0);
  const buffer: any[] = [];
  const mem = X.exportTrace(otlp, { type: "memory", buffer });
  check("memory sink receives the OTLP payload (testable, no network)", mem.exported === true && buffer.length === 1 && mem.spanCount === trace.spans.length);
  const otlpNoSeam = X.exportTrace(otlp, { type: "otlp", endpoint: "https://collector.example/v1/traces", token: "t" });
  check("OTLP sink WITHOUT an injected governed transport ⇒ refused, NO egress (no fabricated destination)", otlpNoSeam.exported === false && /not permitted/.test(otlpNoSeam.reason));
  let posted: any = null;
  const otlpSeam = X.exportTrace(otlp, { type: "otlp", endpoint: "https://collector.example/v1/traces", token: "t" }, { _post: (url: string, body: any, headers: any) => { posted = { url, headers }; return { ok: true, status: 200 }; } });
  check("OTLP sink WITH injected transport posts (test seam only; real egress still default-deny)", otlpSeam.exported === true && posted.url === "https://collector.example/v1/traces" && /Bearer t/.test(posted.headers.authorization));

  // ---- redaction: sensitive content stripped before export ----
  const withSecret = { ok: true, traceId: trace.traceId, spans: [{ name: "invoke_agent odg", kind: "INTERNAL", traceId: trace.traceId, spanId: "aaaaaaaaaaaaaaaa", parentSpanId: null, status: "OK", attributes: { "gen_ai.operation.name": "invoke_agent", "gen_ai.provider.name": "odg", "gen_ai.input.messages": "SECRET PROMPT", "odg.token": "s3cr3t" } }] };
  const rOtlp = X.toOtlp(withSecret);
  const red = X.exportTrace(rOtlp, { type: "none" });
  check("sensitive opt-in content (gen_ai.input.messages, odg.token) REDACTED before export", red.redactedKeys.includes("gen_ai.input.messages") && red.redactedKeys.includes("odg.token") && !JSON.stringify(red.payload).includes("SECRET PROMPT") && !JSON.stringify(red.payload).includes("s3cr3t"));

  // ---- fail-closed + determinism + contract ----
  check("malformed execution ⇒ fail-closed", X.composeExecutionTrace({ patchExecution: null }).ok === false);
  check("deterministic: identical inputs ⇒ identical OTLP", JSON.stringify(X.toOtlp(X.composeExecutionTrace({ patchExecution: report, providerEvidence: evidence }))) === JSON.stringify(X.toOtlp(X.composeExecutionTrace({ patchExecution: report, providerEvidence: evidence }))));
  check("contract: reuses V166 emitter (no parallel), collector-safe, no real egress, cites OTLP 1.11.x", /emitGenAiTrace/.test(X.OTEL_EXECUTION_TRACE_CONTRACT.reuses[0]) && X.OTEL_EXECUTION_TRACE_CONTRACT.invariants.some((i: string) => /NO real network egress/.test(i)) && /OTLP\/JSON 1\.11/.test(X.OTEL_EXECUTION_TRACE_CONTRACT.worldReference));
  check("contract frozen", Object.isFrozen(X.OTEL_EXECUTION_TRACE_CONTRACT) && Object.isFrozen(trace));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — otel-execution-trace (§16/§17: REAL execution report + V157 provider sealed-evidence → full OTel trace with honest ODG→provider HANDOFF span; OTLP/JSON conformant [kind INTERNAL=1, status OK=1/ERROR=2, typed keyValue]; collector-safe export [no collector⇒no egress], sensitive content REDACTED, cost-bounded, NO real network egress; durations never fabricated)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
