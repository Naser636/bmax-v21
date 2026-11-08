#!/usr/bin/env node
"use strict";

/*
 * V5-E / ENGINEERING INTELLIGENCE — FLAKY-TEST GATE + DETERMINISTIC REPLAY (E14 Deterministic Replay + Flaky Test
 * Intelligence). PURE, deterministic. Decides a suite's stability from repeated runs and — the non-negotiable rule
 * (§P3/§4) — a flaky test is NEVER declared PASS: mixed outcomes ⇒ FLAKY_QUARANTINE (quarantined, not passed; it does
 * not become PASS by repetition or masking). Deterministic replay: runs with the SAME seed/fixed inputs must produce
 * identical outputs; a divergence ⇒ NON_DETERMINISTIC (flagged, never PASS). REUSES p2-passk-reliability.passAtK
 * (stability) + p2-flaky-root-cause.classifyFlakiness (OD/NOD cause when flaky). Fail-closed: too few runs ⇒
 * INSUFFICIENT (cannot certify stable). It decides; it runs no test and grants no authority. Dual export.
 */

const PASSK = require("./p2-passk-reliability");       // passAtK — stability across runs
const FLAKY = require("./p2-flaky-root-cause");        // classifyFlakiness — OD vs NOD cause

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

const VERDICT = Object.freeze(["STABLE_PASS", "STABLE_FAIL", "FLAKY_QUARANTINE", "INSUFFICIENT"]);

/**
 * flakyGate({ suiteId, runs, minRuns, flakyConfig }) -> { verdict, passAt1, passAtK, cause, reasons }.
 * runs: bool[] (repeated outcomes). A flaky (mixed) suite ⇒ FLAKY_QUARANTINE — NEVER PASS.
 */
function flakyGate(input: any): any {
  const o = isObj(input) ? input : {};
  const suiteId = typeof o.suiteId === "string" ? o.suiteId : "suite";
  const runs = arr(o.runs).filter((x) => typeof x === "boolean");
  const minRuns = Math.max(2, Math.floor(typeof o.minRuns === "number" ? o.minRuns : 3));
  if (runs.length < minRuns) return out("INSUFFICIENT", null, null, null, [`only ${runs.length} runs (< minRuns ${minRuns}) — cannot certify stability (fail-closed)`]);

  const pk = PASSK.passAtK({ [suiteId]: runs });
  const allPass = pk.passAtK === 1 && pk.passAt1 === 1;
  const allFail = pk.passAt1 === 0;
  if (allPass) return out("STABLE_PASS", pk.passAt1, pk.passAtK, null, [`${runs.length} runs all PASS`]);
  if (allFail) return out("STABLE_FAIL", pk.passAt1, pk.passAtK, null, [`${runs.length} runs all FAIL (consistent failure, not flaky)`]);
  // mixed ⇒ FLAKY: quarantine, never PASS; attach the OD/NOD cause.
  const cause = o.flakyConfig && isObj(o.flakyConfig) ? FLAKY.classifyFlakiness({ testId: suiteId, ...o.flakyConfig }).cause : "NON_DETERMINISTIC";
  return out("FLAKY_QUARANTINE", pk.passAt1, pk.passAtK, cause, [`flaky (pass^1 ${pk.passAt1} ≠ pass^k ${pk.passAtK}) ⇒ QUARANTINE — a flaky test NEVER becomes PASS by repetition or masking`]);
}

function out(verdict: string, passAt1: any, passAtK: any, cause: any, reasons: string[]): any {
  return Object.freeze({ verdict, passAt1, passAtK, cause, isPass: verdict === "STABLE_PASS", reasons: Object.freeze(reasons) });
}

/** deterministicReplay({ replays }) -> { deterministic, divergences, reasons }. Same seed ⇒ identical output, else NON_DETERMINISTIC. */
function deterministicReplay(input: any): any {
  const o = isObj(input) ? input : {};
  const replays = arr(o.replays).filter(isObj);
  const bySeed: Record<string, Set<string>> = {};
  for (const r of replays) { const seed = String(r.seed); const out = JSON.stringify(r.output); (bySeed[seed] = bySeed[seed] || new Set()).add(out); }
  const divergences = Object.keys(bySeed).filter((s) => bySeed[s].size > 1);
  const deterministic = replays.length > 0 && divergences.length === 0;
  return Object.freeze({ deterministic, divergences: Object.freeze(divergences), reasons: Object.freeze(divergences.length > 0 ? [`${divergences.length} seed(s) produced DIFFERENT outputs across replays ⇒ NON_DETERMINISTIC (never PASS)`] : (replays.length === 0 ? ["no replays supplied ⇒ cannot assert determinism (fail-closed)"] : ["identical outputs per seed ⇒ deterministic"])), note: deterministic ? "deterministic replay" : "NOT deterministic (or unverifiable) — fail-closed" });
}

const FLAKY_REPLAY_GATE_CONTRACT = Object.freeze({
  id: "V5-E-FLAKY-REPLAY-GATE",
  source: "ODG Engineering Intelligence — E14 Deterministic Replay + Flaky Test Intelligence (§P3/§4)",
  verdicts: VERDICT,
  reuses: Object.freeze(["p2-passk-reliability.passAtK (stability)", "p2-flaky-root-cause.classifyFlakiness (OD/NOD cause)"]),
  notAuthority: "a stability/determinism decision over supplied runs; it runs no test and grants no authority",
  invariants: Object.freeze([
    "a flaky (mixed-outcome) suite ⇒ FLAKY_QUARANTINE — it NEVER becomes PASS by repetition or masking",
    "STABLE_PASS requires ALL runs pass across ≥ minRuns; all-fail ⇒ STABLE_FAIL (consistent, not flaky)",
    "too few runs ⇒ INSUFFICIENT (cannot certify stability, fail-closed)",
    "deterministic replay: same seed must give identical output; a divergence ⇒ NON_DETERMINISTIC (never PASS)",
    "pure/deterministic: runs/replays in → verdict out; no clock/random/network; runs nothing itself",
  ]),
});

module.exports = { flakyGate, deterministicReplay, FLAKY_REPLAY_GATE_CONTRACT };

if (require.main === module) {
  const demo = { stable: flakyGate({ suiteId: "a", runs: [true, true, true] }).verdict, flaky: flakyGate({ suiteId: "b", runs: [true, false, true] }).verdict, replay: deterministicReplay({ replays: [{ seed: 1, output: "x" }, { seed: 1, output: "y" }] }).deterministic };
  process.stdout.write(JSON.stringify({ ...FLAKY_REPLAY_GATE_CONTRACT, demo }, null, 2) + "\n");
}

export {};
