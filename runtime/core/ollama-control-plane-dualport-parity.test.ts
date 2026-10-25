#!/usr/bin/env node
// @ts-nocheck — runs under tsx; suppresses tsc typechecking (not strict typing), consistent with the other
// runtime/core *-dualport-parity.test.ts suites. The SOURCES under test are strict-typed.
"use strict";
/*
 * OLLAMA-CONTROL-PLANE DUAL-PORT PARITY (AB-4 migration proof) — strict TypeScript canonical
 * runtime/core/ollama-control-plane.ts vs legacy production port ollama-control-plane.js. HERMETIC: httpCall
 * is INJECTED (zero network, no real Ollama), now() is a FIXED clock (deterministic timings). Proves API +
 * the pure decision pipeline (normalizeTask/classify/decidePolicy/routeModel/validateOutput) + the async
 * run() orchestrator across OK / REFUSED(fail-closed LARGE) / VALIDATION_FAILED / TRANSPORT_ERROR / DISABLED,
 * js ≡ ts. No real network, no provider, no JS removed.
 */
const assert = require("assert");
const path = require("path");
const js = require(path.join(__dirname, "ollama-control-plane.js"));
const ts = require(path.join(__dirname, "ollama-control-plane.ts"));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

(async () => {
  ok("same exported API", eq(Object.keys(js).sort(), Object.keys(ts).sort()));
  ok("CONTRACT + constant tables identical", eq(js.CONTRACT, ts.CONTRACT) && eq(js.TIER, ts.TIER) && eq(js.OUTCOME, ts.OUTCOME));

  // Pure decision pipeline parity across representative tasks.
  const tasks = [
    { kind: "classify" }, { kind: "code" }, { kind: "summarize", contextTokens: 100 },
    { kind: "extract", contextTokens: 9000 }, { risk: "HIGH", kind: "classify" },
    { highRisk: true, kind: "label" }, { kind: "unknown" }, { complexity: "HIGH", kind: "classify" }, {}, null,
  ];
  for (let i = 0; i < tasks.length; i++) {
    ok(`normalizeTask parity #${i}`, eq(js.normalizeTask(tasks[i]), ts.normalizeTask(tasks[i])));
    ok(`decidePolicy parity #${i}`, eq(js.decidePolicy(tasks[i]), ts.decidePolicy(tasks[i])));
  }
  ok("routeModel fail-closed parity (LARGE, no large model)", eq(js.routeModel(js.decidePolicy({ risk: "HIGH" }), {}), ts.routeModel(ts.decidePolicy({ risk: "HIGH" }), {})));
  const specs = [undefined, { json: true, requiredFields: ["x"] }, { json: true, enums: { k: ["a", "b"] } }];
  const outs = ["", "hello", '{"x":1}', '{"y":1}', '{"k":"c"}', "not json"];
  for (const s of specs) for (const o of outs) ok(`validateOutput parity (${JSON.stringify(s)},${JSON.stringify(o)})`, eq(js.validateOutput(o, s), ts.validateOutput(o, s)));

  // run() orchestrator parity — HERMETIC injected httpCall + fixed clock. force:true bypasses the flag.
  const now = () => 1000; // constant clock ⇒ deterministic queueWaitMs/inferenceMs=0
  const okHttp = async () => ({ status: 200, message: { content: '{"x":1}' }, eval_count: 7, prompt_eval_count: 3 });
  const badJsonHttp = async () => ({ status: 200, message: { content: "not json" } });
  const errHttp = async () => ({ status: 500 });
  const common = { force: true, now, models: { small: "small-m", large: "large-m" } };
  const scen = [
    ["OK small", { kind: "classify" }, { ...common, httpCall: okHttp, validate: { json: true, requiredFields: ["x"] } }],
    ["VALIDATION_FAILED", { kind: "classify" }, { ...common, httpCall: badJsonHttp, validate: { json: true, requiredFields: ["x"] } }],
    ["TRANSPORT_ERROR", { kind: "code" }, { ...common, httpCall: errHttp }],
    ["REFUSED (HIGH risk, no large model)", { risk: "HIGH", kind: "classify" }, { force: true, now, models: { small: "small-m" }, httpCall: okHttp }],
    ["DISABLED (no force, flag off)", { kind: "classify" }, { now, models: { small: "s" }, httpCall: okHttp }],
    ["OK large + unloadAfter", { kind: "code" }, { ...common, httpCall: okHttp, unloadAfter: true }],
  ];
  for (const [label, task, opts] of scen) {
    // Each run uses its OWN fresh scheduler implicitly (not shared) ⇒ deterministic.
    const jr = await js.run(task, opts);
    const tr = await ts.run(task, opts);
    ok(`run() parity — ${label} (js ≡ ts, outcome=${jr.outcome})`, eq(jr, tr));
  }
  ok("DISABLED is a strict NO-OP (providerCalls 0)", (await js.run({ kind: "classify" }, { now })).providerCalls === 0);

  console.log(`\nOLLAMA-CONTROL-PLANE DUAL-PORT PARITY — ${passed} assertions passed.`);
})();
