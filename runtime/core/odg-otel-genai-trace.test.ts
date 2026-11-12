#!/usr/bin/env node
"use strict";
/* V166 §9/§18 — OpenTelemetry GenAI trace emission for ODG execution. Proves: ODG's REAL execution report (from the real
 * compiled patch-executor, scratch cwd) converts to OTel GenAI semantic-convention spans that pass an INDEPENDENT conformance
 * check (required gen_ai.operation.name + gen_ai.provider.name; invoke_agent root + one execute_tool span per executed entry;
 * exact tool.* keys; error.type ONLY on error); honest provider="odg" + odg.* attribution (not misrepresented as model output);
 * deterministic; fail-closed. Grounded in OTel GenAI semconv v1.42. No network/export. */
const T = require("./odg-otel-genai-trace.js");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const cp = require("node:child_process");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

// Produce a GENUINE patch-execution report via the real compiled executor in a scratch cwd (repo untouched).
function realReport(mission: string, author: string): any {
  const EXEC = path.join(__dirname, "..", "dist", "core", "patch-executor.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v166-otel-"));
  fs.mkdirSync(path.join(dir, "runtime", "core"), { recursive: true });
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  fs.writeFileSync(path.join(dir, "runtime", "core", "fx.txt"), "original\n");
  const plan = { mission, authorizedPaths: ["runtime/core"], patches: [{ action: "APPLY_FX", objectiveId: "APPLY_FX", authoredBy: author, edits: [{ target: "runtime/core/fx.txt", content: "edited\n" }] }] };
  fs.writeFileSync(path.join(dir, "runtime", "generated", "patch-plan.json"), JSON.stringify(plan));
  cp.spawnSync(process.execPath, [EXEC], { cwd: dir, encoding: "utf8" });
  const report = JSON.parse(fs.readFileSync(path.join(dir, "runtime", "generated", "patch-execution.json"), "utf8"));
  fs.rmSync(dir, { recursive: true, force: true });
  return report;
}

function main() {
  // ---- REAL executor output → conformant OTel GenAI spans ----
  const report = realReport("V166_OTEL_REAL", "PROVIDER");
  const t = T.emitGenAiTrace(report, { agentName: "odg" });
  check("emitted a trace from the REAL patch-execution report", t.ok === true && typeof t.traceId === "string" && t.traceId.length === 32);
  check("root is an invoke_agent span with required gen_ai attrs", t.spans[0].name === "invoke_agent odg" && t.spans[0].attributes["gen_ai.operation.name"] === "invoke_agent" && t.spans[0].attributes["gen_ai.provider.name"] === "odg" && typeof t.spans[0].attributes["gen_ai.agent.id"] === "string");
  check("EXACTLY one execute_tool span per executed[] entry (no fabricated spans)", t.spans.filter((s: any) => s.attributes["gen_ai.operation.name"] === "execute_tool").length === report.executed.length && t.spans.length === report.executed.length + 1);
  check("execute_tool span carries exact tool.* keys + valid tool.type + linking call.id", (() => { const s = t.spans[1]; return s.attributes["gen_ai.tool.name"] === "APPLY_FX" && T.TOOL_TYPES.has(s.attributes["gen_ai.tool.type"]) && s.attributes["gen_ai.tool.call.id"] === "V166_OTEL_REAL-0" && s.parentSpanId === t.spans[0].spanId; })());
  check("HONEST attribution: provider=odg + odg.authored_by reflects the real entry (PROVIDER), not misrepresented as model output", t.spans[1].attributes["odg.authored_by"] === "PROVIDER" && t.spans[1].attributes["gen_ai.provider.name"] === "odg");
  check("real-report trace passes INDEPENDENT conformance validation", T.validateConformance(t.spans).ok === true);

  // ---- error handling: a FAILED entry ⇒ ERROR span + error.type; non-error spans must NOT carry error.type ----
  const failReport = { mission: "V166_FAIL", executed: [{ action: "OP_OK", status: "DONE", authoredBy: "ODG_RULES", appliedBy: "ODG_EXECUTOR" }, { action: "OP_BAD", status: "FAILED", code: "TRUTH_LOCK_REFUSED", authoredBy: "PROVIDER", appliedBy: null }] };
  const ft = T.emitGenAiTrace(failReport);
  const bad = ft.spans.find((s: any) => s.attributes["gen_ai.tool.name"] === "OP_BAD");
  const ok = ft.spans.find((s: any) => s.attributes["gen_ai.tool.name"] === "OP_OK");
  check("FAILED entry ⇒ span status ERROR + error.type = real code", bad.status === "ERROR" && bad.attributes["error.type"] === "TRUTH_LOCK_REFUSED");
  check("non-errored tool span does NOT carry error.type (conditional-required honored)", ok.status === "OK" && !Object.prototype.hasOwnProperty.call(ok.attributes, "error.type"));
  check("root span reflects failure (ERROR + _OTHER fallback) when any tool failed", ft.spans[0].status === "ERROR" && ft.spans[0].attributes["error.type"] === "_OTHER");
  check("fail-report trace still passes INDEPENDENT conformance validation", T.validateConformance(ft.spans).ok === true);

  // ---- the validator genuinely rejects non-conformance (not a rubber stamp) ----
  const broken = [{ name: "execute_tool x", status: "OK", attributes: { "gen_ai.operation.name": "execute_tool", "gen_ai.provider.name": "odg", "gen_ai.tool.name": "x", "gen_ai.tool.type": "WRONG", "gen_ai.tool.call.id": "x-0" } }];
  check("validator REJECTS an invalid gen_ai.tool.type (real check, not a stamp)", T.validateConformance(broken).ok === false && T.validateConformance(broken).violations.some((v: string) => /tool.type/.test(v)));
  const falseErr = [{ name: "invoke_agent odg", status: "OK", attributes: { "gen_ai.operation.name": "invoke_agent", "gen_ai.provider.name": "odg", "error.type": "_OTHER" } }];
  check("validator REJECTS error.type on a non-errored span", T.validateConformance(falseErr).ok === false);

  // ---- determinism + fail-closed ----
  check("deterministic: same report ⇒ identical spans (ids + attrs)", JSON.stringify(T.emitGenAiTrace(report, { agentName: "odg" }).spans) === JSON.stringify(t.spans));
  check("malformed report fail-closed", T.emitGenAiTrace(null).ok === false && T.emitGenAiTrace({ executed: [] }).ok === false);
  check("toolTypeFor maps read/inspect ⇒ retrieval, else function (honest default)", T.toolTypeFor("READ_FILE") === "retrieval" && T.toolTypeFor("DIAGNOSTIC") === "retrieval" && T.toolTypeFor("APPLY_EDIT") === "function");

  // ---- contract: grounded in the real world reference; no export/egress ----
  check("contract cites OTel GenAI semconv v1.42 + mints-only (no network/export)", /v1.42/.test(T.OTEL_GENAI_CONTRACT.worldReference) && T.OTEL_GENAI_CONTRACT.invariants.some((x: string) => /NO network|no egress/i.test(x)));
  check("contract frozen (deterministic)", Object.isFrozen(T.OTEL_GENAI_CONTRACT) && Object.isFrozen(t));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — otel-genai-trace (§9/§18: ODG's REAL execution report → OTel GenAI semconv v1.42 spans [invoke_agent root + one execute_tool/entry, exact gen_ai.* keys, error.type only on error]; honest provider=odg + odg.* attribution; independent conformance validator rejects non-conformance; deterministic; no export)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
