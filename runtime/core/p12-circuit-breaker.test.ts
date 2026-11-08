#!/usr/bin/env node
"use strict";
const assert = require("assert");
const B = require("./p12-circuit-breaker");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 23 — P12 CIRCUIT BREAKER");
const cfg = { failureThreshold: 0.5, minSamples: 5, cooldownTicks: 3, probeLimit: 2 };

// CLOSED with failures over threshold + enough samples ⇒ trip OPEN.
{
  const r = B.evaluateBreaker({ state: "CLOSED", outcomes: ["FAIL", "FAIL", "FAIL", "SUCCESS", "FAIL"], config: cfg });
  check(r.nextState === "OPEN" && r.admit === false, `failure rate ≥ threshold ⇒ OPEN (got ${r.nextState}, rate ${r.failureRate})`);
}
// CLOSED healthy ⇒ stays CLOSED.
check(B.evaluateBreaker({ state: "CLOSED", outcomes: ["SUCCESS", "SUCCESS", "SUCCESS", "SUCCESS", "SUCCESS"], config: cfg }).nextState === "CLOSED", "healthy ⇒ CLOSED");
// CLOSED below minSamples ⇒ stays CLOSED (resilience4j min-calls rule, does not trip on noise).
check(B.evaluateBreaker({ state: "CLOSED", outcomes: ["FAIL", "FAIL"], config: cfg }).nextState === "CLOSED", "below minSamples ⇒ stays CLOSED (min-calls)");

// OPEN before cooldown ⇒ stays OPEN (short-circuit).
check(B.evaluateBreaker({ state: "OPEN", outcomes: [], config: cfg, cooldownElapsed: 1 }).nextState === "OPEN", "OPEN + cooldown not elapsed ⇒ OPEN");
// OPEN after cooldown ⇒ HALF_OPEN (admit probes).
{
  const r = B.evaluateBreaker({ state: "OPEN", outcomes: [], config: cfg, cooldownElapsed: 3 });
  check(r.nextState === "HALF_OPEN" && r.admit === true, "OPEN + cooldown elapsed ⇒ HALF_OPEN (admit probes)");
}

// HALF_OPEN with a failing probe ⇒ re-OPEN immediately.
check(B.evaluateBreaker({ state: "HALF_OPEN", outcomes: ["SUCCESS", "FAIL"], config: cfg }).nextState === "OPEN", "HALF_OPEN + probe FAIL ⇒ re-OPEN");
// HALF_OPEN with probeLimit clean probes ⇒ CLOSED (recovered).
check(B.evaluateBreaker({ state: "HALF_OPEN", outcomes: ["SUCCESS", "SUCCESS"], config: cfg }).nextState === "CLOSED", "HALF_OPEN + enough clean probes ⇒ CLOSED");
// HALF_OPEN with partial clean probes ⇒ stay HALF_OPEN.
check(B.evaluateBreaker({ state: "HALF_OPEN", outcomes: ["SUCCESS"], config: cfg }).nextState === "HALF_OPEN", "HALF_OPEN partial ⇒ stay HALF_OPEN");

// fail-closed: unknown state ⇒ OPEN.
check(B.evaluateBreaker({ state: "BANANA", outcomes: [], config: cfg }).nextState === "OPEN", "unknown state ⇒ OPEN (fail-closed)");
// fail-closed: invalid outcome token ⇒ OPEN.
check(B.evaluateBreaker({ state: "CLOSED", outcomes: ["SUCCESS", "WAT"], config: cfg }).nextState === "OPEN", "invalid outcome token ⇒ OPEN (fail-closed)");

check(B.P12_CIRCUIT_BREAKER_CONTRACT.invariants.some((i: any) => /re-opens immediately/.test(i)), "contract: probe-fail re-opens immediately");

console.log(failures === 0 ? "ALL PASS — SÉRIE 23 P12 CIRCUIT BREAKER" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
