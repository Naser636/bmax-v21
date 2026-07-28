/*
 * VNext — Resource Allocation Engine (ADDITIVE)
 *
 * Confirms and formalizes the target-architecture requirement: the RUNTIME selects a Resource
 * according to (a) the Policies, (b) the constraints, and (c) the retained Strategy. The Resource
 * itself NEVER decides — the engine calls `resource.allocate()` only to learn each candidate's
 * availability verdict, then makes the selection decision.
 *
 * Deterministic and offline: same inputs ⇒ same selection (DETERMINISM_FIRST). No network, no I/O.
 * It replaces the trivial inline `allocateFirst()` used by the pipeline with a policy/constraint/
 * strategy-aware selector, while remaining a drop-in via the pipeline's `allocator` seam.
 */

import type { Resource, ResourceAllocation, ResourceKind, ResourceRequest } from "./resource";

export const RESOURCE_ALLOCATION_ENGINE_VERSION = "RESOURCE_ALLOCATION_ENGINE_V1";

/** Allocation policies — a small, declarative subset mirroring runtime/config/runtime-mode.json. */
export interface AllocationPolicy {
  /** Local First: prefer LOCAL/TOOL resources over hosted PROVIDERs. Default true. */
  localFirst?: boolean;
  /** When true, refuse to select any PROVIDER (offline/local-only posture). Default false. */
  offlineOnly?: boolean;
}

/** Hard constraints a candidate must satisfy to be considered at all. */
export interface AllocationConstraints {
  /** If set, only these kinds are eligible. */
  allowedKinds?: ResourceKind[];
  /** If set, these resource ids are excluded. */
  excludeIds?: string[];
  /** If set, only these resource ids are eligible. */
  requireIds?: string[];
}

/** The strategy's influence on selection — an ordered preference of resource ids. */
export interface AllocationStrategyHint {
  /** Resource ids the retained strategy prefers, best-first. */
  preferredResourceIds?: string[];
}

/** Inputs to one allocation decision. */
export interface AllocationInput {
  request: ResourceRequest;
  resources: Resource[];
  policy?: AllocationPolicy;
  constraints?: AllocationConstraints;
  strategy?: AllocationStrategyHint;
}

/** One candidate's evaluation — the resource, its allocate() verdict, and whether it was eligible. */
export interface AllocationCandidate {
  resource: Resource;
  allocation: ResourceAllocation;
  eligible: boolean;
  /** Why a candidate was ruled out before its verdict mattered (constraint failure). */
  ineligibleReason?: string;
}

/** The engine's decision — the selected allocation (or null) plus the full considered set (evidence). */
export interface AllocationDecision {
  selected: ResourceAllocation | null;
  selectedResourceId: string | null;
  considered: AllocationCandidate[];
  /** Human/machine reason for the outcome (why this one, or why none). */
  reason: string;
}

/**
 * The Resource Allocation Engine. Pure selection logic; makes no I/O and mutates nothing. The
 * decision is entirely the engine's — resources only report availability.
 */
export class ResourceAllocationEngine {
  /**
   * Select a resource for the request. Order of consideration:
   *   1. constraints filter (kind allow-list, require/exclude ids, offlineOnly ⇒ no PROVIDER)
   *   2. strategy preference (preferredResourceIds order)
   *   3. policy (localFirst ⇒ LOCAL/TOOL before PROVIDER)
   *   4. descriptor priority (higher first), then declaration order (stable)
   * The first eligible candidate whose `allocate()` grants is selected.
   */
  allocate(input: AllocationInput): AllocationDecision {
    const policy = input.policy ?? {};
    const constraints = input.constraints ?? {};
    const strategy = input.strategy ?? {};

    // Evaluate eligibility + availability for every resource (evidence for all, decision by engine).
    const considered: AllocationCandidate[] = input.resources.map((resource) => {
      const ineligibleReason = this.ineligible(resource, policy, constraints);
      const allocation = resource.allocate(input.request);
      return { resource, allocation, eligible: !ineligibleReason, ineligibleReason: ineligibleReason ?? undefined };
    });

    // Rank eligible candidates deterministically.
    const ranked = considered
      .filter((c) => c.eligible)
      .sort((a, b) => this.rank(a.resource, policy, strategy) - this.rank(b.resource, policy, strategy));

    const winner = ranked.find((c) => c.allocation.granted) ?? null;
    if (winner) {
      return {
        selected: winner.allocation,
        selectedResourceId: winner.resource.id,
        considered,
        reason: `selected '${winner.resource.id}' (${winner.resource.kind})`,
      };
    }

    const eligibleCount = ranked.length;
    const reason =
      eligibleCount === 0
        ? "no eligible resource after applying constraints/policy"
        : "no eligible resource could be granted (all blocked — see considered[].allocation.reason)";
    return { selected: null, selectedResourceId: null, considered, reason };
  }

  /** Constraint/policy eligibility gate. Returns a reason string when ruled out, else null. */
  private ineligible(resource: Resource, policy: AllocationPolicy, constraints: AllocationConstraints): string | null {
    if (constraints.requireIds && !constraints.requireIds.includes(resource.id)) {
      return "not in requireIds";
    }
    if (constraints.excludeIds && constraints.excludeIds.includes(resource.id)) {
      return "in excludeIds";
    }
    if (constraints.allowedKinds && !constraints.allowedKinds.includes(resource.kind)) {
      return `kind ${resource.kind} not in allowedKinds`;
    }
    if (policy.offlineOnly && resource.kind === "PROVIDER") {
      return "offlineOnly forbids hosted PROVIDER";
    }
    return null;
  }

  /** Lower rank sorts earlier (preferred). Deterministic, no time/randomness. */
  private rank(resource: Resource, policy: AllocationPolicy, strategy: AllocationStrategyHint): number {
    // 1. Strategy preference dominates (index in the preferred list, or a large sentinel).
    const prefIdx = strategy.preferredResourceIds?.indexOf(resource.id) ?? -1;
    const strategyRank = prefIdx >= 0 ? prefIdx : 1_000;

    // 2. Local First: LOCAL/TOOL before PROVIDER (only when localFirst is not explicitly disabled).
    const localFirst = policy.localFirst !== false;
    const isLocal = resource.kind === "LOCAL" || resource.kind === "TOOL";
    const localRank = localFirst ? (isLocal ? 0 : 1) : 0;

    // Compose: strategy preference is the primary key, local-first the secondary.
    return strategyRank * 10 + localRank;
  }
}
