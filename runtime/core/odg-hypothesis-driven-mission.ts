#!/usr/bin/env node
"use strict";
/*
 * V326 §8 — HYPOTHESIS-DRIVEN NATIVE MISSION. Completes the GENUINE pre-registered-hypothesis workflow (not merely the
 * interface) by running it on a mission whose measurement is actually PER-SIGNAL and MEANINGFUL.
 *
 * THE GAP (honest, from §8): the hypothesis-adjudicator + odg-cycle-hypothesis-verdict exist, but the evolution-loop's
 * `measurement` is a FLAT {regressed,improved} summary with no per-signal metric and no pre-registered prediction — so
 * wiring adjudication there would be a permanently-INCONCLUSIVE no-op (explicitly forbidden by §8). This module does NOT
 * touch that loop. Instead it builds the REAL workflow where the signal IS measurable: a native engineering mission
 * (odg-native-engineering.runNativeCycle) that
 *   (1) PRE-REGISTERS a prediction about a measurable signal (testsPass) BEFORE the experiment (preRegisteredAtMs = t0),
 *   (2) EXECUTES the native cycle (real before→after on testsPass: faulty run → repaired run),
 *   (3) ADJUDICATES the measured delta against the pre-registered prediction via the production hypothesis-adjudicator,
 *   (4) CONSUMES the verdict: a REFUTED pre-registered prediction BLOCKS acceptance (the mission did not do what it
 *       predicted) — the adjudication is a real gate, not a decoration.
 *
 * Composes odg-native-engineering + odg-hypothesis-adjudicator (improvement-baseline.measureDelta) + odg-native-execution-
 * provenance. Builds NO second hypothesis system; wires NO meaningless INCONCLUSIVE into a central loop. Deterministic
 * given an injected clock; the adjudicator itself is clock-free (we supply the two timestamps).
 */

const NE = require("./odg-native-engineering.js");
const HA = require("./odg-hypothesis-adjudicator.js");
const PROV = require("./odg-native-execution-provenance.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function freeze<T>(o: T): T { return Object.freeze(o) as T; }
const GREEN = Object.freeze(new Set(["NATIVE_GREEN", "NATIVE_REPAIRED_GREEN"]));

// Extract the REAL before/after testsPass from the native cycle trace: `execute_tests` is the FIRST run (faulty when a
// fault was seeded), and the cycle's final testsPass is the AFTER (post-repair, or the only run when already green).
function beforeAfterTestsPass(cycle: any): { before: number; after: number } | null {
  const steps = Array.isArray(cycle.steps) ? cycle.steps : [];
  const exec = steps.find((s: any) => s && s.step === "execute_tests");
  if (!exec || typeof exec.pass !== "number" || typeof cycle.testsPass !== "number") return null;
  return { before: exec.pass, after: cycle.testsPass };
}

/**
 * runHypothesisMission(mission) -> { ok, id, cycleVerdict, hypothesisVerdict, preRegistered, prediction, measured,
 * actor, executionSucceeded, hypothesisConfirmed, accepted, acceptReason }.
 *   mission: { id, spec:{fnName,kind,examples}, injectFault?, prediction:{ signal, direction, magnitude? }, now? }.
 * The prediction is PRE-REGISTERED (t0) before the cycle runs; measured at t1>t0. REFUTED ⇒ accepted:false.
 */
function runHypothesisMission(mission: any): any {
  const m = isObj(mission) ? mission : {};
  if (typeof m.id !== "string" || !isObj(m.spec)) return freeze({ ok: false, code: "BAD_MISSION", detail: "mission needs { id, spec }" });
  if (!isObj(m.prediction) || typeof m.prediction.signal !== "string" || (m.prediction.direction !== "improved" && m.prediction.direction !== "regressed"))
    return freeze({ ok: false, code: "BAD_PREDICTION", detail: 'mission.prediction needs { signal, direction:"improved"|"regressed" }' });

  const nowFn = typeof m.now === "function" ? m.now : Date.now;
  // PRE-REGISTRATION timestamp — stamped BEFORE the experiment runs (honesty: no back-dating). A non-finite clock value
  // is coerced to 0 so the adjudicator's finite preRegisteredAtMs<measuredAtMs ordering is ALWAYS enforceable (a
  // malformed injected clock can never defeat the pre-registration ordering check).
  let t0 = nowFn(); if (!Number.isFinite(t0)) t0 = 0;

  const cycle = NE.runNativeCycle({ id: m.id, spec: m.spec, injectFault: m.injectFault === true });
  const att = PROV.attributeNativeCycle(cycle, m.id);
  const actor = att && att.provenance ? att.provenance.actor : null;

  let t1 = nowFn(); if (!Number.isFinite(t1) || !(t1 > t0)) t1 = t0 + 1; // MEASUREMENT timestamp — finite + strictly after t0

  const ba = beforeAfterTestsPass(cycle);
  // Build the pre-registered prediction object the adjudicator requires.
  const prediction = { signal: m.prediction.signal, direction: m.prediction.direction, magnitude: m.prediction.magnitude, preRegistered: true, preRegisteredAtMs: t0, measuredAtMs: t1 };
  // Measure the REAL per-signal before→after delta (only testsPass is measurable from a native cycle; any other signal
  // ⇒ unmeasured ⇒ INCONCLUSIVE, honestly). A non-native cycle (no run) ⇒ no measurement ⇒ INCONCLUSIVE.
  const before = ba ? { testsPass: ba.before } : {};
  const after = ba ? { testsPass: ba.after } : {};
  const adj = HA.adjudicateFromBaselines(prediction, before, after, { testsPass: "higher" });

  const executionSucceeded = cycle.nativeCycle === true && GREEN.has(cycle.verdict) && actor === "ODG";
  const hypothesisVerdict = adj.ok ? adj.verdict : "INCONCLUSIVE";
  const hypothesisConfirmed = hypothesisVerdict === "CONFIRMED";
  // CONSUMPTION: a REFUTED pre-registered prediction BLOCKS acceptance even if the cycle ran green — the mission did not
  // do what it predicted. INCONCLUSIVE does not block (the execution succeeded; the prediction just wasn't confirmed).
  const accepted = executionSucceeded && hypothesisVerdict !== "REFUTED";
  const acceptReason = !executionSucceeded ? `execution did not succeed (cycle=${cycle.verdict}, actor=${actor})`
    : hypothesisVerdict === "REFUTED" ? "pre-registered prediction REFUTED — mission contradicted its own hypothesis ⇒ not accepted"
    : hypothesisVerdict === "CONFIRMED" ? "execution succeeded (actor=ODG) AND the pre-registered prediction was CONFIRMED"
    : "execution succeeded (actor=ODG); hypothesis INCONCLUSIVE (not refuted) ⇒ accepted, but prediction not confirmed";

  return freeze({
    ok: true, id: m.id,
    cycleVerdict: cycle.verdict,
    hypothesisVerdict,
    preRegistered: adj.preRegistered === true,
    prediction: freeze({ signal: prediction.signal, direction: prediction.direction, magnitude: prediction.magnitude ?? null, preRegisteredAtMs: t0, measuredAtMs: t1 }),
    measured: adj.measured || null,
    actor,
    executionSucceeded,
    hypothesisConfirmed,
    accepted,
    acceptReason,
  });
}

/** demonstrate(now) -> CONFIRMED (repair predicted to improve), REFUTED (repair predicted to regress ⇒ blocked), and
 *  INCONCLUSIVE (already-green predicted to improve ⇒ flat). now injectable for determinism. */
function demonstrate(now?: any): any {
  const clk = typeof now === "function" ? now : (() => { let t = 0; return () => (t += 1000); })();
  const confirmed = runHypothesisMission({ id: "H-CONFIRM", spec: { fnName: "f", kind: "sum", examples: [{ args: [2, 3], expect: 5 }, { args: [1, 1], expect: 2 }] }, injectFault: true, prediction: { signal: "testsPass", direction: "improved" }, now: clk });
  const refuted = runHypothesisMission({ id: "H-REFUTE", spec: { fnName: "g", kind: "max", examples: [{ args: [2, 3], expect: 3 }] }, injectFault: true, prediction: { signal: "testsPass", direction: "regressed" }, now: clk });
  const inconclusive = runHypothesisMission({ id: "H-INCONC", spec: { fnName: "h", kind: "isEven", examples: [{ args: [4], expect: true }] }, injectFault: false, prediction: { signal: "testsPass", direction: "improved" }, now: clk });
  return freeze({
    confirmed: freeze({ v: confirmed.hypothesisVerdict, accepted: confirmed.accepted, proven: confirmed.hypothesisVerdict === "CONFIRMED" && confirmed.accepted === true && confirmed.actor === "ODG" }),
    refuted: freeze({ v: refuted.hypothesisVerdict, accepted: refuted.accepted, proven: refuted.hypothesisVerdict === "REFUTED" && refuted.accepted === false && refuted.executionSucceeded === true }),
    inconclusive: freeze({ v: inconclusive.hypothesisVerdict, accepted: inconclusive.accepted, proven: inconclusive.hypothesisVerdict === "INCONCLUSIVE" && inconclusive.accepted === true }),
  });
}

const HYPOTHESIS_DRIVEN_MISSION_CONTRACT = Object.freeze({
  id: "V326-HYPOTHESIS-DRIVEN-MISSION",
  purpose: "§8 — complete the GENUINE pre-registered-hypothesis workflow on a mission with a REAL per-signal measurement (native testsPass before→after): predict BEFORE, measure, adjudicate, and CONSUME the verdict (REFUTED blocks acceptance) — NOT a meaningless INCONCLUSIVE wired into a central loop",
  reuses: Object.freeze(["odg-native-engineering.runNativeCycle (real per-signal measurement)", "odg-hypothesis-adjudicator.adjudicateFromBaselines → improvement-baseline.measureDelta (the production adjudicator — NOT reimplemented)", "odg-native-execution-provenance (actor=ODG)"]),
  invariants: Object.freeze([
    "the prediction is PRE-REGISTERED (preRegisteredAtMs = t0, stamped BEFORE the cycle runs; measuredAtMs = t1 > t0) — never back-dated",
    "measurement is REAL + per-signal (testsPass before→after from the native cycle trace) — not a flat {regressed,improved} summary; an unmeasurable signal ⇒ INCONCLUSIVE (honest)",
    "CONSUMED as a gate: a REFUTED pre-registered prediction BLOCKS acceptance even when the cycle ran green; INCONCLUSIVE does not block (execution succeeded, prediction unconfirmed)",
    "does NOT touch the evolution-loop (its flat measurement would make adjudication a permanent INCONCLUSIVE no-op — forbidden by §8); builds NO second hypothesis system",
    "deterministic given an injected clock; the adjudicator is clock-free; frozen outputs",
  ]),
});

module.exports = { runHypothesisMission, beforeAfterTestsPass, demonstrate, HYPOTHESIS_DRIVEN_MISSION_CONTRACT };
export {};
