#!/usr/bin/env node
"use strict";

/*
 * ON_DEMAND_MODEL_ROUTING_V2 — Ollama Inference Control Plane (OPT-IN, Ollama-only, additive) — TypeScript
 * canonical. Faithful, strict-typed port of the historical runtime/core/ollama-control-plane.js (behaviour
 * identical: same policy/router/scheduler/validator/lifecycle, same DISABLED NO-OP default, same CommonJS
 * module.exports, same read-only require.main CLI). Verified under tsconfig.runtime-leaves-strict.json
 * (strict, no ts-nocheck). No runtime consumer imports it (migration-campaign only lists its NAME), so the
 * CommonJS module.exports form is kept; the legacy .js stays the production port. Dual-port parity proven by
 * ollama-control-plane-dualport-parity.test.ts. OFF unless ODG_OLLAMA_CONTROL_PLANE=1 (or opts.force); speaks
 * ONLY local HTTP via an injected httpCall (tests inject a fake — zero network). No pull/delete/external call.
 */

const POLICY_VERSION = "OCP_V1";
const FLAG = "ODG_OLLAMA_CONTROL_PLANE";

const TIER = Object.freeze({ SMALL: "SMALL", LARGE: "LARGE" });
const RISK = Object.freeze({ LOW: "LOW", HIGH: "HIGH" });
const COMPLEXITY = Object.freeze({ LOW: "LOW", HIGH: "HIGH" });
const OUTCOME = Object.freeze({
  OK: "OK", DISABLED: "DISABLED", REFUSED: "REFUSED",
  TRANSPORT_ERROR: "TRANSPORT_ERROR", TIMEOUT: "TIMEOUT", CANCELLED: "CANCELLED",
  VALIDATION_FAILED: "VALIDATION_FAILED",
});

const SMALL_KINDS: readonly string[] = Object.freeze(["classify", "classification", "extract", "extraction", "summarize", "short-summary", "label"]);
const LARGE_KINDS: readonly string[] = Object.freeze(["code", "code-review", "review", "architecture", "refactor", "design", "long-context"]);

function isPlainObject(v: unknown): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isNonEmptyString(v: unknown): v is string { return typeof v === "string" && v.trim().length > 0; }
function isEnabled(): boolean { return process.env[FLAG] === "1"; }

const CONTRACT = Object.freeze({
  id: "ODG-OLLAMA-CONTROL-PLANE",
  name: "ON_DEMAND_MODEL_ROUTING_V2",
  policyVersion: POLICY_VERSION,
  flag: FLAG,
  default: "DISABLED (NO-OP unless ODG_OLLAMA_CONTROL_PLANE=1)",
  scope: "Ollama local HTTP only — no pull/delete/download, no external/cloud call, no provider-primary change",
  tiers: Object.freeze(Object.values(TIER)),
  outcomes: Object.freeze(Object.values(OUTCOME)),
  rules: Object.freeze([
    "classification/extraction/short-summary ⇒ SMALL",
    "code/review/architecture/long-context/high-complexity ⇒ LARGE",
    "HIGH risk ⇒ LARGE mandatory (fail-closed; REFUSED if no large model)",
    "no silent downgrade LARGE→SMALL",
    "deterministic: same task+policy ⇒ same decision (reason + policyVersion on every decision)",
    "transport success ≠ inference success ≠ output validation ≠ certification",
    "no auto-repair of a HIGH-risk invalid output",
  ]),
});

// ---- 1) Task Normalizer / Profile -------------------------------------------------------------
function normalizeTask(task: any): any {
  const t = isPlainObject(task) ? task : {};
  const kind = isNonEmptyString(t.kind) ? t.kind.trim().toLowerCase() : "unknown";
  const contextTokens = Number.isFinite(t.contextTokens) && t.contextTokens >= 0 ? t.contextTokens : 0;
  const declaredComplexity = t.complexity === COMPLEXITY.HIGH || t.complexity === COMPLEXITY.LOW ? t.complexity : null;
  const highRisk = t.risk === RISK.HIGH || t.highRisk === true;
  return Object.freeze({ kind, contextTokens, declaredComplexity, highRisk, longContext: contextTokens > 8000 });
}

// ---- 2) Risk / Complexity Classifier ----------------------------------------------------------
function classify(profile: any): any {
  const p = isPlainObject(profile) ? profile : normalizeTask(profile);
  const risk = p.highRisk ? RISK.HIGH : RISK.LOW;
  let complexity = p.declaredComplexity;
  if (!complexity) {
    const largeKind = LARGE_KINDS.includes(p.kind);
    complexity = largeKind || p.longContext ? COMPLEXITY.HIGH : COMPLEXITY.LOW;
  }
  return Object.freeze({ risk, complexity, kind: p.kind, longContext: p.longContext });
}

// ---- 3) Model Policy (tier choice) ------------------------------------------------------------
function decidePolicy(task: any): any {
  const profile = normalizeTask(task);
  const c = classify(profile);
  if (c.risk === RISK.HIGH) {
    return Object.freeze({ tier: TIER.LARGE, reason: "HIGH risk ⇒ LARGE mandatory", risk: c.risk, complexity: c.complexity, policyVersion: POLICY_VERSION });
  }
  if (SMALL_KINDS.includes(profile.kind) && c.complexity === COMPLEXITY.LOW && !profile.longContext) {
    return Object.freeze({ tier: TIER.SMALL, reason: `kind '${profile.kind}' + LOW complexity ⇒ SMALL`, risk: c.risk, complexity: c.complexity, policyVersion: POLICY_VERSION });
  }
  if (c.complexity === COMPLEXITY.HIGH || LARGE_KINDS.includes(profile.kind) || profile.longContext) {
    return Object.freeze({ tier: TIER.LARGE, reason: "code/architecture/long-context/high-complexity ⇒ LARGE", risk: c.risk, complexity: c.complexity, policyVersion: POLICY_VERSION });
  }
  return Object.freeze({ tier: TIER.SMALL, reason: "default LOW-complexity ⇒ SMALL", risk: c.risk, complexity: c.complexity, policyVersion: POLICY_VERSION });
}

// ---- 4) Model Router (concrete model) ---------------------------------------------------------
function routeModel(decision: any, models: any): any {
  const m = isPlainObject(models) ? models : {};
  const want = decision.tier;
  const id = want === TIER.LARGE ? m.large : m.small;
  if (isNonEmptyString(id)) {
    return Object.freeze({ ok: true, tier: want, model: id, fallback: false, reason: decision.reason, policyVersion: POLICY_VERSION });
  }
  return Object.freeze({
    ok: false, tier: want, model: null, fallback: false, policyVersion: POLICY_VERSION,
    reason: `no ${want} model configured (fail-closed; no silent downgrade)`,
  });
}

// ---- Output Validator (quality — distinct from transport/inference success) --------------------
function validateOutput(text: any, spec: any): any {
  const s = isPlainObject(spec) ? spec : {};
  if (!isNonEmptyString(text)) return Object.freeze({ ok: false, reason: "empty output" });
  if (!s.json) return Object.freeze({ ok: true, reason: "non-JSON output accepted (no schema required)" });
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { return Object.freeze({ ok: false, reason: "invalid JSON" }); }
  if (!isPlainObject(parsed)) return Object.freeze({ ok: false, reason: "schema mismatch: not an object" });
  for (const f of Array.isArray(s.requiredFields) ? s.requiredFields : []) {
    if (!(f in parsed)) return Object.freeze({ ok: false, reason: `missing required field: ${f}` });
  }
  if (isPlainObject(s.enums)) {
    for (const [f, allowed] of Object.entries(s.enums)) {
      if (f in parsed && Array.isArray(allowed) && !allowed.includes(parsed[f])) {
        return Object.freeze({ ok: false, reason: `invalid enum for ${f}: ${String(parsed[f])}` });
      }
    }
  }
  return Object.freeze({ ok: true, reason: "output validated", parsed });
}

// ---- 5) Scheduler / Concurrency Gate ----------------------------------------------------------
class Scheduler {
  max: number;
  serializeLarge: boolean;
  active: number;
  largeActive: number;
  queue: any[];
  constructor(opts: any = {}) {
    this.max = Number.isFinite(opts.maxConcurrency) && opts.maxConcurrency > 0 ? opts.maxConcurrency : 2;
    this.serializeLarge = opts.serializeLarge !== false;
    this.active = 0;
    this.largeActive = 0;
    this.queue = [];
  }
  _canRun(tier: string): boolean {
    if (this.active >= this.max) return false;
    if (this.serializeLarge && tier === TIER.LARGE && (this.largeActive > 0 || this.active > 0)) return false;
    if (this.serializeLarge && this.largeActive > 0) return false;
    return true;
  }
  _drain(): void {
    for (let i = 0; i < this.queue.length; i++) {
      if (this._canRun(this.queue[i].tier)) {
        const item = this.queue.splice(i, 1)[0];
        this._start(item);
        i--;
      }
    }
  }
  _start(item: any): void {
    this.active++;
    if (item.tier === TIER.LARGE) this.largeActive++;
    Promise.resolve()
      .then(item.fn)
      .then((v: any) => item.resolve(v), (e: any) => item.reject(e))
      .finally(() => {
        this.active--;
        if (item.tier === TIER.LARGE) this.largeActive--;
        this._drain();
      });
  }
  run(tier: string, fn: () => any): Promise<any> {
    return new Promise<any>((resolve, reject) => {
      this.queue.push({ tier, fn, resolve, reject });
      this._drain();
    });
  }
}

// ---- Lifecycle (keep_alive / unload / idempotent close) ---------------------------------------
async function unloadModel(httpCall: any, baseUrl: string, model: any, signal: any): Promise<any> {
  if (!isNonEmptyString(model)) return Object.freeze({ requested: false, confirmed: false, reason: "no model" });
  try {
    const res = await httpCall({ url: `${baseUrl}/api/generate`, body: { model, keep_alive: 0, prompt: "" }, signal });
    const confirmed = isPlainObject(res) && (res.done === true || res.done_reason === "unload" || res.status === 200);
    return Object.freeze({ requested: true, confirmed: !!confirmed, reason: confirmed ? "server acknowledged unload" : "unload requested; not confirmed" });
  } catch (e: any) {
    return Object.freeze({ requested: true, confirmed: false, reason: `unload error: ${e && e.message ? e.message : String(e)}` });
  }
}

// ---- Adapter (HTTP Ollama ONLY) ---------------------------------------------------------------
async function defaultHttpCall({ url, body, signal }: any): Promise<any> {
  const _fetch: any = (globalThis as any).fetch;
  const r = await _fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
  const json = await r.json().catch(() => ({}));
  return { status: r.status, ...json };
}

// ---- Orchestrator -----------------------------------------------------------------------------
async function run(task: any, opts: any = {}): Promise<any> {
  if (!isEnabled() && opts.force !== true) {
    return Object.freeze({ enabled: false, outcome: OUTCOME.DISABLED, policyVersion: POLICY_VERSION, providerCalls: 0, externalCalls: 0 });
  }
  const baseUrl = isNonEmptyString(opts.baseUrl) ? opts.baseUrl.replace(/\/$/, "") : "http://127.0.0.1:11434";
  const now = typeof opts.now === "function" ? opts.now : Date.now;
  const httpCall = typeof opts.httpCall === "function" ? opts.httpCall : defaultHttpCall;
  const scheduler = opts.scheduler instanceof Scheduler ? opts.scheduler : new Scheduler(opts.schedulerOpts);
  const keepAlive = opts.keepAlive === undefined ? "5m" : opts.keepAlive;

  const decision = decidePolicy(task);
  const routed = routeModel(decision, opts.models);
  let providerCalls = 0;
  const base: any = {
    policyVersion: POLICY_VERSION, enabled: true, tier: decision.tier, reason: decision.reason,
    risk: decision.risk, complexity: decision.complexity, model: routed.model, fallback: routed.fallback,
    keepAlive, externalCalls: 0,
  };
  if (!routed.ok) {
    return Object.freeze({ ...base, outcome: OUTCOME.REFUSED, reason: routed.reason, providerCalls: 0, queueWaitMs: 0, inferenceMs: 0, retries: 0, outputValidated: false, unload: null });
  }

  const enqueuedAt = now();
  const result = await scheduler.run(decision.tier, async () => {
    const startedAt = now();
    const queueWaitMs = startedAt - enqueuedAt;
    let inferenceMs = 0; let text = ""; let transportOk = false; let outcome: string; let usage: any = null;
    try {
      const res = await httpCall({
        url: `${baseUrl}/api/chat`,
        body: { model: routed.model, keep_alive: keepAlive, stream: false, messages: [
          ...(isNonEmptyString(opts.system) ? [{ role: "system", content: opts.system }] : []),
          { role: "user", content: isNonEmptyString(opts.prompt) ? opts.prompt : "" },
        ] },
        signal: opts.signal,
      });
      providerCalls++;
      inferenceMs = now() - startedAt;
      transportOk = isPlainObject(res) && (res.status === undefined || res.status === 200);
      text = isPlainObject(res) && isPlainObject(res.message) && typeof res.message.content === "string" ? res.message.content : "";
      usage = isPlainObject(res) && Number.isFinite(res.eval_count) ? { evalCount: res.eval_count, promptEvalCount: res.prompt_eval_count } : null;
      const v = validateOutput(text, opts.validate);
      outcome = transportOk ? (v.ok ? OUTCOME.OK : OUTCOME.VALIDATION_FAILED) : OUTCOME.TRANSPORT_ERROR;
      const rec: any = { ...base, outcome, queueWaitMs, inferenceMs, retries: 0, providerCalls, text, usage, outputValidated: v.ok, validationReason: v.reason };
      if (opts.unloadAfter) rec.unload = await unloadModel(httpCall, baseUrl, routed.model, opts.signal);
      return rec;
    } catch (e: any) {
      inferenceMs = now() - startedAt;
      const aborted = e && (e.name === "AbortError" || /abort/i.test(String(e.message || "")));
      outcome = aborted ? OUTCOME.CANCELLED : (/(timeout|ETIMEDOUT)/i.test(String(e && e.message)) ? OUTCOME.TIMEOUT : OUTCOME.TRANSPORT_ERROR);
      const rec: any = { ...base, outcome, queueWaitMs, inferenceMs, retries: 0, providerCalls, text: "", usage: null, outputValidated: false, error: String(e && e.message ? e.message : e) };
      if (opts.unloadAfter) rec.unload = await unloadModel(httpCall, baseUrl, routed.model, undefined);
      return rec;
    }
  });
  return Object.freeze(result);
}

module.exports = {
  POLICY_VERSION, FLAG, TIER, RISK, COMPLEXITY, OUTCOME, CONTRACT,
  isEnabled, normalizeTask, classify, decidePolicy, routeModel, validateOutput,
  Scheduler, unloadModel, run,
};

// ---- Read-only CLI: prints the contract descriptor; mutates nothing, calls nothing. ------------
if (require.main === module) {
  process.stdout.write(JSON.stringify(CONTRACT, null, 2) + "\n");
}

export {};
