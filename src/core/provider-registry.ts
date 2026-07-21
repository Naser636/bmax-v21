/*
 * Provider Registry — Capability implementation
 *
 * Mission 4 — Provider Registry Foundation. Runtime-owned capability that manages the set of
 * registered provider descriptors: register, de-register, look up and discover by capability.
 *
 * Invariants:
 *   - NEVER DECIDES: discovery filters and returns descriptors in a stable order; it does NOT rank
 *     or pick a "best" provider (that is the Provider Orchestrator's job, Mission 3).
 *   - NEVER EXECUTES: it holds only metadata descriptors; no provider is ever invoked.
 *   - UNIQUE IDS: registering an already-present id is rejected.
 *   - IMMUTABLE PUBLIC OUTPUTS: every descriptor stored and returned is a deep, deeply-FROZEN copy,
 *     so neither the caller's original object nor a returned reference can mutate registry state.
 *   - NO PROVIDER COUPLING: imports only contracts; references no concrete provider adapter.
 * Pure aside from its in-memory map; deterministic; error-as-data; no filesystem/network I/O.
 */

import type { ProviderAdapterDescriptor } from "@/contracts/provider-adapter";
import type { ProviderCapabilityId } from "@/contracts/provider-capability";
import {
  PROVIDER_REGISTRY_CONTRACT_VERSION,
  type DeregisterProviderInputs,
  type DeregisterProviderResult,
  type ProviderRegistryDescription,
  type ProviderRegistryError,
  type ProviderRegistryErrorCode,
  type RegisterProviderInputs,
  type RegisterProviderResult,
} from "@/contracts/provider-registry";

const CAPABILITY_NAME = "Provider Registry";

interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

export class ProviderRegistry {
  private readonly registry = new Map<string, Readonly<ProviderAdapterDescriptor>>();

  describe(): ProviderRegistryDescription {
    return {
      name: CAPABILITY_NAME,
      class: "capability",
      owner: "Runtime",
      providerRegistryContractVersion: PROVIDER_REGISTRY_CONTRACT_VERSION,
      status: "READY",
    };
  }

  initialize(): { ready: true } {
    return { ready: true };
  }

  // --- registration (items 3, 4) -----------------------------------------

  register(inputs: RegisterProviderInputs): RegisterProviderResult {
    const received =
      inputs && typeof inputs.providerRegistryContractVersion === "string"
        ? inputs.providerRegistryContractVersion
        : "";

    if (!inputs || typeof inputs !== "object") {
      return { ok: false, error: this.error("INPUTS_MALFORMED", received, "RegisterProviderInputs is missing or not an object.") };
    }
    const incompatible = this.checkContractVersion(received);
    if (incompatible) return { ok: false, error: incompatible };

    const malformed = this.validateDescriptor(inputs.descriptor, received);
    if (malformed) return { ok: false, error: malformed };

    if (this.registry.has(inputs.descriptor.id)) {
      return {
        ok: false,
        error: this.error("DUPLICATE_PROVIDER", received, `A provider with id "${inputs.descriptor.id}" is already registered.`),
      };
    }

    const frozen = this.freezeCopy(inputs.descriptor);
    this.registry.set(frozen.id, frozen);
    return { ok: true, descriptor: frozen };
  }

  deregister(inputs: DeregisterProviderInputs): DeregisterProviderResult {
    const received =
      inputs && typeof inputs.providerRegistryContractVersion === "string"
        ? inputs.providerRegistryContractVersion
        : "";

    if (!inputs || typeof inputs !== "object") {
      return { ok: false, error: this.error("INPUTS_MALFORMED", received, "DeregisterProviderInputs is missing or not an object.") };
    }
    const incompatible = this.checkContractVersion(received);
    if (incompatible) return { ok: false, error: incompatible };
    if (typeof inputs.id !== "string" || inputs.id.length === 0) {
      return { ok: false, error: this.error("INPUTS_MALFORMED", received, "id is missing or empty.") };
    }
    if (!this.registry.has(inputs.id)) {
      return { ok: false, error: this.error("PROVIDER_NOT_FOUND", received, `No provider registered with id "${inputs.id}".`) };
    }
    this.registry.delete(inputs.id);
    return { ok: true, id: inputs.id };
  }

  // --- discovery / management (read-only, no decision) -------------------

  has(id: string): boolean {
    return typeof id === "string" && this.registry.has(id);
  }

  /** Frozen copy of one provider, or null. */
  get(id: string): Readonly<ProviderAdapterDescriptor> | null {
    if (typeof id !== "string") return null;
    const d = this.registry.get(id);
    return d ? this.freezeCopy(d) : null;
  }

  /** All providers, frozen copies, ordered by id — a stable snapshot. */
  list(): ReadonlyArray<Readonly<ProviderAdapterDescriptor>> {
    return [...this.registry.values()]
      .map((d) => this.freezeCopy(d))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  /**
   * Discover the ENABLED providers that serve `capability`, frozen copies, ordered by id. This is a
   * management/discovery filter only — it applies NO ranking and picks NO winner (that is the
   * Provider Orchestrator's decision).
   */
  discover(capability: ProviderCapabilityId): ReadonlyArray<Readonly<ProviderAdapterDescriptor>> {
    return this.list().filter((d) => d.enabled && d.capabilities.includes(capability));
  }

  // --- helpers ------------------------------------------------------------

  /** Deep copy + deep freeze so registry state is immutable through any returned/stored reference. */
  private freezeCopy(d: ProviderAdapterDescriptor): Readonly<ProviderAdapterDescriptor> {
    const capabilities = Object.freeze([...d.capabilities]);
    return Object.freeze({ id: d.id, capabilities, priority: d.priority, enabled: d.enabled }) as Readonly<ProviderAdapterDescriptor>;
  }

  private validateDescriptor(d: ProviderAdapterDescriptor, received: string): ProviderRegistryError | null {
    const bad = (message: string) => this.error("INPUTS_MALFORMED", received, message);
    if (!d || typeof d !== "object") return bad("descriptor is missing or not an object.");
    if (typeof d.id !== "string" || d.id.length === 0) return bad("descriptor.id is missing or empty.");
    if (!Array.isArray(d.capabilities) || !d.capabilities.every((c) => typeof c === "string" && c.length > 0)) {
      return bad("descriptor.capabilities must be an array of non-empty strings.");
    }
    if (typeof d.priority !== "number" || !Number.isFinite(d.priority)) return bad("descriptor.priority must be a finite number.");
    if (typeof d.enabled !== "boolean") return bad("descriptor.enabled must be a boolean.");
    return null;
  }

  private checkContractVersion(received: string): ProviderRegistryError | null {
    const supported = this.parseSemVer(PROVIDER_REGISTRY_CONTRACT_VERSION);
    const got = this.parseSemVer(received);
    if (!got) {
      return this.error("INPUTS_MALFORMED", received, "providerRegistryContractVersion is not a valid MAJOR.MINOR.PATCH version.");
    }
    if (got.major !== supported!.major) {
      return this.error(
        "PROVIDER_REGISTRY_CONTRACT_INCOMPATIBLE",
        received,
        `Incompatible Provider Registry Contract Version: supported ${PROVIDER_REGISTRY_CONTRACT_VERSION}, received ${received}.`,
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
    code: ProviderRegistryErrorCode,
    received: string,
    message: string,
  ): ProviderRegistryError {
    return { code, supported: PROVIDER_REGISTRY_CONTRACT_VERSION, received, message };
  }
}

export { CAPABILITY_NAME };
