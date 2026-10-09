#!/usr/bin/env node
"use strict";

/*
 * FINANCE PAPER-TRADING (P2) — virtual (fictitious) portfolio from finance-sim positions. SIMULATION-ONLY.
 *
 * Hard boundaries: NO broker, NO real order, NO real portfolio, NO execution (`executed:false`; every order
 * is tagged `fictitious:true`). Fees and slippage are EXPLICIT ASSUMPTIONS in basis points — labelled as
 * assumptions, NOT real execution costs. Deterministic integer math via economic-unit ASSET quantities.
 * Reuses economic-unit; adds no new primitive. No profitability/risk claim.
 */

const eu = require("./economic-unit");
const sim = require("./finance-sim");

const CODE = Object.freeze({ INVALID_INPUT: "INVALID_INPUT", LENGTH_MISMATCH: "LENGTH_MISMATCH", DECISIONS_BLOCKED: "DECISIONS_BLOCKED" });

function isInt(v) { return typeof v === "number" && Number.isInteger(v); }
function isBps(v) { return isInt(v) && v >= 0; }

/*
 * paperTrade(bars, positions, {feeBps, slippageBps, unit, scale}) — long/flat: a FICTITIOUS buy order on
 * entry (0→1) and a FICTITIOUS sell order on exit (1→0). Slippage worsens the fill (buy higher, sell lower);
 * fee is charged on traded notional. P&L is held-position mark-to-market minus assumed costs, in ASSET minor.
 */
function paperTrade(bars, positions, opts = {}) {
  if (!Array.isArray(bars) || !Array.isArray(positions)) return Object.freeze({ ok: false, code: CODE.INVALID_INPUT });
  if (bars.length !== positions.length || bars.length === 0) return Object.freeze({ ok: false, code: CODE.LENGTH_MISMATCH });
  const feeBps = isBps(opts.feeBps) ? opts.feeBps : 0;
  const slipBps = isBps(opts.slippageBps) ? opts.slippageBps : 0;
  const unit = typeof opts.unit === "string" && opts.unit ? opts.unit : "SIM";
  const scale = isInt(opts.scale) ? opts.scale : (bars[0] && bars[0].scale) || 2;
  for (const b of bars) { if (!b || !isInt(b.minor) || b.scale !== scale) return Object.freeze({ ok: false, code: CODE.INVALID_INPUT }); }

  const bps = (minor, b) => Math.trunc((minor * b) / 10000); // integer bps of a minor amount
  const orders = [];
  let gross = 0, costs = 0, held = false, entryFill = 0;
  for (let i = 0; i < bars.length; i++) {
    const px = bars[i].minor;
    const want = positions[i] === 1;
    if (want && !held) { // fictitious BUY (adverse slippage ⇒ pay more)
      const fill = px + bps(px, slipBps); const fee = bps(px, feeBps);
      orders.push({ i, side: "BUY", refPriceMinor: px, fillMinor: fill, feeMinor: fee, slippageMinor: fill - px, fictitious: true });
      costs += fee + (fill - px); entryFill = fill; held = true;
    } else if (!want && held) { // fictitious SELL (adverse slippage ⇒ receive less)
      const fill = px - bps(px, slipBps); const fee = bps(px, feeBps);
      orders.push({ i, side: "SELL", refPriceMinor: px, fillMinor: fill, feeMinor: fee, slippageMinor: px - fill, fictitious: true });
      costs += fee + (px - fill); gross += fill - entryFill; held = false;
    }
  }
  if (held) { // mark-to-market the open position at the last bar (no forced close order)
    gross += bars[bars.length - 1].minor - entryFill;
  }
  const grossQ = eu.quantity(unit, eu.KIND.ASSET, gross, scale);
  const costsQ = eu.quantity(unit, eu.KIND.ASSET, costs, scale);
  const netQ = eu.sub(grossQ, costsQ);
  return Object.freeze({
    ok: true, mode: "PAPER", executed: false,
    assumptions: Object.freeze({ feeBps, slippageBps: slipBps, note: "ASSUMPTIONS, not real execution costs" }),
    orders: Object.freeze(orders),
    grossPnl: Object.freeze(grossQ), costs: Object.freeze(costsQ), netPnl: Object.freeze(netQ),
    netFormatted: eu.format(netQ),
  });
}

/*
 * paperTradeFromSource(source, positions, opts) — ENFORCED decision gate. A finance-data-connector result is
 * the ONLY accepted entry for producing NEW fictitious orders from real-data-derived positions. If the source
 * failed (`ok!==true`) or is not fresh (`decisionsAllowed!==true`, e.g. STALE/HTTP_ERROR), NO order and NO
 * virtual position is created ⇒ DECISIONS_BLOCKED (fail-closed). A historical runSimulation ACCEPT does NOT
 * re-enable decisions: ACCEPT only means the historical computation is well-formed, NOT that fresh-data
 * decisions are authorized. This is the seam the stale-lock was missing.
 */
function paperTradeFromSource(source, positions, opts = {}) {
  if (!source || source.ok !== true) return Object.freeze({ ok: false, blocked: true, code: CODE.DECISIONS_BLOCKED, reason: "source not ok", orders: Object.freeze([]), executed: false });
  if (source.decisionsAllowed !== true) return Object.freeze({ ok: false, blocked: true, code: CODE.DECISIONS_BLOCKED, reason: source.code || "not fresh", orders: Object.freeze([]), executed: false });
  if (!Array.isArray(source.series)) return Object.freeze({ ok: false, blocked: true, code: CODE.DECISIONS_BLOCKED, reason: "no series", orders: Object.freeze([]), executed: false });
  const bars = source.series.map((b) => ({ minor: b && b.price && b.price.minor, scale: b && b.price && b.price.scale }));
  return paperTrade(bars, positions, opts);
}

/*
 * runGovernedPaper(source, params, opts) — THE single governed paper-trading entry point. Consolidates the
 * whole parcours: freshness/integrity GATE (source.ok + decisionsAllowed) → finance-sim.runSimulation on the
 * SOURCE series → internal paper trade → provenance-preserving result. Fail-closed DECISIONS_BLOCKED before
 * any simulation/order when the source is absent/failed/stale (a historical ACCEPT can never lift the gate).
 * Pure: returns ONE frozen result or a BLOCKED result — there is no mutable portfolio to leave partially
 * modified. No broker, no real order, executed:false.
 */
function runGovernedPaper(source, params, opts = {}) {
  if (!source || source.ok !== true) return Object.freeze({ ok: false, blocked: true, code: CODE.DECISIONS_BLOCKED, reason: "source not ok", orders: Object.freeze([]), executed: false });
  if (source.decisionsAllowed !== true) return Object.freeze({ ok: false, blocked: true, code: CODE.DECISIONS_BLOCKED, reason: source.code || "not fresh", orders: Object.freeze([]), executed: false });
  if (!Array.isArray(source.series)) return Object.freeze({ ok: false, blocked: true, code: CODE.DECISIONS_BLOCKED, reason: "no series", orders: Object.freeze([]), executed: false });
  const simRes = sim.runSimulation(source.series, params);
  if (!simRes.ok) return Object.freeze({ ok: false, blocked: true, code: CODE.DECISIONS_BLOCKED, reason: "sim " + (simRes.code || "rejected"), orders: Object.freeze([]), executed: false });
  const bars = source.series.map((b) => ({ minor: b.price.minor, scale: b.price.scale }));
  const paper = paperTrade(bars, simRes.positions, opts);
  if (!paper.ok) return Object.freeze({ ok: false, blocked: true, code: paper.code, orders: Object.freeze([]), executed: false });
  return Object.freeze({
    ok: true, mode: "GOVERNED_PAPER", executed: false,
    provenance: source.provenance, inputHash: simRes.inputHash, params: simRes.params,
    positions: simRes.positions, orders: paper.orders,
    grossPnl: paper.grossPnl, costs: paper.costs, netPnl: paper.netPnl, netFormatted: paper.netFormatted,
    assumptions: paper.assumptions,
  });
}

// EXPORTS: ONLY the gated entries are public — `runGovernedPaper` (the single governed parcours) and
// `paperTradeFromSource` (gated adapter). The low-level cost kernel `paperTrade` is a MODULE-PRIVATE helper
// (not exported): it cannot be reached except through the two gated entries above, so there is no bypass. Its
// internal LENGTH_MISMATCH/INVALID_INPUT guards remain as defensive checks (unreachable via the governed path,
// which only ever passes connector-validated, length-matched bars).
module.exports = { CODE, runGovernedPaper, paperTradeFromSource };

if (require.main === module) { process.stdout.write("finance-paper: virtual/fictitious portfolio only (no execution)\n"); }
