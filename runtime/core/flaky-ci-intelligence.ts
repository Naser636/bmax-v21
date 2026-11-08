#!/usr/bin/env node
"use strict";

/*
 * V5-E / ENGINEERING INTELLIGENCE WAVE-2 — FLAKY CI INTELLIGENCE. PURE, deterministic. Analyzes a test's outcome
 * HISTORY across CI runs (with environment metadata) to detect: flakiness, RECURRENCE (chronic, spanning many runs vs
 * a one-off), and ENVIRONMENTAL correlation (fails only under certain env conditions). It then QUARANTINES and
 * recommends (PROPOSED) prevention — isolate shared state / pin env / deterministic seed. The non-negotiable rule
 * (§P3/§4): a flaky, recurrent, or env-dependent test is NEVER declared PASS (no repetition/masking). REUSES
 * flaky-replay-gate.flakyGate for the core stability decision. Fail-closed: insufficient history ⇒ INSUFFICIENT. It
 * diagnoses; it runs no test, fixes nothing, and grants no authority. Dual export.
 */

const GATE = require("./flaky-replay-gate");           // flakyGate — stability (flaky ⇒ QUARANTINE, never PASS)

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function round(n: number): number { return Number(n.toFixed(4)); }

const VERDICT = Object.freeze(["STABLE_PASS", "STABLE_FAIL", "FLAKY_QUARANTINE", "RECURRENT_FLAKY", "ENV_DEPENDENT", "INSUFFICIENT"]);

/**
 * analyzeHistory({ testId, history, minHistory, recurrenceRuns }) -> { verdict, isPass, recurrent, envDependent, suspectEnv, prevention, reasons }.
 * history: [{ runId, passed, env }]. A flaky/recurrent/env-dependent test is NEVER PASS.
 */
function analyzeHistory(input: any): any {
  const o = isObj(input) ? input : {};
  const testId = typeof o.testId === "string" ? o.testId : "test";
  const history = arr(o.history).filter((h) => isObj(h) && typeof h.passed === "boolean");
  const minHistory = Math.max(2, Math.floor(typeof o.minHistory === "number" ? o.minHistory : 3));
  const recurrenceRuns = Math.max(2, Math.floor(typeof o.recurrenceRuns === "number" ? o.recurrenceRuns : 3));

  const outcomes = history.map((h) => h.passed);
  const gate = GATE.flakyGate({ suiteId: testId, runs: outcomes, minRuns: minHistory });
  if (gate.verdict !== "FLAKY_QUARANTINE") {
    return Object.freeze({ verdict: gate.verdict, isPass: gate.verdict === "STABLE_PASS", recurrent: false, envDependent: false, suspectEnv: null, prevention: Object.freeze([]), reasons: Object.freeze(gate.reasons) });
  }

  // flaky ⇒ analyze recurrence + environmental correlation.
  const failRuns = history.filter((h) => h.passed === false);
  const distinctFailRuns = new Set(failRuns.map((h) => String(h.runId))).size;
  const recurrent = distinctFailRuns >= recurrenceRuns;

  // environmental correlation: if ≥80% of failures share one env value (and that env isn't where all passes are), flag it.
  const byEnvFail: Record<string, number> = {}; const byEnvTotal: Record<string, number> = {};
  for (const h of history) { const e = String(h.env == null ? "unknown" : h.env); byEnvTotal[e] = (byEnvTotal[e] || 0) + 1; if (h.passed === false) byEnvFail[e] = (byEnvFail[e] || 0) + 1; }
  let suspectEnv: string | null = null;
  const totalFails = failRuns.length;
  for (const e of Object.keys(byEnvFail)) {
    const shareOfFails = totalFails > 0 ? byEnvFail[e] / totalFails : 0;
    const envFailRate = byEnvTotal[e] > 0 ? byEnvFail[e] / byEnvTotal[e] : 0;
    if (shareOfFails >= 0.8 && envFailRate >= 0.5 && Object.keys(byEnvTotal).length > 1) { suspectEnv = e; break; }
  }
  const envDependent = suspectEnv !== null;

  const verdict = envDependent ? "ENV_DEPENDENT" : (recurrent ? "RECURRENT_FLAKY" : "FLAKY_QUARANTINE");
  const prevention: any[] = [{ kind: "quarantine", status: "PROPOSED", reason: "flaky ⇒ quarantine (never PASS)" }];
  if (envDependent) prevention.push({ kind: "pin-environment", status: "PROPOSED", reason: `failures concentrated in env '${suspectEnv}'` });
  else prevention.push({ kind: "deterministic-seed-or-isolate-shared-state", status: "PROPOSED", reason: recurrent ? "recurrent flakiness ⇒ root-cause the non-determinism/shared state" : "flakiness ⇒ deterministic replay + isolation" });

  return Object.freeze({
    verdict, isPass: false,                 // a flaky/recurrent/env-dependent test is NEVER PASS
    recurrent, envDependent, suspectEnv,
    flakeRate: round(totalFails / Math.max(1, history.length)),
    prevention: Object.freeze(prevention),
    reasons: Object.freeze([`flaky across ${history.length} runs (${totalFails} fails in ${distinctFailRuns} distinct runs)${recurrent ? ", RECURRENT" : ""}${envDependent ? `, ENV_DEPENDENT on '${suspectEnv}'` : ""} ⇒ QUARANTINE, never PASS`]),
  });
}

const FLAKY_CI_INTELLIGENCE_CONTRACT = Object.freeze({
  id: "V5-E-FLAKY-CI-INTELLIGENCE",
  source: "ODG Engineering Intelligence wave-2 — Flaky CI Intelligence (history / recurrence / environment)",
  verdicts: VERDICT,
  reuses: Object.freeze(["flaky-replay-gate.flakyGate (stability)", "diagnoses CI outcome history + env metadata"]),
  notAuthority: "a read-only flaky-history diagnosis + PROPOSED prevention; it runs no test and fixes nothing",
  invariants: Object.freeze([
    "a flaky, RECURRENT, or ENV_DEPENDENT test is NEVER declared PASS (no repetition/masking)",
    "RECURRENT ⇔ failures span ≥ recurrenceRuns distinct runs (chronic, not a one-off)",
    "ENV_DEPENDENT ⇔ ≥80% of failures concentrate in one environment value (with a real fail-rate there)",
    "prevention actions are PROPOSED (quarantine / pin-env / deterministic-seed) — never auto-applied",
    "fail-closed: insufficient history ⇒ INSUFFICIENT; pure/deterministic; no clock/random/network",
  ]),
});

module.exports = { analyzeHistory, FLAKY_CI_INTELLIGENCE_CONTRACT };

if (require.main === module) {
  const h = [{ runId: 1, passed: true, env: "linux" }, { runId: 2, passed: false, env: "mac" }, { runId: 3, passed: true, env: "linux" }, { runId: 4, passed: false, env: "mac" }, { runId: 5, passed: false, env: "mac" }];
  const r = analyzeHistory({ testId: "t", history: h });
  process.stdout.write(JSON.stringify({ ...FLAKY_CI_INTELLIGENCE_CONTRACT, demo: { verdict: r.verdict, suspectEnv: r.suspectEnv, isPass: r.isPass } }, null, 2) + "\n");
}

export {};
