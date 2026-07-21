/*
 * Provider Orchestrator — Contract (FROZEN, Provider Orchestrator Contract Version 1.0.0)
 *
 * Mission 3 — Provider Orchestrator Foundation.
 *
 * IO surface for the orchestrator core. The orchestrator is a Runtime-owned capability: given a
 * mission, it resolves the needed CAPABILITY first, then deterministically selects a registered
 * provider that serves it. It NEVER executes a provider (foundation only) and NEVER decides on its
 * own — every ranking input is Runtime-supplied metadata. Error-as-data, no I/O.
 */

import type { RoutableMission } from "@/providers";
import type { ProviderCapabilityId } from "@/contracts/provider-capability";
import type { ProviderAdapterDescriptor } from "@/contracts/provider-adapter";

export const PROVIDER_ORCHESTRATOR_CONTRACT_VERSION = "1.0.0";

export interface OrchestrationRequest {
  providerOrchestratorContractVersion: string;
  /** Minimal mission shape the validated `missionRequiresProvider` predicate consumes. */
  mission: RoutableMission;
}

export type OrchestrationDecision =
  | "NO_PROVIDER_NEEDED" // Runtime handles it locally; capability-before-provider still honoured.
  | "PROVIDER_SELECTED"
  | "NO_PROVIDER_AVAILABLE"; // a capability was needed but no enabled provider serves it.

export interface OrchestrationOutcome {
  providerOrchestratorContractVersion: string;
  decision: OrchestrationDecision;
  /** The capability resolved FIRST (null only when no provider is needed). */
  capability: ProviderCapabilityId | null;
  /** The selected provider descriptor (only when decision === "PROVIDER_SELECTED"). */
  provider: ProviderAdapterDescriptor | null;
  /** Providers considered for the capability, in the deterministic order they were ranked. */
  considered: ProviderAdapterDescriptor[];
}

export type ProviderOrchestratorErrorCode =
  | "INPUTS_MALFORMED"
  | "PROVIDER_ORCHESTRATOR_CONTRACT_INCOMPATIBLE"
  | "DUPLICATE_PROVIDER";

export interface ProviderOrchestratorError {
  code: ProviderOrchestratorErrorCode;
  supported: string;
  received: string;
  message: string;
}

export type RegisterResult =
  | { ok: true }
  | { ok: false; error: ProviderOrchestratorError };

export type OrchestrationResult =
  | { ok: true; outcome: OrchestrationOutcome }
  | { ok: false; error: ProviderOrchestratorError };

export interface ProviderOrchestratorDescription {
  name: string;
  class: "capability";
  owner: "Runtime";
  providerOrchestratorContractVersion: string;
  status: "READY";
}
