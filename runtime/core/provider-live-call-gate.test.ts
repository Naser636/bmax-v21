#!/usr/bin/env node
// @ts-nocheck — L5 bulk test migration (runtime/core): runs under tsx unchanged; suppresses tsc
// typechecking (NOT strict typing) — recorded migration debt (type later). See ODG_PROJECT_STATE.md.

// Targeted tests for the Provider Live-Call Gate (WI-1 GOVERNED_PROVIDER_LIVE_CALL_GATE_V1).
// ZERO real/billed calls: the only "runner" here is a spy. Proves the fail-closed contract:
//   (1) default (no ODG_PROVIDER_LIVE=1) ⇒ REFUSED, and the real-call thunk is NEVER invoked;
//   (2) explicit ODG_PROVIDER_LIVE=1 ⇒ LIVE, and the simulated runner IS invoked exactly once.

const {
  PROVIDER_LIVE_ENV,
  PROVIDER_LIVE_VALUE,
  evaluateProviderLiveCall,
  gateLiveCall,
} = require("./provider-live-call-gate");

let failures = 0;
function check(cond, label) {
  if (cond) {
    console.log(`  PASS ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}

// --- 1. Pure decision: fail-closed default -------------------------------------------------------
{
  const d = evaluateProviderLiveCall({ env: {}, provider: "claude-code" });
  check(d.allowed === false && d.mode === "REFUSED", "empty env ⇒ REFUSED (fail-closed default)");
  check(/REFUSED/.test(d.reason) && d.reason.includes(PROVIDER_LIVE_ENV), "refusal reason names the opt-in flag");
}
{
  // Any value other than the exact "1" is still REFUSED (no fuzzy truthiness).
  for (const v of ["0", "", "true", "yes", "LIVE", undefined]) {
    const d = evaluateProviderLiveCall({ env: { [PROVIDER_LIVE_ENV]: v }, provider: "p" });
    check(d.allowed === false, `${PROVIDER_LIVE_ENV}=${JSON.stringify(v)} ⇒ REFUSED (only "1" authorizes)`);
  }
}

// --- 2. Pure decision: explicit authorization ----------------------------------------------------
{
  const d = evaluateProviderLiveCall({ env: { [PROVIDER_LIVE_ENV]: PROVIDER_LIVE_VALUE }, provider: "openai-sdk" });
  check(d.allowed === true && d.mode === "LIVE", `${PROVIDER_LIVE_ENV}=1 ⇒ LIVE (explicit authorization)`);
  check(d.reason.includes("AUTHORIZED"), "authorized reason states AUTHORIZED");
}

// --- 3. Enforcement: REFUSED ⇒ the real-call thunk is NEVER invoked -------------------------------
{
  let spyCalls = 0;
  const perform = () => { spyCalls++; return { spawned: true }; };
  const onRefuse = (decision) => ({ refused: true, reason: decision.reason });
  const out = gateLiveCall(perform, onRefuse, { env: {}, provider: "claude-code" });
  check(spyCalls === 0, "REFUSED: the (potentially billed) runner was NEVER invoked");
  check(out.refused === true && /REFUSED/.test(out.reason), "REFUSED: caller receives the refusal, not a spawn");
}

// --- 4. Enforcement: LIVE ⇒ the simulated runner IS invoked exactly once --------------------------
{
  let spyCalls = 0;
  const perform = () => { spyCalls++; return { spawned: true, exit: 0 }; };
  const onRefuse = () => ({ refused: true });
  const out = gateLiveCall(perform, onRefuse, { env: { [PROVIDER_LIVE_ENV]: PROVIDER_LIVE_VALUE }, provider: "claude-code" });
  check(spyCalls === 1, "LIVE: the simulated runner was invoked exactly once");
  check(out.spawned === true && out.exit === 0, "LIVE: caller receives the runner's real result");
}

// --- 5. Determinism: identical env ⇒ identical decision ------------------------------------------
{
  const a = evaluateProviderLiveCall({ env: {}, provider: "x" });
  const b = evaluateProviderLiveCall({ env: {}, provider: "x" });
  check(JSON.stringify(a) === JSON.stringify(b), "same input ⇒ byte-identical decision (deterministic)");
}

console.log(failures === 0 ? "ALL PASS — PROVIDER LIVE-CALL GATE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
