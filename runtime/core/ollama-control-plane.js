#!/usr/bin/env node
"use strict";

/*
 * ON_DEMAND_MODEL_ROUTING_V2 — Ollama Inference Control Plane (OPT-IN, Ollama-only, additive).
 *
 * Deterministic control of the already-PROVEN local Ollama path. OFF by default: when the feature flag
 * ODG_OLLAMA_CONTROL_PLANE=1 is absent, run() is a strict NO-OP ({enabled:false}) and nothing else changes —
 * the existing provider/adapter/transport path is byte-for-byte unaffected. This module adds NO new provider
 * architecture: the Adapter here speaks ONLY HTTP to a local Ollama server (injected for tests). It never
 * pulls, deletes, or downloads a model, and never makes an external/cloud call.
 *
 * Pipeline (strictly separated responsibilities):
 *   normalizeTask → classify(Risk/Complexity) → decidePolicy(tier) → routeModel(concrete) →
 *   Scheduler(concurrency) → Adapter(HTTP Ollama) → validateOutput → evidence record
 *   Policy = tier choice · Router = concrete model · Scheduler = order/concurrency ·
 *   Lifecycle = keep_alive/unload · Adapter = HTTP only · Validator = output quality · Evidence = observed facts
 *
 * Determinism: same (task, policy) ⇒ same tier/model/reason. Every decision carries reason + policyVersion.
 * Fail-closed: a HIGH-risk task MUST route LARGE; if no large model is configured it is REFUSED (never
 * silently downgraded to small). No auto-repair of a HIGH-risk invalid output.
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

// Task kinds that are cheap/short ⇒ SMALL tier; everything code/architecture/long ⇒ LARGE.
const SMALL_KINDS = Object.freeze(["classify", "classification", "extract", "extraction", "summarize", "short-summary", "label"]);
const LARGE_KINDS = Object.freeze(["code", "code-review", "review", "architecture", "refactor", "design", "long-context"]);

function isPlainObject(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }
function isEnabled() { return process.env[FLAG] === "1"; }

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
function normalizeTask(task) {
  const t = isPlainObject(task) ? task : {};
  const kind = isNonEmptyString(t.kind) ? t.kind.trim().toLowerCase() : "unknown";
  const contextTokens = Number.isFinite(t.contextTokens) && t.contextTokens >= 0 ? t.contextTokens : 0;
  const declaredComplexity = t.complexity === COMPLEXITY.HIGH || t.complexity === COMPLEXITY.LOW ? t.complexity : null;
  const highRisk = t.risk === RISK.HIGH || t.highRisk === true;
  return Object.freeze({ kind, contextTokens, declaredComplexity, highRisk, longContext: contextTokens > 8000 });
}

// ---- 2) Risk / Complexity Classifier ----------------------------------------------------------
function classify(profile) {
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
function decidePolicy(task) {
  const profile = normalizeTask(task);
  const c = classify(profile);
  // HIGH risk ⇒ LARGE mandatory (fail-closed downstream). Otherwise tier by complexity/kind.
  if (c.risk === RISK.HIGH) {
    return Object.freeze({ tier: TIER.LARGE, reason: "HIGH risk ⇒ LARGE mandatory", risk: c.risk, complexity: c.complexity, policyVersion: POLICY_VERSION });
  }
  if (SMALL_KINDS.includes(profile.kind) && c.complexity === COMPLEXITY.LOW && !profile.longContext) {
    return Object.freeze({ tier: TIER.SMALL, reason: `kind '${profile.kind}' + LOW complexity ⇒ SMALL`, risk: c.risk, complexity: c.complexity, policyVersion: POLICY_VERSION });
  }
  if (c.complexity === COMPLEXITY.HIGH || LARGE_KINDS.includes(profile.kind) || profile.longContext) {
    return Object.freeze({ tier: TIER.LARGE, reason: "code/architecture/long-context/high-complexity ⇒ LARGE", risk: c.risk, complexity: c.complexity, policyVersion: POLICY_VERSION });
  }
  // Default (unknown/low) ⇒ SMALL (cheap), never for high-risk (handled above).
  return Object.freeze({ tier: TIER.SMALL, reason: "default LOW-complexity ⇒ SMALL", risk: c.risk, complexity: c.complexity, policyVersion: POLICY_VERSION });
}

// ---- 4) Model Router (concrete model) ---------------------------------------------------------
// models: { small, large } model-id map (from config/env; never auto-pulled). Fail-closed: a LARGE
// decision with no large model configured is REFUSED (never downgraded to small) — critical for HIGH risk.
function routeModel(decision, models) {
  const m = isPlainObject(models) ? models : {};
  const want = decision.tier;
  const id = want === TIER.LARGE ? m.large : m.small;
  if (isNonEmptyString(id)) {
    return Object.freeze({ ok: true, tier: want, model: id, fallback: false, reason: decision.reason, policyVersion: POLICY_VERSION });
  }
  // No model for the required tier. NEVER silently downgrade LARGE→SMALL.
  return Object.freeze({
    ok: false, tier: want, model: null, fallback: false, policyVersion: POLICY_VERSION,
    reason: `no ${want} model configured (fail-closed; no silent downgrade)`,
  });
}

// ---- Output Validator (quality — distinct from transport/inference success) --------------------
// spec: { json?:boolean, requiredFields?:string[], enums?:{field:[allowed]} }. HIGH-risk ⇒ no auto-repair.
function validateOutput(text, spec) {
  const s = isPlainObject(spec) ? spec : {};
  if (!isNonEmptyString(text)) return Object.freeze({ ok: false, reason: "empty output" });
  if (!s.json) return Object.freeze({ ok: true, reason: "non-JSON output accepted (no schema required)" });
  let parsed;
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
// Serializes LARGE by default; bounds overall concurrency. Releases the queue on success/error/timeout/cancel.
class Scheduler {
  constructor(opts = {}) {
    this.max = Number.isFinite(opts.maxConcurrency) && opts.maxConcurrency > 0 ? opts.maxConcurrency : 2;
    this.serializeLarge = opts.serializeLarge !== false;
    this.active = 0;
    this.largeActive = 0;
    this.queue = [];
  }
  _canRun(tier) {
    if (this.active >= this.max) return false;
    if (this.serializeLarge && tier === TIER.LARGE && (this.largeActive > 0 || this.active > 0)) return false;
    if (this.serializeLarge && this.largeActive > 0) return false; // a LARGE in flight blocks others
    return true;
  }
  _drain() {
    for (let i = 0; i < this.queue.length; i++) {
      if (this._canRun(this.queue[i].tier)) {
        const item = this.queue.splice(i, 1)[0];
        this._start(item);
        i--;
      }
    }
  }
  _start(item) {
    this.active++;
    if (item.tier === TIER.LARGE) this.largeActive++;
    Promise.resolve()
      .then(item.fn)
      .then((v) => item.resolve(v), (e) => item.reject(e))
      .finally(() => {
        this.active--;
        if (item.tier === TIER.LARGE) this.largeActive--;
        this._drain();
      });
  }
  run(tier, fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ tier, fn, resolve, reject });
      this._drain();
    });
  }
}

// ---- Lifecycle (keep_alive / unload / idempotent close) ---------------------------------------
// keep_alive is passed verbatim to Ollama. unload() REQUESTS an unload (keep_alive:0) and reports whether
// the server CONFIRMED it — never asserts VRAM freed without the server's own signal.
async function unloadModel(httpCall, baseUrl, model, signal) {
  if (!isNonEmptyString(model)) return Object.freeze({ requested: false, confirmed: false, reason: "no model" });
  try {
    const res = await httpCall({ url: `${baseUrl}/api/generate`, body: { model, keep_alive: 0, prompt: "" }, signal });
    const confirmed = isPlainObject(res) && (res.done === true || res.done_reason === "unload" || res.status === 200);
    return Object.freeze({ requested: true, confirmed: !!confirmed, reason: confirmed ? "server acknowledged unload" : "unload requested; not confirmed" });
  } catch (e) {
    return Object.freeze({ requested: true, confirmed: false, reason: `unload error: ${e && e.message ? e.message : String(e)}` });
  }
}

// ---- Adapter (HTTP Ollama ONLY) ---------------------------------------------------------------
// httpCall({url, body, signal}) -> parsed response. Default uses fetch; tests inject a fake (zero cost,
// and asserts the module never calls /api/pull or /api/delete).
async function defaultHttpCall({ url, body, signal }) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
  const json = await r.json().catch(() => ({}));
  return { status: r.status, ...json };
}

// ---- Orchestrator -----------------------------------------------------------------------------
/**
 * run(task, opts) -> frozen evidence record. opts:
 *   baseUrl (default http://127.0.0.1:11434), models {small,large}, keepAlive, timeoutMs, signal,
 *   httpCall (injected), scheduler (shared), now() (injected clock), validate (spec), unloadAfter (bool).
 * NO-OP ({enabled:false, outcome:DISABLED}) unless the feature flag is on OR opts.force===true (tests).
 */
async function run(task, opts = {}) {
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
  const base = {
    policyVersion: POLICY_VERSION, enabled: true, tier: decision.tier, reason: decision.reason,
    risk: decision.risk, complexity: decision.complexity, model: routed.model, fallback: routed.fallback,
    keepAlive, externalCalls: 0,
  };
  // Fail-closed routing (no large model for a LARGE/HIGH-risk decision).
  if (!routed.ok) {
    return Object.freeze({ ...base, outcome: OUTCOME.REFUSED, reason: routed.reason, providerCalls: 0, queueWaitMs: 0, inferenceMs: 0, retries: 0, outputValidated: false, unload: null });
  }

  const enqueuedAt = now();
  const result = await scheduler.run(decision.tier, async () => {
    const startedAt = now();
    const queueWaitMs = startedAt - enqueuedAt;
    let inferenceMs = 0; let text = ""; let transportOk = false; let outcome; let usage = null;
    let unload = null;
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
      // Validation (distinct from transport/inference). HIGH-risk ⇒ no auto-repair (we only report).
      const v = validateOutput(text, opts.validate);
      outcome = transportOk ? (v.ok ? OUTCOME.OK : OUTCOME.VALIDATION_FAILED) : OUTCOME.TRANSPORT_ERROR;
      const rec = { ...base, outcome, queueWaitMs, inferenceMs, retries: 0, providerCalls, text, usage, outputValidated: v.ok, validationReason: v.reason };
      if (opts.unloadAfter) rec.unload = await unloadModel(httpCall, baseUrl, routed.model, opts.signal);
      return rec;
    } catch (e) {
      inferenceMs = now() - startedAt;
      const aborted = e && (e.name === "AbortError" || /abort/i.test(String(e.message || "")));
      outcome = aborted ? OUTCOME.CANCELLED : (/(timeout|ETIMEDOUT)/i.test(String(e && e.message)) ? OUTCOME.TIMEOUT : OUTCOME.TRANSPORT_ERROR);
      const rec = { ...base, outcome, queueWaitMs, inferenceMs, retries: 0, providerCalls, text: "", usage: null, outputValidated: false, error: String(e && e.message ? e.message : e) };
      // Lifecycle: still attempt unload in finally-semantics (idempotent) so a crashed call doesn't pin VRAM.
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
