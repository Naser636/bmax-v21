#!/usr/bin/env node
"use strict";
/* Tests for odg-forecast-memory (V360 §6 anticipation). Injected clock (epoch ms) ⇒ deterministic, zero fs/network.
 * Proves: a forecast is never a fact; PENDING ⇒ NOT_MEASURED; CONFIRMED needs supplied materialization (no auto-confirm);
 * EXPIRED is a NON-hit; hit/false-signal/lead-time + confidence calibration (Brier/ECE); missed-events honest. */
const M = require("./odg-forecast-memory.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const DAY = 24 * 3600 * 1000;
const T0 = Date.UTC(2026, 0, 1);

function main(): void {
  // open: validation + "never a fact"
  const f = M.openForecast({ claim: "vector DBs become standard for agent memory", provenance: "radar:arxiv", confidence: 0.7, horizonDays: 30, domain: "memory" }, T0);
  check("OPEN forecast: epistemicStatus FORECAST, UNVERIFIED (never a fact), resolveBy = +horizon", f.status === "OPEN" && f.epistemicStatus === "FORECAST" && f.validationStatus === "UNVERIFIED" && f.resolveByMs === T0 + 30 * DAY);
  check("fail-closed: missing source/bad confidence/horizon ⇒ REJECTED", M.openForecast({ claim: "x", confidence: 2, horizonDays: -1 }, T0).status === "REJECTED" && M.openForecast({ confidence: 0.5, horizonDays: 10, provenance: "s" }, T0).status === "REJECTED");

  // PENDING ⇒ NOT_MEASURED (horizon not reached, no observation)
  const rPend = M.resolveForecast(f, { materialized: null }, T0 + 10 * DAY);
  check("PENDING before horizon ⇒ NOT_MEASURED (no fabricated resolution)", rPend.verdict === "PENDING" && rPend.measured === false);

  // CONFIRMED requires supplied materialization (no auto-confirm); within horizon; lead-time measured; outcome 1
  const rConf = M.resolveForecast(f, { materialized: true, observedAtMs: T0 + 20 * DAY, evidence: "seen in 3 frameworks" }, T0 + 20 * DAY);
  check("CONFIRMED only with supplied materialization===true; within horizon; lead-time = 20d; outcome 1", rConf.verdict === "CONFIRMED" && rConf.withinHorizon === true && rConf.anticipationLeadDays === 20 && rConf.outcome === 1);

  // CONFIRMED_LATE: materialized AFTER the horizon ⇒ timing miss, outcome 0 (not a within-horizon hit)
  const rLate = M.resolveForecast(f, { materialized: true, observedAtMs: T0 + 50 * DAY }, T0 + 50 * DAY); // horizon was 30d
  check("CONFIRMED_LATE: materialized after horizon ⇒ outcome 0 (timing miss, not a within-horizon hit)", rLate.verdict === "CONFIRMED_LATE" && rLate.withinHorizon === false && rLate.outcome === 0);

  // observation BEFORE the forecast opened ⇒ post-diction flagged, lead-time null (not a silent 0-lead hit)
  const rPre = M.resolveForecast(f, { materialized: true, observedAtMs: T0 - 5 * DAY }, T0 + 10 * DAY);
  check("observed-before-open flagged (post-diction, not anticipation); leadDays null", rPre.observedBeforeOpen === true && rPre.anticipationLeadDays === null);

  // REFUTED = false signal
  const rRef = M.resolveForecast(f, { materialized: false }, T0 + 25 * DAY);
  check("REFUTED (materialized false) ⇒ false signal, outcome 0", rRef.verdict === "REFUTED" && rRef.outcome === 0);

  // EXPIRED_UNRESOLVED = horizon passed, no evidence ⇒ NON-hit (not auto-confirmed)
  const rExp = M.resolveForecast(f, { materialized: null }, T0 + 40 * DAY);
  check("EXPIRED_UNRESOLVED after horizon with no evidence ⇒ NON-hit (outcome 0, not confirmed)", rExp.verdict === "EXPIRED_UNRESOLVED" && rExp.outcome === 0);

  // scoring: hit-rate / false-signal / late-rate / lead-time; PENDING + EXPIRED excluded from decided AND calibration
  const resolutions = [
    { verdict: "CONFIRMED", confidence: 0.8, outcome: 1, anticipationLeadDays: 10 },
    { verdict: "CONFIRMED", confidence: 0.9, outcome: 1, anticipationLeadDays: 20 },
    { verdict: "CONFIRMED_LATE", confidence: 0.7, outcome: 0 },
    { verdict: "REFUTED", confidence: 0.6, outcome: 0 },
    { verdict: "PENDING", confidence: 0.5 },
    { verdict: "EXPIRED_UNRESOLVED", confidence: 0.4, outcome: 0 },
  ];
  const sc = M.scoreForecasts(resolutions, { minSamples: 1 });
  check("score: 2 confirmed / 4 decided ⇒ hitRate 0.5; falseSignal 0.25; lateRate 0.25", sc.counts.decided === 4 && sc.hitRate === 0.5 && sc.falseSignalRate === 0.25 && sc.lateRate === 0.25);
  check("score: PENDING + EXPIRED reported separately (never a hit); resolutionRate = 4/6", sc.counts.pending === 1 && sc.counts.expiredUnresolved === 1 && sc.resolutionRate === 0.6667);
  check("score: anticipation lead-time mean = 15d (CONFIRMED only)", sc.anticipationLeadDaysMean === 15);
  check("score: calibration over DECIDED only — EXPIRED EXCLUDED (n = 4, not 5)", sc.calibration.n === 4 && typeof sc.calibration.brier === "number");

  // EXPIRED must NOT be able to fabricate a 'trusted' calibration (independent-inspection fix): 20 low-confidence expirations
  const expiredOnly = Array.from({ length: 20 }, () => ({ verdict: "EXPIRED_UNRESOLVED", confidence: 0.05, outcome: 0 }));
  const scExp = M.scoreForecasts(expiredOnly, { minSamples: 1 });
  check("EXPIRED-only ⇒ NO calibration data (NO_DATA), never a fabricated 'trusted' verdict", scExp.calibration.n === 0 && scExp.calibration.trusted === false && scExp.hitRate === null);

  // no decided forecasts ⇒ hitRate NOT_MEASURED (null)
  const scNone = M.scoreForecasts([{ verdict: "PENDING", confidence: 0.5 }], { minSamples: 1 });
  check("no decided forecasts ⇒ hitRate NOT_MEASURED (null)", scNone.hitRate === null && scNone.counts.decided === 0);

  // calibration fail-closed under minSamples
  const scFew = M.scoreForecasts(resolutions); // default minSamples 20 > 4
  check("calibration fail-closed: < minSamples ⇒ NO_DATA / not trusted", scFew.calibration.verdict === "NO_DATA" && scFew.calibration.trusted === false);

  // missed events honest
  const me = M.missedEvents([{ id: "E1", domain: "reasoning" }, { id: "E2", domain: "memory" }], [f]); // f is domain "memory"
  check("missed-events: E1 (reasoning) missed, E2 (memory) anticipated", me.missed.indexOf("E1") >= 0 && me.missed.indexOf("E2") < 0 && me.anticipated === 1);
  const meNone = M.missedEvents([], [f]);
  check("missed-events UNKNOWN without a known-events set (machine-readable null, never assumed zero)", meNone.missed === null && meNone.anticipated === null && /UNKNOWN/.test(meNone.note));

  // frozen + contract
  check("frozen records", Object.isFrozen(f) && Object.isFrozen(rConf) && Object.isFrozen(sc));
  check("contract: never a fact; no auto-confirm; EXPIRED+PENDING excluded from hit-rate+calibration; reuses calibration; no 2nd store",
    /a forecast is NEVER a fact/.test(JSON.stringify(M.FORECAST_MEMORY_CONTRACT.invariants)) &&
    /NO auto-confirm/.test(JSON.stringify(M.FORECAST_MEMORY_CONTRACT.invariants)) &&
    /EXCLUDED from hit-rate AND calibration/.test(JSON.stringify(M.FORECAST_MEMORY_CONTRACT.invariants)) &&
    /calibration/.test(JSON.stringify(M.FORECAST_MEMORY_CONTRACT.reuses)) &&
    /no second memory\/store/.test(JSON.stringify(M.FORECAST_MEMORY_CONTRACT.invariants)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-forecast-memory (V360 §6 anticipation: forecast-with-horizon → retrospective resolution → hit/false-signal/missed/lead-time + Brier/ECE calibration; never a fact, PENDING⇒NOT_MEASURED, no auto-confirm, EXPIRED=non-hit; reuses calibration-trust-gate, no 2nd store)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
