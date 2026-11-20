#!/usr/bin/env node
"use strict";
/* Tests for odg-hypothesis-driven-mission (V326 §8). Proves the GENUINE pre-registered-hypothesis workflow on a mission
 * with a REAL per-signal measurement: predict BEFORE, measure (native testsPass before→after), adjudicate, CONSUME
 * (REFUTED blocks acceptance). Uses the production adjudicator + native engine + provenance end-to-end (no mocks). */
const M = require("./odg-hypothesis-driven-mission.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
function clk(): () => number { let t = 0; return () => (t += 1000); }

function main(): void {
  // ── CONFIRMED: a seeded-fault repair, predicted to IMPROVE testsPass, is measured improved → CONFIRMED + accepted ──
  const c = M.runHypothesisMission({ id: "C", spec: { fnName: "f", kind: "sum", examples: [{ args: [2, 3], expect: 5 }, { args: [1, 1], expect: 2 }] }, injectFault: true, prediction: { signal: "testsPass", direction: "improved" }, now: clk() });
  check("CONFIRMED: repair predicted-improved, measured improved (before<after) ⇒ CONFIRMED", c.hypothesisVerdict === "CONFIRMED" && c.measured.direction === "improved" && c.measured.before < c.measured.after);
  check("CONFIRMED: prediction is PRE-REGISTERED (t0 < t1) and actor=ODG", c.preRegistered === true && c.prediction.preRegisteredAtMs < c.prediction.measuredAtMs && c.actor === "ODG");
  check("CONFIRMED: execution succeeded AND accepted (confirmed hypothesis)", c.executionSucceeded === true && c.hypothesisConfirmed === true && c.accepted === true);

  // ── REFUTED: a repair predicted to REGRESS is measured improved → REFUTED → acceptance BLOCKED (the consumption gate) ──
  const r = M.runHypothesisMission({ id: "R", spec: { fnName: "g", kind: "max", examples: [{ args: [2, 3], expect: 3 }] }, injectFault: true, prediction: { signal: "testsPass", direction: "regressed" }, now: clk() });
  check("REFUTED: measured improved contradicts predicted regressed ⇒ REFUTED", r.hypothesisVerdict === "REFUTED");
  check("REFUTED: execution SUCCEEDED but a refuted pre-registered prediction BLOCKS acceptance (gate consumed)", r.executionSucceeded === true && r.accepted === false && /REFUTED/.test(r.acceptReason));

  // ── INCONCLUSIVE: an already-green mission predicted to improve is flat → INCONCLUSIVE → not blocked ──
  const i = M.runHypothesisMission({ id: "I", spec: { fnName: "h", kind: "isEven", examples: [{ args: [4], expect: true }] }, injectFault: false, prediction: { signal: "testsPass", direction: "improved" }, now: clk() });
  check("INCONCLUSIVE: no change (flat) ⇒ INCONCLUSIVE, accepted (execution ok, prediction not confirmed, not refuted)", i.hypothesisVerdict === "INCONCLUSIVE" && i.accepted === true && i.hypothesisConfirmed === false);

  // ── honesty: a prediction cannot confirm itself; an unmeasurable signal is INCONCLUSIVE ──
  const unmeasurable = M.runHypothesisMission({ id: "U", spec: { fnName: "u", kind: "sum", examples: [{ args: [2, 3], expect: 5 }] }, injectFault: true, prediction: { signal: "latencyMs", direction: "improved" }, now: clk() });
  check("unmeasurable signal (not testsPass) ⇒ INCONCLUSIVE (cannot adjudicate what the native cycle doesn't measure)", unmeasurable.hypothesisVerdict === "INCONCLUSIVE");

  // beforeAfterTestsPass extracts the real faulty→repaired delta from the cycle trace
  const NE = require("./odg-native-engineering.js");
  const cyc = NE.runNativeCycle({ id: "BA", spec: { fnName: "x", kind: "sum", examples: [{ args: [2, 3], expect: 5 }, { args: [1, 1], expect: 2 }] }, injectFault: true });
  const ba = M.beforeAfterTestsPass(cyc);
  check("beforeAfterTestsPass: faulty run before=0, repaired after=full from the real cycle trace", ba.before === 0 && ba.after === 2 && cyc.testsPass === 2);

  // ── fail-closed ──
  check("fail-closed: no spec ⇒ BAD_MISSION; bad direction ⇒ BAD_PREDICTION", M.runHypothesisMission({ id: "x" }).code === "BAD_MISSION" && M.runHypothesisMission({ id: "x", spec: {}, prediction: { signal: "testsPass", direction: "sideways" } }).code === "BAD_PREDICTION");

  // ── demonstrate + determinism + frozen + contract ──
  const d = M.demonstrate(clk());
  check("demonstrate: CONFIRMED(accepted) + REFUTED(blocked) + INCONCLUSIVE(accepted) all proven", d.confirmed.proven && d.refuted.proven && d.inconclusive.proven);
  check("deterministic given same clock", JSON.stringify(M.runHypothesisMission({ id: "C", spec: { fnName: "f", kind: "sum", examples: [{ args: [2, 3], expect: 5 }] }, injectFault: true, prediction: { signal: "testsPass", direction: "improved" }, now: clk() })) === JSON.stringify(M.runHypothesisMission({ id: "C", spec: { fnName: "f", kind: "sum", examples: [{ args: [2, 3], expect: 5 }] }, injectFault: true, prediction: { signal: "testsPass", direction: "improved" }, now: clk() })));
  check("frozen result", Object.isFrozen(c) && Object.isFrozen(c.prediction));
  check("contract: pre-registered-before; REFUTED blocks acceptance; does NOT touch evolution-loop; no 2nd hypothesis system",
    M.HYPOTHESIS_DRIVEN_MISSION_CONTRACT.invariants.some((s: string) => /PRE-REGISTERED/.test(s)) &&
    M.HYPOTHESIS_DRIVEN_MISSION_CONTRACT.invariants.some((s: string) => /REFUTED pre-registered prediction BLOCKS acceptance/.test(s)) &&
    M.HYPOTHESIS_DRIVEN_MISSION_CONTRACT.invariants.some((s: string) => /does NOT touch the evolution-loop/.test(s)) &&
    M.HYPOTHESIS_DRIVEN_MISSION_CONTRACT.invariants.some((s: string) => /NO second hypothesis system/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-hypothesis-driven-mission (V326 §8: GENUINE pre-registered-hypothesis workflow on a REAL per-signal measurement [native testsPass before→after]; predict BEFORE [t0<t1] → measure → production adjudicator → CONSUME: CONFIRMED⇒accepted, REFUTED⇒acceptance BLOCKED [even when green], INCONCLUSIVE⇒accepted-unconfirmed; unmeasurable signal⇒INCONCLUSIVE; does NOT touch the flat-measurement evolution-loop; fail-closed; deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
