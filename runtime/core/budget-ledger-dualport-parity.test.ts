#!/usr/bin/env node
// @ts-nocheck — test runs under tsx unchanged; suppresses tsc typechecking (not strict typing), consistent
// with the other runtime/core *-dualport-parity.test.ts suites. The SOURCES under test are strict-typed.
"use strict";
/*
 * BUDGET-LEDGER DUAL-PORT PARITY (AB-4 migration proof) — the new strict TypeScript canonical
 * runtime/core/budget-ledger.ts vs the legacy production port runtime/core/budget-ledger.js. Both are
 * required under tsx and proven behaviourally IDENTICAL across the full lifecycle + every error/exhaustion
 * path. The .js stays the AUTHORITATIVE/consumed port (cost-accounting.js require("./budget-ledger") resolves
 * it); the .ts is a faithful transcription (types only) proven equivalent here — no JS removal.
 */
const assert = require("assert");
const path = require("path");
const js = require(path.join(__dirname, "budget-ledger.js"));
const ts = require(path.join(__dirname, "budget-ledger.ts"));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

// Same public API + same contract descriptor + same constant tables.
ok("same exported API", eq(Object.keys(js).sort(), Object.keys(ts).sort()));
ok("BUDGET_CONTRACT identical", eq(js.BUDGET_CONTRACT, ts.BUDGET_CONTRACT));
ok("LIFECYCLE / ALLOCATION_STATUS / EXHAUSTION_TRIGGERS identical",
  eq(js.LIFECYCLE, ts.LIFECYCLE) && eq(js.ALLOCATION_STATUS, ts.ALLOCATION_STATUS) && eq(js.EXHAUSTION_TRIGGERS, ts.EXHAUSTION_TRIGGERS));

// Run the SAME scenario sequence through both ports; the snapshots/results must match at every step.
function runScenario(m) {
  const trace = [];
  let L = m.createLedger(100, "mission");
  trace.push(["create", m.snapshot(L)]);
  let r = m.reserve(L, "a", 40); trace.push(["reserve a 40", r.ok, r.error || null, r.snapshot || null]); L = r.ledger;
  r = m.reserve(L, "b", 30); trace.push(["reserve b 30", r.ok, r.snapshot || null]); L = r.ledger;
  r = m.reserve(L, "c", 50); trace.push(["reserve c 50 (exhaust)", r.ok, r.error, r.exhausted, r.exhaustion || null]); // refused: only 30 available
  r = m.reserve(L, "a", 10); trace.push(["reserve dup a", r.ok, r.error]); // duplicate id refused
  r = m.commit(L, "a"); trace.push(["commit a", r.ok, r.snapshot || null]); L = r.ledger;
  r = m.spend(L, "a"); trace.push(["spend a", r.ok, r.snapshot || null]); L = r.ledger;
  r = m.spend(L, "a"); trace.push(["double-spend a", r.ok, r.error]); // not COMMITTED anymore
  r = m.release(L, "a"); trace.push(["release spent a", r.ok, r.error]); // SPENT terminal
  r = m.release(L, "b"); trace.push(["release reserved b", r.ok, r.snapshot || null]); L = r.ledger;
  r = m.release(L, "b"); trace.push(["double-release b", r.ok, r.error]);
  r = m.commit(L, "zzz"); trace.push(["commit unknown", r.ok, r.error]);
  r = m.reserve(L, "", 5); trace.push(["reserve empty id", r.ok, r.error]);
  r = m.reserve(L, "d", -5); trace.push(["reserve negative", r.ok, r.error]);
  r = m.reserve(L, "e", 70); trace.push(["reserve e 70 after releases", r.ok, r.snapshot || null]); L = r.ledger;
  return { trace, final: m.snapshot(L) };
}
const jsRun = runScenario(js);
const tsRun = runScenario(ts);
ok("full lifecycle scenario trace identical (js ≡ ts)", eq(jsRun.trace, tsRun.trace));
ok("final snapshot identical (js ≡ ts)", eq(jsRun.final, tsRun.final));

// Conservation invariant holds identically in both ports after the scenario.
for (const [label, m, run] of [["js", js, jsRun], ["ts", ts, tsRun]]) {
  const s = run.final;
  ok(`${label}: conservation total === available+reserved+committed+spent`,
    s.total === s.available + s.reserved + s.committed + s.spent);
  ok(`${label}: AVAILABLE never negative`, s.available >= 0);
}

// Invalid-ledger guard identical.
ok("invalid ledger guard identical", eq(js.reserve(null, "x", 1), ts.reserve(null, "x", 1)));

console.log(`\nBUDGET-LEDGER DUAL-PORT PARITY — ${passed} assertions passed.`);
