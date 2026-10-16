#!/usr/bin/env node
"use strict";

/*
 * FINANCE-SIMULATION P0 — smallest demonstrable LOCAL simulation path. SIMULATION ONLY.
 *
 * Hard boundaries: NO real order/broker/portfolio, NO network, NO market-data fetch, NO execution. Consumes
 * ONLY caller-supplied deterministic fixtures. Makes NO profitability or financial-validity claim.
 *
 * Reuse (no new primitive/engine/authority): `economic-unit.js` for ASSET money quantities (integer minor
 * units, deterministic — no floats), and the VERDICT vocabulary from `mechanical-acceptance.js`
 * (ACCEPT/REJECT/BLOCKED/UNKNOWN). It does NOT call evaluateAcceptance nor create a second acceptance system.
 *
 * Invariants proven by the tests: invalid/unsourced/temporally-inconsistent data REJECTED/BLOCKED (fail-closed);
 * NO look-ahead (decision at bar i uses ONLY bars[0..i]; a future read throws LOOK_AHEAD); determinism;
 * traceability (inputHash + params).
 *
 * STRICT TS PORT (V64 FINANCE/DEC-006, bounded semantics-preserving). Validation, no-look-ahead accessor,
 * deterministic SMA long/flat decision, integer-minor P&L via economic-unit and the traceable frozen result
 * are byte-identical. Pure (crypto hash only); SIMULATION-ONLY (no network/execution/real money).
 */

import * as crypto from "crypto";
const eu: any = require("./economic-unit");
const { VERDICT } = require("./mechanical-acceptance") as { VERDICT: any };

const CODE = Object.freeze({
  EMPTY: "EMPTY", INVALID_BAR: "INVALID_BAR", UNSOURCED: "UNSOURCED", NON_MONOTONIC_TIME: "NON_MONOTONIC_TIME",
  INVALID_PARAMS: "INVALID_PARAMS", LOOK_AHEAD: "LOOK_AHEAD",
});

function isInt(v: any): boolean { return typeof v === "number" && Number.isInteger(v); }
function isNonEmptyString(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function isPrice(p: any): boolean { return p && isInt(p.minor) && isInt(p.scale) && p.scale >= 0; }
function hash(obj: any): string { return crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex"); }

function ingest(series: any): any {
  if (!Array.isArray(series) || series.length === 0) return Object.freeze({ ok: false, code: CODE.EMPTY, verdict: VERDICT.BLOCKED });
  let prevT = null;
  const scale0 = isPrice(series[0] && series[0].price) ? series[0].price.scale : null;
  for (let i = 0; i < series.length; i++) {
    const b = series[i];
    if (!b || !isInt(b.t) || !isPrice(b.price) || b.price.scale !== scale0) return Object.freeze({ ok: false, code: CODE.INVALID_BAR, at: i, verdict: VERDICT.REJECT });
    if (!isNonEmptyString(b.source)) return Object.freeze({ ok: false, code: CODE.UNSOURCED, at: i, verdict: VERDICT.REJECT });
    if (prevT !== null && !(b.t > prevT)) return Object.freeze({ ok: false, code: CODE.NON_MONOTONIC_TIME, at: i, verdict: VERDICT.REJECT });
    prevT = b.t;
  }
  const bars = series.map((b: any) => ({ t: b.t, minor: b.price.minor, scale: b.price.scale, source: b.source }));
  return Object.freeze({ ok: true, bars: Object.freeze(bars), unit: "SIM", scale: scale0, inputHash: hash(bars), provenance: Object.freeze(bars.map((b: any) => b.source)) });
}

function pastView(bars: any, i: number): any {
  return { length: i + 1, at(j: number) { if (j < 0 || j > i) throw new Error(CODE.LOOK_AHEAD + ": read of index " + j + " at decision " + i); return bars[j]; } };
}

function decideAt(bars: any, i: number, window: number): number {
  const view = pastView(bars, i);
  const start = Math.max(0, i - window + 1);
  let sum = 0, n = 0;
  for (let j = start; j <= i; j++) { sum += view.at(j).minor; n += 1; }
  const sma = Math.trunc(sum / n);
  return view.at(i).minor >= sma ? 1 : 0;
}

function runSimulation(series: any, params: any): any {
  const ing = ingest(series);
  if (!ing.ok) return ing;
  const window = params && params.window;
  if (!isInt(window) || window < 1) return Object.freeze({ ok: false, code: CODE.INVALID_PARAMS, verdict: VERDICT.REJECT });
  const bars = ing.bars;
  const positions = [];
  for (let i = 0; i < bars.length; i++) positions.push(decideAt(bars, i, window));
  let pnl = eu.quantity(ing.unit, eu.KIND.ASSET, 0, ing.scale);
  for (let i = 0; i < bars.length - 1; i++) {
    if (positions[i] === 1) {
      const delta = eu.quantity(ing.unit, eu.KIND.ASSET, bars[i + 1].minor - bars[i].minor, ing.scale);
      pnl = eu.add(pnl, delta);
    }
  }
  return Object.freeze({
    ok: true, verdict: VERDICT.ACCEPT, mode: "SIMULATION", executed: false,
    inputHash: ing.inputHash, params: Object.freeze({ window }),
    bars: bars.length, provenance: ing.provenance,
    positions: Object.freeze(positions), pnl: Object.freeze(pnl), pnlFormatted: eu.format(pnl),
  });
}

module.exports = { CODE, ingest, pastView, decideAt, runSimulation };

if (require.main === module) {
  process.stdout.write("finance-sim: SIMULATION-ONLY module (no network, no execution)\n");
}

// Module-scope marker (adds NO export): forces TypeScript MODULE scope (no global-script collisions).
export {};
