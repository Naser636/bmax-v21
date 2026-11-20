#!/usr/bin/env node
"use strict";
/* Tests for odg-behavioral-improvement (V327 §2). Measures the behavioral TREND across successive verified outcomes
 * (early vs recent acceptance rate) + recurring-failure detection — distinct from point reliability / age staleness.
 * UNKNOWN censored; INSUFFICIENT_DATA fail-closed; IMPROVING/PLATEAU/PLATEAU_LOW/REGRESSING. Deterministic. */
const B = require("./odg-behavioral-improvement.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const S = (reason?: string) => ({ type: "k", outcome: "SUCCESS", independentlyVerified: true });
const F = (reason?: string) => ({ type: "k", outcome: "FAILURE", independentlyVerified: true, reason: reason || "fail" });
const seq = (...xs: any[]) => xs;

function main(): void {
  // thin ⇒ INSUFFICIENT_DATA (fail-closed, no trend asserted)
  check("thin (<10) ⇒ INSUFFICIENT_DATA, improving:false", (() => { const r = B.measureImprovement([S(), S(), F()]); return r.verdict === "INSUFFICIENT_DATA" && r.improving === false && r.delta === null; })());

  // early mostly FAIL → recent mostly SUCCESS ⇒ IMPROVING (learning)
  const imp = B.measureImprovement(seq(F(), F(), F(), F(), S(), S(), S(), S(), S(), S()));
  check("early 1/5 → recent 5/5 ⇒ IMPROVING (improving:true, positive delta)", imp.verdict === "IMPROVING" && imp.improving === true && imp.delta > 0 && imp.recentRate > imp.earlyRate);

  // early mostly SUCCESS → recent mostly FAIL ⇒ REGRESSING (a false rule / class got harder)
  const reg = B.measureImprovement(seq(S(), S(), S(), S(), S(), F(), F(), F(), F(), S()));
  check("early high → recent low ⇒ REGRESSING + re-probe/escalate recommendation", reg.verdict === "REGRESSING" && reg.delta < 0 && /escalate|RE-PROBE/i.test(reg.recommendation));

  // flat & low ⇒ PLATEAU_LOW (accumulating is not improving results — memory cost > gain)
  const low = B.measureImprovement(seq(F(), S(), F(), F(), S(), F(), S(), F(), F(), S()));
  check("flat low (~0.4 both windows) ⇒ PLATEAU_LOW (memory cost > gain ⇒ escalate/decompose)", low.verdict === "PLATEAU_LOW" && Math.abs(low.delta) < 0.2 && /ESCALATE|decompose/i.test(low.recommendation));

  // flat & acceptable ⇒ PLATEAU (trust, no extra probing)
  const plat = B.measureImprovement(seq(S(), S(), F(), S(), S(), S(), S(), F(), S(), S()));
  check("flat high ⇒ PLATEAU (trust the belief)", plat.verdict === "PLATEAU" && /trust/i.test(plat.recommendation));

  // recurring failure signature in the recent window ⇒ flagged (false rule / stuck)
  const recur = B.measureImprovement(seq(S(), S(), S(), S(), S(), F("TIMEOUT"), F("TIMEOUT"), F("TIMEOUT"), F("x"), S()));
  check("same failure signature repeats ≥3 in recent window ⇒ recurringFailure flagged (behaviorally obsolete)", recur.recurringFailure && recur.recurringFailure.signature === "TIMEOUT" && recur.recurringFailure.count === 3 && /false rule|obsolete/i.test(recur.note));

  // UNKNOWN / unverified censored (never counted into the trend)
  const censored = B.measureImprovement([...Array(10).fill(0).map(() => S()), { type: "k", outcome: "UNKNOWN", independentlyVerified: false }, { type: "k", outcome: "SUCCESS", independentlyVerified: false }]);
  check("UNKNOWN + unverified censored ⇒ only the 10 verified counted", censored.samples.decided === 10);

  // key scoping: other classes excluded
  const mixed = [...Array(10).fill(0).map(() => S()), ...Array(10).fill(0).map(() => ({ type: "other", outcome: "FAILURE", independentlyVerified: true }))];
  check("key scoping: only the requested class is measured", B.measureImprovement(mixed, { key: "k" }).samples.decided === 10);

  // frozen + contract
  check("frozen result", Object.isFrozen(imp) && Object.isFrozen(imp.samples));
  check("contract: TREND not quantity; read-only, no parallel memory; complements calibrated-P + belief-refresh",
    /improvement, not just quantity/.test(JSON.stringify(B.BEHAVIORAL_IMPROVEMENT_CONTRACT.invariants)) &&
    /NO parallel memory/.test(JSON.stringify(B.BEHAVIORAL_IMPROVEMENT_CONTRACT.reuses)) &&
    /TREND, a distinct facet/.test(JSON.stringify(B.BEHAVIORAL_IMPROVEMENT_CONTRACT.reuses)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-behavioral-improvement (V327 §2: early-vs-recent trend over the EXISTING store — IMPROVING/PLATEAU/PLATEAU_LOW/REGRESSING + recurring-failure[false-rule] detection; UNKNOWN censored; INSUFFICIENT_DATA fail-closed; measures improvement not quantity; no parallel memory)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
