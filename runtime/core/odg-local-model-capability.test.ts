#!/usr/bin/env node
"use strict";
/* V247 §3/§4/§5 — local-model capability + deny-by-default tool gate. Proves: the qualification is from REAL measured
 * results (schema-json NATIVE_CAPABLE, ts-fix PARTIAL [correct but fenced], risk-judgment DELEGATE [wrong]) ⇒ overall
 * PROPOSER_ONLY; the tool gate denies non-allowlisted tools, out-of-scope/traversal/absolute paths, forbidden tokens, and
 * arbitrary shell (a valid JSON output is NOT authorization); honest (a failure is DELEGATE, not reframed). */
const M = require("./odg-local-model-capability.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

function main() {
  const q = M.qualify();
  check("qualification from REAL measured runs of qwen2.5-coder:3b (2026-11-16)", q.model === "qwen2.5-coder:3b" && q.measuredOn === "2026-11-16" && q.tasks.length === 3);
  check("schema-json ⇒ NATIVE_CAPABLE (correct + clean)", q.tasks.find((t: any) => t.task === "schema-json").verdict === "NATIVE_CAPABLE");
  check("ts-bug-fix ⇒ PARTIAL (correct fix but markdown-fenced ⇒ ODG must post-process)", q.tasks.find((t: any) => t.task === "ts-bug-fix").verdict === "PARTIAL");
  check("HONEST: risk-judgment ⇒ DELEGATE (model called a destructive deletion LOW risk — a failure NOT reframed as success)", q.tasks.find((t: any) => t.task === "risk-judgment").verdict === "DELEGATE" && q.tasks.find((t: any) => t.task === "risk-judgment").correct === false);
  check("overall PROPOSER_ONLY: a model that proposes ≠ an engine that verifies/integrates", q.overall === "PROPOSER_ONLY" && /bounded PROPOSER/i.test(q.conclusion) && /NOT a trusted judge/.test(q.conclusion));

  // DENY-BY-DEFAULT tool gate — a valid JSON output is NOT an authorization.
  const policy = { allowedTools: ["read_file", "write_file"], writeSet: ["runtime/core/x.ts"], forbidden: ["rm ", "sudo", "curl"] };
  check("allowed tool + in-scope path ⇒ ALLOW (authorized by ODG's executor, not the model)", M.admitToolCall({ tool: "write_file", filePath: "runtime/core/x.ts" }, policy).allow === true);
  check("non-allowlisted tool ⇒ DENY (deny-by-default)", M.admitToolCall({ tool: "delete_everything", filePath: "runtime/core/x.ts" }, policy).allow === false);
  check("path traversal ⇒ DENY", M.admitToolCall({ tool: "write_file", filePath: "../../etc/passwd" }, policy).allow === false);
  check("absolute path ⇒ DENY", M.admitToolCall({ tool: "write_file", filePath: "/etc/passwd" }, policy).allow === false);
  check("out-of-scope path (not in write-set) ⇒ DENY", M.admitToolCall({ tool: "write_file", filePath: "runtime/core/other.ts" }, policy).allow === false);
  check("forbidden command token ⇒ DENY", M.admitToolCall({ tool: "exec", command: "sudo rm -rf /" }, { allowedTools: ["exec"], forbidden: ["sudo"] }).allow === false);
  check("shell command without 'exec' allowed ⇒ DENY (model has no arbitrary shell)", M.admitToolCall({ tool: "write_file", command: "echo hi", filePath: "runtime/core/x.ts" }, policy).allow === false);
  check("tool gate never self-authorizes", M.admitToolCall({ tool: "write_file", filePath: "runtime/core/x.ts" }, policy).selfAuthorized === false);
  check("FAIL-CLOSED: allowlisted tool with NO target (no filePath/command) ⇒ DENY (nothing to scope-check)", M.admitToolCall({ tool: "write_file" }, policy).allow === false);
  check("a read-only tool may omit a target (declared in readOnlyTools) ⇒ ALLOW", M.admitToolCall({ tool: "list_dir" }, { allowedTools: ["list_dir"], readOnlyTools: ["list_dir"] }).allow === true);

  // ODG strips the model's markdown fences before trusting output as a value.
  check("stripFences removes ```json fences", M.stripFences("```json\n{\"a\":1}\n```") === "{\"a\":1}");

  check("deterministic + frozen + contract", JSON.stringify(M.qualify()) === JSON.stringify(q) && Object.isFrozen(q) && M.LOCAL_MODEL_CAPABILITY_CONTRACT.invariants.some((i: string) => /DENY-BY-DEFAULT tool gate/.test(i)) && M.LOCAL_MODEL_CAPABILITY_CONTRACT.invariants.some((i: string) => /never reframed as success/.test(i)));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — local-model-capability (V247 §3/§4/§5: REAL measured qualification of qwen2.5-coder:3b ⇒ PROPOSER_ONLY [schema NATIVE, ts-fix PARTIAL/fenced, risk-judgment DELEGATE/wrong]; deny-by-default tool gate [valid JSON ≠ authorization: allowlist + write-set scope + no traversal/absolute/forbidden/arbitrary-shell]; composes delegate-isolation; honest, failures not reframed)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
