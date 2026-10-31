#!/usr/bin/env node
/**
 * ollama-provider — V50 (register C-04): the REAL local generative provider, backed by a locally-installed Ollama
 * daemon + a local code model (qwen2.5-coder). It is the untrusted GENERATION step feeding the proven, confined
 * repair path: generate → STRICT parse → validateProposal → applyProposal → runRepairWorkflow → accept or rollback.
 *
 * CONFINEMENT (honest): Ollama is a client/server runtime, so it cannot run inside provider-sandbox's no-network
 * bubblewrap profile (that would cut the daemon call). The model therefore runs in the pre-existing local Ollama
 * daemon; ODG's confinement is at the OUTPUT boundary — the model's text is treated as an UNTRUSTED proposal that is
 * strictly parsed, path/write-set validated, applied ONLY in an isolated workspace, independently tested, and rolled
 * back exactly on failure (generative-repair-adapter). The client talks ONLY to loopback 127.0.0.1:11434 (hardcoded —
 * no external host, no SSRF surface), with a bounded timeout + response-size cap, no secrets, no shell. The model
 * cannot authorize itself, expand its write-set, or disable tests — the adapter + harness enforce all of that.
 */
"use strict";

const http = require("http");

const OLLAMA_HOST = "127.0.0.1";   // loopback ONLY — never parameterized (no external egress / no SSRF surface)
const OLLAMA_PORT = 11434;
const PREFERRED_MODELS = ["qwen2.5-coder:3b", "qwen2.5-coder:7b", "qwen2.5-coder", "qwen2.5:0.5b"];

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/** loopbackPost(pathName, payload, {timeoutMs, maxBytes}): bounded POST to the local Ollama daemon. Fail-closed. */
function loopbackPost(pathName: string, payload: any, opts: any = {}): Promise<any> {
  const timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : 120000;
  const maxBytes = Number(opts.maxBytes) > 0 ? Number(opts.maxBytes) : 2_000_000;
  const body = JSON.stringify(payload);
  return new Promise((resolve) => {
    let done = false;
    const finish = (r: any) => { if (!done) { done = true; resolve(r); } };
    const req = http.request({ host: OLLAMA_HOST, port: OLLAMA_PORT, path: pathName, method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } }, (res: any) => {
      let data = ""; let bytes = 0;
      res.on("data", (c: any) => { bytes += c.length; if (bytes > maxBytes) { req.destroy(); finish({ ok: false, reason: "response exceeded size cap" }); return; } data += c; });
      res.on("end", () => { try { resolve({ ok: true, status: res.statusCode, json: JSON.parse(data) }); } catch { resolve({ ok: false, reason: "non-JSON response from daemon" }); } });
    });
    req.on("error", (e: any) => finish({ ok: false, reason: `loopback request error: ${e && e.message}` }));
    req.setTimeout(timeoutMs, () => { req.destroy(); finish({ ok: false, reason: "generation timed out" }); });
    req.write(body); req.end();
  });
}

/** loopbackGet(pathName, {timeoutMs, maxBytes}): bounded GET (used for /api/tags discovery). The response-size cap
 *  matches loopbackPost (the file header promises "a bounded timeout + response-size cap"): a daemon — or any other
 *  process that grabbed loopback :11434 — streaming an unbounded body would otherwise be buffered entirely in memory
 *  (OOM/DoS); the 5s timeout does NOT bound bytes received within the window. Fail-closed on overflow. */
function loopbackGet(pathName: string, opts: any = {}): Promise<any> {
  const timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : 5000;
  const maxBytes = Number(opts.maxBytes) > 0 ? Number(opts.maxBytes) : 2_000_000;
  // Test-only seam: inject the request FUNCTION (not host/port — those stay hardcoded, so the loopback-only
  // SSRF posture is unchanged). Defaults to http.request in production, exactly like the get/post transport seams.
  const request = typeof opts.request === "function" ? opts.request : http.request;
  return new Promise((resolve) => {
    let done = false; const finish = (r: any) => { if (!done) { done = true; resolve(r); } };
    const req = request({ host: OLLAMA_HOST, port: OLLAMA_PORT, path: pathName, method: "GET" }, (res: any) => {
      let data = ""; let bytes = 0;
      res.on("data", (c: any) => { bytes += c.length; if (bytes > maxBytes) { req.destroy(); finish({ ok: false, reason: "response exceeded size cap" }); return; } data += c; });
      res.on("end", () => { try { finish({ ok: true, json: JSON.parse(data) }); } catch { finish({ ok: false, reason: "non-JSON" }); } });
    });
    req.on("error", (e: any) => finish({ ok: false, reason: e && e.message }));
    req.setTimeout(timeoutMs, () => { req.destroy(); finish({ ok: false, reason: "timeout" }); });
    req.end();
  });
}

/** detectOllama(opts?): probe the local daemon for available models. transport injectable (tests). Fail-closed. */
async function detectOllama(opts: any = {}): Promise<any> {
  const get = typeof opts.get === "function" ? opts.get : loopbackGet;
  let r: any; try { r = await get("/api/tags", { timeoutMs: opts.timeoutMs || 5000 }); } catch (e: any) { r = { ok: false, reason: (e && e.message) || "probe error" }; }
  if (!r || !r.ok || !isObj(r.json) || !Array.isArray(r.json.models)) return { ok: false, endpointUp: false, models: [], usable: false, reason: (r && r.reason) || "Ollama daemon not reachable on loopback" };
  const models = r.json.models.map((m: any) => m && m.name).filter((n: any) => typeof n === "string");
  const chosen = PREFERRED_MODELS.find((p) => models.includes(p)) || models.find((m: string) => /coder/.test(m)) || models[0] || null;
  return { ok: true, endpointUp: true, models, chosenModel: chosen, usable: !!chosen, reason: chosen ? `Ollama usable with ${chosen}` : "Ollama up but no model available" };
}

/** generate({model, prompt, timeoutMs}): one-shot, non-streaming generation. transport injectable. Returns {ok,text}. */
async function generate(input: any = {}): Promise<any> {
  const model = typeof input.model === "string" && input.model ? input.model : PREFERRED_MODELS[0];
  if (typeof input.prompt !== "string" || !input.prompt) return { ok: false, reason: "prompt (string) required" };
  const post = typeof input.post === "function" ? input.post : loopbackPost;
  const payload = { model, prompt: input.prompt, stream: false, options: { temperature: 0, num_predict: Number(input.numPredict) || 512 } };
  let r: any; try { r = await post("/api/generate", payload, { timeoutMs: input.timeoutMs || 120000 }); } catch (e: any) { r = { ok: false, reason: (e && e.message) || "generate error" }; }
  if (!r || !r.ok) return { ok: false, reason: (r && r.reason) || "generation failed" };
  const text = r.json && typeof r.json.response === "string" ? r.json.response : null;
  if (text === null) return { ok: false, reason: "daemon response missing 'response' field" };
  return { ok: true, model, text };
}

/**
 * parseEditsProposal(text): STRICTLY extract a { edits:[{path,content}] } proposal from untrusted model text.
 * Accepts a fenced or bare JSON object; ignores surrounding prose. Returns { ok, proposal } | { ok:false, reason }.
 */
function parseEditsProposal(text: any): any {
  const s = String(text || "");
  // Prefer a ```json fenced block; else the first balanced top-level object containing "edits".
  let candidate: string | null = null;
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) candidate = fence[1];
  if (!candidate) { const i = s.indexOf('"edits"'); if (i >= 0) { const start = s.lastIndexOf("{", i); if (start >= 0) candidate = balancedObject(s, start); } }
  if (!candidate) { const start = s.indexOf("{"); if (start >= 0) candidate = balancedObject(s, start); }
  if (!candidate) return { ok: false, reason: "no JSON object found in model output" };
  let obj: any; try { obj = JSON.parse(candidate); } catch { return { ok: false, reason: "model output JSON did not parse" }; }
  if (!isObj(obj) || !Array.isArray(obj.edits)) return { ok: false, reason: "proposal missing edits[]" };
  const edits: any[] = [];
  for (const e of obj.edits) { if (!isObj(e) || typeof e.path !== "string" || typeof e.content !== "string") return { ok: false, reason: "each edit needs { path:string, content:string }" }; edits.push({ path: e.path, content: e.content }); }
  if (edits.length === 0) return { ok: false, reason: "empty edits[]" };
  return { ok: true, proposal: { edits } };
}

/** balancedObject(s, start): return the substring of the balanced {...} starting at `start`, or null. */
function balancedObject(s: string, start: number): string | null {
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === "{") depth++; else if (c === "}") { depth--; if (depth === 0) return s.slice(start, i + 1); }
  }
  return null;
}

/** buildRepairPrompt(contract, currentFiles): a strict, bounded instruction asking for an edits-JSON proposal. */
function buildRepairPrompt(contract: any, currentFiles: any): string {
  const files = isObj(currentFiles) ? currentFiles : {};
  const fileBlocks = Object.entries(files).map(([p, c]) => `FILE ${p}:\n\`\`\`\n${String(c).slice(0, 4000)}\n\`\`\``).join("\n\n");
  return [
    "You are a code-repair function. Fix the task by editing ONLY the allowed files.",
    `TASK: ${contract.instruction || "make the failing test pass"}`,
    `ALLOWED FILES (you may ONLY edit these): ${(contract.allowedFiles || []).join(", ")}`,
    fileBlocks,
    'Respond with ONLY a JSON object, no prose: {"edits":[{"path":"<one of the allowed files>","content":"<full new file content>"}]}',
  ].join("\n\n");
}

export { detectOllama, generate, loopbackGet, parseEditsProposal, buildRepairPrompt, balancedObject, PREFERRED_MODELS, OLLAMA_HOST, OLLAMA_PORT };
module.exports = { detectOllama, generate, loopbackGet, parseEditsProposal, buildRepairPrompt, balancedObject, PREFERRED_MODELS, OLLAMA_HOST, OLLAMA_PORT };
