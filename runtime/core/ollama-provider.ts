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
  const payload: any = { model, prompt: input.prompt, stream: false, options: { temperature: 0, num_predict: Number(input.numPredict) || 512 } };
  // Optional keep_alive passthrough (e.g. "10m") so a multi-mission campaign keeps the model RESIDENT between calls,
  // avoiding a ~reload per mission on CPU. Default omitted ⇒ Ollama's own default; behaviour unchanged when not set.
  // (Measured: forcing num_thread is NOT exposed — num_thread=8 benchmarked SLOWER than Ollama's default, so rejected.)
  if (typeof input.keepAlive === "string" && input.keepAlive) payload.keep_alive = input.keepAlive;
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
  // V283-B: small code models routinely emit otherwise-valid JSON whose `content` string carries source code with an
  // INVALID JSON escape — most commonly a regex backslash (`/\s+/`, `\d`, `\w`). JSON only permits \" \\ \/ \b \f \n
  // \r \t \uXXXX, so JSON.parse rejects semantically-correct model output. Fail-closed fallback: ONLY when strict
  // parse throws, double any lone (invalid) backslash inside a string literal and retry once. Valid escapes are left
  // untouched (so real \n newlines still decode); if the retry ALSO fails we still reject — no other leniency.
  let obj: any; let salvaged = false;
  try { obj = JSON.parse(candidate); }
  catch {
    try { obj = JSON.parse(escapeLoneBackslashes(candidate)); salvaged = true; }
    catch { return { ok: false, reason: "model output JSON did not parse" }; }
  }
  if (!isObj(obj) || !Array.isArray(obj.edits)) return { ok: false, reason: "proposal missing edits[]" };
  const edits: any[] = [];
  for (const e of obj.edits) { if (!isObj(e) || typeof e.path !== "string" || typeof e.content !== "string") return { ok: false, reason: "each edit needs { path:string, content:string }" }; edits.push({ path: e.path, content: e.content }); }
  if (edits.length === 0) return { ok: false, reason: "empty edits[]" };
  return { ok: true, proposal: { edits }, salvaged };
}

/**
 * escapeLoneBackslashes(s): inside JSON string literals, double any backslash that is NOT the start of a valid JSON
 * escape (\" \\ \/ \b \f \n \r \t \u). Backslashes outside strings are left alone. Narrow, deterministic, fail-closed:
 * it only makes an INVALID escape into a valid literal backslash; it never relaxes structure, so garbage still fails
 * the subsequent JSON.parse. Used ONLY as a one-shot salvage after strict parse throws.
 */
function escapeLoneBackslashes(s: string): string {
  let out = ""; let inStr = false; let esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (esc) { out += c; esc = false; continue; }
    if (c === "\\") {
      if (!inStr) { out += c; continue; }
      const n = s[i + 1];
      if (n !== undefined && '"\\/bfnrtu'.indexOf(n) >= 0) { out += c; esc = true; }  // valid escape: keep + consume
      else { out += "\\\\"; }                                                          // lone backslash: double it
      continue;
    }
    if (c === '"') inStr = !inStr;
    out += c;
  }
  return out;
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

// ---- V155 Step 5 — MEASUREMENT SURFACE (inventory + streamed, timed generation). Same loopback-only posture: host/port
// stay hardcoded, every transport is an injectable seam (unit tests run with ZERO network), every call is bounded and
// fail-closed. These feed the MEASURED capability registry (odg-local-model-capability.buildCapabilityRegistry); they
// never pull/delete a model and never call anything but 127.0.0.1:11434.

/** ollamaVersion(opts?) -> { ok, version } via GET /api/version. Fail-closed (daemon down ⇒ ok:false). */
async function ollamaVersion(opts: any = {}): Promise<any> {
  const get = typeof opts.get === "function" ? opts.get : loopbackGet;
  let r: any; try { r = await get("/api/version", { timeoutMs: opts.timeoutMs || 5000 }); } catch (e: any) { r = { ok: false, reason: (e && e.message) || "version probe error" }; }
  if (!r || !r.ok || !isObj(r.json) || typeof r.json.version !== "string") return { ok: false, version: null, reason: (r && r.reason) || "Ollama daemon not reachable on loopback" };
  return { ok: true, version: r.json.version };
}

/** listModels(opts?) -> { ok, models:[{ id, digest, sizeBytes, quantization, parameterSize, family, format, contextLength }] }
 *  from GET /api/tags. Missing fields stay null (never invented). Fail-closed. */
async function listModels(opts: any = {}): Promise<any> {
  const get = typeof opts.get === "function" ? opts.get : loopbackGet;
  let r: any; try { r = await get("/api/tags", { timeoutMs: opts.timeoutMs || 5000 }); } catch (e: any) { r = { ok: false, reason: (e && e.message) || "tags probe error" }; }
  if (!r || !r.ok || !isObj(r.json) || !Array.isArray(r.json.models)) return { ok: false, endpointUp: false, models: [], reason: (r && r.reason) || "Ollama daemon not reachable on loopback" };
  const models = r.json.models.filter((m: any) => isObj(m) && typeof m.name === "string").map((m: any) => {
    const d = isObj(m.details) ? m.details : {};
    return {
      id: m.name,
      digest: typeof m.digest === "string" ? m.digest : null,
      sizeBytes: Number.isFinite(m.size) ? m.size : null,
      quantization: typeof d.quantization_level === "string" ? d.quantization_level : null,
      parameterSize: typeof d.parameter_size === "string" ? d.parameter_size : null,
      family: typeof d.family === "string" ? d.family : null,
      format: typeof d.format === "string" ? d.format : null,
      contextLength: Number.isFinite(d.context_length) ? d.context_length : null,
    };
  });
  return { ok: true, endpointUp: true, models };
}

/** showModel(model, opts?) -> { ok, contextLength, parameterCount, details } via POST /api/show (model_info is the
 *  authoritative source for the context length: '<arch>.context_length'). Fail-closed; unknown fields stay null. */
async function showModel(model: any, opts: any = {}): Promise<any> {
  if (typeof model !== "string" || !model) return { ok: false, reason: "model (string) required" };
  const post = typeof opts.post === "function" ? opts.post : loopbackPost;
  let r: any; try { r = await post("/api/show", { model }, { timeoutMs: opts.timeoutMs || 10000 }); } catch (e: any) { r = { ok: false, reason: (e && e.message) || "show error" }; }
  if (!r || !r.ok || !isObj(r.json)) return { ok: false, reason: (r && r.reason) || "show failed" };
  if (r.status !== undefined && r.status !== 200) return { ok: false, reason: `show returned HTTP ${r.status}${isObj(r.json) && typeof r.json.error === "string" ? ": " + r.json.error : ""}` };
  const info = isObj(r.json.model_info) ? r.json.model_info : {};
  let contextLength: number | null = null; let parameterCount: number | null = null;
  for (const k of Object.keys(info)) {
    if (/\.context_length$/.test(k) && Number.isFinite(info[k])) contextLength = info[k];
    if (k === "general.parameter_count" && Number.isFinite(info[k])) parameterCount = info[k];
  }
  const d = isObj(r.json.details) ? r.json.details : {};
  return { ok: true, model, contextLength, parameterCount, details: { quantization: typeof d.quantization_level === "string" ? d.quantization_level : null, parameterSize: typeof d.parameter_size === "string" ? d.parameter_size : null, family: typeof d.family === "string" ? d.family : null, format: typeof d.format === "string" ? d.format : null } };
}

/** loopbackStream(pathName, payload, opts): bounded STREAMED POST (NDJSON). Records the wall-clock time of the FIRST
 *  non-empty `response` token (real TTFT) and returns the concatenated text + the final `done` record. Fail-closed on
 *  timeout / size cap / non-200 / malformed stream. `now` is injectable (monotonic ms). */
function loopbackStream(pathName: string, payload: any, opts: any = {}): Promise<any> {
  const timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : 180000;
  const maxBytes = Number(opts.maxBytes) > 0 ? Number(opts.maxBytes) : 2_000_000;
  const now = typeof opts.now === "function" ? opts.now : () => Number(process.hrtime.bigint() / BigInt(1000000));
  const request = typeof opts.request === "function" ? opts.request : http.request;
  const body = JSON.stringify(payload);
  return new Promise((resolve) => {
    let done = false; let deadline: any = null;
    const finish = (r: any) => { if (!done) { done = true; if (deadline) clearTimeout(deadline); resolve(r); } };
    const t0 = now(); let ttftMs: number | null = null; let text = ""; let buf = ""; let bytes = 0; let final: any = null;
    const req = request({ host: OLLAMA_HOST, port: OLLAMA_PORT, path: pathName, method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } }, (res: any) => {
      if (res.statusCode !== 200) { let e = ""; res.on("data", (c: any) => { if (e.length < 2000) e += c; }); res.on("end", () => finish({ ok: false, status: res.statusCode, reason: `HTTP ${res.statusCode}: ${e.slice(0, 300)}` })); return; }
      const line = (l: string) => {
        if (!l.trim()) return;
        let j: any; try { j = JSON.parse(l); } catch { return; }
        if (isObj(j) && typeof j.error === "string") { final = { error: j.error }; return; }
        if (isObj(j) && typeof j.response === "string" && j.response.length) { if (ttftMs === null) ttftMs = now() - t0; text += j.response; }
        if (isObj(j) && j.done === true) final = j;
      };
      res.on("data", (c: any) => {
        bytes += c.length; if (bytes > maxBytes) { req.destroy(); finish({ ok: false, reason: "response exceeded size cap" }); return; }
        buf += c; let i: number; while ((i = buf.indexOf("\n")) >= 0) { line(buf.slice(0, i)); buf = buf.slice(i + 1); }
      });
      res.on("end", () => {
        line(buf);
        const totalMs = now() - t0;
        if (final && typeof final.error === "string") return finish({ ok: false, reason: `daemon error: ${final.error}` });
        if (!final) return finish({ ok: false, reason: "stream ended without a done record" });
        finish({ ok: true, text, ttftMs, totalMs, final });
      });
    });
    req.on("error", (e: any) => finish({ ok: false, reason: `loopback request error: ${e && e.message}` }));
    req.setTimeout(timeoutMs, () => { req.destroy(); finish({ ok: false, reason: "generation timed out (idle)", timedOut: true }); });
    // WALL-CLOCK deadline (req.setTimeout is idle-only: a slow trickle of tokens would never trip it).
    deadline = setTimeout(() => { try { req.destroy(); } catch { /* already closed */ } finish({ ok: false, reason: "generation timed out (wall-clock deadline)", timedOut: true }); }, timeoutMs);
    if (deadline && typeof deadline.unref === "function") deadline.unref();
    req.write(body); req.end();
  });
}

/** generateMeasured({ model, prompt, options, keepAlive, timeoutMs, stream? }) -> { ok, model, text, ttftMs, totalMs,
 *  evalCount, evalDurationNs, promptEvalCount, promptEvalDurationNs, loadDurationNs, totalDurationNs, tokPerSec, doneReason,
 *  options } — a streamed, TIMED generation. `options` are passed verbatim to Ollama and echoed back (recorded). tokPerSec is
 *  eval_count / eval_duration (the daemon's own counters, not a wall-clock guess); absent counters ⇒ null (NOT_MEASURED).
 *  Fail-closed: unavailable model / daemon down / timeout ⇒ { ok:false, unavailable?, timedOut?, reason }. */
async function generateMeasured(input: any = {}): Promise<any> {
  if (typeof input.model !== "string" || !input.model) return { ok: false, reason: "model (string) required" };
  if (typeof input.prompt !== "string" || !input.prompt) return { ok: false, reason: "prompt (string) required" };
  const stream = typeof input.stream === "function" ? input.stream : loopbackStream;
  const options = isObj(input.options) ? { ...input.options } : { temperature: 0 };
  const payload: any = { model: input.model, prompt: input.prompt, stream: true, options };
  if (typeof input.keepAlive === "string" || typeof input.keepAlive === "number") payload.keep_alive = input.keepAlive;
  let r: any; try { r = await stream("/api/generate", payload, { timeoutMs: input.timeoutMs || 180000, now: input.now }); } catch (e: any) { r = { ok: false, reason: (e && e.message) || "generate error" }; }
  if (!r || !r.ok) {
    const reason = (r && r.reason) || "generation failed";
    const unavailable = /not found|ECONNREFUSED|not reachable|HTTP 404/i.test(reason);
    return { ok: false, model: input.model, reason, unavailable, timedOut: !!(r && r.timedOut) || /timed out/i.test(reason), options };
  }
  const f = isObj(r.final) ? r.final : {};
  const num = (v: any) => (Number.isFinite(v) ? v : null);
  const evalCount = num(f.eval_count); const evalDurationNs = num(f.eval_duration);
  return {
    ok: true, model: input.model, text: String(r.text || ""),
    ttftMs: num(r.ttftMs), totalMs: num(r.totalMs),
    evalCount, evalDurationNs, promptEvalCount: num(f.prompt_eval_count), promptEvalDurationNs: num(f.prompt_eval_duration),
    loadDurationNs: num(f.load_duration), totalDurationNs: num(f.total_duration),
    tokPerSec: evalCount !== null && evalDurationNs ? Math.round((evalCount / (evalDurationNs / 1e9)) * 100) / 100 : null,
    doneReason: typeof f.done_reason === "string" ? f.done_reason : null, options,
  };
}

/** unloadModel(model, opts?) -> best-effort keep_alive:0 so only ONE model is resident at a time (benchmark discipline). */
async function unloadModel(model: any, opts: any = {}): Promise<any> {
  if (typeof model !== "string" || !model) return { ok: false, reason: "model (string) required" };
  const post = typeof opts.post === "function" ? opts.post : loopbackPost;
  let r: any; try { r = await post("/api/generate", { model, keep_alive: 0 }, { timeoutMs: opts.timeoutMs || 30000 }); } catch (e: any) { r = { ok: false, reason: (e && e.message) || "unload error" }; }
  return { ok: !!(r && r.ok), reason: r && r.ok ? "unload requested" : (r && r.reason) || "unload failed" };
}

export { detectOllama, generate, loopbackGet, parseEditsProposal, buildRepairPrompt, balancedObject, escapeLoneBackslashes, PREFERRED_MODELS, OLLAMA_HOST, OLLAMA_PORT, ollamaVersion, listModels, showModel, loopbackStream, generateMeasured, unloadModel };
module.exports = { detectOllama, generate, loopbackGet, parseEditsProposal, buildRepairPrompt, balancedObject, escapeLoneBackslashes, PREFERRED_MODELS, OLLAMA_HOST, OLLAMA_PORT, ollamaVersion, listModels, showModel, loopbackStream, generateMeasured, unloadModel };
