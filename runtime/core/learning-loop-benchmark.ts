#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V25 Chantier 3 — LEARNING-LOOP EFFICACY BENCHMARK. PURE, deterministic, ISOLATED (an injected in-memory
 * store — NEVER the real autonomy-store ledger). Measures whether the REAL reuse-ledger actually suppresses precedents
 * that caused NET regressions, so they are not blindly replayed. It composes the real reuse-ledger (recordReuseOutcome /
 * suppressedSignatures / classifyReuseOutcome) over a SYNTHETIC precedent history, and compares three decision groups:
 *   A — no ledger (reuse every precedent, the control),
 *   B — with ledger (suppress net-regressed precedents),
 *   C — adversarial history (fake-useful + net-regressed + local-improvement/global-regression precedents).
 * Independent check: the net-regression classification is re-derived directly from the raw before/after deltas (a path
 * distinct from the ledger's own flag), and the two must agree. Synthetic histories unblock nothing canonical. Dual export.
 */

const RL = require("./reuse-ledger.js");
const BASE = require("./improvement-baseline.js");

function memStore(): any { const m: any = {}; return { read: (k: string, fb: any) => (k in m ? m[k] : fb), write: (k: string, v: any) => { m[k] = v; } }; }
// higher = better (default sense): a decrease is a regression. Build before/after signal pairs.
function sig(obj: any): any { return { signals: obj }; }

// A synthetic precedent history (clearly SYNTHETIC). Each precedent is reused N times with a measured before/after.
const HISTORY = Object.freeze([
  Object.freeze({ signature: "prec:genuine-win", uses: [{ before: sig({ a: 10 }), after: sig({ a: 20 }) }, { before: sig({ a: 10 }), after: sig({ a: 18 }) }], label: "genuine improvement (should stay reusable)" }),
  Object.freeze({ signature: "prec:net-regress", uses: [{ before: sig({ a: 20, b: 20, c: 20 }), after: sig({ a: 10, b: 10, c: 10 }) }, { before: sig({ a: 20, b: 20, c: 20 }), after: sig({ a: 9, b: 9, c: 9 }) }], label: "net regression (MUST be suppressed)" }),
  Object.freeze({ signature: "prec:local-win-global-loss", uses: [{ before: sig({ a: 10, b: 10, c: 10, d: 10 }), after: sig({ a: 20, b: 5, c: 5, d: 5 }) }, { before: sig({ a: 10, b: 10, c: 10, d: 10 }), after: sig({ a: 20, b: 4, c: 4, d: 4 }) }], label: "one metric up, three down — net regression (MUST be suppressed)" }),
  Object.freeze({ signature: "prec:stale-once-good", uses: [{ before: sig({ a: 10 }), after: sig({ a: 20 }) }, { before: sig({ a: 20, b: 20 }), after: sig({ a: 10, b: 10 }) }, { before: sig({ a: 20, b: 20 }), after: sig({ a: 9, b: 9 }) }], label: "once good, now failing — must NOT become a universal rule" }),
]);

/** independentNetRegression(uses) -> count of uses whose RAW delta is a net regression (recomputed directly, not via the ledger). */
function independentNetRegression(uses: any[]): number {
  let fails = 0;
  for (const u of uses) { const d = BASE.measureDelta(u.before, u.after); if ((d.summary.regressed || 0) > (d.summary.improved || 0)) fails++; }
  return fails;
}

/** runBenchmark(history?) -> measured groups A/B/C with regressions avoided + falsification checks. */
function runBenchmark(history: any = HISTORY): any {
  const hist = Array.isArray(history) ? history : HISTORY;
  const store = memStore();

  // Record the whole synthetic history through the REAL ledger.
  for (const p of hist) for (const u of p.uses) RL.recordReuseOutcome(p.signature, { before: u.before, after: u.after }, { store });
  const suppressed = new Set(RL.suppressedSignatures({ store }));

  // Independent ground truth: which precedents ARE net-regressors (recomputed from raw deltas, distinct from the ledger flag).
  const groundTruthRegressors = new Set(hist.filter((p: any) => independentNetRegression(p.uses) >= RL.SUPPRESS_MIN_FAILURES).map((p: any) => p.signature));

  // GROUP A (no ledger): every precedent would be reused ⇒ every net-regressor replays ⇒ a regression each.
  const regressionsIfNoLedger = hist.filter((p: any) => groundTruthRegressors.has(p.signature)).length;
  // GROUP B (with ledger): a suppressed net-regressor is NOT replayed ⇒ avoided.
  const avoided = hist.filter((p: any) => groundTruthRegressors.has(p.signature) && suppressed.has(p.signature)).length;
  const missed = hist.filter((p: any) => groundTruthRegressors.has(p.signature) && !suppressed.has(p.signature)).length;    // a real regressor NOT suppressed (should be 0)
  const wronglySuppressed = hist.filter((p: any) => !groundTruthRegressors.has(p.signature) && suppressed.has(p.signature)).length; // a genuine win suppressed (should be 0)

  // Falsification: the ledger flag MUST agree with the independent recomputation on every precedent.
  const disagreements = hist.filter((p: any) => groundTruthRegressors.has(p.signature) !== suppressed.has(p.signature)).map((p: any) => p.signature);

  return Object.freeze({
    denominator: hist.length,
    groundTruthRegressors: Object.freeze([...groundTruthRegressors]),
    suppressedByLedger: Object.freeze([...suppressed]),
    measures: Object.freeze({
      regressionsIfNoLedger,                 // GROUP A control
      regressionsAvoided: avoided,           // GROUP B benefit
      regressorsMissed: missed,              // MUST be 0
      genuineWinsWronglySuppressed: wronglySuppressed, // MUST be 0
      netImprovementOverControl: regressionsIfNoLedger > 0 ? Number((avoided / regressionsIfNoLedger).toFixed(4)) : null,
      ledgerAgreesWithIndependent: disagreements.length === 0,
    }),
    disagreements: Object.freeze(disagreements),
  });
}

const LEARNING_LOOP_BENCHMARK_CONTRACT = Object.freeze({
  id: "V124-LEARNING-LOOP-BENCHMARK",
  source: "CTO V25 Chantier 3 — measured reuse-ledger efficacy over a synthetic precedent history",
  reuses: Object.freeze(["reuse-ledger.recordReuseOutcome / suppressedSignatures / classifyReuseOutcome (the REAL mechanism)", "improvement-baseline.measureDelta for the INDEPENDENT net-regression recomputation"]),
  notAuthority: "measures suppression efficacy over a SYNTHETIC history in an injected store; it is NOT production data and unblocks no canonical promotion",
  invariants: Object.freeze([
    "a precedent that caused a NET regression (regressed > improved) on ≥ the suppression threshold MUST be suppressed (not replayed)",
    "a local improvement with a global regression is a NET regression and MUST be suppressed (a win on one metric is not a universal rule)",
    "a genuine net-improvement precedent must NOT be suppressed (no false suppression)",
    "the ledger's suppression flag is cross-checked against an INDEPENDENT recomputation from raw deltas — they must agree (a re-run of the ledger alone is not independent assurance)",
    "synthetic histories are not production results and unblock nothing canonical",
  ]),
});

module.exports = { HISTORY, independentNetRegression, runBenchmark, LEARNING_LOOP_BENCHMARK_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify(runBenchmark(), null, 2) + "\n"); }

export {};
