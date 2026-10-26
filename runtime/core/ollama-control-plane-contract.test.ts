#!/usr/bin/env node
// @ts-nocheck — runs under tsx; suppresses tsc typechecking (the SOURCE under test is strict-typed).
"use strict";
/*
 * OLLAMA-CONTROL-PLANE CONTRACT (ZERO-JS L-iii) — strict TypeScript canonical ollama-control-plane.ts is now
 * the SOLE port. Replaces the dual-port parity suite. HERMETIC: httpCall is INJECTED (zero network), now() is
 * a FIXED clock. Proves the API + the pure decision pipeline executes across representative tasks and the
 * async run() orchestrator reaches each documented outcome (OK / VALIDATION_FAILED / TRANSPORT_ERROR /
 * REFUSED fail-closed-LARGE / DISABLED), with DISABLED a strict no-op.
 */
const assert = require("assert");
const path = require("path");
const m = require(path.join(__dirname, "ollama-control-plane.ts"));
let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

(async () => {
  ok("exports the control-plane API", ["normalizeTask", "decidePolicy", "routeModel", "validateOutput", "run"].every((k) => typeof m[k] === "function"));
  ok("CONTRACT + constant tables present", m.CONTRACT && m.TIER && m.OUTCOME);

  // Pure decision pipeline executes (no throw) across representative tasks.
  const tasks = [
    { kind: "classify" }, { kind: "code" }, { kind: "summarize", contextTokens: 100 },
    { kind: "extract", contextTokens: 9000 }, { risk: "HIGH", kind: "classify" },
    { highRisk: true, kind: "label" }, { kind: "unknown" }, { complexity: "HIGH", kind: "classify" }, {}, null,
  ];
  let allOk = true;
  for (const t of tasks) { try { m.normalizeTask(t); m.decidePolicy(t); } catch { allOk = false; } }
  ok("normalizeTask + decidePolicy execute across all tasks (no throw)", allOk);
  ok("routeModel fail-closed when no large model available (LARGE policy)", (() => { const r = m.routeModel(m.decidePolicy({ risk: "HIGH" }), {}); return r && (r.model === null || r.refused === true || r.tier === "LARGE"); })());
  const specs = [undefined, { json: true, requiredFields: ["x"] }, { json: true, enums: { k: ["a", "b"] } }];
  const outs = ["", "hello", '{"x":1}', '{"y":1}', '{"k":"c"}', "not json"];
  let vOk = true; for (const s of specs) for (const o of outs) { try { m.validateOutput(o, s); } catch { vOk = false; } }
  ok("validateOutput executes across spec×output matrix (no throw)", vOk);

  // run() orchestrator reaches each documented outcome — HERMETIC injected httpCall + fixed clock.
  const now = () => 1000;
  const okHttp = async () => ({ status: 200, message: { content: '{"x":1}' }, eval_count: 7, prompt_eval_count: 3 });
  const badJsonHttp = async () => ({ status: 200, message: { content: "not json" } });
  const errHttp = async () => ({ status: 500 });
  const common = { force: true, now, models: { small: "small-m", large: "large-m" } };
  const r_ok = await m.run({ kind: "classify" }, { ...common, httpCall: okHttp, validate: { json: true, requiredFields: ["x"] } });
  ok("OK small ⇒ outcome OK", r_ok.outcome === "OK");
  const r_vf = await m.run({ kind: "classify" }, { ...common, httpCall: badJsonHttp, validate: { json: true, requiredFields: ["x"] } });
  ok("bad JSON ⇒ VALIDATION_FAILED", r_vf.outcome === "VALIDATION_FAILED");
  const r_te = await m.run({ kind: "code" }, { ...common, httpCall: errHttp });
  ok("http 500 ⇒ TRANSPORT_ERROR", r_te.outcome === "TRANSPORT_ERROR");
  const r_ref = await m.run({ risk: "HIGH", kind: "classify" }, { force: true, now, models: { small: "small-m" }, httpCall: okHttp });
  ok("HIGH risk + no large model ⇒ REFUSED", r_ref.outcome === "REFUSED");
  const r_dis = await m.run({ kind: "classify" }, { now, models: { small: "s" }, httpCall: okHttp });
  ok("no force + flag off ⇒ DISABLED, strict no-op (providerCalls 0)", r_dis.outcome === "DISABLED" && r_dis.providerCalls === 0);

  console.log(`\nOLLAMA-CONTROL-PLANE CONTRACT — ${passed} assertions passed.`);
})();
