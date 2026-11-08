#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 23 (reliability — world-research gap) — CIRCUIT BREAKER (CLOSED / OPEN / HALF_OPEN). PURE, deterministic.
 * World reference: the circuit-breaker recovery pattern (Azure Architecture Center; resilience4j; "Resilient
 * Microservices" arXiv 2512.16959 Dec-2025) — when a dependency fails at rate the breaker TRIPS OPEN to stop
 * hammering it, after a cooldown goes HALF_OPEN to admit a bounded number of probes, and re-CLOSES only if the probes
 * succeed (any probe failure re-opens). ODG's reliability stack has DLQ (poison), saga, burn-rate, watermark, dedup —
 * but NO circuit breaker (grep-verified: no HALF_OPEN / circuit / breaker / bulkhead state machine; third-party-agent
 * -gate's "circuit-break" is a one-way hard budget cap, not a rolling-failure-rate breaker with recovery). An OPEN
 * breaker is precisely what stops RETRYING records from storming the p12-dead-letter-quarantine during a brownout.
 * Composes p7-burn-rate-alert.burnRate (failure-rate-over-threshold math) + the DLQ outcome vocabulary. No clock:
 * the OPEN→HALF_OPEN cooldown is a caller-supplied logical tick count (like event-stream seq). Dual export.
 */

const BURN = require("./p7-burn-rate-alert");          // burnRate — reuse the rate-over-threshold math for the trip decision

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function num(v: any, d = 0): number { return typeof v === "number" && isFinite(v) ? v : d; }
function round(n: number): number { return Number(n.toFixed(4)); }

const STATE = Object.freeze(["CLOSED", "OPEN", "HALF_OPEN"]);
const OUTCOME = Object.freeze(["SUCCESS", "FAIL", "SLOW"]);
const isFailure = (o: any) => o === "FAIL" || o === "SLOW";

/**
 * evaluateBreaker({ state, outcomes, config, cooldownElapsed }) -> { nextState, admit, failureRate, burnRate, note }.
 *   state ∈ CLOSED|OPEN|HALF_OPEN (unknown ⇒ OPEN, fail-closed).
 *   outcomes: recent window of "SUCCESS"|"FAIL"|"SLOW" (invalid token ⇒ OPEN, fail-closed).
 *   config: { failureThreshold (0..1, default .5), minSamples (default 5), cooldownTicks (default 3), probeLimit (default 2) }.
 *   cooldownElapsed: caller-supplied logical ticks since the breaker opened (no clock).
 */
function evaluateBreaker(input: any): any {
  const o = isObj(input) ? input : {};
  const cfg = isObj(o.config) ? o.config : {};
  const failureThreshold = Math.min(1, Math.max(0.0001, num(cfg.failureThreshold, 0.5)));
  const minSamples = Math.max(1, Math.floor(num(cfg.minSamples, 5)));
  const cooldownTicks = Math.max(1, Math.floor(num(cfg.cooldownTicks, 3)));
  const probeLimit = Math.max(1, Math.floor(num(cfg.probeLimit, 2)));
  const outcomes = arr(o.outcomes);
  const state = STATE.includes(o.state) ? o.state : null;

  // fail-closed: an unknown current state, or any invalid outcome token, ⇒ OPEN (never fabricate CLOSED from bad telemetry).
  if (state === null) return out("OPEN", false, null, null, "unknown current state ⇒ OPEN (fail-closed)");
  if (outcomes.some((x) => !OUTCOME.includes(x))) return out("OPEN", false, null, null, "invalid outcome token ⇒ OPEN (fail-closed)");

  const n = outcomes.length;
  const fails = outcomes.filter(isFailure).length;
  const failureRate = n > 0 ? round(fails / n) : 0;
  // reuse p7 burnRate: budget = 1 − (1 − threshold) = threshold ⇒ burnRate = failureRate / threshold; tripped ⟺ ≥ 1.
  const br = BURN.burnRate(failureRate, 1 - failureThreshold);
  const tripped = br >= 1;

  if (state === "CLOSED") {
    // resilience4j rule: a minimum number of calls is required before the rate can trip the breaker.
    if (n >= minSamples && tripped) return out("OPEN", false, failureRate, br, `failure rate ${failureRate} ≥ threshold ${failureThreshold} over ${n} calls ⇒ OPEN`);
    return out("CLOSED", true, failureRate, br, n < minSamples ? `only ${n} calls (< minSamples ${minSamples}) — not enough to trip; stays CLOSED` : "failure rate within threshold ⇒ CLOSED");
  }
  if (state === "OPEN") {
    // cooldown gates the recovery probe; until it elapses the breaker stays OPEN (short-circuits the call path).
    if (num(o.cooldownElapsed, 0) >= cooldownTicks) return out("HALF_OPEN", true, failureRate, br, `cooldown ${cooldownTicks} ticks elapsed ⇒ HALF_OPEN (admit bounded probes)`);
    return out("OPEN", false, failureRate, br, "cooldown not elapsed ⇒ OPEN (short-circuit)");
  }
  // HALF_OPEN: the outcomes window IS the probe results. Any failure re-opens immediately; probeLimit successes closes.
  if (fails > 0) return out("OPEN", false, failureRate, br, "a recovery probe failed ⇒ re-OPEN immediately (never optimistically close)");
  const successes = outcomes.filter((x) => x === "SUCCESS").length;
  if (successes >= probeLimit) return out("CLOSED", true, failureRate, br, `${successes} ≥ ${probeLimit} clean probes ⇒ CLOSED (recovered)`);
  return out("HALF_OPEN", true, failureRate, br, `${successes}/${probeLimit} clean probes so far ⇒ stay HALF_OPEN`);
}

function out(nextState: string, admit: boolean, failureRate: any, burnRate: any, note: string): any {
  return Object.freeze({ nextState, admit, failureRate, burnRate, note });
}

const P12_CIRCUIT_BREAKER_CONTRACT = Object.freeze({
  id: "V124-P12-CIRCUIT-BREAKER",
  source: "SÉRIE 23 reliability — circuit breaker CLOSED/OPEN/HALF_OPEN (Azure Arch Center; resilience4j; arXiv 2512.16959 2025)",
  states: STATE,
  reuses: Object.freeze(["p7-burn-rate-alert.burnRate (failure-rate-over-threshold trip)", "DLQ outcome vocabulary (p12-dead-letter-quarantine)", "caller-supplied logical ticks (no clock)"]),
  notAuthority: "a deterministic state-machine step over a caller-supplied outcome window; it calls no dependency and runs no timer",
  invariants: Object.freeze([
    "CLOSED trips to OPEN only when failure rate ≥ threshold over ≥ minSamples calls (resilience4j min-calls rule)",
    "OPEN short-circuits (admit:false) until the caller-supplied cooldown ticks elapse ⇒ HALF_OPEN",
    "HALF_OPEN admits bounded probes; ANY probe failure re-opens immediately; probeLimit clean probes ⇒ CLOSED",
    "fail-closed: unknown current state or any invalid outcome token ⇒ OPEN — never fabricate CLOSED from bad telemetry",
    "pure/deterministic: window in → next state out; no clock, no random, no network; it never itself makes the downstream call",
  ]),
});

module.exports = { evaluateBreaker, P12_CIRCUIT_BREAKER_CONTRACT };

if (require.main === module) {
  const trip = evaluateBreaker({ state: "CLOSED", outcomes: ["FAIL", "FAIL", "FAIL", "SUCCESS", "FAIL"], config: { failureThreshold: 0.5, minSamples: 5 } });
  process.stdout.write(JSON.stringify({ ...P12_CIRCUIT_BREAKER_CONTRACT, demo: { nextState: trip.nextState, failureRate: trip.failureRate } }, null, 2) + "\n");
}

export {};
