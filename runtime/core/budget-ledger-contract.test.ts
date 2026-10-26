#!/usr/bin/env node
// @ts-nocheck — test runs under tsx unchanged; suppresses tsc typechecking (the SOURCE under test is strict-typed).
"use strict";
/*
 * BUDGET-LEDGER CONTRACT (ZERO-JS L-iii) — the strict TypeScript canonical runtime/core/budget-ledger.ts
 * is now the SOLE port (the former .js rollback is retired). This replaces the former dual-port parity
 * suite: it exercises the SAME full lifecycle + every error/exhaustion path and asserts the contract
 * directly (API shape, descriptor/constant tables, per-step outcomes, conservation, fail-closed guards).
 */
const assert = require("assert");
const path = require("path");
const m = require(path.join(__dirname, "budget-ledger.ts"));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

// Public API + contract descriptor + constant tables present and well-formed.
ok("exports the lifecycle API", ["createLedger", "reserve", "commit", "spend", "release", "snapshot"].every((k) => typeof m[k] === "function"));
ok("BUDGET_CONTRACT descriptor present", m.BUDGET_CONTRACT && typeof m.BUDGET_CONTRACT === "object");
ok("LIFECYCLE / ALLOCATION_STATUS / EXHAUSTION_TRIGGERS present",
  m.LIFECYCLE && m.ALLOCATION_STATUS && m.EXHAUSTION_TRIGGERS);

// Run the full scenario and assert each step's documented outcome against the TS port.
let L = m.createLedger(100, "mission");
ok("create: total=100, available=100", m.snapshot(L).total === 100 && m.snapshot(L).available === 100);
let r = m.reserve(L, "a", 40); ok("reserve a 40 ⇒ ok", r.ok === true); L = r.ledger;
r = m.reserve(L, "b", 30); ok("reserve b 30 ⇒ ok", r.ok === true); L = r.ledger;
r = m.reserve(L, "c", 50); ok("reserve c 50 ⇒ refused + exhausted (only 30 left)", r.ok === false && r.exhausted === true);
r = m.reserve(L, "a", 10); ok("duplicate id a ⇒ refused", r.ok === false);
r = m.commit(L, "a"); ok("commit a ⇒ ok", r.ok === true); L = r.ledger;
r = m.spend(L, "a"); ok("spend a ⇒ ok", r.ok === true); L = r.ledger;
r = m.spend(L, "a"); ok("double-spend a ⇒ refused (not COMMITTED)", r.ok === false);
r = m.release(L, "a"); ok("release SPENT a ⇒ refused (terminal)", r.ok === false);
r = m.release(L, "b"); ok("release reserved b ⇒ ok", r.ok === true); L = r.ledger;
r = m.release(L, "b"); ok("double-release b ⇒ refused", r.ok === false);
r = m.commit(L, "zzz"); ok("commit unknown ⇒ refused", r.ok === false);
r = m.reserve(L, "", 5); ok("reserve empty id ⇒ refused", r.ok === false);
r = m.reserve(L, "d", -5); ok("reserve negative ⇒ refused", r.ok === false);
r = m.reserve(L, "e", 70); ok("reserve e 70 after releases ⇒ refused (only 60 free: 100−40 spent)", r.ok === false); L = r.ledger;

// Conservation invariant + non-negativity hold on the final snapshot.
const s = m.snapshot(L);
ok("conservation: total === available+reserved+committed+spent",
  s.total === s.available + s.reserved + s.committed + s.spent);
ok("AVAILABLE never negative", s.available >= 0);

// Fail-closed: an invalid ledger is refused (never throws, returns {ok:false}).
const guard = m.reserve(null, "x", 1);
ok("invalid ledger guard ⇒ {ok:false}", guard && guard.ok === false);

console.log(`\nBUDGET-LEDGER CONTRACT — ${passed} assertions passed.`);
