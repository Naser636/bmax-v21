#!/usr/bin/env node
/*
 * Provider Live-Call Gate (TS port — compiles to runtime/dist/core/provider-live-call-gate.js, the
 * sibling the compiled dist/core/fleet-bridge.js requires). Behavioural parity with the JS rollback port
 * runtime/core/provider-live-call-gate.js (CTO Priority-1 L2 migration, dual-port).
 *
 * The single, fail-closed authorization point for every LIVE (potentially billed) provider process.
 * Default REFUSE: a live call happens ONLY when the operator sets ODG_PROVIDER_LIVE=1. Pure +
 * deterministic (function of injected env alone; no Date/Math/random, no I/O). Error-as-data: never
 * throws, never spawns. Activates NO provider.
 *
 * Exports are declared as NAMED exports (export const/function) so BOTH consumer styles work against the
 * compiled CommonJS output: ES named imports (src/providers/*-provider-adapter.ts:
 * `import { evaluateProviderLiveCall } from ".../provider-live-call-gate.js"`) AND require-destructure
 * (runtime/core/fleet-bridge: `const { gateLiveCall } = require("./provider-live-call-gate")`). Using
 * `export` also forces TypeScript MODULE scope, so these declarations do NOT collide with the JS rollback
 * port (provider-live-call-gate.js) under the repo-wide tsc program (TS2451).
 */

/** The explicit, fail-closed opt-in flag that authorizes a live (billed) provider process. */
export const PROVIDER_LIVE_ENV = "ODG_PROVIDER_LIVE";
/** The value the flag must hold to authorize a live call (any other value / absence ⇒ REFUSED). */
export const PROVIDER_LIVE_VALUE = "1";

type LiveDecision = { allowed: boolean; mode: "LIVE" | "REFUSED"; reason: string };
type GateInput = { env?: Record<string, string | undefined>; provider?: string };

/** Decide whether a LIVE provider process may be spawned. Fail-closed: absent/!= "1" ⇒ REFUSED. */
export function evaluateProviderLiveCall(input?: GateInput): LiveDecision {
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
 * otherwise return `onRefuse(decision)` WITHOUT ever invoking `perform`.
 */
export function gateLiveCall<T>(perform: () => T, onRefuse: (decision: LiveDecision) => T, input?: GateInput): T {
  const decision = evaluateProviderLiveCall(input);
  if (!decision.allowed) return onRefuse(decision);
  return perform();
}
