/*
 * Provider Orchestrator — Capability implementation
 *
 * Mission 3 — Provider Orchestrator Foundation. Runtime-owned capability that, for a given mission:
 *   1. resolves the needed CAPABILITY first (reusing the validated `missionRequiresProvider`), then
 *   2. deterministically selects a registered provider that serves that capability.
 *
 * Founding rules:
 *   - CAPABILITY-BEFORE-PROVIDER: a provider is only ever considered AFTER a capability is resolved
 *     (structurally enforced — selectProvider requires a capability id, and orchestrate() calls it
 *     only on the `needed` branch).
 *   - RUNTIME OWNS THE DECISION: ranking is a pure function of Runtime-supplied metadata (priority,
 *     then id). Providers never self-select.
 *   - NO PROVIDER COUPLING: the orchestrator imports only contracts + the routing predicate; it does
 *     NOT reference any concrete provider adapter and NEVER executes one (foundation only).
 * Pure aside from its in-memory registry; deterministic; error-as-data; no filesystem/network I/O.
 */

import { missionRequiresProvider } from "@/providers";
import {
  ENGINEERING_CAPABILITY,
  PROVIDER_CAPABILITY_CONTRACT_VERSION,
  type CapabilityResolution,
  type ProviderCapabilityId,
} from "@/contracts/provider-capability";
import type { ProviderAdapterDescriptor } from "@/contracts/provider-adapter";
import {
  PROVIDER_ORCHESTRATOR_CONTRACT_VERSION,
  type OrchestrationOutcome,
  type OrchestrationRequest,
  type OrchestrationResult,
  type ProviderOrchestratorDescription,
  type ProviderOrchestratorError,
  type ProviderOrchestratorErrorCode,
  type RegisterResult,
} from "@/contracts/provider-orchestrator";

const CAPABILITY_NAME = "Provider Orchestrator";

interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

export class ProviderOrchestrator {
  // In-memory registry keyed by provider id. Supports registering MULTIPLE providers (item 5).
  private readonly registry = new Map<string, ProviderAdapterDescriptor>();

  describe(): ProviderOrchestratorDescription {
    return {
      name: CAPABILITY_NAME,
      class: "capability",
      owner: "Runtime",
      providerOrchestratorContractVersion: PROVIDER_ORCHESTRATOR_CONTRACT_VERSION,
      status: "READY",
    };
  }

  initialize(): { ready: true } {
    return { ready: true };
  }

  // --- registration (item 5) ---------------------------------------------

  /** Register a provider descriptor. Rejects a malformed descriptor and a duplicate id. */
  register(descriptor: ProviderAdapterDescriptor): RegisterResult {
    const malformed = this.validateDescriptor(descriptor);
    if (malformed) return { ok: false, error: malformed };
    if (this.registry.has(descriptor.id)) {
      return {
        ok: false,
        error: this.error("DUPLICATE_PROVIDER", "", `A provider with id "${descriptor.id}" is already registered.`),
      };
    }
    // Store a defensive copy so later mutation of the caller's object cannot change selection.
    this.registry.set(descriptor.id, {
      id: descriptor.id,
      capabilities: [...descriptor.capabilities],
      priority: descriptor.priority,
      enabled: descriptor.enabled,
    });
    return { ok: true };
  }

  /** All registered providers, ordered by id (stable snapshot; copies). */
  listProviders(): ProviderAdapterDescriptor[] {
    return [...this.registry.values()]
      .map((d) => ({ id: d.id, capabilities: [...d.capabilities], priority: d.priority, enabled: d.enabled }))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  // --- capability resolution (item 6: capability BEFORE provider) --------

  /**
   * Decide which capability a mission needs — the FIRST step, always. Reuses the validated
   * `missionRequiresProvider` predicate (no duplication, no governance change): an engineering
   * mission maps to the ENGINEERING capability; anything else needs no provider.
   */
  resolveCapability(mission: OrchestrationRequest["mission"]): CapabilityResolution {
    const needed = missionRequiresProvider(mission);
    return {
      providerCapabilityContractVersion: PROVIDER_CAPABILITY_CONTRACT_VERSION,
      needed,
      capability: needed ? ENGINEERING_CAPABILITY : null,
    };
  }

  // --- deterministic provider selection (item 4) -------------------------

  /**
   * Rank the enabled providers serving `capability` by (priority desc, id asc) and return them.
   * Pure function of the registry; registration order never affects the result.
   */
  private rankFor(capability: ProviderCapabilityId): ProviderAdapterDescriptor[] {
    return [...this.registry.values()]
      .filter((d) => d.enabled && d.capabilities.includes(capability))
      .map((d) => ({ id: d.id, capabilities: [...d.capabilities], priority: d.priority, enabled: d.enabled }))
      .sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority; // higher priority first
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; // deterministic tie-break
      });
  }

  // --- top-level orchestration (item 1) ----------------------------------

  /**
   * Orchestrate (deterministic):
   *   1. version + structural gate
   *   2. resolve capability FIRST
   *      - not needed        → NO_PROVIDER_NEEDED (Runtime handles locally; no provider touched)
   *   3. select a provider for that capability
   *      - a ranked provider → PROVIDER_SELECTED (highest priority, id tie-break)
   *      - none              → NO_PROVIDER_AVAILABLE
   */
  orchestrate(request: OrchestrationRequest): OrchestrationResult {
    const received =
      request && typeof request.providerOrchestratorContractVersion === "string"
        ? request.providerOrchestratorContractVersion
        : "";

    if (!request || typeof request !== "object") {
      return { ok: false, error: this.error("INPUTS_MALFORMED", received, "OrchestrationRequest is missing or not an object.") };
    }
    if (typeof request.providerOrchestratorContractVersion !== "string") {
      return { ok: false, error: this.error("INPUTS_MALFORMED", received, "providerOrchestratorContractVersion is missing or not a string.") };
    }
    if (typeof request.mission !== "object" || request.mission === null) {
      return { ok: false, error: this.error("INPUTS_MALFORMED", received, "mission is missing or not an object.") };
    }
    const incompatible = this.checkContractVersion(received);
    if (incompatible) return { ok: false, error: incompatible };

    // Step 2 — capability FIRST.
    const resolution = this.resolveCapability(request.mission);
    if (!resolution.needed || resolution.capability === null) {
      return { ok: true, outcome: this.outcome("NO_PROVIDER_NEEDED", null, null, []) };
    }

    // Step 3 — only now is a provider considered.
    const considered = this.rankFor(resolution.capability);
    if (considered.length === 0) {
      return { ok: true, outcome: this.outcome("NO_PROVIDER_AVAILABLE", resolution.capability, null, considered) };
    }
    return { ok: true, outcome: this.outcome("PROVIDER_SELECTED", resolution.capability, considered[0], considered) };
  }

  // --- helpers ------------------------------------------------------------

  private outcome(
    decision: OrchestrationOutcome["decision"],
    capability: ProviderCapabilityId | null,
    provider: ProviderAdapterDescriptor | null,
    considered: ProviderAdapterDescriptor[],
  ): OrchestrationOutcome {
    return {
      providerOrchestratorContractVersion: PROVIDER_ORCHESTRATOR_CONTRACT_VERSION,
      decision,
      capability,
      provider,
      considered,
    };
  }

  private validateDescriptor(d: ProviderAdapterDescriptor): ProviderOrchestratorError | null {
    const bad = (message: string) => this.error("INPUTS_MALFORMED", "", message);
    if (!d || typeof d !== "object") return bad("ProviderAdapterDescriptor is missing or not an object.");
    if (typeof d.id !== "string" || d.id.length === 0) return bad("descriptor.id is missing or empty.");
    if (!Array.isArray(d.capabilities) || !d.capabilities.every((c) => typeof c === "string" && c.length > 0)) {
      return bad("descriptor.capabilities must be an array of non-empty strings.");
    }
    if (typeof d.priority !== "number" || !Number.isFinite(d.priority)) return bad("descriptor.priority must be a finite number.");
    if (typeof d.enabled !== "boolean") return bad("descriptor.enabled must be a boolean.");
    return null;
  }

  private checkContractVersion(received: string): ProviderOrchestratorError | null {
    const supported = this.parseSemVer(PROVIDER_ORCHESTRATOR_CONTRACT_VERSION);
    const got = this.parseSemVer(received);
    if (!got) {
      return this.error("INPUTS_MALFORMED", received, "providerOrchestratorContractVersion is not a valid MAJOR.MINOR.PATCH version.");
    }
    if (got.major !== supported!.major) {
      return this.error(
        "PROVIDER_ORCHESTRATOR_CONTRACT_INCOMPATIBLE",
        received,
        `Incompatible Provider Orchestrator Contract Version: supported ${PROVIDER_ORCHESTRATOR_CONTRACT_VERSION}, received ${received}.`,
      );
    }
    return null;
  }

  private parseSemVer(value: string): SemVer | null {
    if (typeof value !== "string") return null;
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());
    if (!m) return null;
    return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
  }

  private error(
    code: ProviderOrchestratorErrorCode,
    received: string,
    message: string,
  ): ProviderOrchestratorError {
    return { code, supported: PROVIDER_ORCHESTRATOR_CONTRACT_VERSION, received, message };
  }
}

export { CAPABILITY_NAME };
