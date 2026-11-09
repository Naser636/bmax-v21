#!/usr/bin/env node
"use strict";

/*
 * V12.4 / LOCAL INTELLIGENCE ENGINE — MODEL ROUTER (CTO V6 §3). PURE, deterministic. Benchmark-grounded, task-aware
 * selection of the local coding model, over the EXISTING ollama-provider.PREFERRED_MODELS (a recommendation layer — it
 * reimplements no transport). Grounded in the measured 2026-11-09 CPU benchmark on a controlled repair task
 * (clamp): qwen2.5-coder:3b ≈ 15.2 tok/s CORRECT (≈2× faster than 7b), qwen2.5-coder:7b ≈ 8.1 tok/s CORRECT,
 * qwen2.5:0.5b ≈ 59.2 tok/s but INCORRECT (too weak). Routing: a SIMPLE task → the fastest benchmarked-CORRECT model
 * (3b); a COMPLEX task → the highest-quality model (7b); a model benchmarked INCORRECT (0.5b) is NEVER the default for a
 * correctness-critical task. The router only RECOMMENDS — the INDEPENDENT test remains the sole arbiter of acceptance
 * (a faster model's output is accepted ONLY if it passes the independent test; speed never lowers the quality gate).
 * Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

// Measured CPU benchmark (2026-11-09, clamp repair task; tokPerSec approximate, correct = passed the independent test).
const MODEL_BENCHMARKS = Object.freeze({
  "qwen2.5-coder:7b": Object.freeze({ tokPerSec: 8.1, correct: true, tier: "quality" }),
  "qwen2.5-coder:3b": Object.freeze({ tokPerSec: 15.2, correct: true, tier: "fast" }),
  "qwen2.5:0.5b": Object.freeze({ tokPerSec: 59.2, correct: false, tier: "tiny" }),
});

const SIMPLE_DEFAULT = "qwen2.5-coder:3b";   // fastest benchmarked-correct
const COMPLEX_DEFAULT = "qwen2.5-coder:7b";  // highest quality
const FALLBACK = "qwen2.5-coder:7b";

/** correctnessTrusted(model) -> boolean. A model benchmarked INCORRECT is not trusted as a DEFAULT for a code task. */
function correctnessTrusted(model: any): boolean {
  const b = (MODEL_BENCHMARKS as any)[String(model)];
  return b ? b.correct === true : false;   // unknown model ⇒ not trusted as default (fail-closed)
}

/**
 * selectModel({ taskComplexity, available }) -> { model, reason, benchmark }. taskComplexity: "SIMPLE" | "COMPLEX" (default COMPLEX — safe).
 * available: optional list of installed models (if given, the pick must be installed, else falls back to the quality model).
 */
function selectModel(input: any): any {
  const o = isObj(input) ? input : {};
  const complexity = o.taskComplexity === "SIMPLE" ? "SIMPLE" : "COMPLEX";
  const avail = Array.isArray(o.available) ? o.available.map(String) : null;
  let model = complexity === "SIMPLE" ? SIMPLE_DEFAULT : COMPLEX_DEFAULT;
  // the chosen model must be correctness-trusted (never default to a benchmarked-incorrect model) …
  if (!correctnessTrusted(model)) model = FALLBACK;
  // … and installed, if an availability list was supplied.
  if (avail && !avail.includes(model)) model = avail.find((m: any) => correctnessTrusted(m)) || FALLBACK;
  const b = (MODEL_BENCHMARKS as any)[model] || null;
  return Object.freeze({
    model,
    reason: complexity === "SIMPLE" ? "SIMPLE task ⇒ fastest benchmarked-CORRECT model (speed; quality still gated by the independent test)" : "COMPLEX task ⇒ highest-quality model (correctness priority)",
    benchmark: b,
    note: "a recommendation only — the independent test is the sole arbiter of acceptance; a model benchmarked INCORRECT is never a default for a code task",
  });
}

const MODEL_ROUTER_CONTRACT = Object.freeze({
  id: "V124-MODEL-ROUTER",
  source: "CTO V6 §3 — benchmark-grounded, task-aware local model routing",
  benchmarks: MODEL_BENCHMARKS,
  reuses: Object.freeze(["ollama-provider.PREFERRED_MODELS (recommendation over the existing list; no new transport)", "the independent test (l3-governed-repair / l4-campaign scoreL3) — the sole acceptance arbiter"]),
  notAuthority: "recommends a model by task; it calls no model and accepts nothing — the independent test decides",
  invariants: Object.freeze([
    "a SIMPLE task routes to the fastest benchmarked-CORRECT model (3b ≈2× faster than 7b); a COMPLEX task routes to the highest-quality model (7b)",
    "a model benchmarked INCORRECT (0.5b) is NEVER the default for a correctness-critical code task (fail-closed)",
    "the router only RECOMMENDS — a faster model's output is accepted ONLY if it passes the INDEPENDENT test; speed never lowers the quality gate (Truth Lock + reproducibility preserved)",
    "unknown model ⇒ not correctness-trusted ⇒ falls back to the quality model (fail-closed)",
    "pure/deterministic: task + availability in → model recommendation out; calls no model, writes no file",
  ]),
});

module.exports = { MODEL_BENCHMARKS, correctnessTrusted, selectModel, MODEL_ROUTER_CONTRACT };

if (require.main === module) {
  const simple = selectModel({ taskComplexity: "SIMPLE", available: ["qwen2.5-coder:7b", "qwen2.5-coder:3b", "qwen2.5:0.5b"] });
  const complex = selectModel({ taskComplexity: "COMPLEX" });
  process.stdout.write(JSON.stringify({ ...MODEL_ROUTER_CONTRACT, demo: { simple: simple.model, complex: complex.model } }, null, 2) + "\n");
}

export {};
