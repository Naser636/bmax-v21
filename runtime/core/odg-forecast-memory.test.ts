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

  // CONFIRMED requires supplied materialization (no auto-confirm); lead-time measured
  const rConf = M.resolveForecast(f, { materialized: true, observedAtMs: T0 + 20 * DAY, evidence: "seen in 3 frameworks" }, T0 + 20 * DAY);
  check("CONFIRMED only with supplied materialization===true; within horizon; lead-time = 20d; outcome 1", rConf.verdict === "CONFIRMED" && rConf.withinHorizon === true && rConf.anticipationLeadDays === 20 && rConf.outcome === 1);

  // REFUTED = false signal
  const rRef = M.resolveForecast(f, { materialized: false }, T0 + 25 * DAY);
  check("REFUTED (materialized false) ⇒ false signal, outcome 0", rRef.verdict === "REFUTED" && rRef.outcome === 0);

  // EXPIRED_UNRESOLVED = horizon passed, no evidence ⇒ NON-hit (not auto-confirmed)
  const rExp = M.resolveForecast(f, { materialized: null }, T0 + 40 * DAY);
  check("EXPIRED_UNRESOLVED after horizon with no evidence ⇒ NON-hit (outcome 0, not confirmed)", rExp.verdict === "EXPIRED_UNRESOLVED" && rExp.outcome === 0);

  // scoring: hit-rate / false-signal / lead-time; PENDING excluded from decided
  const resolutions = [
    { verdict: "CONFIRMED", confidence: 0.8, outcome: 1, anticipationLeadDays: 10 },
    { verdict: "CONFIRMED", confidence: 0.9, outcome: 1, anticipationLeadDays: 20 },
    { verdict: "REFUTED", confidence: 0.6, outcome: 0 },
    { verdict: "PENDING", confidence: 0.5 },
    { verdict: "EXPIRED_UNRESOLVED", confidence: 0.4, outcome: 0 },
  ];
  const sc = M.scoreForecasts(resolutions, { minSamples: 1 });
  check("score: 2 confirmed / 1 refuted ⇒ hitRate 0.6667, falseSignal 0.3333, decided=3", sc.counts.decided === 3 && sc.hitRate === 0.6667 && sc.falseSignalRate === 0.3333);
  check("score: PENDING + EXPIRED reported separately (never a hit)", sc.counts.pending === 1 && sc.counts.expiredUnresolved === 1);
  check("score: anticipation lead-time mean = 15d", sc.anticipationLeadDaysMean === 15);
  check("score: confidence calibration present (Brier via canonical gate), n = resolved samples (4)", sc.calibration.n === 4 && typeof sc.calibration.brier === "number");

  // no decided forecasts ⇒ hitRate NOT_MEASURED (null)
  const scNone = M.scoreForecasts([{ verdict: "PENDING", confidence: 0.5 }], { minSamples: 1 });
  check("no decided forecasts ⇒ hitRate NOT_MEASURED (null)", scNone.hitRate === null && scNone.counts.decided === 0);

  // calibration fail-closed under minSamples
  const scFew = M.scoreForecasts(resolutions); // default minSamples 20 > 4
  check("calibration fail-closed: < minSamples ⇒ NO_DATA / not trusted", scFew.calibration.verdict === "NO_DATA" && scFew.calibration.trusted === false);

  // missed events honest
  const me = M.missedEvents([{ id: "E1", domain: "reasoning" }, { id: "E2", domain: "memory" }], [f]); // f is domain "memory"
  check("missed-events: E1 (reasoning) missed, E2 (memory) anticipated", me.missed.indexOf("E1") >= 0 && me.missed.indexOf("E2") < 0 && me.anticipated === 1);
  check("missed-events UNKNOWN without a known-events set (never assumed zero)", /UNKNOWN/.test(M.missedEvents([], [f]).note));

  // frozen + contract
  check("frozen records", Object.isFrozen(f) && Object.isFrozen(rConf) && Object.isFrozen(sc));
  check("contract: never a fact; PENDING NOT_MEASURED; no auto-confirm; EXPIRED non-hit; reuses calibration; no 2nd store",
    /a forecast is NEVER a fact/.test(JSON.stringify(M.FORECAST_MEMORY_CONTRACT.invariants)) &&
    /NO auto-confirm/.test(JSON.stringify(M.FORECAST_MEMORY_CONTRACT.invariants)) &&
    /NON-hit/.test(JSON.stringify(M.FORECAST_MEMORY_CONTRACT.invariants)) &&
    /calibration/.test(JSON.stringify(M.FORECAST_MEMORY_CONTRACT.reuses)) &&
    /no second memory\/store/.test(JSON.stringify(M.FORECAST_MEMORY_CONTRACT.invariants)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-forecast-memory (V360 §6 anticipation: forecast-with-horizon → retrospective resolution → hit/false-signal/missed/lead-time + Brier/ECE calibration; never a fact, PENDING⇒NOT_MEASURED, no auto-confirm, EXPIRED=non-hit; reuses calibration-trust-gate, no 2nd store)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
