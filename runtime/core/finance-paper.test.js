#!/usr/bin/env node
"use strict";
/* FINANCE PAPER-TRADING — deterministic test. Fictitious orders, explicit fee/slippage, NO execution. */
const assert = require("assert");
const path = require("path");
const P = require(path.resolve(__dirname, "finance-paper.js"));
let passed = 0; function ok(n, c) { assert.ok(c, n); console.log("  ok -", n); passed += 1; }
const b = (minor) => ({ minor, scale: 2 });
const BARS = [b(1000), b(1100), b(1050), b(1200)];
const POS = [1, 1, 0, 1]; // buy@0, hold, sell@2, buy@3 (open at end)

// 1 — hand-computed fees/slippage/P&L (feeBps=10, slipBps=20).
{
  const r = P.paperTrade(BARS, POS, { feeBps: 10, slippageBps: 20, scale: 2 });
  ok("1 ok, PAPER, executed:false", r.ok && r.mode === "PAPER" && r.executed === false);
  ok("1 three fictitious orders (BUY,SELL,BUY)", r.orders.length === 3 && r.orders.every(o => o.fictitious === true) && r.orders.map(o => o.side).join(",") === "BUY,SELL,BUY");
  ok("1 gross=44, costs=9, net=35 minor (hand-computed)", r.grossPnl.minor === 44 && r.costs.minor === 9 && r.netPnl.minor === 35 && r.netFormatted.startsWith("0.35"));
  ok("1 assumptions labelled (not real costs)", r.assumptions.feeBps === 10 && r.assumptions.slippageBps === 20 && /ASSUMPTIONS/.test(r.assumptions.note));
}
// 2 — zero fee/slippage ⇒ gross==net.
{
  const r = P.paperTrade(BARS, POS, { feeBps: 0, slippageBps: 0, scale: 2 });
  ok("2 no costs ⇒ net==gross, costs 0", r.costs.minor === 0 && r.netPnl.minor === r.grossPnl.minor);
}
// 3 — determinism.
ok("3 deterministic", JSON.stringify(P.paperTrade(BARS, POS, { feeBps: 10, slippageBps: 20, scale: 2 })) === JSON.stringify(P.paperTrade(BARS, POS, { feeBps: 10, slippageBps: 20, scale: 2 })));
// 4 — fail-closed: length mismatch / invalid bar.
ok("4 length mismatch ⇒ LENGTH_MISMATCH", P.paperTrade(BARS, [1, 0], {}).code === P.CODE.LENGTH_MISMATCH);
ok("4 invalid bar ⇒ INVALID_INPUT", P.paperTrade([{ minor: 1.5, scale: 2 }], [1], {}).code === P.CODE.INVALID_INPUT);
// 5 — no execution/order-send surface exported.
ok("5 no execute/send/broker export", !Object.keys(P).some(k => /execute|send|broker|submit|route/i.test(k)));
console.log(`\nFINANCE PAPER-TRADING — ${passed} assertions passed.`);
