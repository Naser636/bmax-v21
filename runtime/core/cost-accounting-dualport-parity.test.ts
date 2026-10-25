#!/usr/bin/env node
// @ts-nocheck — runs under tsx; suppresses tsc typechecking (not strict typing), consistent with the other
// runtime/core *-dualport-parity.test.ts suites. The SOURCES under test are strict-typed.
"use strict";
/*
 * COST-ACCOUNTING DUAL-PORT PARITY (AB-4 migration proof) — the new strict TypeScript canonical
 * runtime/core/cost-accounting.ts vs the legacy production port runtime/core/cost-accounting.js. Both
 * required under tsx and proven behaviourally IDENTICAL across the full reserve→commit→spend→release
 * lifecycle + exhaustion + unit-mismatch + spend-requires-OBSERVED paths. The .js stays the
 * AUTHORITATIVE/consumed port (live-cost-metering.js require("./cost-accounting") resolves it); the .ts is a
 * faithful transcription (types only) proven equivalent here — no JS removal.
 */
const assert = require("assert");
const path = require("path");
const E = require(path.join(__dirname, "economic-unit.js"));
const js = require(path.join(__dirname, "cost-accounting.js"));
const ts = require(path.join(__dirname, "cost-accounting.ts"));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

ok("same exported API", eq(Object.keys(js).sort(), Object.keys(ts).sort()));
ok("COST_ACCOUNTING_CONTRACT identical", eq(js.COST_ACCOUNTING_CONTRACT, ts.COST_ACCOUNTING_CONTRACT));

const Q = (minor) => E.quantity("token", E.KIND.COST_UNIT, minor, 0);
const est = (minor) => E.costMeasurement(Q(minor), E.BASIS.ESTIMATED);
const obs = (minor) => E.costMeasurement(Q(minor), E.BASIS.OBSERVED);
const wrongUnit = E.costMeasurement(E.quantity("EUR", E.KIND.ASSET, 10, 2), E.BASIS.OBSERVED);

function runScenario(m) {
  const trace = [];
  let cb = m.createCostBudget("token", E.KIND.COST_UNIT, 100);
  trace.push(["create", m.snapshot(cb)]);
  let r = m.reserve(cb, "a", est(40)); trace.push(["reserve a est40", r.ok, r.decision, r.snapshot]); cb = r.costBudget;
  r = m.reserve(cb, "b", est(80)); trace.push(["reserve b est80 (exhaust)", r.ok, r.decision, r.error, r.exhaustion]); // only 60 left
  r = m.reserve(cb, "a", est(1)); trace.push(["reserve dup a", r.ok, r.decision, r.error]);
  r = m.commit(cb, "a"); trace.push(["commit a", r.ok, r.decision, r.snapshot]); cb = r.costBudget;
  r = m.spend(cb, "a", est(40)); trace.push(["spend a with ESTIMATE (refused)", r.ok, r.decision, r.error]); // estimate never spent
  r = m.spend(cb, "a", obs(40)); trace.push(["spend a OBSERVED", r.ok, r.decision, r.snapshot]); cb = r.costBudget;
  r = m.spend(cb, "a", obs(40)); trace.push(["double-spend a", r.ok, r.decision, r.error]);
  let r2 = m.reserve(cb, "c", est(30)); cb = r2.costBudget; trace.push(["reserve c est30", r2.ok, r2.decision, r2.snapshot]);
  r = m.release(cb, "c"); trace.push(["release c", r.ok, r.decision, r.snapshot]); cb = r.costBudget;
  // unit mismatch is REFUSED (throws) — capture identically in both ports.
  let mismatch;
  try { m.reserve(cb, "d", wrongUnit); mismatch = "NO_THROW"; } catch (e) { mismatch = String(e.message); }
  trace.push(["reserve wrong unit", mismatch]);
  return { trace, final: m.snapshot(cb) };
}
const jsRun = runScenario(js);
const tsRun = runScenario(ts);
ok("full cost lifecycle trace identical (js ≡ ts)", eq(jsRun.trace, tsRun.trace));
ok("final snapshot identical (js ≡ ts)", eq(jsRun.final, tsRun.final));
ok("spend-with-ESTIMATE refused identically (never spends an estimate)",
   jsRun.trace.find(t => t[0] === "spend a with ESTIMATE (refused)")[1] === false);
ok("unit-mismatch refused identically (no implicit conversion)",
   /no implicit conversion/.test(jsRun.trace.find(t => t[0] === "reserve wrong unit")[1]));
ok("conservation holds identically in both ports", (() => {
  const s = tsRun.final; return s.total === s.available + s.reserved + s.committed + s.spent && s.available >= 0;
})());

console.log(`\nCOST-ACCOUNTING DUAL-PORT PARITY — ${passed} assertions passed.`);
