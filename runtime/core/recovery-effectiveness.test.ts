#!/usr/bin/env node
"use strict";
/* M11 (V12.4 recovery effectiveness) — battery. Proves recovery actions are CLASSIFIED from REAL before/after deltas
 * (EFFECTIVE/HARMFUL/INEFFECTIVE/INCONCLUSIVE) reusing improvement-baseline.measureDelta, that a recovery which
 * REGRESSES the system is flagged HARMFUL (never a false EFFECTIVE), that the aggregate effectiveness RATE excludes
 * unmeasurable events (null, no fake 0/0), and that it is fail-closed, frozen and deterministic. No egress. */
const R = require("./recovery-effectiveness.js");
const B = (o: any) => ({ signals: o });
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  // 1-4. single-event classification
  check("EFFECTIVE on net improvement", R.classifyRecovery(B({ err: 10, lat: 100 }), B({ err: 2, lat: 50 }), { err: "lower", lat: "lower" }).outcome === "EFFECTIVE");
  check("HARMFUL on net regression (recovery made it worse)", (() => { const c = R.classifyRecovery(B({ err: 2 }), B({ err: 10 }), { err: "lower" }); return c.outcome === "HARMFUL" && /REGRESSION/.test(c.reason); })());
  check("INEFFECTIVE on measured-but-tied", R.classifyRecovery(B({ a: 10, b: 10 }), B({ a: 5, b: 20 }), { a: "lower", b: "lower" }).outcome === "INEFFECTIVE");
  check("INCONCLUSIVE on no measured change (flat + empty) — no fabricated effect", R.classifyRecovery(B({ a: 10 }), B({ a: 10 }), { a: "lower" }).outcome === "INCONCLUSIVE" && R.classifyRecovery({}, {}).outcome === "INCONCLUSIVE" && R.classifyRecovery(B({ a: 10 }), B({ a: 10 }), { a: "lower" }).measured === false);

  // 5. adversarial: improved 1, regressed 2 ⇒ net regressed ⇒ HARMFUL (never falsely EFFECTIVE)
  check("net-regressed mixed signals ⇒ HARMFUL (not a false EFFECTIVE)", R.classifyRecovery(B({ a: 10, b: 10, c: 10 }), B({ a: 5, b: 20, c: 20 }), { a: "lower", b: "lower", c: "lower" }).outcome === "HARMFUL");

  // 6. aggregation over a prolonged run
  const events = [
    { id: "r1", before: B({ err: 10 }), after: B({ err: 2 }), senseMap: { err: "lower" } },   // EFFECTIVE
    { id: "r2", before: B({ err: 2 }), after: B({ err: 10 }), senseMap: { err: "lower" } },    // HARMFUL
    { id: "r3", before: B({ a: 10, b: 10 }), after: B({ a: 5, b: 20 }), senseMap: { a: "lower", b: "lower" } }, // INEFFECTIVE
    { id: "r4", before: B({ x: 5 }), after: B({ x: 5 }), senseMap: { x: "lower" } },           // INCONCLUSIVE
  ];
  const a = R.assessRecoveries(events);
  check("aggregate counts correct (1 eff, 1 harm, 1 ineff, 1 inconcl)", a.counts.effective === 1 && a.counts.harmful === 1 && a.counts.ineffective === 1 && a.counts.inconclusive === 1 && a.total === 4);
  check("measured excludes INCONCLUSIVE (denominator = 3)", a.measured === 3);
  check("effectivenessRate = EFFECTIVE/measured = 1/3", a.effectivenessRate === 0.3333);
  check("harmfulRate surfaced + anyHarmful true (a recovery regressed the system)", a.harmfulRate === 0.3333 && a.anyHarmful === true);

  // 7. no fake 0/0: all-INCONCLUSIVE run ⇒ rates null
  const none = R.assessRecoveries([{ before: {}, after: {} }, { before: B({ a: 1 }), after: B({ a: 1 }), senseMap: { a: "lower" } }]);
  check("all unmeasurable ⇒ effectivenessRate null (no fabricated 0/0)", none.measured === 0 && none.effectivenessRate === null && none.harmfulRate === null && none.anyHarmful === false);
  // 8. empty run
  check("empty run ⇒ total 0, rate null", (() => { const e = R.assessRecoveries([]); return e.total === 0 && e.effectivenessRate === null; })());
  // 9. id defaulting
  check("missing id ⇒ defaulted (recovery-N)", R.assessRecoveries([{ before: B({ e: 2 }), after: B({ e: 1 }), senseMap: { e: "lower" } }]).results[0].id === "recovery-0");

  // 10. fail-closed: junk + throwing getter ⇒ INCONCLUSIVE, never throws
  let threw = false; try {
    const g: any = {}; Object.defineProperty(g, "signals", { get() { throw new Error("boom"); } });
    check("throwing getter ⇒ INCONCLUSIVE (fail-closed, no throw)", R.classifyRecovery(g, {}).outcome === "INCONCLUSIVE");
    check("junk inputs ⇒ INCONCLUSIVE", R.classifyRecovery(null, "x").outcome === "INCONCLUSIVE" && R.classifyRecovery(undefined, undefined).outcome === "INCONCLUSIVE");
    R.assessRecoveries("nonsense"); R.assessRecoveries(null);
  } catch { threw = true; }
  check("assessRecoveries never throws on junk", threw === false && R.assessRecoveries("nonsense").total === 0);

  // 11. frozen + deterministic
  check("outputs frozen (summary + results + per-result)", Object.isFrozen(a) && Object.isFrozen(a.results) && Object.isFrozen(a.results[0]) && Object.isFrozen(a.counts));
  check("deterministic (identical events ⇒ identical JSON)", JSON.stringify(R.assessRecoveries(events)) === JSON.stringify(R.assessRecoveries(events)));

  // ===== Regression locks for independent-validator findings (no fabricated effect from non-numeric/NaN) =====
  // D1: non-numeric signal CHURN (string/bool/object changed) is NOT an improvement ⇒ INCONCLUSIVE, never EFFECTIVE
  check("D1: string churn (bad->worse) ⇒ INCONCLUSIVE (not fabricated EFFECTIVE)", R.classifyRecovery(B({ status: "bad" }), B({ status: "worse" }), { status: "lower" }).outcome === "INCONCLUSIVE");
  check("D1: bool/object churn ⇒ INCONCLUSIVE", R.classifyRecovery(B({ ok: true }), B({ ok: false })).outcome === "INCONCLUSIVE" && R.classifyRecovery(B({ cfg: { x: 1 } }), B({ cfg: { x: 2 } })).outcome === "INCONCLUSIVE");
  // D2 (WORST): a real numeric REGRESSION must stay HARMFUL even when irrelevant non-numeric fields also change
  check("D2: numeric regression + non-numeric churn ⇒ HARMFUL (regression never hidden)", R.classifyRecovery(B({ err: 2, tagA: "x", tagB: "p" }), B({ err: 10, tagA: "y", tagB: "q" }), { err: "lower" }).outcome === "HARMFUL");
  // D3: NaN never yields a fabricated EFFECTIVE or HARMFUL ⇒ INCONCLUSIVE
  check("D3: NaN->number and NaN->NaN ⇒ INCONCLUSIVE (never EFFECTIVE/HARMFUL)", R.classifyRecovery(B({ a: NaN }), B({ a: 5 }), { a: "lower" }).outcome === "INCONCLUSIVE" && R.classifyRecovery(B({ a: NaN }), B({ a: NaN })).outcome === "INCONCLUSIVE");
  // D-aggregate: a run of pure non-numeric churn must NOT report 100% effective
  const churn = R.assessRecoveries([{ before: B({ s: "a" }), after: B({ s: "b" }) }, { before: B({ s: "c" }), after: B({ s: "d" }) }]);
  check("aggregate of non-numeric churn ⇒ 0 measured, rate null, anyHarmful false (no fabricated 100%)", churn.measured === 0 && churn.effectivenessRate === null && churn.counts.effective === 0);

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — recovery-effectiveness M11 (measured recovery effectiveness; HARMFUL surfaced; rate excludes unmeasurable; fail-closed; reuses measureDelta)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
