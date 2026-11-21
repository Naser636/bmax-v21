#!/usr/bin/env node
"use strict";
/*
 * V360 §6 (anticipation) — FORECAST MEMORY: prediction-accuracy-over-time. PURE, deterministic, fail-closed. The missing
 * predictive half of the Radar: it RECORDS a forecast about a future technology trend/event with provenance + confidence +
 * a time HORIZON, RESOLVES it retrospectively against OBSERVED reality (supplied — never fabricated), and SCORES forecast
 * accuracy (hit-rate, false-signal, missed-events, anticipation lead-time, and confidence CALIBRATION via Brier/ECE).
 *
 * HONESTY (the point of a foresight memory): a forecast is NEVER a fact (epistemicStatus "FORECAST", validationStatus
 * UNVERIFIED). A forecast whose horizon has not passed is PENDING ⇒ accuracy NOT_MEASURED — never a resolved hit. CONFIRMED
 * requires a supplied observation with materialized===true (there is NO auto-confirm); a horizon that passes with no evidence
 * is EXPIRED_UNRESOLVED, counted as a NON-hit, not a success. The goal is prospective intelligence, not presenting guesses as
 * certainties. Reuses calibration-trust-gate.assessCalibration + eval-metrics.brierScore (the canonical calibration) — it adds
 * NO second memory/store; a durable caller persists records via the existing autonomy-store/idempotency-guard pattern.
 */

const CAL = require("./calibration-trust-gate.js"); // canonical confidence-calibration gate (ECE/Brier, fail-closed NO_DATA)

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function isNum(v: any): boolean { return typeof v === "number" && isFinite(v); }
const DAY_MS = 24 * 60 * 60 * 1000;

const VERDICT = Object.freeze(["CONFIRMED", "REFUTED", "PENDING", "EXPIRED_UNRESOLVED"]);

/**
 * openForecast(spec, nowMs) -> frozen OPEN forecast or a REJECTED record (fail-closed). spec: { claim, provenance (source),
 *   confidence ∈ [0,1], horizonDays > 0, id?, domain?, direction? }. A forecast is NEVER a fact.
 */
function openForecast(spec: any, nowMs: number): any {
  const s = isObj(spec) ? spec : {};
  const reasons: string[] = [];
  if (typeof s.claim !== "string" || !s.claim.trim()) reasons.push("MISSING_CLAIM");
  if (!(isNum(s.confidence) && s.confidence >= 0 && s.confidence <= 1)) reasons.push("BAD_CONFIDENCE");
  if (!(isNum(s.horizonDays) && s.horizonDays > 0)) reasons.push("BAD_HORIZON");
  if (!s.provenance) reasons.push("MISSING_PROVENANCE"); // a forecast with no source is not admissible
  if (!isNum(nowMs)) reasons.push("BAD_NOW");
  if (reasons.length) return freeze({ status: "REJECTED", reasons: freeze(reasons), note: "fail-closed: a forecast needs a claim, a source, confidence∈[0,1] and a positive horizon" });
  return freeze({
    status: "OPEN", id: typeof s.id === "string" ? s.id : null,
    claim: s.claim, domain: typeof s.domain === "string" ? s.domain : null, direction: typeof s.direction === "string" ? s.direction : null,
    provenance: s.provenance, confidence: s.confidence, horizonDays: s.horizonDays,
    openedAtMs: nowMs, resolveByMs: nowMs + s.horizonDays * DAY_MS,
    epistemicStatus: "FORECAST", validationStatus: "UNVERIFIED",
  });
}

/**
 * resolveForecast(forecast, observation, nowMs) -> frozen resolution. observation: { materialized: true|false|null,
 *   observedAtMs?, evidence? }. CONFIRMED requires materialized===true (no auto-confirm); false ⇒ REFUTED (false signal);
 *   null ⇒ PENDING if the horizon has not passed (accuracy NOT_MEASURED) else EXPIRED_UNRESOLVED (a NON-hit, never a success).
 */
function resolveForecast(forecast: any, observation: any, nowMs: number): any {
  const f = isObj(forecast) ? forecast : {};
  const o = isObj(observation) ? observation : {};
  if (f.status !== "OPEN") return freeze({ verdict: "PENDING", measured: false, note: "not an OPEN forecast — nothing to resolve" });
  const materialized = o.materialized === true ? true : o.materialized === false ? false : null;
  const observedAtMs = isNum(o.observedAtMs) ? o.observedAtMs : (isNum(nowMs) ? nowMs : null);

  if (materialized === true) {
    const leadDays = (isNum(observedAtMs) && isNum(f.openedAtMs)) ? Math.max(0, (observedAtMs - f.openedAtMs) / DAY_MS) : null; // how early we called it
    const withinHorizon = isNum(observedAtMs) && isNum(f.resolveByMs) ? observedAtMs <= f.resolveByMs : null;
    return freeze({ forecastId: f.id, verdict: "CONFIRMED", measured: true, materialized: true, withinHorizon, anticipationLeadDays: leadDays, confidence: f.confidence, outcome: 1, evidence: o.evidence || null, note: "observed materialization supplied — a resolved hit (still provenance-tied, not a standalone fact)" });
  }
  if (materialized === false) {
    return freeze({ forecastId: f.id, verdict: "REFUTED", measured: true, materialized: false, confidence: f.confidence, outcome: 0, evidence: o.evidence || null, note: "observed non-materialization — a false signal" });
  }
  // no decisive observation
  if (isNum(nowMs) && isNum(f.resolveByMs) && nowMs < f.resolveByMs) {
    return freeze({ forecastId: f.id, verdict: "PENDING", measured: false, confidence: f.confidence, note: "horizon not reached — accuracy NOT_MEASURED (never a fabricated resolution)" });
  }
  return freeze({ forecastId: f.id, verdict: "EXPIRED_UNRESOLVED", measured: true, materialized: null, confidence: f.confidence, outcome: 0, note: "horizon passed with no supplied evidence — counted as a NON-hit (not auto-confirmed)" });
}

/**
 * scoreForecasts(resolutions, opts?) -> frozen accuracy report over RESOLVED forecasts. hitRate / falseSignalRate over the
 * decided (CONFIRMED|REFUTED) set; EXPIRED and PENDING are reported separately (never counted as hits). Confidence
 * calibration (Brier/ECE, fail-closed NO_DATA) via the canonical calibration-trust-gate over {p:confidence, outcome}.
 */
function scoreForecasts(resolutions: any[], opts: any = {}): any {
  const rs = arr(resolutions).filter(isObj);
  const o = isObj(opts) ? opts : {};
  const by = (v: string) => rs.filter((r) => r.verdict === v);
  const confirmed = by("CONFIRMED"), refuted = by("REFUTED"), pending = by("PENDING"), expired = by("EXPIRED_UNRESOLVED");
  const decided = confirmed.length + refuted.length;
  const hitRate = decided > 0 ? +(confirmed.length / decided).toFixed(4) : null; // null ⇒ NOT_MEASURED (no decided forecasts)
  const falseSignalRate = decided > 0 ? +(refuted.length / decided).toFixed(4) : null;
  const leads = confirmed.map((r) => r.anticipationLeadDays).filter(isNum);
  const anticipationLeadDaysMean = leads.length ? +(leads.reduce((a, b) => a + b, 0) / leads.length).toFixed(2) : null;
  // confidence calibration: samples from every RESOLVED (decided or expired) forecast, {p:confidence, outcome}.
  const samples = [...confirmed, ...refuted, ...expired].filter((r) => isNum(r.confidence) && isNum(r.outcome)).map((r) => ({ p: r.confidence, outcome: r.outcome }));
  const calibration = CAL.assessCalibration({ samples, minSamples: Math.max(1, Math.floor(o.minSamples || 20)), maxECE: o.maxECE, integritySignals: o.integritySignals });
  return freeze({
    counts: freeze({ total: rs.length, confirmed: confirmed.length, refuted: refuted.length, pending: pending.length, expiredUnresolved: expired.length, decided }),
    hitRate, falseSignalRate, anticipationLeadDaysMean,
    calibration: freeze({ verdict: calibration.verdict, trusted: calibration.trusted === true, ece: calibration.ece, brier: calibration.brier, n: calibration.n }),
    note: "accuracy over RESOLVED forecasts only; PENDING ⇒ NOT_MEASURED (horizon not reached); EXPIRED_UNRESOLVED counts as a NON-hit (never auto-confirmed). Confidence calibration via the canonical calibration-trust-gate (fail-closed NO_DATA under minSamples). A forecast is never a standalone fact.",
  });
}

/**
 * missedEvents(knownEvents, forecasts, matchFn?) -> events that NO open/resolved forecast anticipated (false negatives / the
 * "missed events" taxonomy). matchFn(event, forecast)->bool (default: shared non-empty domain OR a claim keyword overlap).
 * Honest: this needs a supplied known-events set — without one, missed-events are UNKNOWN (never assumed zero).
 */
function missedEvents(knownEvents: any[], forecasts: any[], matchFn?: any): any {
  const events = arr(knownEvents).filter(isObj);
  const fx = arr(forecasts).filter(isObj);
  const match = typeof matchFn === "function" ? matchFn : (ev: any, f: any) => {
    if (ev.domain && f.domain && ev.domain === f.domain) return true;
    const k = (typeof ev.keyword === "string" ? ev.keyword : "").toLowerCase();
    return !!k && typeof f.claim === "string" && f.claim.toLowerCase().indexOf(k) >= 0;
  };
  const missed = events.filter((ev) => !fx.some((f) => match(ev, f)));
  return freeze({ knownEvents: events.length, anticipated: events.length - missed.length, missed: freeze(missed.map((e) => e.id || e.keyword || null)), note: events.length === 0 ? "no known-events set supplied — missed-events UNKNOWN (never assumed zero)" : "events with no matching forecast = false negatives (missed anticipations)" });
}

const FORECAST_MEMORY_CONTRACT = Object.freeze({
  id: "V360-FORECAST-MEMORY",
  purpose: "§6 anticipation — a prediction-accuracy-over-time memory: forecast-with-horizon → retrospective resolution against OBSERVED reality → hit/false-signal/missed/lead-time + confidence calibration (Brier/ECE); prospective intelligence, never guesses-as-facts",
  reuses: Object.freeze([
    "calibration-trust-gate.assessCalibration + eval-metrics.brierScore (the canonical confidence calibration — fail-closed NO_DATA)",
    "the pre-registered-prediction discipline of odg-hypothesis-adjudicator (direction/confidence recorded BEFORE resolution)",
    "durable persistence via the existing autonomy-store/idempotency-guard pattern (a caller's concern) — NO second memory/store",
  ]),
  invariants: Object.freeze([
    "a forecast is NEVER a fact (epistemicStatus FORECAST, validationStatus UNVERIFIED); admissible only with a claim, a source, confidence∈[0,1] and a positive horizon (fail-closed)",
    "PENDING (horizon not reached) ⇒ accuracy NOT_MEASURED — never a resolved hit; CONFIRMED requires a supplied observation materialized===true (NO auto-confirm)",
    "a horizon that passes with no evidence is EXPIRED_UNRESOLVED, counted as a NON-hit (never a success); missed-events are UNKNOWN without a supplied known-events set (never assumed zero)",
    "scores hit-rate / false-signal / anticipation lead-time + confidence calibration (Brier/ECE via the canonical gate); PURE/deterministic/frozen; reuses calibration; no second memory/store",
  ]),
});

module.exports = { openForecast, resolveForecast, scoreForecasts, missedEvents, VERDICT, FORECAST_MEMORY_CONTRACT };
export {};
