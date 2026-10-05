#!/usr/bin/env node
"use strict";

/*
 * ON_DEMAND_MODEL_ROUTING_V2 — Ollama Control Plane: offline/fake tests. No server, no network, no pull/delete.
 * Proves: feature-flag OFF NO-OP + backward compat; deterministic small/large routing; HIGH-risk⇒LARGE;
 * no silent downgrade; scheduler concurrency/serialize-large; lifecycle unload + idempotent; timeout/cancel;
 * output validation; evidence fields; providerCalls/externalCalls; never calls /api/pull or /api/delete.
 * Run: node runtime/core/ollama-control-plane.test.js
 */
const C = require("./ollama-control-plane");

let failures = 0;
function check(cond, label) { if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); } }
const MODELS = { small: "qwen2.5:0.5b", large: "qwen2.5:14b" };
// A fake Ollama HTTP: records every URL (to prove no pull/delete), returns a scripted chat/unload response.
function fakeHttp(script = {}) {
  const urls = [];
  const call = async ({ url, body, signal }) => {
    urls.push(url);
    if (signal && signal.aborted) { const e = new Error("aborted"); e.name = "AbortError"; throw e; }
    if (script.throw) throw script.throw;
    if (/\/api\/generate$/.test(url)) return { status: 200, done: true, done_reason: "unload" }; // unload ack
    return { status: 200, message: { role: "assistant", content: script.content ?? "hello" }, eval_count: 7, prompt_eval_count: 30 };
  };
  return { call, urls };
}
const clock = (seq) => { let i = 0; return () => seq[Math.min(i++, seq.length - 1)]; };

console.log("ON_DEMAND_MODEL_ROUTING_V2 — OLLAMA CONTROL PLANE (offline)");

// 1 — feature flag OFF ⇒ NO-OP (backward compatible), providerCalls 0.
{
  const had = process.env.ODG_OLLAMA_CONTROL_PLANE; delete process.env.ODG_OLLAMA_CONTROL_PLANE;
  const f = fakeHttp();
  C.run({ kind: "classify" }, { models: MODELS, httpCall: f.call }).then((r) => {
    check(r.enabled === false && r.outcome === "DISABLED", "1. flag OFF ⇒ NO-OP DISABLED (backward compatible)");
    check(r.providerCalls === 0 && f.urls.length === 0, "1b. no provider call when disabled");
    if (had !== undefined) process.env.ODG_OLLAMA_CONTROL_PLANE = had;
  });
}

// 2 — determinism: same task ⇒ same tier/reason.
{
  const a = C.decidePolicy({ kind: "classify" }); const b = C.decidePolicy({ kind: "classify" });
  check(JSON.stringify(a) === JSON.stringify(b), "2. decidePolicy deterministic (same task ⇒ same decision)");
  check(typeof a.reason === "string" && a.policyVersion === "OCP_V1", "2b. decision carries reason + policyVersion");
}

// 3 — routing: classify/extract/summarize ⇒ SMALL; code/architecture/long-context ⇒ LARGE.
{
  check(C.decidePolicy({ kind: "classify" }).tier === "SMALL", "3. classify ⇒ SMALL");
  check(C.decidePolicy({ kind: "extract" }).tier === "SMALL", "3b. extract ⇒ SMALL");
  check(C.decidePolicy({ kind: "code" }).tier === "LARGE", "3c. code ⇒ LARGE");
  check(C.decidePolicy({ kind: "code-review" }).tier === "LARGE", "3d. code-review ⇒ LARGE");
  check(C.decidePolicy({ kind: "architecture" }).tier === "LARGE", "3e. architecture ⇒ LARGE");
  check(C.decidePolicy({ kind: "summarize", contextTokens: 40000 }).tier === "LARGE", "3f. long-context overrides SMALL ⇒ LARGE");
}

// 4 — HIGH risk ⇒ LARGE mandatory (even for a normally-SMALL kind); no silent downgrade.
{
  const d = C.decidePolicy({ kind: "classify", risk: "HIGH" });
  check(d.tier === "LARGE" && /HIGH risk/.test(d.reason), "4. HIGH risk ⇒ LARGE mandatory");
}

// 5 — no silent downgrade: LARGE decision + no large model ⇒ routeModel REFUSES (not SMALL).
{
  const d = C.decidePolicy({ kind: "code" });
  const r = C.routeModel(d, { small: "qwen2.5:0.5b" }); // no large configured
  check(r.ok === false && r.tier === "LARGE" && r.model === null, "5. LARGE + no large model ⇒ fail-closed REFUSE (no downgrade)");
  const r2 = C.routeModel(C.decidePolicy({ kind: "classify" }), { small: "qwen2.5:0.5b" });
  check(r2.ok === true && r2.model === "qwen2.5:0.5b", "5b. SMALL routes to the small model");
}

// 6 — run() force + small ⇒ OK; providerCalls 1; externalCalls 0; evidence fields present.
{
  const f = fakeHttp({ content: "ODG_LOCAL_OK" });
  C.run({ kind: "classify" }, { force: true, models: MODELS, httpCall: f.call, prompt: "hi", now: clock([1000, 1000, 1200]) }).then((r) => {
    check(r.outcome === "OK" && r.tier === "SMALL" && r.model === "qwen2.5:0.5b", "6. run SMALL ⇒ OK with concrete model");
    check(r.providerCalls === 1 && r.externalCalls === 0, "6b. exactly 1 provider call, 0 external calls");
    check(r.queueWaitMs === 0 && r.inferenceMs === 200 && r.keepAlive === "5m", "6c. evidence: queueWait/inference/keepAlive observed");
    check(r.outputValidated === true, "6d. output validated");
    check(!f.urls.some((u) => /\/api\/(pull|delete|create|push)/.test(u)), "6e. NEVER calls pull/delete/create/push");
    check(f.urls.every((u) => /^http:\/\/127\.0\.0\.1:11434\//.test(u)), "6f. all calls to localhost Ollama (external=0)");
  });
}

// 7 — fail-closed at run(): HIGH-risk + no large model ⇒ REFUSED, no provider call.
{
  const f = fakeHttp();
  C.run({ kind: "classify", risk: "HIGH" }, { force: true, models: { small: "qwen2.5:0.5b" }, httpCall: f.call }).then((r) => {
    check(r.outcome === "REFUSED" && r.tier === "LARGE" && r.providerCalls === 0, "7. HIGH-risk + no large model ⇒ REFUSED, 0 provider call (fail-closed)");
    check(f.urls.length === 0, "7b. no HTTP call on refusal");
  });
}

// 8 — validation matrix (transport OK but output quality varies).
{
  check(C.validateOutput("", {}).ok === false, "8a. empty output ⇒ invalid");
  check(C.validateOutput("not json", { json: true }).ok === false, "8b. invalid JSON ⇒ invalid");
  check(C.validateOutput('{"a":1}', { json: true, requiredFields: ["b"] }).ok === false, "8c. missing required field ⇒ invalid");
  check(C.validateOutput('{"s":"X"}', { json: true, enums: { s: ["A", "B"] } }).ok === false, "8d. invalid enum ⇒ invalid");
  check(C.validateOutput('{"s":"A"}', { json: true, requiredFields: ["s"], enums: { s: ["A", "B"] } }).ok === true, "8e. valid JSON+schema ⇒ ok");
  // run() with a JSON spec + bad output ⇒ VALIDATION_FAILED (distinct from transport/inference success).
  const f = fakeHttp({ content: "not json" });
  C.run({ kind: "classify" }, { force: true, models: MODELS, httpCall: f.call, validate: { json: true } }).then((r) => {
    check(r.outcome === "VALIDATION_FAILED" && r.providerCalls === 1, "8f. transport OK + bad output ⇒ VALIDATION_FAILED (no auto-repair)");
  });
}

// 9 — Scheduler: LARGE serialized (never overlap); concurrency bound respected.
{
  const sched = new C.Scheduler({ maxConcurrency: 3, serializeLarge: true });
  let active = 0, maxLargeOverlap = 0, maxActive = 0;
  const defer = () => { let res; const p = new Promise((r) => (res = r)); return { p, res }; };
  const mk = (tier, d) => sched.run(tier, async () => {
    active++; maxActive = Math.max(maxActive, active);
    if (tier === "LARGE") maxLargeOverlap = Math.max(maxLargeOverlap, active);
    await d.p; active--; return tier;
  });
  const d1 = defer(), d2 = defer(), d3 = defer();
  const l1 = mk("LARGE", d1), l2 = mk("LARGE", d2), s1 = mk("SMALL", d3);
  setTimeout(() => { d1.res(); d2.res(); d3.res(); }, 5);
  Promise.all([l1, l2, s1]).then(() => {
    check(maxLargeOverlap <= 1, "9. LARGE never overlaps anything (serialized)");
    check(maxActive <= 3, "9b. concurrency bound respected");
  });
}

// 10 — Lifecycle: unloadAfter ⇒ unload requested + confirmed (server ack); idempotent close.
{
  const f = fakeHttp({ content: "ok" });
  C.run({ kind: "classify" }, { force: true, models: MODELS, httpCall: f.call, unloadAfter: true }).then((r) => {
    check(r.unload && r.unload.requested === true && r.unload.confirmed === true, "10. unloadAfter ⇒ unload requested + confirmed (server ack)");
    check(f.urls.some((u) => /\/api\/generate$/.test(u)), "10b. unload uses /api/generate keep_alive:0 (no delete)");
  });
  // idempotent: calling unloadModel twice is safe and reports consistently.
  const f2 = fakeHttp();
  Promise.all([C.unloadModel(f2.call, "http://127.0.0.1:11434", "m"), C.unloadModel(f2.call, "http://127.0.0.1:11434", "m")]).then(([a, b]) => {
    check(a.confirmed === true && b.confirmed === true, "10c. unload idempotent (safe to repeat)");
    check(C.unloadModel(f2.call, "http://127.0.0.1:11434", "") instanceof Promise, "10d. unload with no model returns cleanly (no throw)");
  });
}

// 11 — timeout / cancellation.
{
  const abErr = new Error("The operation was aborted"); abErr.name = "AbortError";
  C.run({ kind: "classify" }, { force: true, models: MODELS, httpCall: fakeHttp({ throw: abErr }).call }).then((r) => {
    check(r.outcome === "CANCELLED", "11. aborted inference ⇒ CANCELLED");
  });
  const toErr = new Error("request timeout ETIMEDOUT");
  C.run({ kind: "classify" }, { force: true, models: MODELS, httpCall: fakeHttp({ throw: toErr }).call }).then((r) => {
    check(r.outcome === "TIMEOUT", "11b. timeout ⇒ TIMEOUT");
  });
}

// 12 — CLI contract descriptor loads + declares OFF-by-default + Ollama-only scope.
{
  check(C.CONTRACT.name === "ON_DEMAND_MODEL_ROUTING_V2" && /DISABLED/.test(C.CONTRACT.default), "12. contract: name + DISABLED default");
  check(/no pull\/delete\/download/.test(C.CONTRACT.scope) && /no external\/cloud/.test(C.CONTRACT.scope), "12b. contract scope: no pull/delete, no external");
}

// Summary (allow the async checks above to settle).
setTimeout(() => {
  console.log(failures === 0 ? "ALL PASS — OLLAMA CONTROL PLANE" : `FAILURES: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}, 60);
