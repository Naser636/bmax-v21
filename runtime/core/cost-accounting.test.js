#!/usr/bin/env node
"use strict";

/*
 * V5 cost-accounting adapter (increment C). Locks: budget bound to a declared unit; unit-mismatch refused
 * (no implicit conversion); reserve→commit→spend lifecycle; SPEND requires OBSERVED (estimate refused);
 * overspend ⇒ EXHAUSTION; release/recovery; denied/unobserved action not charged; COST≠BUDGET≠VALUE;
 * determinism. Composes economic-unit + budget-ledger (reuse, not reimplement).
 *
 * Run directly: node runtime/core/cost-accounting.test.js
 */
const E = require("./economic-unit");
const C = require("./cost-accounting");

let failures = 0;
function check(cond, label) { if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); } }

const tok = (n) => E.quantity("token", E.KIND.COST_UNIT, n, 0);
const est = (n) => E.costMeasurement(tok(n), E.BASIS.ESTIMATED, { provider: "openai", calculationBasis: "heuristic" });
const obs = (n) => E.costMeasurement(tok(n), E.BASIS.OBSERVED, { provider: "openai", provenance: "api.usage.total_tokens" });

console.log("V5 — COST ACCOUNTING ADAPTER");

// Full lifecycle: reserve(estimate) → commit → spend(observed).
{
  let cb = C.createCostBudget("token", E.KIND.COST_UNIT, 10000);
  check(C.snapshot(cb).available === 10000 && C.snapshot(cb).unit === "token", "cost budget bound to unit=token, available=total");
  const r = C.reserve(cb, "call-1", est(1500));
  check(r.ok && r.decision === "RESERVED" && r.snapshot.reserved === 1500, "reserve an ESTIMATED cost ⇒ RESERVED");
  cb = r.costBudget;
  const c = C.commit(cb, "call-1"); check(c.ok && c.decision === "COMMITTED", "commit ⇒ COMMITTED"); cb = c.costBudget;
  const s = C.spend(cb, "call-1", obs(1480));
  check(s.ok && s.decision === "SPENT" && s.snapshot.spent === 1500, "spend with OBSERVED ⇒ SPENT");
}

// SPEND requires OBSERVED — an estimate is never spent.
{
  let cb = C.createCostBudget("token", E.KIND.COST_UNIT, 10000);
  cb = C.commit(C.reserve(cb, "c", est(100)).costBudget, "c").costBudget;
  const bad = C.spend(cb, "c", est(100));
  check(!bad.ok && /OBSERVED/.test(bad.error), "spend with an ESTIMATED measurement ⇒ REJECTED (never charged as real)");
  check(C.snapshot(bad.costBudget).spent === 0, "unobserved spend ⇒ ZERO spent (not charged as executed)");
}

// Unit mismatch refused (no implicit conversion).
{
  const cb = C.createCostBudget("token", E.KIND.COST_UNIT, 100);
  let threw = false; try { C.reserve(cb, "x", E.quantity("EUR", E.KIND.ASSET, 50, 2)); } catch { threw = true; }
  check(threw, "reserve an EUR cost against a token budget ⇒ throws (no implicit conversion)");
}

// Overspend ⇒ exhaustion (no silent grant).
{
  const cb = C.createCostBudget("token", E.KIND.COST_UNIT, 1000);
  const r = C.reserve(cb, "big", est(5000));
  check(!r.ok && r.decision === "EXHAUSTED" && Array.isArray(r.exhaustion.triggers), "reserve beyond available ⇒ EXHAUSTED with canonical triggers");
  check(C.snapshot(r.costBudget).available === 1000, "exhausted reserve ⇒ budget unchanged (no silent grant)");
}

// Release / recovery: a denied/aborted action returns its budget.
{
  let cb = C.createCostBudget("token", E.KIND.COST_UNIT, 1000);
  cb = C.reserve(cb, "a", est(400)).costBudget;
  const rel = C.release(cb, "a");
  check(rel.ok && C.snapshot(rel.costBudget).available === 1000 && C.snapshot(rel.costBudget).recovered === 400, "release a reservation ⇒ budget recovered (available restored)");
}

// Determinism.
{
  const run = () => { let cb = C.createCostBudget("token", E.KIND.COST_UNIT, 1000); cb = C.commit(C.reserve(cb, "a", est(250)).costBudget, "a").costBudget; return C.spend(cb, "a", obs(250)).snapshot; };
  check(JSON.stringify(run()) === JSON.stringify(run()), "deterministic: same sequence ⇒ same snapshot");
}

console.log(failures === 0 ? "ALL PASS — V5 COST ACCOUNTING ADAPTER" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
