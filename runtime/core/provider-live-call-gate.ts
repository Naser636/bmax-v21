#!/usr/bin/env node
"use strict";
// Provider Live-Call Gate — TypeScript canonical. Faithful, strict-typed port of the historical
// runtime/core/provider-live-call-gate.js (behaviour identical: same env flag, same fail-closed decision,
// same reason strings, same public members). Verified under tsconfig.runtime-leaves-strict.json (strict,
// no ts-nocheck). The legacy .js stays the production port for `require("./provider-live-call-gate")`
// consumers; the TypeScript consumers (src/providers/*-provider-adapter.ts) ESM-import named members, so
// this canonical uses ESM `export` declarations (tsx + esbuild interop expose the same names to a require()
// of this .ts). Dual-port parity is proven by provider-live-call-gate-dualport-parity.test.ts.
//
// The single fail-closed authorization point for every LIVE (potentially billed) provider process. Reuses
// the established explicit opt-in idiom — ODG_PROVIDER_LIVE=1, default OFF (REFUSED). Guards the REAL spawn
// boundary only; an injected (zero-cost) runner is never gated. Pure + deterministic (env in → decision out;
// no clock/random/I/O); never throws, never spawns.

export interface LiveCallInput { env?: Record<string, string | undefined>; provider?: string; }
export interface LiveCallDecision { allowed: boolean; mode: "LIVE" | "REFUSED"; reason: string; }

/** The explicit, fail-closed opt-in flag that authorizes a live (billed) provider process. */
export const PROVIDER_LIVE_ENV = "ODG_PROVIDER_LIVE";
/** The value the flag must hold to authorize a live call (any other value / absence ⇒ REFUSED). */
export const PROVIDER_LIVE_VALUE = "1";

/** Decide whether a LIVE provider process may be spawned. Fail-closed: absent/!= "1" ⇒ REFUSED. */
export function evaluateProviderLiveCall(input?: LiveCallInput): LiveCallDecision {
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
 * Central enforcement wrapper: run `perform()` (the real, billed call) ONLY when the gate allows; otherwise
 * return `onRefuse(decision)` WITHOUT ever invoking `perform`.
 */
export function gateLiveCall<T>(perform: () => T, onRefuse: (decision: LiveCallDecision) => T, input?: LiveCallInput): T {
  const decision = evaluateProviderLiveCall(input);
  if (!decision.allowed) return onRefuse(decision);
  return perform();
}
