#!/usr/bin/env node
"use strict";
/* Tests for odg-cycle-hypothesis-verdict (adjudicate a cycle's pre-registered prediction vs its measured delta).
   PURE. Composes the REAL improvement-baseline.measureDelta + odg-hypothesis-adjudicator — no mocks. */
const M = require("./odg-cycle-hypothesis-verdict.js");
const IB = require("./improvement-baseline.js");
const ADJ = require("./odg-hypothesis-adjudicator.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const V = ADJ.VERDICT;

const before = { signals: { passRate: 0.6, defects: 10 } };
const after = { signals: { passRate: 0.8, defects: 4 } };
const md = IB.measureDelta(before, after, { defects: "lower" }); // passRate improved (+0.2), defects improved (−6)
const mkCycle = (pred: any, extra?: any) => Object.assign({
  id: "CY-1", createdAt: 1000, history: [{ at: 1000, event: "STARTED" }, { at: 5000, event: "MEASURED" }],
  hypothesis: { hypothesis: "passRate improves after the change", refutationConditions: ["no change or worse"], successCriteria: ["passRate up"], prediction: pred },
  measurement: md,
}, extra || {});

function main(): void {
  // CONFIRMED — pre-registered prediction matches the measured delta
  const c = M.adjudicateCycle(mkCycle({ signal: "passRate", direction: "improved" }));
  check("cycle predicted improved + measured improved ⇒ CONFIRMED, adjudicable", c.verdict === V.CONFIRMED && c.adjudicable === true && c.cycleId === "CY-1");
  // lower-is-better signal honoured via measureDelta (not reimplemented)
  check("lower-is-better defects dropped, predicted improved ⇒ CONFIRMED", M.adjudicateCycle(mkCycle({ signal: "defects", direction: "improved" })).verdict === V.CONFIRMED);
  // magnitude met / not met
  check("direction + magnitude met ⇒ CONFIRMED", M.adjudicateCycle(mkCycle({ signal: "passRate", direction: "improved", magnitude: 0.15 })).verdict === V.CONFIRMED);
  check("direction matched but magnitude below predicted ⇒ INCONCLUSIVE (under-powered)", M.adjudicateCycle(mkCycle({ signal: "passRate", direction: "improved", magnitude: 0.5 })).verdict === V.INCONCLUSIVE);

  // REFUTED — measured opposite the prediction
  check("predicted regressed but measured improved ⇒ REFUTED", M.adjudicateCycle(mkCycle({ signal: "passRate", direction: "regressed" })).verdict === V.REFUTED);

  // INCONCLUSIVE — no structured prediction ⇒ not adjudicable, never confirmed
  const noPred = { id: "CY-2", createdAt: 1000, history: [{ at: 1000 }], hypothesis: { hypothesis: "x", refutationConditions: ["a"], successCriteria: ["b"] }, measurement: md };
  check("hypothesis without a structured prediction ⇒ INCONCLUSIVE, adjudicable false (never confirmed)", M.adjudicateCycle(noPred).verdict === V.INCONCLUSIVE && M.adjudicateCycle(noPred).adjudicable === false);
  // no measurement ⇒ not adjudicable
  const noMeas = mkCycle({ signal: "passRate", direction: "improved" }); delete noMeas.measurement;
  check("cycle without a measurement ⇒ INCONCLUSIVE, adjudicable false", M.adjudicateCycle(noMeas).adjudicable === false);

  // GENUINE PRE-REGISTRATION: createdAt (hypothesis registration) must precede the measurement time
  const backdated = { id: "CY-3", createdAt: 9000, history: [{ at: 1000 }, { at: 5000 }], hypothesis: { hypothesis: "x", refutationConditions: ["a"], successCriteria: ["b"], prediction: { signal: "passRate", direction: "improved" } }, measurement: md };
  check("createdAt AFTER the measurement time ⇒ INCONCLUSIVE (not genuinely pre-registered)", M.adjudicateCycle(backdated).verdict === V.INCONCLUSIVE);
  // FAIL-CLOSED on unresolvable timestamps: a matching prediction must NOT self-confirm without a registration time
  const noCreatedAt = { id: "CY-5", history: [{ at: 5000 }], hypothesis: { hypothesis: "x", refutationConditions: ["a"], successCriteria: ["b"], prediction: { signal: "passRate", direction: "improved" } }, measurement: md };
  check("no createdAt ⇒ INCONCLUSIVE (cannot prove pre-registration — fail-closed, not self-confirming)", M.adjudicateCycle(noCreatedAt).verdict === V.INCONCLUSIVE);
  const noHistory = { id: "CY-6", createdAt: 1000, hypothesis: { hypothesis: "x", refutationConditions: ["a"], successCriteria: ["b"], prediction: { signal: "passRate", direction: "improved" } }, measurement: md };
  check("no history (no measurement time) ⇒ INCONCLUSIVE (fail-closed)", M.adjudicateCycle(noHistory).verdict === V.INCONCLUSIVE);
  check("garbage history timestamps ⇒ INCONCLUSIVE (fail-closed)", M.adjudicateCycle({ id: "CY-7", createdAt: "nope", history: [{ at: "nope" }], hypothesis: { hypothesis: "x", refutationConditions: ["a"], successCriteria: ["b"], prediction: { signal: "passRate", direction: "improved" } }, measurement: md }).verdict === V.INCONCLUSIVE);

  // ISO timestamps also accepted (parsed), order enforced
  const isoCycle = { id: "CY-4", createdAt: "2026-01-01T00:00:00Z", history: [{ at: "2026-01-01T00:00:00Z" }, { at: "2026-01-02T00:00:00Z" }], hypothesis: { hypothesis: "x", refutationConditions: ["a"], successCriteria: ["b"], prediction: { signal: "passRate", direction: "improved" } }, measurement: md };
  check("ISO createdAt < ISO measurement ⇒ CONFIRMED (timestamps parsed)", M.adjudicateCycle(isoCycle).verdict === V.CONFIRMED);

  // composition fidelity: equals adjudicateHypothesis over the same prediction+measurement
  const direct = ADJ.adjudicateHypothesis({ signal: "passRate", direction: "improved", preRegistered: true, preRegisteredAtMs: 1000, measuredAtMs: 5000 }, md);
  check("adjudication equals odg-hypothesis-adjudicator over the cycle's prediction + measurement", JSON.stringify(c.adjudication) === JSON.stringify(direct));

  // batch roll-up: rate over ADJUDICABLE only, non-adjudicable reported separately
  const batch = M.adjudicateCycles([mkCycle({ signal: "passRate", direction: "improved" }), mkCycle({ signal: "passRate", direction: "regressed" }), noPred]);
  check("batch: 3 total, 2 adjudicable, 1 confirmed, 1 refuted, rate 0.5 over adjudicable", batch.total === 3 && batch.adjudicable === 2 && batch.confirmed === 1 && batch.refuted === 1 && batch.confirmedRateOfAdjudicable === 0.5);
  check("batch: a non-adjudicable cycle is NOT counted as confirmed", batch.inconclusive === 0 && batch.adjudicable === 2);
  // all non-adjudicable ⇒ rate null (never a 0-denominator rate)
  check("0 adjudicable ⇒ confirmedRateOfAdjudicable null", M.adjudicateCycles([noPred]).confirmedRateOfAdjudicable === null && M.adjudicateCycles([noPred]).adjudicable === 0);

  // fail-closed
  check("non-object cycle ⇒ BAD_CYCLE", M.adjudicateCycle(null).ok === false && M.adjudicateCycle(null).code === "BAD_CYCLE");
  check("non-array cycles ⇒ BAD_INPUT", M.adjudicateCycles("x").ok === false && M.adjudicateCycles("x").code === "BAD_INPUT");
  check("garbage cycle in a batch ⇒ handled (not a throw)", (() => { const b = M.adjudicateCycles([null, 42, mkCycle({ signal: "passRate", direction: "improved" })]); return b.total === 3 && b.adjudicable === 1; })());

  // honesty + determinism + frozen + contract
  check("note: rate over adjudicable only, expectation never confirms, no blended score", /over ADJUDICABLE cycles ONLY/.test(batch.note) && /author's expectation never confirms itself/.test(batch.note) && /No blended score/.test(batch.note));
  check("deterministic", JSON.stringify(M.adjudicateCycle(mkCycle({ signal: "passRate", direction: "improved" }))) === JSON.stringify(c));
  check("frozen (verdict, prediction, batch, verdicts)", Object.isFrozen(c) && Object.isFrozen(c.prediction) && Object.isFrozen(batch) && Object.isFrozen(batch.verdicts));
  check("contract: read-only, genuine-prereg, confirmed-only-on-match, non-adjudicable≠confirmed, rate-over-adjudicable",
    M.CYCLE_HYPOTHESIS_VERDICT_CONTRACT.invariants.some((s: string) => /read-only/.test(s)) &&
    M.CYCLE_HYPOTHESIS_VERDICT_CONTRACT.invariants.some((s: string) => /pre-registration is genuine/.test(s)) &&
    M.CYCLE_HYPOTHESIS_VERDICT_CONTRACT.invariants.some((s: string) => /the author's expectation never confirms itself/.test(s)) &&
    M.CYCLE_HYPOTHESIS_VERDICT_CONTRACT.invariants.some((s: string) => /never counted as confirmed/.test(s)) &&
    M.CYCLE_HYPOTHESIS_VERDICT_CONTRACT.invariants.some((s: string) => /over ADJUDICABLE cycles ONLY/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-cycle-hypothesis-verdict (adjudicate a cycle's PRE-REGISTERED prediction vs measured delta over REAL improvement-baseline.measureDelta + odg-hypothesis-adjudicator: predicted-match⇒CONFIRMED [magnitude]; opposite⇒REFUTED; magnitude-below/no-prediction/no-measurement/back-dated-createdAt⇒INCONCLUSIVE [genuine pre-registration enforced: createdAt<measurement]; lower-is-better via measureDelta; ISO+epoch timestamps; batch rate over ADJUDICABLE only [non-adjudicable never confirmed]; bad-cycle/non-array/garbage fail-closed; read-only; PURE/deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
