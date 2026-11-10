#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V39 LOT J — LOCAL MODEL GENERATOR (the real generateFile seam). It connects native-project-builder's
 * `generateFile(fileSpec, builtContracts)` seam to ODG's LOCAL model (qwen2.5-coder via 127.0.0.1:11434). The PROJECT code
 * is model-authored (native); this module only (a) builds a deterministic prompt from the file spec + the dependency
 * contracts, (b) POSTs it to the local Ollama endpoint, and (c) extracts the code from the response (strips markdown
 * fences) fail-closed. It validates NOTHING about correctness — the INDEPENDENT verifier in native-project-builder remains
 * the sole acceptance arbiter. The network call is an INJECTED seam (fetchImpl) so the gate stays hermetic (no network in
 * CI); the live run passes the real global fetch. Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

/** buildPrompt(fileSpec, builtContracts) -> string. Deterministic. Instructs the model to emit ONE CommonJS module, with
 *  the dependency contracts in context and (on repair) the prior build error. */
function buildPrompt(fileSpec: any, builtContracts: any): string {
  const f = isObj(fileSpec) ? fileSpec : {};
  const base = String(f.path || "file.js").replace(/^.*\//, "");
  const deps = arr(f.dependsOn);
  const depLines = deps.map((d: any) => { const bn = String(d).replace(/^.*\//, ""); const c = (isObj(builtContracts) ? builtContracts[d] : null) || "(no contract)"; return `  - require('./${bn}') -> ${c}`; }).join("\n");
  const lines = [
    "You are generating exactly ONE CommonJS module file for a multi-file Node.js project.",
    "Output ONLY the JavaScript source for this one file. No explanation, no markdown fences, no prose.",
    "Use CommonJS: module.exports = ...  and require('./other.js') for local dependencies.",
    "",
    `File: ${f.path || base}`,
    `Responsibility: ${f.role || "(unspecified)"}`,
    `Contract (must be satisfied exactly): ${f.contract || "(unspecified)"}`,
  ];
  if (deps.length) lines.push("", "This file depends on these already-built modules (require them by relative path):", depLines);
  if (f.buildError) lines.push("", `A previous attempt FAILED to build with this error — fix it:`, `  ${String(f.buildError)}`);
  lines.push("", `Now output only the code for ${f.path || base}:`);
  return lines.join("\n");
}

/** extractCode(raw) -> string|null. Strips a ```lang ... ``` fence if present; fail-closed: returns null unless the result
 *  is a non-empty CommonJS-looking module (defends against prose being compiled as code). */
function extractCode(raw: any): string | null {
  let s = String(raw == null ? "" : raw).trim();
  const fence = s.match(/```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  else s = s.replace(/^```[a-zA-Z0-9_-]*\s*/,"").replace(/```\s*$/,"").trim();
  if (!s) return null;
  if (!/module\.exports|exports\./.test(s)) return null;      // not a module — treat as a failed generation (fail-closed)
  return s;
}

/**
 * makeLocalGenerator(opts, fetchImpl?) -> async generateFile(fileSpec, builtContracts) -> { ok, content?, provenance }.
 * opts: { model, host?, timeoutMs?, numPredict?, temperature? }. fetchImpl defaults to the global fetch (live). The
 * returned seam is what native-project-builder calls. FAIL-CLOSED: a non-OK HTTP status, a timeout/exception, an empty
 * response, or a non-module response ⇒ { ok:false } (never a fabricated success).
 */
function makeLocalGenerator(opts: any = {}, fetchImpl: any = undefined): any {
  const o = isObj(opts) ? opts : {};
  const model = String(o.model || "qwen2.5-coder:3b");
  const host = String(o.host || "http://127.0.0.1:11434");
  const timeoutMs = Number(o.timeoutMs) || 120000;
  const numPredict = Number(o.numPredict) || 512;
  const temperature = Number.isFinite(Number(o.temperature)) ? Number(o.temperature) : 0.1;
  const doFetch = typeof fetchImpl === "function" ? fetchImpl : (typeof (globalThis as any).fetch === "function" ? (globalThis as any).fetch.bind(globalThis) : null);

  return async function generateFile(fileSpec: any, builtContracts: any): Promise<any> {
    if (!doFetch) return Object.freeze({ ok: false, reason: "no fetch available (local model seam unreachable)", provenance: Object.freeze({ model, host }) });
    const prompt = buildPrompt(fileSpec, builtContracts);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const t0 = Date.now();
    try {
      const res = await doFetch(`${host}/api/generate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model, prompt, stream: false, options: { temperature, num_predict: numPredict } }), signal: controller.signal });
      if (!res || res.ok !== true) return Object.freeze({ ok: false, reason: `HTTP ${res && res.status}`, provenance: Object.freeze({ model, host, ms: Date.now() - t0 }) });
      const j = await res.json();
      const content = extractCode(j && j.response);
      const provenance = Object.freeze({ model: (j && j.model) || model, host, evalCount: (j && j.eval_count) || null, ms: Date.now() - t0, native: true });
      if (!content) return Object.freeze({ ok: false, reason: "no CommonJS module extracted from the model output", provenance });
      return Object.freeze({ ok: true, content, provenance });
    } catch (e: any) {
      return Object.freeze({ ok: false, reason: String((e && e.message) || e), provenance: Object.freeze({ model, host, ms: Date.now() - t0 }) });
    } finally { clearTimeout(timer); }
  };
}

const LOCAL_MODEL_GENERATOR_CONTRACT = Object.freeze({
  id: "V124-LOCAL-MODEL-GENERATOR",
  source: "CTO V39 LOT J — the real generateFile seam connecting native-project-builder to the local qwen2.5-coder model",
  reuses: Object.freeze(["native-project-builder (the generateFile seam it implements; the INDEPENDENT verifier still arbitrates)", "the local Ollama endpoint 127.0.0.1:11434 (no download/install/replace; local only)"]),
  notAuthority: "builds a prompt, calls the local model, extracts the code; it validates NO correctness and authorizes nothing — the independent verifier is the sole acceptance arbiter",
  invariants: Object.freeze([
    "the PROJECT code is model-authored (native); this seam only prompts, calls, and extracts — it never edits the code toward passing",
    "fail-closed: a non-OK HTTP status, timeout, empty response, or a non-module output ⇒ ok:false (never a fabricated success)",
    "the network call is an INJECTED seam so the gate stays hermetic (no network in CI); the live run uses the real fetch",
    "dependency contracts are passed in context (inter-file relations); on repair the prior build error is included",
    "provenance (model, eval_count, ms, native:true) is reported honestly; pure prompt/extraction logic is deterministic",
  ]),
});

module.exports = { buildPrompt, extractCode, makeLocalGenerator, LOCAL_MODEL_GENERATOR_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify(LOCAL_MODEL_GENERATOR_CONTRACT, null, 2) + "\n"); }

export {};
