/*
 * Provider Registry — Contract (FROZEN, Provider Registry Contract Version 1.0.0)
 *
 * Mission 4 — Provider Registry Foundation.
 *
 * The Registry is responsible ONLY for registration, discovery and management of provider
 * descriptors. It NEVER decides (selection belongs to the Provider Orchestrator, Mission 3) and
 * NEVER executes (execution belongs to the validated EngineeringProviderPort). It reuses the
 * already-frozen `ProviderAdapterDescriptor` (Mission 3) and introduces NO coupling to any concrete
 * provider. Pure, deterministic, no I/O.
 */

import type { ProviderAdapterDescriptor } from "@/contracts/provider-adapter";
import type { ProviderCapabilityId } from "@/contracts/provider-capability";

export const PROVIDER_REGISTRY_CONTRACT_VERSION = "1.0.0";

/** Versioned envelope for a registration request. */
export interface RegisterProviderInputs {
  providerRegistryContractVersion: string;
  descriptor: ProviderAdapterDescriptor;
}

/** Versioned envelope for a de-registration request. */
export interface DeregisterProviderInputs {
  providerRegistryContractVersion: string;
  id: string;
}

export type ProviderRegistryErrorCode =
  | "INPUTS_MALFORMED"
  | "PROVIDER_REGISTRY_CONTRACT_INCOMPATIBLE"
  | "DUPLICATE_PROVIDER"
  | "PROVIDER_NOT_FOUND";

export interface ProviderRegistryError {
  code: ProviderRegistryErrorCode;
  supported: string;
  received: string;
  message: string;
}

export type RegisterProviderResult =
  | { ok: true; descriptor: Readonly<ProviderAdapterDescriptor> }
  | { ok: false; error: ProviderRegistryError };

export type DeregisterProviderResult =
  | { ok: true; id: string }
  | { ok: false; error: ProviderRegistryError };

export interface ProviderRegistryDescription {
  name: string;
  class: "capability";
  owner: "Runtime";
  providerRegistryContractVersion: string;
  status: "READY";
}

/** Discovery filter: a capability the caller is looking for (management/discovery only, no ranking). */
export type ProviderDiscoveryQuery = ProviderCapabilityId;
