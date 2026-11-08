#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 13 (P2 excellence) — pass^k RELIABILITY METRIC. PURE, deterministic. World reference: τ-bench evaluates
 * tool-using agents with pass^k across k INDEPENDENT rollouts — a single-pass score overstates reliability because an
 * agent that passes once may fail on repetition (NIST AI Agent Standards Initiative, Feb 2026; τ-bench / BFCL). ODG's
 * P2 reference used HELD-OUT accuracy (leakage-free) but not reliability-under-repetition. This adds the pass^k metric:
 * a task is reliable ONLY if ALL k of its rollouts pass (fail-closed); it reports the pass^1 → pass^k reliability drop
 * so an inflated single-pass number cannot hide flakiness. Complements benchmark-factory held-out eval; no new engine.
 * Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function round(n: number): number { return Number(n.toFixed(4)); }

/** passAtK(rolloutsByTask) -> { k, tasks, passAt1, passAtK, reliabilityDrop, flaky }.
 * rolloutsByTask: { taskId: [bool, bool, ...] } — each boolean is one independent rollout's pass/fail.
 * A task is reliable only if EVERY rollout passed; tasks must share the same k (else fail-closed to the min). */
function passAtK(rolloutsByTask: any): any {
  const m = isObj(rolloutsByTask) ? rolloutsByTask : {};
  const ids = Object.keys(m).filter((id) => Array.isArray(m[id]) && m[id].length > 0);
  if (ids.length === 0) return Object.freeze({ k: 0, tasks: 0, passAt1: 0, passAtK: 0, reliabilityDrop: 0, flaky: Object.freeze([]), note: "no rollouts" });
  // k = the MINIMUM rollout count across tasks (fail-closed: never credit a task for rollouts it didn't run).
  const k = Math.min(...ids.map((id) => m[id].length));
  let anyPass = 0; let allPass = 0; const flaky: string[] = [];
  for (const id of ids) {
    const rs = m[id].slice(0, k).map((x: any) => x === true);
    const passedAll = rs.every((x: boolean) => x);
    const passedAny = rs.some((x: boolean) => x);
    if (passedAny) anyPass++;
    if (passedAll) allPass++;
    if (passedAny && !passedAll) flaky.push(id);   // passes sometimes but not every rollout ⇒ flaky (hidden by pass^1)
  }
  const passAt1 = round(anyPass / ids.length);
  const passAtKVal = round(allPass / ids.length);
  return Object.freeze({
    k, tasks: ids.length, passAt1, passAtK: passAtKVal, reliabilityDrop: round(passAt1 - passAtKVal),
    flaky: Object.freeze(flaky),
    note: "a task is reliable only if ALL k rollouts pass (fail-closed); reliabilityDrop = pass^1 − pass^k exposes flakiness a single-pass score hides",
  });
}

/** reliable(report, threshold) -> boolean. Reliability is judged on pass^k, never pass^1. */
function reliable(report: any, threshold: number): boolean {
  const t = typeof threshold === "number" ? threshold : 0.9;
  return isObj(report) && typeof report.passAtK === "number" && report.passAtK >= t;
}

const P2_PASSK_CONTRACT = Object.freeze({
  id: "V124-P2-PASSK-RELIABILITY",
  source: "SÉRIE 13 P2 — pass^k reliability (τ-bench / BFCL / NIST AI Agent Standards Feb-2026)",
  reference: Object.freeze({ metric: "pass^k across k independent rollouts", sources: Object.freeze(["τ-bench", "BFCL (Berkeley Function Calling Leaderboard)", "NIST AI Agent Standards Initiative Feb-2026"]) }),
  complements: "benchmark-factory held-out eval (adds reliability-under-repetition, not a replacement)",
  notAuthority: "a reliability metric over observed rollouts; it runs no model and grants nothing",
  invariants: Object.freeze([
    "a task is reliable ONLY if ALL k rollouts pass (fail-closed) — pass^k, never pass^1",
    "k is the MINIMUM rollout count across tasks (never credit a task for rollouts it didn't run)",
    "reliabilityDrop = pass^1 − pass^k surfaces flakiness that a single-pass score hides",
    "complements held-out accuracy; adds the reliability dimension; no new engine",
  ]),
});

module.exports = { passAtK, reliable, P2_PASSK_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...P2_PASSK_CONTRACT, demo: passAtK({ t1: [true, true, true], t2: [true, false, true], t3: [true, true, true] }) }, null, 2) + "\n"); }

export {};
