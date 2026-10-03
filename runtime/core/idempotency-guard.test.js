#!/usr/bin/env node
"use strict";

/*
 * V5 Stage 5 — action-level idempotency + compare-and-set guard (FICHE_07 §9).
 * DUPLICATE_DETECTION + RECONCILIATION, compare-and-set via canonical version, opt-in, determinism.
 *
 * Run directly: node runtime/core/idempotency-guard.test.js
 */
const G = require("./idempotency-guard");

let failures = 0;
function check(cond, label) { if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); } }

console.log("V5 STAGE 5 — IDEMPOTENCY GUARD");

// New guarded action, expected-previous matches current ⇒ PROCEED.
{
  const d = G.admit({ actionId: "A1", idempotencyKey: "k1", expectedPreviousState: 5 }, G.emptyJournal(), 5);
  check(d.decision === "PROCEED" && d.guarded === true, "new action + matching expected version ⇒ PROCEED (guarded)");
}

// DUPLICATE_DETECTION + RECONCILIATION: a previously-applied key ⇒ DUPLICATE with the prior result.
{
  let j = G.emptyJournal();
  j = G.record(j, "k1", { wrote: "out.js" });
  const d = G.admit({ actionId: "A1", idempotencyKey: "k1", expectedPreviousState: 9 }, j, 5);
  check(d.decision === "DUPLICATE", "already-applied idempotencyKey ⇒ DUPLICATE (no re-apply)");
  check(JSON.stringify(d.reconciledResult) === JSON.stringify({ wrote: "out.js" }), "DUPLICATE reconciles to the recorded prior result");
}

// DUPLICATE precedence: a replay is safe even when the version has since moved (dup checked before CAS).
{
  let j = G.record(G.emptyJournal(), "k2", { ok: true });
  const d = G.admit({ idempotencyKey: "k2", expectedPreviousState: 1 }, j, 999);
  check(d.decision === "DUPLICATE", "DUPLICATE detected before compare-and-set (replay always safe)");
}

// COMPARE-AND-SET failure: stale expected-previous ⇒ CONFLICT, do not apply.
{
  const d = G.admit({ actionId: "A3", idempotencyKey: "k3", expectedPreviousState: 4 }, G.emptyJournal(), 6);
  check(d.decision === "CONFLICT" && /expectedPreviousState 4 != currentVersion 6/.test(d.detail), "stale expectedPreviousState ⇒ CONFLICT (compare-and-set)");
}

// CAS with matching version ⇒ PROCEED.
{
  const d = G.admit({ idempotencyKey: "k4", expectedPreviousState: 6 }, G.emptyJournal(), 6);
  check(d.decision === "PROCEED", "matching expectedPreviousState ⇒ PROCEED");
}

// Non-integer version ⇒ CONFLICT (cannot compare-and-set against a non-version).
{
  const d = G.admit({ idempotencyKey: "k5", expectedPreviousState: 2 }, G.emptyJournal(), undefined);
  check(d.decision === "CONFLICT", "undefined currentVersion with a CAS request ⇒ CONFLICT (no blind apply)");
}

// Opt-in: no idempotencyKey and no expectedPreviousState ⇒ UNGUARDED PROCEED.
{
  const d = G.admit({ actionId: "A6" }, G.emptyJournal(), 3);
  check(d.decision === "PROCEED" && d.guarded === false, "no key + no expected-previous ⇒ UNGUARDED PROCEED (opt-in)");
}

// record never overwrites an applied key (an applied action is final).
{
  let j = G.record(G.emptyJournal(), "k7", { v: 1 });
  j = G.record(j, "k7", { v: 2 });
  check(JSON.stringify(G.admit({ idempotencyKey: "k7" }, j, 0).reconciledResult) === JSON.stringify({ v: 1 }), "record does not overwrite an already-applied key");
}

// Full safe-replay cycle: PROCEED → apply → record → replay ⇒ DUPLICATE (idempotent end-to-end).
{
  let j = G.emptyJournal();
  const first = G.admit({ idempotencyKey: "cycle", expectedPreviousState: 0 }, j, 0);
  check(first.decision === "PROCEED", "cycle: first submit ⇒ PROCEED");
  j = G.record(j, "cycle", { applied: true });
  const replay = G.admit({ idempotencyKey: "cycle", expectedPreviousState: 0 }, j, 1);
  check(replay.decision === "DUPLICATE" && replay.reconciledResult.applied === true, "cycle: replay ⇒ DUPLICATE + reconciled (idempotent)");
}

// Determinism: same inputs ⇒ same decision.
{
  const a = G.admit({ idempotencyKey: "d", expectedPreviousState: 2 }, G.emptyJournal(), 3);
  const b = G.admit({ idempotencyKey: "d", expectedPreviousState: 2 }, G.emptyJournal(), 3);
  check(a.decision === b.decision && a.detail === b.detail, "deterministic: same inputs ⇒ same decision");
}

console.log(failures === 0 ? "ALL PASS — V5 STAGE 5 IDEMPOTENCY GUARD" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
