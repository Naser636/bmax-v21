/*
 * Provider Adapter — Contract (FROZEN, Provider Adapter Contract Version 1.0.0)
 *
 * Mission 3 — Provider Orchestrator Foundation.
 *
 * A ProviderAdapterDescriptor is the REGISTRATION + SELECTION metadata of a provider: its id, the
 * capabilities it serves, a Runtime-assigned priority, and whether it is enabled. It is PURE
 * metadata — it deliberately carries no execution surface, so the orchestrator can select
 * deterministically with ZERO coupling to any concrete provider.
 *
 * The actual execution port stays the already-validated `EngineeringProviderPort` (@/providers);
 * this contract does not redefine or replace it. Binding a descriptor to a live port is the
 * Runtime's job, OUTSIDE this foundation (no real provider is integrated in Mission 3).
 */

import type { ProviderCapabilityId } from "@/contracts/provider-capability";

export const PROVIDER_ADAPTER_CONTRACT_VERSION = "1.0.0";

export interface ProviderAdapterDescriptor {
  /** Unique provider id (e.g. "claude"). Uniqueness is enforced at registration. */
  id: string;
  /** Capabilities this provider can serve. Empty ⇒ it serves nothing and is never selected. */
  capabilities: ProviderCapabilityId[];
  /** Runtime-owned ranking; higher is preferred. Ties are broken deterministically by id. */
  priority: number;
  /** Disabled providers are registered but never selected. */
  enabled: boolean;
}
