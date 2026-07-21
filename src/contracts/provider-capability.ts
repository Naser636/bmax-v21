/*
 * Provider Capability — Contract (FROZEN, Provider Capability Contract Version 1.0.0)
 *
 * Mission 3 — Provider Orchestrator Foundation.
 *
 * A "provider capability" is WHAT a provider can do for the Runtime (a kind of work), independent of
 * WHICH concrete provider does it. The Runtime always resolves a CAPABILITY first, then picks a
 * provider that serves it — capability-before-provider is the founding rule (Mission 3, item 6).
 *
 * This contract introduces NO coupling to any real provider and does NOT redefine the validated
 * execution port (EngineeringProviderPort in @/providers) — it only names the capability taxonomy
 * and the deterministic resolution result the Runtime owns.
 */

export const PROVIDER_CAPABILITY_CONTRACT_VERSION = "1.0.0";

/**
 * Capability identifier. Kept as an opaque string so new capabilities can be registered later
 * WITHOUT a contract change; v1 canonically defines the single "engineering" capability, which maps
 * to the existing, validated `missionRequiresProvider` predicate.
 */
export type ProviderCapabilityId = string;

/** The one capability defined at v1: code/engineering work on the repository. */
export const ENGINEERING_CAPABILITY: ProviderCapabilityId = "engineering";

/** All capability ids known to this build (extensible without breaking the contract). */
export const KNOWN_PROVIDER_CAPABILITIES: ReadonlyArray<ProviderCapabilityId> = [
  ENGINEERING_CAPABILITY,
];

/**
 * Result of the Runtime deciding which capability a mission needs. `needed:false` means the Runtime
 * handles the mission locally and NO provider is involved — the separation is preserved by default.
 */
export interface CapabilityResolution {
  providerCapabilityContractVersion: string;
  needed: boolean;
  capability: ProviderCapabilityId | null;
}
