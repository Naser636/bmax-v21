/*
 * VNext — Resource abstraction (ADDITIVE extension point)
 *
 * Target-architecture rule: "Remplacer conceptuellement le Provider par une abstraction
 * Resource. Les Providers existants deviennent des implémentations de Resource. Aucun
 * changement de comportement ne doit être introduit."
 *
 * A `Resource` is anything the Runtime allocates to execute a stage — an engineering
 * provider (Claude/OpenAI) today, but also, later, compute/quota/human-review/local-LLM.
 * The existing provider surface (src/providers/provider-port.ts +
 * provider-failover-engine.ts) is NOT changed; instead `ProviderResource` ADAPTS it to the
 * Resource contract. Because nothing in the current Runtime calls `Resource` yet, behavior
 * is byte-identical — this is pure additive glue at the Runtime edge.
 */

import type { RuntimeState } from "../runtime-state";

export const RESOURCE_LAYER_VERSION = "RESOURCE_LAYER_V1";

/**
 * Kinds of resource the Runtime can allocate. Providers are one kind. `TOOL` covers non-LLM
 * execution resources (OCR, search engine, compiler, internal scripts). This union is only ever
 * EXTENDED (never narrowed), so adding a kind is backward-compatible — existing values stay valid.
 */
export type ResourceKind = "PROVIDER" | "COMPUTE" | "QUOTA" | "HUMAN" | "LOCAL" | "TOOL";

/** A minimal, provider-agnostic view of the Runtime Context the strategy/resource stages read. */
export interface RuntimeContextView {
  currentMission: string | null;
  state?: RuntimeState;
  /** Free-form facts a real context builder can attach (branch, budget, …). Read-only. */
  facts?: Readonly<Record<string, unknown>>;
}

/** A request to allocate a resource for a mission stage. Pure data. */
export interface ResourceRequest {
  mission: string;
  /** What the caller needs the resource for (advisory; used for evidence/routing). */
  purpose?: string;
}

/** The verdict of an allocation attempt — always returned as data, never thrown. */
export interface ResourceAllocation {
  resourceId: string;
  kind: ResourceKind;
  /** Whether the resource can be used right now. */
  granted: boolean;
  /** When not granted: the precise reason (mirrors the provider failover vocabulary). */
  reason: string | null;
  /** When not granted: the single next action to make it usable. */
  nextAction: string | null;
}

/**
 * The Resource contract. `allocate()` answers "can I use you, and why/why not" WITHOUT
 * performing the work — the actual execute stage is invoked separately by the pipeline,
 * keeping resource *selection* and resource *use* on distinct seams (ONE_RESPONSIBILITY).
 */
export interface Resource {
  readonly id: string;
  readonly kind: ResourceKind;
  allocate(request: ResourceRequest): ResourceAllocation;
}

/**
 * Shape the ProviderResource needs from the EXISTING provider layer, expressed as a tiny
 * structural port so this module imports no provider internals (keeps the foundation frozen
 * and the adapter unit-testable with an injected stub). A real wiring passes an object backed
 * by `runMissionWithFailover` / the provider factory availability probe.
 */
export interface ProviderAvailabilityProbe {
  /** Provider identity (e.g. "claude", "openai"). */
  provider: string;
  /** True when the provider can run right now (from provider-availability). */
  available: boolean;
  /** Precise blocker when unavailable (missing config/component). */
  reason?: string | null;
  /** Single next action to make it usable. */
  nextAction?: string | null;
}

/**
 * Adapts an EXISTING engineering provider (via its availability probe) to the Resource
 * contract. This is the bridge that lets Providers "become implementations of Resource"
 * without editing provider-port.ts or provider-failover-engine.ts. Behavior-neutral: it only
 * re-expresses the availability verdict the provider layer already computes.
 */
export class ProviderResource implements Resource {
  readonly kind: ResourceKind = "PROVIDER";

  constructor(private readonly probe: ProviderAvailabilityProbe) {}

  get id(): string {
    return `provider:${this.probe.provider}`;
  }

  allocate(): ResourceAllocation {
    return {
      resourceId: this.id,
      kind: this.kind,
      granted: this.probe.available,
      reason: this.probe.available ? null : this.probe.reason ?? "provider unavailable",
      nextAction: this.probe.available ? null : this.probe.nextAction ?? null,
    };
  }
}
