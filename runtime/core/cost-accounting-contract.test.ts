#!/usr/bin/env node
// @ts-nocheck — runs under tsx; suppresses tsc typechecking (the SOURCE under test is strict-typed).
"use strict";
/*
 * COST-ACCOUNTING CONTRACT (ZERO-JS L-iii) — the strict TypeScript canonical runtime/core/cost-accounting.ts
 * is now the SOLE port (the former .js rollback is retired). Replaces the dual-port parity suite: it drives
 * the SAME full reserve→commit→spend→release lifecycle + exhaustion + unit-mismatch + spend-requires-OBSERVED
 * paths through the TS port (full path-execution coverage) and asserts the documented contract invariants.
 */
const assert = require("assert");
const path = require("path");
const E = require(path.join(__dirname, "economic-unit.ts"));
const m = require(path.join(__dirname, "cost-accounting.ts"));
let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

ok("exports the cost-accounting API", ["createCostBudget", "reserve", "commit", "spend", "release", "snapshot"].every((k) => typeof m[k] === "function"));
ok("COST_ACCOUNTING_CONTRACT descriptor present", m.COST_ACCOUNTING_CONTRACT && typeof m.COST_ACCOUNTING_CONTRACT === "object");

const Q = (minor) => E.quantity("token", E.KIND.COST_UNIT, minor, 0);
const est = (minor) => E.costMeasurement(Q(minor), E.BASIS.ESTIMATED);
const obs = (minor) => E.costMeasurement(Q(minor), E.BASIS.OBSERVED);
const wrongUnit = E.costMeasurement(E.quantity("EUR", E.KIND.ASSET, 10, 2), E.BASIS.OBSERVED);

// Drive the full scenario through the TS port (every path executes ⇒ a throw on any path fails the suite).
const trace = [];
let cb = m.createCostBudget("token", E.KIND.COST_UNIT, 100);
trace.push(["create", m.snapshot(cb)]);
let r = m.reserve(cb, "a", est(40)); trace.push(["reserve a est40", r.ok]); cb = r.costBudget;
r = m.reserve(cb, "b", est(80)); trace.push(["reserve b est80 (exhaust)", r.ok, r.exhaustion]); // only 60 left
r = m.reserve(cb, "a", est(1)); trace.push(["reserve dup a", r.ok]);
r = m.commit(cb, "a"); trace.push(["commit a", r.ok]); cb = r.costBudget;
r = m.spend(cb, "a", est(40)); trace.push(["spend a with ESTIMATE (refused)", r.ok]); // estimate never spent
r = m.spend(cb, "a", obs(40)); trace.push(["spend a OBSERVED", r.ok]); cb = r.costBudget;
r = m.spend(cb, "a", obs(40)); trace.push(["double-spend a", r.ok]);
let r2 = m.reserve(cb, "c", est(30)); cb = r2.costBudget; trace.push(["reserve c est30", r2.ok]);
r = m.release(cb, "c"); trace.push(["release c", r.ok]); cb = r.costBudget;
let mismatch;
try { m.reserve(cb, "d", wrongUnit); mismatch = "NO_THROW"; } catch (e) { mismatch = String(e.message); }
trace.push(["reserve wrong unit", mismatch]);
const final = m.snapshot(cb);

// Documented contract invariants (same assertions the dual-port suite made, now on the sole TS port).
ok("reserve a est40 ⇒ ok", trace.find((t) => t[0] === "reserve a est40")[1] === true);
ok("reserve b est80 ⇒ refused (exhaust, only 60 left)", trace.find((t) => t[0] === "reserve b est80 (exhaust)")[1] === false);
ok("duplicate id a ⇒ refused", trace.find((t) => t[0] === "reserve dup a")[1] === false);
ok("spend-with-ESTIMATE refused (never spends an estimate)", trace.find((t) => t[0] === "spend a with ESTIMATE (refused)")[1] === false);
ok("spend a OBSERVED ⇒ ok", trace.find((t) => t[0] === "spend a OBSERVED")[1] === true);
ok("double-spend a ⇒ refused", trace.find((t) => t[0] === "double-spend a")[1] === false);
ok("unit-mismatch refused (no implicit conversion)", /no implicit conversion/.test(trace.find((t) => t[0] === "reserve wrong unit")[1]));
ok("conservation: total === available+reserved+committed+spent", final.total === final.available + final.reserved + final.committed + final.spent);
ok("AVAILABLE never negative", final.available >= 0);

console.log(`\nCOST-ACCOUNTING CONTRACT — ${passed} assertions passed.`);
