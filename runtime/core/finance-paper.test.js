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

// 6 — ENFORCED stale-lock (P2.1): decisionsAllowed gate blocks NEW fictitious orders end-to-end.
{
  const C = require(path.resolve(__dirname, "finance-data-connector.js"));
  const F = require(path.resolve(__dirname, "finance-sim.js"));
  const CANDLES = JSON.stringify([[300, 10, 12, 11, 11, 5], [200, 9, 11, 10, 10, 4], [100, 8, 10, 9, 9, 3]]);
  const mock = (status = 200, body = CANDLES) => () => Promise.resolve({ status, body });
  const build = (over) => C.fetchSeries(Object.assign({ url: "u", instrument: "X", fetcher: mock(), staleMaxSeconds: 1000, nowMs: (300 + 500) * 1000, scale: 2 }, over));
  (async () => {
    const fresh = await build({});
    const stale = await build({ nowMs: (300 + 99999) * 1000 });
    const httpErr = await build({ fetcher: mock(404, "") });
    const posFresh = F.runSimulation(fresh.series, { window: 2 }).positions;
    const posStale = F.runSimulation(stale.series, { window: 2 }); // historical calc still ACCEPT
    // fresh ⇒ orders allowed
    const okRun = P.paperTradeFromSource(fresh, posFresh, { feeBps: 10, slippageBps: 20, scale: 2 });
    ok("6 fresh source ⇒ paper allowed (orders produced)", okRun.ok === true && okRun.orders.length >= 1);
    // stale ⇒ BLOCKED, zero orders, executed:false — even though historical sim verdict is ACCEPT
    const blocked = P.paperTradeFromSource(stale, posStale.positions, { feeBps: 10, slippageBps: 20, scale: 2 });
    ok("6 STALE source ⇒ DECISIONS_BLOCKED, 0 orders (ACCEPT does NOT re-enable)", posStale.verdict === "ACCEPT" && blocked.ok === false && blocked.blocked === true && blocked.code === P.CODE.DECISIONS_BLOCKED && blocked.orders.length === 0 && blocked.executed === false);
    // HTTP_ERROR / failed source ⇒ BLOCKED (no bypass)
    ok("6 failed source (HTTP_ERROR) ⇒ DECISIONS_BLOCKED, 0 orders", P.paperTradeFromSource(httpErr, [1, 1, 1], {}).code === P.CODE.DECISIONS_BLOCKED && P.paperTradeFromSource(httpErr, [1], {}).orders.length === 0);
    // null/malformed source ⇒ BLOCKED
    ok("6 null source ⇒ DECISIONS_BLOCKED", P.paperTradeFromSource(null, [1], {}).code === P.CODE.DECISIONS_BLOCKED);
    console.log(`\nFINANCE PAPER-TRADING — ${passed} assertions passed.`);
  })().catch((e) => { console.error("ERR", e && e.stack); process.exit(1); });
}
