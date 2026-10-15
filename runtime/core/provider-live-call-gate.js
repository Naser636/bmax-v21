#!/usr/bin/env node

// Provider Live-Call Gate — the single, fail-closed authorization point for every LIVE (potentially
// billed) provider process the Runtime can spawn (Claude Code CLI, the OpenAI SDK sidecar, and the
// Fleet bridge worker). WI-1 GOVERNED_PROVIDER_LIVE_CALL_GATE_V1.
//
// WHY THIS EXISTS
//   Before this gate there was NO single chokepoint: a real, billed provider spawn could occur
//   whenever an entry point was reached (the failover engine even defaulted execute=true). This
//   module makes the default REFUSE: a live provider call happens ONLY when the operator has
//   explicitly opted in, and otherwise never spawns a process.
//
// AUTHORIZATION MECHANISM (reused, NOT invented)
//   This reuses the repository's established fail-closed opt-in idiom — an explicit, never-silent
//   environment flag, default OFF — exactly like `ODG_LIVE_PROBE=1` (odg-probe: "DEFAULT = DRY, ZERO
//   network; a live request requires ODG_LIVE_PROBE=1") and `ODG_PROVIDER_DIRECT_WRITE=1` (documented
//   escape hatch, default OFF). The live-call authorization flag is `ODG_PROVIDER_LIVE=1`.
//
// SCOPE (per CTO ruling on WI-1)
//   The gate guards the REAL spawn boundary ONLY. An INJECTED runner/caller (the test seam that makes
//   zero-cost calls) is inherently not billed and is never gated — so existing provider conformance
//   tests, which inject fake runners, are unaffected. Non-provider child processes (e.g. `git status`)
//   are NOT provider calls and are never gated.
//
// Pure + deterministic: the decision is a function of the injected env alone (no Date/Math/random, no
// I/O). Error-as-data: callers translate a REFUSED decision into their own structured halt; this
// module never throws and never spawns anything itself.

/** The explicit, fail-closed opt-in flag that authorizes a live (billed) provider process. */
const PROVIDER_LIVE_ENV = "ODG_PROVIDER_LIVE";
/** The value the flag must hold to authorize a live call (any other value / absence ⇒ REFUSED). */
const PROVIDER_LIVE_VALUE = "1";

/**
 * Decide whether a LIVE provider process may be spawned. Fail-closed: absent/!= "1" ⇒ REFUSED.
 *
 * @param {{ env?: Record<string, string|undefined>, provider?: string }} [input]
 *   env      — the environment to read the opt-in from (default: process.env). Injectable for tests.
 *   provider — provider name, used only to make the reason message precise.
 * @returns {{ allowed: boolean, mode: "LIVE"|"REFUSED", reason: string }}
 */
function evaluateProviderLiveCall(input) {
  const env = (input && input.env) || (typeof process !== "undefined" ? process.env : {}) || {};
  const provider = (input && input.provider) || "provider";
  const authorized = env[PROVIDER_LIVE_ENV] === PROVIDER_LIVE_VALUE;
  if (authorized) {
    return {
      allowed: true,
      mode: "LIVE",
      reason: `${provider}: live provider call AUTHORIZED (${PROVIDER_LIVE_ENV}=${PROVIDER_LIVE_VALUE}).`,
    };
  }
  return {
    allowed: false,
    mode: "REFUSED",
    reason:
      `${provider}: live provider call REFUSED by the fail-closed gate — no ${PROVIDER_LIVE_ENV}=${PROVIDER_LIVE_VALUE} ` +
      `authorization present. No process was spawned. Set ${PROVIDER_LIVE_ENV}=${PROVIDER_LIVE_VALUE} to explicitly ` +
      `permit a real (potentially billed) provider call.`,
  };
}

/**
 * Central enforcement wrapper: run `perform()` (the real, billed call) ONLY when the gate allows;
 * otherwise return `onRefuse(decision)` WITHOUT ever invoking `perform`. This is the guarantee the
 * acceptance test exercises with a spy: on REFUSED the spy is never called; on LIVE it is called once.
 *
 * @template T
 * @param {() => T} perform   the real call to make when authorized (never called when REFUSED)
 * @param {(decision: {allowed:boolean,mode:string,reason:string}) => T} onRefuse  refusal translator
 * @param {{ env?: Record<string, string|undefined>, provider?: string }} [input]
 * @returns {T}
 */
function gateLiveCall(perform, onRefuse, input) {
  const decision = evaluateProviderLiveCall(input);
  if (!decision.allowed) return onRefuse(decision);
  return perform();
}

module.exports = { PROVIDER_LIVE_ENV, PROVIDER_LIVE_VALUE, evaluateProviderLiveCall, gateLiveCall };
