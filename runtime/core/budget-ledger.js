#!/usr/bin/env node
"use strict";

/*
 * V5 STAGE 3 — BUDGET + COST ACCOUNTING (deterministic budget ledger).
 *
 * Canonical requirement (ODG_FINAL_MASTER_V5_FICHE_03.md §185 Budget Allocator):
 *   Budget state:  AVAILABLE → RESERVED → COMMITTED → SPENT → RECOVERABLE → REMAINING
 *   Unexpected spend triggers:  REPLAN / ESCALATE / SUBSTITUTE / RESTRICT / SAFE STOP
 *   "Budget exhaustion is not permission to silently lower quality or violate authority."
 *   Budgets decompose into mission / capability / provider / token / compute / verification /
 *   human-attention / reserve buckets.
 *
 * This is that accounting state machine: a pure, deterministic ledger over CALLER-DECLARED units. It
 * invents NO economic value and sets NO price (real money / settlement is Stage 9, not here) — the
 * caller supplies every amount (e.g. a mission's declared token/compute budget). The ledger ENFORCES:
 *   - no overspend: a reservation that exceeds AVAILABLE is refused and reports exhaustion with the
 *     canonical triggers (never silently granted, never negative) ;
 *   - no double-commit / double-spend: each allocation moves strictly RESERVED → COMMITTED → SPENT ;
 *   - recovery/compensation: a RESERVED or COMMITTED allocation may be RELEASED back to AVAILABLE
 *     (SPENT is terminal — undoing a real spend is a NEW governed action, not a silent release, per
 *     FICHE_07 §11) ;
 *   - conservation: total === available + reserved + committed + spent, always.
 *
 * Pure/standalone in the style of state-transition.js / action-gate.js (no clock, randomness or I/O;
 * each operation returns a NEW frozen ledger). A read-only require.main CLI prints the descriptor.
 * NOT a mission verdict and NOT a settlement — it is the in-flight accounting of ONE budget bucket.
 */

const LIFECYCLE = Object.freeze(["AVAILABLE", "RESERVED", "COMMITTED", "SPENT", "RECOVERABLE", "REMAINING"]);
const ALLOCATION_STATUS = Object.freeze(["RESERVED", "COMMITTED", "SPENT", "RELEASED"]);
// Canonical responses to an unexpected / exhausting spend (FICHE_03 §185). The caller's policy chooses;
// the ledger never silently lowers quality or proceeds past exhaustion.
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
function isFiniteNumber(v) { return typeof v === "number" && Number.isFinite(v); }
function isNonNegNumber(v) { return isFiniteNumber(v) && v >= 0; }
function isPosNumber(v) { return isFiniteNumber(v) && v > 0; }
function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }
function isLedger(l) {
  return l !== null && typeof l === "object" && isNonNegNumber(l.total) && l.allocations && typeof l.allocations === "object";
}

// ---- Derived sums (pure) ----------------------------------------------------------------------
function sumByStatus(ledger, status) {
  let s = 0;
  for (const id of Object.keys(ledger.allocations)) {
    const a = ledger.allocations[id];
    if (a.status === status) s += a.amount;
  }
  return s;
}
function reservedTotal(l) { return sumByStatus(l, "RESERVED"); }
function committedTotal(l) { return sumByStatus(l, "COMMITTED"); }
function spentTotal(l) { return sumByStatus(l, "SPENT"); }
function recoveredTotal(l) { return sumByStatus(l, "RELEASED"); }
// AVAILABLE / REMAINING: total minus everything outstanding or spent (RELEASED returns to available).
function available(l) { return l.total - reservedTotal(l) - committedTotal(l) - spentTotal(l); }

/** snapshot(ledger) -> the frozen budget state (the lifecycle view + exhaustion flag). */
function snapshot(ledger) {
  const avail = available(ledger);
  return Object.freeze({
    total: ledger.total,
    available: avail,
    reserved: reservedTotal(ledger),
    committed: committedTotal(ledger),
    spent: spentTotal(ledger),
    recoverable: reservedTotal(ledger) + committedTotal(ledger), // RESERVED/COMMITTED can still be released
    recovered: recoveredTotal(ledger),
    remaining: avail,
    exhausted: avail <= 0,
  });
}

// ---- Constructor ------------------------------------------------------------------------------
function createLedger(total, bucket) {
  if (!isNonNegNumber(total)) throw new Error("createLedger: total must be a non-negative finite number");
  return Object.freeze({
    total,
    bucket: isNonEmptyString(bucket) ? bucket : "mission",
    allocations: Object.freeze({}),
  });
}

function withAllocations(ledger, allocations) {
  return Object.freeze({ total: ledger.total, bucket: ledger.bucket, allocations: Object.freeze(allocations) });
}
function cloneAllocations(ledger) {
  const out = {};
  for (const id of Object.keys(ledger.allocations)) out[id] = ledger.allocations[id];
  return out;
}
function fail(ledger, error, extra) {
  return Object.freeze(Object.assign({ ok: false, error, ledger }, extra || {}));
}
function okResult(ledger, extra) {
  return Object.freeze(Object.assign({ ok: true, ledger, snapshot: snapshot(ledger) }, extra || {}));
}

// ---- Operations (pure: (ledger, ...) -> { ok, ledger, ... }) ----------------------------------
/** RESERVE: AVAILABLE -> RESERVED. Refused (with exhaustion) when amount exceeds AVAILABLE — no overspend. */
function reserve(ledger, id, amount) {
  if (!isLedger(ledger)) return fail(ledger, "reserve: invalid ledger");
  if (!isNonEmptyString(id)) return fail(ledger, "reserve: id required");
  if (!isPosNumber(amount)) return fail(ledger, "reserve: amount must be a positive finite number");
  if (ledger.allocations[id]) return fail(ledger, `reserve: allocation "${id}" already exists`);
  const avail = available(ledger);
  if (amount > avail) {
    // Exhaustion — never silently grant or go negative. Caller policy picks a canonical trigger.
    return fail(ledger, `reserve: insufficient budget (requested ${amount}, available ${avail})`, {
      exhausted: true,
      exhaustion: Object.freeze({ requested: amount, available: avail, triggers: EXHAUSTION_TRIGGERS }),
    });
  }
  const allocations = cloneAllocations(ledger);
  allocations[id] = Object.freeze({ amount, status: "RESERVED" });
  return okResult(withAllocations(ledger, allocations));
}

/** COMMIT: RESERVED -> COMMITTED. No double-commit (only a RESERVED allocation may commit). */
function commit(ledger, id) {
  if (!isLedger(ledger)) return fail(ledger, "commit: invalid ledger");
  const a = ledger.allocations[id];
  if (!a) return fail(ledger, `commit: unknown allocation "${id}"`);
  if (a.status !== "RESERVED") return fail(ledger, `commit: allocation "${id}" is ${a.status}, not RESERVED`);
  const allocations = cloneAllocations(ledger);
  allocations[id] = Object.freeze({ amount: a.amount, status: "COMMITTED" });
  return okResult(withAllocations(ledger, allocations));
}

/** SPEND: COMMITTED -> SPENT. No double-spend (only a COMMITTED allocation may spend). Terminal. */
function spend(ledger, id) {
  if (!isLedger(ledger)) return fail(ledger, "spend: invalid ledger");
  const a = ledger.allocations[id];
  if (!a) return fail(ledger, `spend: unknown allocation "${id}"`);
  if (a.status !== "COMMITTED") return fail(ledger, `spend: allocation "${id}" is ${a.status}, not COMMITTED`);
  const allocations = cloneAllocations(ledger);
  allocations[id] = Object.freeze({ amount: a.amount, status: "SPENT" });
  return okResult(withAllocations(ledger, allocations));
}

/** RELEASE (recovery/compensation): RESERVED|COMMITTED -> RELEASED (amount returns to AVAILABLE).
 *  SPENT is terminal — a real spend is undone by a NEW governed action, never a silent release. */
function release(ledger, id) {
  if (!isLedger(ledger)) return fail(ledger, "release: invalid ledger");
  const a = ledger.allocations[id];
  if (!a) return fail(ledger, `release: unknown allocation "${id}"`);
  if (a.status === "SPENT") return fail(ledger, `release: allocation "${id}" is SPENT (terminal — compensate via a new action)`);
  if (a.status === "RELEASED") return fail(ledger, `release: allocation "${id}" already RELEASED`);
  const allocations = cloneAllocations(ledger);
  allocations[id] = Object.freeze({ amount: a.amount, status: "RELEASED" });
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
