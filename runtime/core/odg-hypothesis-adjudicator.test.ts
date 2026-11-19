#!/usr/bin/env node
"use strict";
/* Tests for odg-hypothesis-adjudicator (pre-registered predicted-vs-measured). PURE. Composes the REAL
   improvement-baseline.measureDelta — no mocks. */
const M = require("./odg-hypothesis-adjudicator.js");
const IB = require("./improvement-baseline.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const V = M.VERDICT;
const before = { signals: { passRate: 0.6, defects: 10, flatSig: 5 } };
const after = { signals: { passRate: 0.8, defects: 4, flatSig: 5 } };
const sense = { defects: "lower" };
const P = (o: any) => ({ preRegistered: true, ...o });
const adj = (pred: any) => M.adjudicateFromBaselines(pred, before, after, sense);

function main(): void {
  // CONFIRMED — pre-registered direction matches measured
  check("pre-registered improved + measured improved ⇒ CONFIRMED", adj(P({ signal: "passRate", direction: "improved" })).verdict === V.CONFIRMED);
  // lower-is-better signal: defects dropped ⇒ improved (sense honoured via measureDelta)
  check("lower-is-better defects dropped ⇒ CONFIRMED (sense from measureDelta)", adj(P({ signal: "defects", direction: "improved" })).verdict === V.CONFIRMED);
  // CONFIRMED with magnitude met (|Δ passRate| ≈ 0.2 ≥ 0.15)
  const cm = adj(P({ signal: "passRate", direction: "improved", magnitude: 0.15 }));
  check("direction + magnitude met ⇒ CONFIRMED", cm.verdict === V.CONFIRMED && cm.measured.direction === "improved");

  // REFUTED — measured opposite the prediction
  const ref = adj(P({ signal: "passRate", direction: "regressed" }));
  check("pre-registered regressed but measured improved ⇒ REFUTED", ref.verdict === V.REFUTED && /contradicts the pre-registered/.test(ref.reason));

  // INCONCLUSIVE — direction matched but magnitude below predicted minimum (not CONFIRMED on a trivial change)
  const under = adj(P({ signal: "passRate", direction: "improved", magnitude: 0.5 }));
  check("direction matched but |delta| < predicted magnitude ⇒ INCONCLUSIVE (under-powered)", under.verdict === V.INCONCLUSIVE && /under-powered/.test(under.reason));
  // INCONCLUSIVE — flat (no measured change)
  check("flat signal ⇒ INCONCLUSIVE (no measured change)", adj(P({ signal: "flatSig", direction: "improved" })).verdict === V.INCONCLUSIVE);
  // INCONCLUSIVE — signal not measured
  check("unmeasured signal ⇒ INCONCLUSIVE", adj(P({ signal: "ghost", direction: "improved" })).verdict === V.INCONCLUSIVE);

  // PRE-REGISTRATION is mandatory — a non-pre-registered prediction that WOULD confirm is INCONCLUSIVE, not CONFIRMED
  const post = adj({ signal: "passRate", direction: "improved" }); // no preRegistered flag
  check("NOT pre-registered ⇒ INCONCLUSIVE + preRegistered:false (expectation never confirms)", post.verdict === V.INCONCLUSIVE && post.preRegistered === false && /not attested pre-registered/.test(post.reason));
  check("the same prediction, pre-registered, DOES confirm (so the gate is what blocks it)", adj(P({ signal: "passRate", direction: "improved" })).verdict === V.CONFIRMED);
  // back-dated pre-registration (registered AFTER measurement) is rejected
  check("pre-registration timestamp not before measurement ⇒ INCONCLUSIVE", M.adjudicateFromBaselines({ signal: "passRate", direction: "improved", preRegistered: true, preRegisteredAtMs: 200, measuredAtMs: 100 }, before, after, sense).verdict === V.INCONCLUSIVE);
  check("pre-registration strictly before measurement ⇒ allowed (CONFIRMED)", M.adjudicateFromBaselines({ signal: "passRate", direction: "improved", preRegistered: true, preRegisteredAtMs: 100, measuredAtMs: 200 }, before, after, sense).verdict === V.CONFIRMED);

  // composition fidelity: adjudicateFromBaselines == adjudicateHypothesis(measureDelta(...))
  const md = IB.measureDelta(before, after, sense);
  check("adjudicateFromBaselines == adjudicateHypothesis over REAL measureDelta", JSON.stringify(adj(P({ signal: "passRate", direction: "improved" }))) === JSON.stringify(M.adjudicateHypothesis(P({ signal: "passRate", direction: "improved" }), md)));
  // accepts a raw metrics map too
  check("accepts a raw metrics map (not only the full result)", M.adjudicateHypothesis(P({ signal: "passRate", direction: "improved" }), md.metrics).verdict === V.CONFIRMED);

  // measured output echoes the real delta
  const c = adj(P({ signal: "defects", direction: "improved" }));
  check("measured echoes before/after/delta/direction from measureDelta", c.measured.before === 10 && c.measured.after === 4 && c.measured.delta === -6 && c.measured.direction === "improved");

  // fail-closed inputs
  check("non-object prediction ⇒ BAD_PREDICTION", M.adjudicateHypothesis(null, md).ok === false && M.adjudicateHypothesis(null, md).code === "BAD_PREDICTION");
  check("missing signal ⇒ BAD_PREDICTION", M.adjudicateHypothesis({ direction: "improved", preRegistered: true }, md).code === "BAD_PREDICTION");
  check("direction not improved/regressed ⇒ BAD_PREDICTION", M.adjudicateHypothesis({ signal: "x", direction: "flat", preRegistered: true }, md).code === "BAD_PREDICTION");
  check("negative magnitude ⇒ BAD_PREDICTION", M.adjudicateHypothesis({ signal: "x", direction: "improved", magnitude: -1, preRegistered: true }, md).code === "BAD_PREDICTION");
  check("bad measured ⇒ BAD_MEASURED", M.adjudicateHypothesis(P({ signal: "x", direction: "improved" }), 42).code === "BAD_MEASURED");

  // honesty + determinism + frozen + contract
  const ok = adj(P({ signal: "passRate", direction: "improved" }));
  check("note: pre-registered required, expectation never confirms, opposite⇒REFUTED", /PRE-REGISTERED prediction/.test(ok.note) && /author's expectation never confirms/.test(ok.note) && /Opposite direction ⇒ REFUTED/.test(ok.note));
  check("deterministic", JSON.stringify(adj(P({ signal: "passRate", direction: "improved" }))) === JSON.stringify(ok));
  check("frozen (result, predicted, measured)", Object.isFrozen(ok) && Object.isFrozen(ok.predicted) && Object.isFrozen(ok.measured));
  check("contract: pre-registered-required, confirmed-only-on-match, opposite-refuted, magnitude-partial, composes-measureDelta",
    M.HYPOTHESIS_ADJUDICATOR_CONTRACT.invariants.some((s: string) => /must be PRE-REGISTERED/.test(s)) &&
    M.HYPOTHESIS_ADJUDICATOR_CONTRACT.invariants.some((s: string) => /author's expectation never confirms itself/.test(s)) &&
    M.HYPOTHESIS_ADJUDICATOR_CONTRACT.invariants.some((s: string) => /OPPOSITE direction ⇒ REFUTED/.test(s)) &&
    M.HYPOTHESIS_ADJUDICATOR_CONTRACT.invariants.some((s: string) => /magnitude below the predicted minimum ⇒ INCONCLUSIVE/.test(s)) &&
    M.HYPOTHESIS_ADJUDICATOR_CONTRACT.invariants.some((s: string) => /composes improvement-baseline.measureDelta/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-hypothesis-adjudicator (pre-registered predicted-vs-measured over REAL improvement-baseline.measureDelta: direction-match⇒CONFIRMED [magnitude met]; opposite⇒REFUTED; magnitude-below-min/flat/unmeasured/NOT-pre-registered/back-dated⇒INCONCLUSIVE [expectation never confirms]; sense-aware via measureDelta; composition fidelity + raw-metrics-map; bad-prediction/bad-measured fail-closed; PURE/deterministic/frozen/clock-free)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
