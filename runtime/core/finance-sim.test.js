#!/usr/bin/env node
"use strict";
/* FINANCE-SIM — SIMULATION-ONLY contract test. Deterministic fixtures, no network, no execution. */
const assert = require("assert");
const path = require("path");
const F = require(path.resolve(__dirname, "finance-sim.js"));
const { VERDICT } = require(path.resolve(__dirname, "mechanical-acceptance.js"));
let passed = 0; function ok(n, c) { assert.ok(c, n); console.log("  ok -", n); passed += 1; }
const bar = (t, minor, source = "fixture") => ({ t, price: { minor, scale: 2 }, source });
// Hand-computed fixture (window=2): positions=[1,0,1,0], pnl minor = -13 (0.05/… see report). Exercises long+flat+negative.
const SERIES = [bar(1, 100), bar(2, 90), bar(3, 95), bar(4, 92)];

// 1 — valid series ⇒ ACCEPT, SIMULATION, executed:false, deterministic positions + P&L, traceable.
{
  const r = F.runSimulation(SERIES, { window: 2 });
  ok("1 valid ⇒ ACCEPT + SIMULATION + executed:false", r.ok && r.verdict === VERDICT.ACCEPT && r.mode === "SIMULATION" && r.executed === false);
  ok("1 positions hand-computed [1,0,1,0]", JSON.stringify(r.positions) === JSON.stringify([1, 0, 1, 0]));
  ok("1 P&L = -13 minor (scale2) → '-0.13 SIM' (no profit claim)", r.pnl.minor === -13 && r.pnl.scale === 2 && r.pnlFormatted.startsWith("-0.13"));
  ok("1 traceable: inputHash + params present", /^[0-9a-f]{64}$/.test(r.inputHash) && r.params.window === 2 && r.bars === 4);
}
// 2 — empty ⇒ BLOCKED/EMPTY.
ok("2 empty ⇒ BLOCKED EMPTY", (() => { const r = F.runSimulation([], { window: 2 }); return !r.ok && r.code === F.CODE.EMPTY && r.verdict === VERDICT.BLOCKED; })());
// 3 — invalid bar (bad price / scale drift) ⇒ REJECT INVALID_BAR.
ok("3 non-integer price ⇒ INVALID_BAR", F.runSimulation([{ t: 1, price: { minor: 1.5, scale: 2 }, source: "x" }], { window: 1 }).code === F.CODE.INVALID_BAR);
ok("3 scale drift ⇒ INVALID_BAR", F.runSimulation([bar(1, 100), { t: 2, price: { minor: 10, scale: 4 }, source: "x" }], { window: 1 }).code === F.CODE.INVALID_BAR);
// 4 — unsourced ⇒ REJECT UNSOURCED.
ok("4 missing source ⇒ UNSOURCED", F.runSimulation([{ t: 1, price: { minor: 100, scale: 2 } }], { window: 1 }).code === F.CODE.UNSOURCED);
// 5 — temporal inconsistency (duplicate / backwards t) ⇒ NON_MONOTONIC_TIME.
ok("5 duplicate t ⇒ NON_MONOTONIC_TIME", F.runSimulation([bar(1, 100), bar(1, 101)], { window: 1 }).code === F.CODE.NON_MONOTONIC_TIME);
ok("5 backwards t ⇒ NON_MONOTONIC_TIME", F.runSimulation([bar(2, 100), bar(1, 101)], { window: 1 }).code === F.CODE.NON_MONOTONIC_TIME);
// 6 — invalid params ⇒ REJECT INVALID_PARAMS.
ok("6 window<1 ⇒ INVALID_PARAMS", F.runSimulation(SERIES, { window: 0 }).code === F.CODE.INVALID_PARAMS);
// 7 — NO LOOK-AHEAD (property): decisions on a truncated series equal the full-run decisions up to that point.
{
  const full = F.runSimulation(SERIES, { window: 2 }).positions;
  let consistent = true;
  for (let k = 0; k < SERIES.length; k++) {
    const trunc = F.runSimulation(SERIES.slice(0, k + 1), { window: 2 }).positions;
    if (JSON.stringify(trunc) !== JSON.stringify(full.slice(0, k + 1))) consistent = false;
  }
  ok("7 no look-ahead: truncating future bars never changes past decisions", consistent);
}
// 8 — explicit future read throws LOOK_AHEAD.
{
  const ing = F.ingest(SERIES); let threw = false, msg = "";
  try { F.pastView(ing.bars, 1).at(2); } catch (e) { threw = true; msg = String(e.message); }
  ok("8 reading a future index ⇒ throws LOOK_AHEAD", threw && msg.startsWith(F.CODE.LOOK_AHEAD));
}
// 9 — determinism: same input+params ⇒ identical result bytes.
ok("9 deterministic", JSON.stringify(F.runSimulation(SERIES, { window: 2 })) === JSON.stringify(F.runSimulation(SERIES, { window: 2 })));
// 10 — no real execution surface exported.
ok("10 no execution/order/broker export", !Object.keys(F).some((k) => /execute|order|broker|trade|send|buy|sell/i.test(k)));
console.log(`\nFINANCE-SIM (simulation-only) — ${passed} assertions passed.`);
