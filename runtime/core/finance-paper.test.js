#!/usr/bin/env node
"use strict";
/*
 * FINANCE PAPER-TRADING — deterministic test through the GOVERNED API ONLY (runGovernedPaper /
 * paperTradeFromSource). No access to internal helpers. Fictitious orders, explicit fee/slippage, NO execution.
 * Note: the kernel's internal LENGTH_MISMATCH/INVALID_INPUT guards are unreachable via the governed path (the
 * connector guarantees valid, length-matched bars); they remain as defensive internals, not public-API tested.
 */
const assert = require("assert");
const path = require("path");
const P = require(path.resolve(__dirname, "finance-paper.js"));
const C = require(path.resolve(__dirname, "finance-data-connector.js"));
const F = require(path.resolve(__dirname, "finance-sim.js"));
let passed = 0; function ok(n, c) { assert.ok(c, n); console.log("  ok -", n); passed += 1; }

// Candles (Coinbase shape, descending) whose closes → minor [1000,1100,1050,1200] (scale 2). SMA(window=2)
// on these yields positions [1,1,0,1] — the sequence the P&L was hand-computed against.
const CANDLES = JSON.stringify([[4, 11, 13, 12, 12, 1], [3, 10, 11, 10, 10.5, 1], [2, 10, 12, 11, 11, 1], [1, 9, 11, 10, 10, 1]]);
const mock = (status = 200, body = CANDLES) => () => Promise.resolve({ status, body });
const build = (over) => C.fetchSeries(Object.assign({ url: "u", instrument: "X", fetcher: mock(), staleMaxSeconds: 1000, nowMs: (4 + 1) * 1000, scale: 2 }, over));

(async () => {
  const fresh = await build({});
  const stale = await build({ nowMs: (4 + 99999) * 1000 });
  const httpErr = await build({ fetcher: mock(404, "") });

  // 1 — governed fresh ⇒ GOVERNED_PAPER, positions [1,1,0,1], hand-computed fees/slippage/P&L (fee10/slip20).
  const g = P.runGovernedPaper(fresh, { window: 2 }, { feeBps: 10, slippageBps: 20, scale: 2 });
  ok("1 GOVERNED_PAPER, executed:false, positions [1,1,0,1]", g.ok && g.mode === "GOVERNED_PAPER" && g.executed === false && JSON.stringify(g.positions) === JSON.stringify([1, 1, 0, 1]));
  ok("1 three fictitious orders BUY,SELL,BUY", g.orders.length === 3 && g.orders.every(o => o.fictitious === true) && g.orders.map(o => o.side).join(",") === "BUY,SELL,BUY");
  ok("1 gross=44, costs=9, net=35 minor (hand-computed)", g.grossPnl.minor === 44 && g.costs.minor === 9 && g.netPnl.minor === 35 && g.netFormatted.startsWith("0.35"));
  ok("1 assumptions labelled (not real costs) + provenance/inputHash", g.assumptions.feeBps === 10 && g.assumptions.slippageBps === 20 && /ASSUMPTIONS/.test(g.assumptions.note) && g.provenance && /^[0-9a-f]{64}$/.test(g.inputHash));

  // 2 — zero fee/slippage ⇒ costs 0, net==gross (==50 for these closes).
  const g0 = P.runGovernedPaper(fresh, { window: 2 }, { feeBps: 0, slippageBps: 0, scale: 2 });
  ok("2 no costs ⇒ costs 0, net==gross==50", g0.costs.minor === 0 && g0.netPnl.minor === g0.grossPnl.minor && g0.netPnl.minor === 50);

  // 3 — determinism.
  ok("3 deterministic", JSON.stringify(P.runGovernedPaper(fresh, { window: 2 }, { feeBps: 10, slippageBps: 20, scale: 2 })) === JSON.stringify(g));

  // 4 — fail-closed gate via paperTradeFromSource (positions supplied) on bad sources.
  ok("4 paperTradeFromSource STALE ⇒ DECISIONS_BLOCKED 0 orders", P.paperTradeFromSource(stale, [1, 1, 0, 1], {}).code === P.CODE.DECISIONS_BLOCKED && P.paperTradeFromSource(stale, [1], {}).orders.length === 0);
  ok("4 paperTradeFromSource HTTP_ERROR / null ⇒ BLOCKED", P.paperTradeFromSource(httpErr, [1], {}).code === P.CODE.DECISIONS_BLOCKED && P.paperTradeFromSource(null, [1], {}).code === P.CODE.DECISIONS_BLOCKED);

  // 5 — runGovernedPaper gate: STALE/HTTP_ERROR/null/invalid-params ⇒ BLOCKED, 0 orders; ACCEPT cannot lift.
  const simStale = F.runSimulation(stale.series, { window: 2 });
  ok("5 STALE ⇒ BLOCKED (historical ACCEPT does NOT re-enable)", simStale.verdict === "ACCEPT" && P.runGovernedPaper(stale, { window: 2 }, {}).code === P.CODE.DECISIONS_BLOCKED && P.runGovernedPaper(stale, { window: 2 }, {}).orders.length === 0);
  ok("5 HTTP_ERROR ⇒ BLOCKED", P.runGovernedPaper(httpErr, { window: 2 }, {}).code === P.CODE.DECISIONS_BLOCKED);
  ok("5 null source ⇒ BLOCKED", P.runGovernedPaper(null, { window: 2 }, {}).code === P.CODE.DECISIONS_BLOCKED);
  ok("5 invalid sim params on fresh ⇒ BLOCKED, 0 orders", P.runGovernedPaper(fresh, { window: 0 }, {}).code === P.CODE.DECISIONS_BLOCKED && P.runGovernedPaper(fresh, { window: 0 }, {}).orders.length === 0);

  // 6 — NO BYPASS: neither the bare kernel nor the internal alias is exported; only gated entries are public.
  ok("6 paperTrade === undefined AND __internalPaperTrade === undefined", P.paperTrade === undefined && P.__internalPaperTrade === undefined);
  ok("6 only gated entries public", typeof P.runGovernedPaper === "function" && typeof P.paperTradeFromSource === "function" && !Object.keys(P).some(k => /execute|send|broker|submit|route/i.test(k)));

  // 7 — atomicity: a blocked result carries no partial portfolio.
  { const bl = P.runGovernedPaper(stale, { window: 2 }, {}); ok("7 blocked ⇒ no partial portfolio", bl.orders.length === 0 && bl.netPnl === undefined && bl.executed === false); }

  console.log(`\nFINANCE PAPER-TRADING (governed-only) — ${passed} assertions passed.`);
})().catch((e) => { console.error("ERR", e && e.stack); process.exit(1); });
