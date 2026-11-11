#!/usr/bin/env node
"use strict";

/*
 * recovery-effectiveness (mission M11, V12.4 — MEASURED recovery effectiveness over prolonged operation). PURE,
 * deterministic, fail-closed. Closes a demonstrable gap: the runtime DETECTS degradation and DECIDES to recover
 * (incident-recurrence, circuit-breaker, FDIR, the M10 bench) and RESTORES without corruption (recovery-drill), but
 * nothing MEASURES whether a recovery action actually IMPROVED the system. This classifies each recovery from its
 * REAL before/after metrics via improvement-baseline.measureDelta — honouring "no fabricated effect":
 *   EFFECTIVE    net improvement (improved > regressed)
 *   HARMFUL      net regression (regressed > improved) — the recovery made things WORSE (a critical signal)
 *   INEFFECTIVE  measured but no net gain (improved === regressed > 0)
 *   INCONCLUSIVE no measured signal at all (improved === regressed === 0) — never counted EFFECTIVE
 * assessRecoveries aggregates a run: the effectiveness RATE is EFFECTIVE / MEASURED (INCONCLUSIVE excluded from the
 * denominator — null, never a fake 0/0). Reuses the canonical measureDelta; adds no new primitive. No I/O, no clock,
 * no randomness, no network. Compatible with the nine primitives (a pure read-model over measured facts).
 */

const BASELINE = require("./improvement-baseline.js");   // REUSE canonical measureDelta (no reinvention)

const OUTCOMES = Object.freeze({ EFFECTIVE: "EFFECTIVE", HARMFUL: "HARMFUL", INEFFECTIVE: "INEFFECTIVE", INCONCLUSIVE: "INCONCLUSIVE" });

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/**
 * classifyRecovery(before, after, senseMap?): grade ONE recovery action from its measured before/after delta.
 * Fail-closed: no measured change ⇒ INCONCLUSIVE (never a fabricated EFFECTIVE). Never throws.
 */
function classifyRecovery(before: any, after: any, senseMap?: any): any {
  try {
    const delta = BASELINE.measureDelta(before, after, senseMap);
    const metrics = isObj(delta) && isObj(delta.metrics) ? delta.metrics : null;
    if (!metrics) return Object.freeze({ outcome: OUTCOMES.INCONCLUSIVE, reason: "no delta metrics — not measurable", measured: false });
    // Derive improved/regressed OURSELVES from the per-metric directions — do NOT trust summary.improved, which
    // counts non-numeric "changed" signals (string/bool/object churn has NO better/worse meaning) and can leak NaN.
    // A metric counts ONLY when its direction is improved/regressed AND both before/after are FINITE numbers ⇒ a
    // non-numeric change or a NaN/Infinity is UNMEASURED (never a fabricated effect; a real numeric regression stays
    // HARMFUL even when irrelevant non-numeric fields also changed).
    let improved = 0, regressed = 0;
    for (const name of Object.keys(metrics)) {
      const m = (metrics as any)[name];
      if (!isObj(m) || !Number.isFinite(m.before) || !Number.isFinite(m.after)) continue;
      if (m.direction === "improved") improved++;
      else if (m.direction === "regressed") regressed++;
    }
    if (improved === 0 && regressed === 0) return Object.freeze({ outcome: OUTCOMES.INCONCLUSIVE, reason: "no measured NUMERIC change (non-numeric/NaN signals are not an effect)", measured: false });
    if (improved > regressed) return Object.freeze({ outcome: OUTCOMES.EFFECTIVE, reason: `net improvement (${improved} improved > ${regressed} regressed)`, measured: true });
    if (regressed > improved) return Object.freeze({ outcome: OUTCOMES.HARMFUL, reason: `net REGRESSION after recovery (${regressed} regressed > ${improved} improved)`, measured: true });
    return Object.freeze({ outcome: OUTCOMES.INEFFECTIVE, reason: `measured but no net gain (${improved} improved = ${regressed} regressed)`, measured: true });
  } catch { return Object.freeze({ outcome: OUTCOMES.INCONCLUSIVE, reason: "classification error — fail-closed", measured: false }); }
}

/**
 * assessRecoveries(events): aggregate a run of recovery events [{ id?, before, after, senseMap? }]. Returns per-event
 * classifications + a FROZEN summary: counts, measured (EFFECTIVE+HARMFUL+INEFFECTIVE), effectivenessRate =
 * EFFECTIVE/measured (null on 0 measured — no fake 0/0), harmfulRate, and `anyHarmful`. Pure, deterministic, never throws.
 */
function assessRecoveries(events: any): any {
  const list = Array.isArray(events) ? events : [];
  const results = list.map((e: any, i: number) => {
    const ev = isObj(e) ? e : {};
    const c = classifyRecovery(ev.before, ev.after, ev.senseMap);
    return Object.freeze({ id: typeof ev.id === "string" && ev.id ? ev.id : `recovery-${i}`, outcome: c.outcome, measured: c.measured, reason: c.reason });
  });
  const count = (o: string) => results.filter((r) => r.outcome === o).length;
  const effective = count(OUTCOMES.EFFECTIVE), harmful = count(OUTCOMES.HARMFUL), ineffective = count(OUTCOMES.INEFFECTIVE), inconclusive = count(OUTCOMES.INCONCLUSIVE);
  const measured = effective + harmful + ineffective;                 // INCONCLUSIVE excluded — unmeasurable, not a failure
  const rate = (n: number) => measured > 0 ? Number((n / measured).toFixed(4)) : null;
  return Object.freeze({
    total: results.length,
    counts: Object.freeze({ effective, harmful, ineffective, inconclusive }),
    measured,
    effectivenessRate: rate(effective),                               // null on 0 measured (never a fabricated 0/0)
    harmfulRate: rate(harmful),
    anyHarmful: harmful > 0,                                          // a recovery that REGRESSED the system is surfaced
    results: Object.freeze(results),
  });
}

module.exports = { OUTCOMES, classifyRecovery, assessRecoveries };
export {};

if (require.main === module) {
  process.stdout.write(JSON.stringify({ model: "recovery-effectiveness/1", outcomes: Object.keys(OUTCOMES) }, null, 2) + "\n");
}
