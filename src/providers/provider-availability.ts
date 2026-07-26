/*
 * Provider Availability — the shared vocabulary for "can this provider run right now?"
 *
 * The EngineeringProviderPort (provider-port.ts) answers "execute this mission"; it deliberately
 * says nothing about whether the provider CAN be invoked at all. Failover needs that second
 * question answered BEFORE a (paid, side-effecting) call is attempted, and it needs the answer as
 * structured evidence — not a bare boolean — so the Runtime can report EXACTLY why a provider is
 * unusable (mission objectives 3–6: blocking component, missing config/resource, next action).
 *
 * This module is provider-agnostic and imports nothing from src/core or src/contracts, preserving
 * the port's zero-coupling discipline (contract §0). Adapters may implement `AvailabilityAware`;
 * the factory (provider-factory.ts) reads it to decide selection and to build the halt report.
 *
 * Determinism: an availability check is a pure function of an injected `AvailabilityEnv` (env vars
 * + a binary-presence probe). No ambient time or randomness — the same env yields the same verdict.
 */

/** Injected view of the world an availability check is allowed to observe. Fully mockable. */
export interface AvailabilityEnv {
  /** Environment variables (defaults to process.env at the edge; injected in tests). */
  env: Record<string, string | undefined>;
  /** True when an executable is resolvable on PATH. Injected so tests never touch the real system. */
  hasBinary: (bin: string) => boolean;
}

/**
 * Structured verdict for a single provider. When `available` is false, the three report fields are
 * populated with the PRECISE, actionable detail the mission demands; when true they are null.
 */
export interface ProviderAvailability {
  /** Provider identity (matches EngineeringProviderPort.name), e.g. "claude-code" / "openai-codex". */
  provider: string;
  /** Whether the provider can be invoked right now. */
  available: boolean;
  /** The exact component that blocks use, e.g. "openai-codex credential preflight". Null if available. */
  blockingComponent: string | null;
  /** The exact missing configuration / resource, e.g. "environment variable OPENAI_API_KEY". Null if available. */
  missingConfiguration: string | null;
  /** The single next action an operator must take to unblock, e.g. "export OPENAI_API_KEY=…". Null if available. */
  nextAction: string | null;
  /** Human-readable one-line summary (always present). */
  detail: string;
  /** Every requirement inspected and whether it was satisfied — evidence, not narrative. */
  checks: AvailabilityCheck[];
}

/** One inspected requirement (a credential, a binary, …) and its observed state. */
export interface AvailabilityCheck {
  requirement: string;
  satisfied: boolean;
  detail: string;
}

/** A provider adapter that can report whether it is invocable. Structural — the port stays unchanged. */
export interface AvailabilityAware {
  checkAvailability(env: AvailabilityEnv): ProviderAvailability;
}

/** True when `value` implements `AvailabilityAware`. */
export function isAvailabilityAware(value: unknown): value is AvailabilityAware {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { checkAvailability?: unknown }).checkAvailability === "function"
  );
}

/** Build a satisfied `ProviderAvailability` from the inspected checks. */
export function available(provider: string, checks: AvailabilityCheck[]): ProviderAvailability {
  return {
    provider,
    available: true,
    blockingComponent: null,
    missingConfiguration: null,
    nextAction: null,
    detail: `${provider} is available`,
    checks,
  };
}

/** Build an unavailable `ProviderAvailability` carrying the precise, actionable diagnostics. */
export function unavailable(
  provider: string,
  reason: {
    blockingComponent: string;
    missingConfiguration: string;
    nextAction: string;
    checks: AvailabilityCheck[];
  },
): ProviderAvailability {
  return {
    provider,
    available: false,
    blockingComponent: reason.blockingComponent,
    missingConfiguration: reason.missingConfiguration,
    nextAction: reason.nextAction,
    detail: `${provider} is unavailable: ${reason.missingConfiguration} (${reason.blockingComponent})`,
    checks: reason.checks,
  };
}
