#!/usr/bin/env node
"use strict";

/*
 * V5 STAGE 3 — BUDGET + COST ACCOUNTING (deterministic budget ledger) — TypeScript canonical.
 * Faithful, strict-typed port of the historical runtime/core/budget-ledger.js (behaviour identical:
 * same constants, same pure operations, same frozen return shapes, same read-only require.main CLI,
 * same CommonJS `module.exports`). Verified under tsconfig.runtime-leaves-strict.json (strict, no
 * ts-nocheck). The legacy .js remains an INDEPENDENT byte-equivalent implementation and stays the
 * production port that `require("./budget-ledger")` resolves to; dual-port parity is proven by
 * runtime/core/budget-ledger-dualport-parity.test.ts.
 *
 * Canonical requirement (ODG_FINAL_MASTER_V5_FICHE_03.md §185 Budget Allocator):
 *   Budget state:  AVAILABLE -> RESERVED -> COMMITTED -> SPENT -> RECOVERABLE -> REMAINING
 *   "Budget exhaustion is not permission to silently lower quality or violate authority."
 * A pure, deterministic ledger over CALLER-DECLARED units: no overspend, no double-commit/double-spend,
 * release only from RESERVED/COMMITTED (SPENT terminal), conservation total === available+reserved+committed+spent.
 */

type AllocationStatus = "RESERVED" | "COMMITTED" | "SPENT" | "RELEASED";
interface Allocation { amount: number; status: AllocationStatus; }
interface Ledger { total: number; bucket: string; allocations: Record<string, Allocation>; }
interface OpResult {
  ok: boolean;
  ledger: Ledger;
  error?: string;
  snapshot?: unknown;
  exhausted?: boolean;
  exhaustion?: unknown;
}

const LIFECYCLE = Object.freeze(["AVAILABLE", "RESERVED", "COMMITTED", "SPENT", "RECOVERABLE", "REMAINING"]);
const ALLOCATION_STATUS = Object.freeze(["RESERVED", "COMMITTED", "SPENT", "RELEASED"]);
const EXHAUSTION_TRIGGERS = Object.freeze(["REPLAN", "ESCALATE", "SUBSTITUTE", "RESTRICT", "SAFE_STOP"]);

const BUDGET_CONTRACT = Object.freeze({
  id: "V5-STAGE3-BUDGET-LEDGER",
  source: "FICHE_03 §185",
  lifecycle: LIFECYCLE,
  allocationStatus: ALLOCATION_STATUS,
  exhaustionTriggers: EXHAUSTION_TRIGGERS,
  invariants: Object.freeze([
    "no overspend: AVAILABLE never negative; a reservation beyond AVAILABLE is refused with exhaustion",
    "no double-commit / double-spend: strictly RESERVED -> COMMITTED -> SPENT",
    "RELEASE only from RESERVED/COMMITTED (SPENT is terminal; undo is a new governed action)",
    "conservation: total === available + reserved + committed + spent",
    "deterministic / pure (no clock, randomness or I/O)",
  ]),
});

// ---- Type guards ------------------------------------------------------------------------------
function isFiniteNumber(v: unknown): v is number { return typeof v === "number" && Number.isFinite(v); }
function isNonNegNumber(v: unknown): v is number { return isFiniteNumber(v) && v >= 0; }
function isPosNumber(v: unknown): v is number { return isFiniteNumber(v) && v > 0; }
function isNonEmptyString(v: unknown): v is string { return typeof v === "string" && v.trim().length > 0; }
function isLedger(l: unknown): l is Ledger {
  const o = l as { total?: unknown; allocations?: unknown } | null;
  return o !== null && typeof o === "object" && isNonNegNumber(o.total) && !!o.allocations && typeof o.allocations === "object";
}

// ---- Derived sums (pure) ----------------------------------------------------------------------
function sumByStatus(ledger: Ledger, status: AllocationStatus): number {
  let s = 0;
  for (const id of Object.keys(ledger.allocations)) {
    const a = ledger.allocations[id];
    if (a.status === status) s += a.amount;
  }
  return s;
}
function reservedTotal(l: Ledger): number { return sumByStatus(l, "RESERVED"); }
function committedTotal(l: Ledger): number { return sumByStatus(l, "COMMITTED"); }
function spentTotal(l: Ledger): number { return sumByStatus(l, "SPENT"); }
function recoveredTotal(l: Ledger): number { return sumByStatus(l, "RELEASED"); }
function available(l: Ledger): number { return l.total - reservedTotal(l) - committedTotal(l) - spentTotal(l); }

/** snapshot(ledger) -> the frozen budget state (the lifecycle view + exhaustion flag). */
function snapshot(ledger: Ledger): unknown {
  const avail = available(ledger);
  return Object.freeze({
    total: ledger.total,
    available: avail,
    reserved: reservedTotal(ledger),
    committed: committedTotal(ledger),
    spent: spentTotal(ledger),
    recoverable: reservedTotal(ledger) + committedTotal(ledger),
    recovered: recoveredTotal(ledger),
    remaining: avail,
    exhausted: avail <= 0,
  });
}

// ---- Constructor ------------------------------------------------------------------------------
function createLedger(total: unknown, bucket?: unknown): Ledger {
  if (!isNonNegNumber(total)) throw new Error("createLedger: total must be a non-negative finite number");
  return Object.freeze({
    total,
    bucket: isNonEmptyString(bucket) ? bucket : "mission",
    allocations: Object.freeze({}) as Record<string, Allocation>,
  });
}

function withAllocations(ledger: Ledger, allocations: Record<string, Allocation>): Ledger {
  return Object.freeze({ total: ledger.total, bucket: ledger.bucket, allocations: Object.freeze(allocations) });
}
function cloneAllocations(ledger: Ledger): Record<string, Allocation> {
  const out: Record<string, Allocation> = {};
  for (const id of Object.keys(ledger.allocations)) out[id] = ledger.allocations[id];
  return out;
}
function fail(ledger: Ledger, error: string, extra?: Record<string, unknown>): OpResult {
  return Object.freeze(Object.assign({ ok: false, error, ledger }, extra || {})) as OpResult;
}
function okResult(ledger: Ledger, extra?: Record<string, unknown>): OpResult {
  return Object.freeze(Object.assign({ ok: true, ledger, snapshot: snapshot(ledger) }, extra || {})) as OpResult;
}

// ---- Operations (pure: (ledger, ...) -> { ok, ledger, ... }) ----------------------------------
/** RESERVE: AVAILABLE -> RESERVED. Refused (with exhaustion) when amount exceeds AVAILABLE — no overspend. */
function reserve(ledger: Ledger, id: unknown, amount: unknown): OpResult {
  if (!isLedger(ledger)) return fail(ledger, "reserve: invalid ledger");
  if (!isNonEmptyString(id)) return fail(ledger, "reserve: id required");
  if (!isPosNumber(amount)) return fail(ledger, "reserve: amount must be a positive finite number");
  if (ledger.allocations[id]) return fail(ledger, `reserve: allocation "${id}" already exists`);
  const avail = available(ledger);
  if (amount > avail) {
    return fail(ledger, `reserve: insufficient budget (requested ${amount}, available ${avail})`, {
      exhausted: true,
      exhaustion: Object.freeze({ requested: amount, available: avail, triggers: EXHAUSTION_TRIGGERS }),
    });
  }
  const allocations = cloneAllocations(ledger);
  allocations[id] = Object.freeze({ amount, status: "RESERVED" }) as Allocation;
  return okResult(withAllocations(ledger, allocations));
}

/** COMMIT: RESERVED -> COMMITTED. No double-commit (only a RESERVED allocation may commit). */
function commit(ledger: Ledger, id: string): OpResult {
  if (!isLedger(ledger)) return fail(ledger, "commit: invalid ledger");
  const a = ledger.allocations[id];
  if (!a) return fail(ledger, `commit: unknown allocation "${id}"`);
  if (a.status !== "RESERVED") return fail(ledger, `commit: allocation "${id}" is ${a.status}, not RESERVED`);
  const allocations = cloneAllocations(ledger);
  allocations[id] = Object.freeze({ amount: a.amount, status: "COMMITTED" }) as Allocation;
  return okResult(withAllocations(ledger, allocations));
}

/** SPEND: COMMITTED -> SPENT. No double-spend (only a COMMITTED allocation may spend). Terminal. */
function spend(ledger: Ledger, id: string): OpResult {
  if (!isLedger(ledger)) return fail(ledger, "spend: invalid ledger");
  const a = ledger.allocations[id];
  if (!a) return fail(ledger, `spend: unknown allocation "${id}"`);
  if (a.status !== "COMMITTED") return fail(ledger, `spend: allocation "${id}" is ${a.status}, not COMMITTED`);
  const allocations = cloneAllocations(ledger);
  allocations[id] = Object.freeze({ amount: a.amount, status: "SPENT" }) as Allocation;
  return okResult(withAllocations(ledger, allocations));
}

/** RELEASE (recovery/compensation): RESERVED|COMMITTED -> RELEASED (amount returns to AVAILABLE).
 *  SPENT is terminal — a real spend is undone by a NEW governed action, never a silent release. */
function release(ledger: Ledger, id: string): OpResult {
  if (!isLedger(ledger)) return fail(ledger, "release: invalid ledger");
  const a = ledger.allocations[id];
  if (!a) return fail(ledger, `release: unknown allocation "${id}"`);
  if (a.status === "SPENT") return fail(ledger, `release: allocation "${id}" is SPENT (terminal — compensate via a new action)`);
  if (a.status === "RELEASED") return fail(ledger, `release: allocation "${id}" already RELEASED`);
  const allocations = cloneAllocations(ledger);
  allocations[id] = Object.freeze({ amount: a.amount, status: "RELEASED" }) as Allocation;
  return okResult(withAllocations(ledger, allocations));
}

module.exports = {
  LIFECYCLE,
  ALLOCATION_STATUS,
  EXHAUSTION_TRIGGERS,
  BUDGET_CONTRACT,
  createLedger,
  snapshot,
  reserve,
  commit,
  spend,
  release,
};

// ---- Read-only CLI: prints the contract descriptor; mutates nothing. --------------------------
if (require.main === module) {
  process.stdout.write(JSON.stringify(BUDGET_CONTRACT, null, 2) + "\n");
}

export {};
