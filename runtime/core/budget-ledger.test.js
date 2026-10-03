#!/usr/bin/env node
"use strict";

/*
 * V5 Stage 3 — Budget ledger. Locks the FICHE_03 §185 lifecycle
 * AVAILABLE→RESERVED→COMMITTED→SPENT→RECOVERABLE→REMAINING: no overspend, no double-commit/spend,
 * release-as-recovery (SPENT terminal), conservation, determinism, exhaustion triggers. Pure module.
 *
 * Run directly: node runtime/core/budget-ledger.test.js
 */
const B = require("./budget-ledger");

let failures = 0;
function check(cond, label) { if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); } }
const conserved = (l) => { const s = B.snapshot(l); return s.available + s.reserved + s.committed + s.spent === s.total; };

console.log("V5 STAGE 3 — BUDGET LEDGER");

// Lifecycle: reserve → commit → spend, with available decreasing and conservation holding throughout.
{
  let l = B.createLedger(100);
  check(B.snapshot(l).available === 100, "fresh ledger: available === total");
  const r = B.reserve(l, "a1", 40);
  check(r.ok && r.snapshot.reserved === 40 && r.snapshot.available === 60, "reserve ⇒ RESERVED, available 100→60");
  l = r.ledger;
  const c = B.commit(l, "a1");
  check(c.ok && c.snapshot.committed === 40 && c.snapshot.reserved === 0 && c.snapshot.available === 60, "commit ⇒ RESERVED→COMMITTED (available unchanged)");
  l = c.ledger;
  const s = B.spend(l, "a1");
  check(s.ok && s.snapshot.spent === 40 && s.snapshot.committed === 0 && s.snapshot.available === 60, "spend ⇒ COMMITTED→SPENT");
  check(conserved(s.ledger), "conservation holds after reserve/commit/spend");
}

// No overspend: a reservation beyond AVAILABLE is refused with exhaustion + canonical triggers.
{
  const l = B.createLedger(50);
  const r = B.reserve(l, "big", 80);
  check(!r.ok && r.exhausted === true, "reserve beyond available ⇒ refused + exhausted");
  check(Array.isArray(r.exhaustion.triggers) && r.exhaustion.triggers.includes("SAFE_STOP") && r.exhaustion.triggers.includes("REPLAN"), "exhaustion reports canonical triggers (no silent grant)");
  check(B.snapshot(r.ledger).available === 50, "refused reservation did NOT mutate the budget (available still 50)");
}

// Reserve up to the limit then one unit more → exhaustion (available never negative).
{
  let l = B.createLedger(10);
  l = B.reserve(l, "a", 10).ledger;
  check(B.snapshot(l).available === 0, "reserve exactly available ⇒ available 0");
  const over = B.reserve(l, "b", 1);
  check(!over.ok && over.exhausted === true, "any further reserve ⇒ exhaustion (available never negative)");
}

// No double-commit / double-spend; strict ordering.
{
  let l = B.createLedger(100);
  l = B.reserve(l, "a1", 30).ledger;
  check(!B.spend(l, "a1").ok, "cannot SPEND a RESERVED (must COMMIT first)");
  l = B.commit(l, "a1").ledger;
  check(!B.commit(l, "a1").ok, "cannot double-COMMIT");
  l = B.spend(l, "a1").ledger;
  check(!B.spend(l, "a1").ok, "cannot double-SPEND (SPENT terminal)");
  check(!B.commit(l, "a1").ok, "cannot COMMIT a SPENT allocation");
}

// Release = recovery: RESERVED/COMMITTED return to AVAILABLE; SPENT is terminal.
{
  let l = B.createLedger(100);
  l = B.reserve(l, "a1", 40).ledger;
  const rel = B.release(l, "a1");
  check(rel.ok && rel.snapshot.available === 100 && rel.snapshot.recovered === 40, "release a RESERVED ⇒ amount returns to available (recovered)");
  let l2 = B.createLedger(100);
  l2 = B.spend(B.commit(B.reserve(l2, "x", 20).ledger, "x").ledger, "x").ledger;
  check(!B.release(l2, "x").ok, "cannot RELEASE a SPENT allocation (compensation is a new action)");
}

// Unknown allocation / bad inputs.
{
  const l = B.createLedger(100);
  check(!B.commit(l, "nope").ok, "commit unknown id ⇒ not ok");
  check(!B.reserve(l, "a", -5).ok && !B.reserve(l, "a", 0).ok, "non-positive amount ⇒ refused");
  let ok = true; try { B.createLedger(-1); ok = false; } catch { /* expected */ } check(ok, "negative total ⇒ throws");
}

// Determinism: same operation sequence ⇒ identical snapshot.
{
  const seq = (l) => B.spend(B.commit(B.reserve(l, "a", 25).ledger, "a").ledger, "a").ledger;
  check(JSON.stringify(B.snapshot(seq(B.createLedger(100)))) === JSON.stringify(B.snapshot(seq(B.createLedger(100)))), "deterministic: same sequence ⇒ same snapshot");
}

console.log(failures === 0 ? "ALL PASS — V5 STAGE 3 BUDGET LEDGER" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
