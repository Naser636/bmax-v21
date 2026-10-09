#!/usr/bin/env node
"use strict";
/*
 * FINANCE-SIM P1 — WALK-FORWARD validation over LOCAL synthetic fixtures. SIMULATION-ONLY, no network, no
 * execution. TEST-ONLY harness: it reuses the existing finance-sim public API (ingest/decideAt/runSimulation)
 * and adds NO application code, NO backtesting engine, NO new primitive. It proves determinism + strict
 * no-look-ahead / no train↔validate leakage across multiple folds; it makes NO profitability/risk claim.
 */
const assert = require("assert");
const path = require("path");
const F = require(path.resolve(__dirname, "finance-sim.js"));
let passed = 0; function ok(n, c) { assert.ok(c, n); console.log("  ok -", n); passed += 1; }
const bar = (t, minor, source = "fx") => ({ t, price: { minor, scale: 2 }, source });
const PRICES = [100, 101, 99, 98, 102, 103, 101, 100, 104, 106, 105, 107];
const SERIES = PRICES.map((m, i) => bar(i + 1, m));
const WINDOW = 3;
const EXPECT = [1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 1, 1]; // hand-computed (SMA-3 long/flat)

// TEST-ONLY walk-forward partitioner over the EXISTING API. Expanding history; each validation bar decides
// using ONLY bars[0..i] (via the module's decideAt). Fails closed if no full fold fits.
function walkForward(series, { window, trainLen, testLen }) {
  const ing = F.ingest(series);
  if (!ing.ok) return { ok: false, code: ing.code };
  const bars = ing.bars, N = bars.length;
  if (!Number.isInteger(trainLen) || !Number.isInteger(testLen) || trainLen < window || testLen < 1 || trainLen + testLen > N) {
    return { ok: false, code: "INSUFFICIENT_WINDOWS" };
  }
  const folds = [];
  for (let start = 0; start + trainLen + testLen <= N; start += testLen) {
    const vStart = start + trainLen, vEnd = Math.min(vStart + testLen, N);
    const decisions = [];
    for (let i = vStart; i < vEnd; i++) decisions.push({ i, pos: F.decideAt(bars, i, window) });
    folds.push({ train: [start, vStart], validate: [vStart, vEnd], decisions });
  }
  return { ok: true, folds, inputHash: ing.inputHash, window, executed: false };
}

// 1 — baseline correctness anchor (deterministic positions).
ok("1 full-run positions match hand-computed SMA-3", JSON.stringify(F.runSimulation(SERIES, { window: WINDOW }).positions) === JSON.stringify(EXPECT));

// 2 — walk-forward produces ≥2 folds, each executed:false.
const wf = walkForward(SERIES, { window: WINDOW, trainLen: 4, testLen: 2 });
ok("2 walk-forward ⇒ multiple folds, no execution", wf.ok && wf.folds.length >= 2 && wf.executed === false);

// 3 — strict decision/future separation: each validate decision == decision on the series TRUNCATED at i.
{
  let consistent = true;
  for (const f of wf.folds) for (const d of f.decisions) {
    const truncBars = F.ingest(SERIES.slice(0, d.i + 1)).bars;
    if (F.decideAt(truncBars, d.i, WINDOW) !== d.pos) consistent = false;
  }
  ok("3 validate decision uses only data available at decision time (truncation-equal)", consistent);
}

// 4 — no train↔validate leakage: mutating ANY future bar (index>i) never changes the decision at i.
{
  let leakFree = true;
  for (const f of wf.folds) for (const d of f.decisions) {
    const mutated = SERIES.map((b, idx) => (idx > d.i ? bar(b.t, b.price.minor + 500) : b)); // perturb future only
    const mBars = F.ingest(mutated).bars;
    if (F.decideAt(mBars, d.i, WINDOW) !== d.pos) leakFree = false;
  }
  ok("4 future-bar mutation never changes a past/at-decision position (no leakage)", leakFree);
}

// 5 — historical invariance when adding future observations: positions[0..k] stable as the series grows.
{
  const full = F.runSimulation(SERIES, { window: WINDOW }).positions;
  let stable = true;
  for (let k = WINDOW; k < SERIES.length; k++) {
    const grown = F.runSimulation(SERIES.slice(0, k + 1), { window: WINDOW }).positions;
    if (JSON.stringify(grown) !== JSON.stringify(full.slice(0, k + 1))) stable = false;
  }
  ok("5 adding future observations never rewrites past decisions", stable);
}

// 6 — fail-closed: insufficient windows, invalid timestamps, missing data.
ok("6 insufficient windows ⇒ INSUFFICIENT_WINDOWS", walkForward(SERIES, { window: WINDOW, trainLen: 11, testLen: 5 }).code === "INSUFFICIENT_WINDOWS");
ok("6 non-monotonic timestamps ⇒ fail-closed", walkForward([bar(2, 100), bar(1, 101), bar(3, 102)], { window: 1, trainLen: 1, testLen: 1 }).code === F.CODE.NON_MONOTONIC_TIME);
ok("6 missing source ⇒ fail-closed", walkForward([{ t: 1, price: { minor: 100, scale: 2 } }, bar(2, 101)], { window: 1, trainLen: 1, testLen: 1 }).code === F.CODE.UNSOURCED);

// 7 — determinism: identical fold decisions + inputHash across two runs.
{
  const a = walkForward(SERIES, { window: WINDOW, trainLen: 4, testLen: 2 });
  const b = walkForward(SERIES, { window: WINDOW, trainLen: 4, testLen: 2 });
  ok("7 deterministic folds + inputHash", JSON.stringify(a) === JSON.stringify(b) && a.inputHash === b.inputHash);
}

// 8 — no source mutation: the input fixture is byte-identical after all runs.
{
  const snapshot = JSON.stringify(SERIES);
  F.runSimulation(SERIES, { window: WINDOW }); walkForward(SERIES, { window: WINDOW, trainLen: 4, testLen: 2 });
  ok("8 source series not mutated by simulation/walk-forward", JSON.stringify(SERIES) === snapshot);
}

console.log(`\nFINANCE-SIM WALK-FORWARD (simulation-only) — ${passed} assertions passed.`);
