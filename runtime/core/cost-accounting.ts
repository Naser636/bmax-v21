#!/usr/bin/env node
"use strict";

/*
 * V5 COST ACCOUNTING ADAPTER (Stage 3, increment C) — TypeScript canonical. Faithful, strict-typed port of
 * the historical runtime/core/cost-accounting.js (behaviour identical: same contract, same pure ops, same
 * frozen return shapes, same CommonJS module.exports, same read-only require.main CLI). Verified under
 * tsconfig.runtime-leaves-strict.json (strict, no ts-nocheck). The legacy .js stays the production port that
 * require("./cost-accounting") resolves to; dual-port parity is proven by cost-accounting-dualport-parity.test.ts.
 *
 * Composes the two EXISTING primitives WITHOUT reimplementing either: economic-unit (economic Quantity +
 * OBSERVED/ESTIMATED measurement) and budget-ledger (AVAILABLE→RESERVED→COMMITTED→SPENT lifecycle). Keeps
 * COST ≠ BUDGET ≠ VALUE ≠ REVENUE distinct. Reserve/commit may use an ESTIMATED measurement; SPEND requires
 * an OBSERVED one. Pure/deterministic (no clock/randomness/I/O).
 */

const E: any = require("./economic-unit");
const budget: any = require("./budget-ledger");

interface CostBudget { unit: string; kind: string; ledger: any; }

const COST_ACCOUNTING_CONTRACT = Object.freeze({
  id: "V5-COST-ACCOUNTING",
  source: "FICHE_03 §176/§185; composes economic-unit + budget-ledger",
  rules: Object.freeze([
    "a cost budget binds ONE budget-ledger to ONE declared economic unit",
    "all measurements must be in the budget's unit (mismatch refused — no implicit conversion)",
    "reserve/commit may use an ESTIMATED measurement; SPEND requires an OBSERVED measurement",
    "a cost is never SPENT before the event is observed; a denied/unobserved action is not charged",
    "COST ≠ BUDGET ≠ VALUE ≠ REVENUE ≠ CASH ≠ SETTLEMENT (adapter only; not those stages)",
    "integer minor-unit amounts only (exact); scale is the unit's declared scale",
    "deterministic / pure (reuses budget-ledger pure ops)",
  ]),
});

function isPlainObject(v: unknown): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isNonEmptyString(v: unknown): v is string { return typeof v === "string" && v.trim().length > 0; }

/**
 * createCostBudget(unit, kind, totalMinor) -> { unit, kind, ledger } — a budget-ledger bound to a declared
 * economic unit. `totalMinor` is the AVAILABLE allocation in that unit's minor units (exact int).
 */
function createCostBudget(unit: unknown, kind: unknown, totalMinor: unknown): CostBudget {
  if (!isNonEmptyString(unit)) throw new Error("createCostBudget: unit required");
  if (kind !== E.KIND.COST_UNIT && kind !== E.KIND.ASSET) throw new Error("createCostBudget: kind ∈ COST_UNIT|ASSET");
  if (!Number.isInteger(totalMinor) || (totalMinor as number) < 0) throw new Error("createCostBudget: totalMinor (non-negative integer) required");
  return Object.freeze({ unit, kind: kind as string, ledger: budget.createLedger(totalMinor, unit) });
}

// A measurement must be an economic Quantity in the budget's unit (same unit AND kind). No conversion.
function requireBudgetUnit(cb: CostBudget, q: any, op: string): void {
  if (!E.isQuantity(q)) throw new Error(`${op}: an economic Quantity is required`);
  if (q.unit !== cb.unit || q.kind !== cb.kind) {
    throw new Error(`${op}: unit mismatch ${q.unit}/${q.kind} vs budget ${cb.unit}/${cb.kind} — no implicit conversion`);
  }
  if (q.minor < 0) throw new Error(`${op}: cost amount must be non-negative`);
}
function withLedger(cb: CostBudget, ledger: any): CostBudget { return Object.freeze({ unit: cb.unit, kind: cb.kind, ledger }); }

/** RESERVE an estimated/known cost quantity against the budget (AVAILABLE→RESERVED). */
function reserve(cb: CostBudget, id: string, measurement: any): unknown {
  const q = measurement && measurement.quantity ? measurement.quantity : measurement; // accept Quantity or CostMeasurement
  requireBudgetUnit(cb, q, "reserve");
  const r = budget.reserve(cb.ledger, id, q.minor);
  return Object.freeze({ ok: r.ok, decision: r.ok ? "RESERVED" : (r.exhausted ? "EXHAUSTED" : "REJECTED"), error: r.error || null, exhaustion: r.exhaustion || null, costBudget: r.ok ? withLedger(cb, r.ledger) : cb, snapshot: budget.snapshot(r.ledger) });
}

/** COMMIT a reservation (RESERVED→COMMITTED). */
function commit(cb: CostBudget, id: string): unknown {
  const r = budget.commit(cb.ledger, id);
  return Object.freeze({ ok: r.ok, decision: r.ok ? "COMMITTED" : "REJECTED", error: r.error || null, costBudget: r.ok ? withLedger(cb, r.ledger) : cb, snapshot: budget.snapshot(r.ledger) });
}

/**
 * SPEND a committed reservation — REQUIRES an OBSERVED measurement (a cost is never SPENT before the event
 * is observed). The observed measurement must match the budget unit; an estimate is refused here.
 */
function spend(cb: CostBudget, id: string, observed: any): unknown {
  if (!isPlainObject(observed) || observed.basis !== E.BASIS.OBSERVED) {
    return Object.freeze({ ok: false, decision: "REJECTED", error: "spend requires an OBSERVED cost measurement (an estimate is never spent)", costBudget: cb, snapshot: budget.snapshot(cb.ledger) });
  }
  requireBudgetUnit(cb, observed.quantity, "spend");
  const r = budget.spend(cb.ledger, id);
  return Object.freeze({ ok: r.ok, decision: r.ok ? "SPENT" : "REJECTED", error: r.error || null, observed: observed.quantity, costBudget: r.ok ? withLedger(cb, r.ledger) : cb, snapshot: budget.snapshot(r.ledger) });
}

/** RELEASE a reservation/commitment (recovery) — a denied/aborted action returns its budget. */
function release(cb: CostBudget, id: string): unknown {
  const r = budget.release(cb.ledger, id);
  return Object.freeze({ ok: r.ok, decision: r.ok ? "RELEASED" : "REJECTED", error: r.error || null, costBudget: r.ok ? withLedger(cb, r.ledger) : cb, snapshot: budget.snapshot(r.ledger) });
}

function snapshot(cb: CostBudget): unknown { return Object.freeze({ unit: cb.unit, kind: cb.kind, ...budget.snapshot(cb.ledger) }); }

module.exports = { COST_ACCOUNTING_CONTRACT, createCostBudget, reserve, commit, spend, release, snapshot };

if (require.main === module) {
  process.stdout.write(JSON.stringify(COST_ACCOUNTING_CONTRACT, null, 2) + "\n");
}

export {};
