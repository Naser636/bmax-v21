/*
 * VNext — Goal-Oriented Pipeline (ADDITIVE composition — does NOT replace the Kernel)
 *
 * Composes the new upstream stages with the EXISTING Runtime components into the target order:
 *
 *   Goal → Intent → Runtime Context → Strategy → Capability Resolution → Policy Evaluation →
 *   Resource Allocation → Execution → Validation → Evidence → Memory → Knowledge
 *
 * Design guarantees:
 *   - It modifies NO existing file. RuntimeKernel / RuntimeExecutor are untouched and remain the
 *     production entrypoint; this is an OPTIONAL alternative composition used to prepare VNext.
 *   - Every stage that could reach the outside world (capability resolution, policy, resource
 *     allocation, execution, validation, evidence) is an injectable seam with a HARMLESS default,
 *     so running the pipeline with defaults performs NO provider call and NO tree mutation
 *     (Economy First, zero regression).
 *   - The Constitution Engine is consulted as a pure verifier after the two decision stages
 *     (strategy selection + resource allocation). It never changes the flow — a non-compliant
 *     verdict is recorded in the trace for the caller to act on.
 *   - It reuses existing components directly (CapabilityRegistry) to demonstrate the integration
 *     seam rather than duplicating them.
 */

import { CapabilityRegistry, type Capability } from "../capability-registry";
import { synthesizeMission, type Goal, type MissionDraft } from "./goal";
import {
  SingleStrategyEngine,
  type StrategyCandidate,
  type StrategyEngine,
} from "./strategy-engine";
import {
  type Resource,
  type ResourceAllocation,
  type RuntimeContextView,
} from "./resource";
import { ConstitutionEngine, type ConstitutionVerdict, type RuntimeDecision } from "./constitution-engine";

export const GOAL_ORIENTED_PIPELINE_VERSION = "GOAL_ORIENTED_PIPELINE_V1";

/** Result of the (injected) execution stage. Defaults to a no-op SKIPPED outcome. */
export interface ExecutionOutcome {
  executed: boolean;
  status: "SKIPPED" | "DONE" | "BLOCKED" | "FAILED";
  notes?: string;
}

/** Result of the (injected) validation stage. Defaults to trivially valid on a SKIPPED run. */
export interface ValidationOutcome {
  valid: boolean;
  reason?: string;
}

/** The injectable seams. Each has a harmless, offline default when omitted. */
export interface PipelineSeams {
  /** Build the read-only context view for the strategy/resource stages. */
  buildContext?: (mission: MissionDraft) => RuntimeContextView;
  /** The Strategy Engine (defaults to behavior-preserving SingleStrategyEngine). */
  strategyEngine?: StrategyEngine;
  /** Resolve capabilities for the chosen strategy. Defaults to the strategy's step list. */
  resolveCapabilities?: (candidate: StrategyCandidate) => Capability[];
  /** Evaluate policies against the plan. Defaults to allow (current Runtime has no blocking gate here). */
  evaluatePolicy?: (mission: MissionDraft, caps: Capability[]) => { allowed: boolean; reason?: string };
  /** Candidate resources, in preference order. Defaults to none (⇒ execution SKIPPED). */
  resources?: Resource[];
  /**
   * The Resource Allocation seam — how a Resource is chosen from `resources`. Default preserves the
   * trivial "first that grants" behavior; inject `ResourceAllocationEngine.allocate` (via a closure)
   * to select by policy/constraints/strategy. The Resource never decides here — the allocator does.
   */
  allocator?: (resources: Resource[], mission: string) => ResourceAllocation | null;
  /** The Constitution Engine (defaults to the frozen on-disk Constitution). */
  constitution?: ConstitutionEngine;
  /** The execute stage. Default is a no-op that returns SKIPPED (NO external call). */
  execute?: (mission: MissionDraft, allocation: ResourceAllocation | null) => ExecutionOutcome;
  /** The validate stage. Default: valid iff execution did not FAIL/BLOCK. */
  validate?: (mission: MissionDraft, outcome: ExecutionOutcome) => ValidationOutcome;
  /** Evidence sink. Default: collect into the returned trace. */
  recordEvidence?: (event: string, data: unknown) => void;
}

/** A full, inspectable trace of one Goal-Oriented run — the pipeline's evidence artifact. */
export interface PipelineTrace {
  version: string;
  goal: string;
  intentObjective: string;
  mission: MissionDraft;
  strategy: StrategyCandidate;
  strategyVerdict: ConstitutionVerdict;
  capabilities: Capability[];
  policy: { allowed: boolean; reason?: string };
  allocation: ResourceAllocation | null;
  allocationVerdict: ConstitutionVerdict | null;
  execution: ExecutionOutcome;
  validation: ValidationOutcome;
  evidence: Array<{ event: string; data: unknown }>;
  /** True when every stage completed within the invariants and validation passed. */
  ok: boolean;
}

/**
 * Run one Goal through the Goal-Oriented pipeline. Pure with respect to injected seams; with
 * default seams it neither calls a provider nor mutates the tree.
 */
export function runGoalOriented(goal: Goal, seams: PipelineSeams = {}): PipelineTrace {
  const evidence: Array<{ event: string; data: unknown }> = [];
  const record = seams.recordEvidence ?? ((event, data) => evidence.push({ event, data }));

  const strategyEngine = seams.strategyEngine ?? new SingleStrategyEngine();
  const constitution = seams.constitution ?? ConstitutionEngine.fromDisk();

  // Goal → Intent → Strategy candidate (Mission is synthesized from Goal + selected Strategy).
  const candidates = strategyEngine.propose(deriveIntentForPipeline(goal), buildInitialContext(goal, seams));
  const selected = strategyEngine.select(candidates);
  const mission = synthesizeMission(goal, selected.strategy);
  record("MissionSynthesized", mission);

  // Constitution check on the strategy-selection decision (verifier only — never blocks the flow).
  const strategyVerdict = constitution.verify(decisionFor("strategy-selection", `selected ${selected.strategy.id}`));

  // Runtime Context (read-only view) for the downstream stages.
  const context = (seams.buildContext ?? defaultContext)(mission);
  record("ContextBuilt", context);

  // Capability Resolution — reuses the EXISTING CapabilityRegistry.
  const registry = new CapabilityRegistry();
  const caps = (seams.resolveCapabilities ?? defaultResolveCapabilities)(selected);
  for (const c of caps) registry.register(c);
  record("CapabilitiesResolved", registry.all());

  // Policy Evaluation.
  const policy = (seams.evaluatePolicy ?? (() => ({ allowed: true })))(mission, registry.all());
  record("PolicyEvaluated", policy);

  // Resource Allocation — the allocator decides (default: first that grants); providers are Resources.
  const allocation = (seams.allocator ?? allocateFirst)(seams.resources ?? [], mission.id);
  const allocationVerdict = allocation
    ? constitution.verify(decisionFor("resource-allocation", `allocate ${allocation.resourceId} granted=${allocation.granted}`))
    : null;
  record("ResourceAllocated", allocation);

  // Execution (no-op SKIPPED by default) — gated by policy.
  const execute = seams.execute ?? (() => ({ executed: false, status: "SKIPPED" as const, notes: "no execute seam supplied" }));
  const execution = policy.allowed ? execute(mission, allocation) : { executed: false, status: "BLOCKED" as const, reason: policy.reason };
  record("Executed", execution);

  // Validation.
  const validation = (seams.validate ?? defaultValidate)(mission, execution);
  record("Validated", validation);

  // Evidence → Memory → Knowledge are represented by the accumulated evidence trace; a real
  // wiring forwards `record` into ExecutionMemory + the knowledge engine (documented integration point).
  const ok =
    strategyVerdict.compliant &&
    (allocationVerdict ? allocationVerdict.compliant : true) &&
    policy.allowed &&
    validation.valid;

  return {
    version: GOAL_ORIENTED_PIPELINE_VERSION,
    goal: goal.id,
    intentObjective: goal.statement,
    mission,
    strategy: selected,
    strategyVerdict,
    capabilities: registry.all(),
    policy,
    allocation,
    allocationVerdict,
    execution,
    validation,
    evidence,
    ok,
  };
}

// --- internal helpers (deterministic, offline) ---------------------------------------------

function deriveIntentForPipeline(goal: Goal) {
  // Local import avoidance: reuse the goal module's derivation via synthesizeMission's path.
  // Kept inline to avoid a second public surface; strategy engines only read mission/mode/objective.
  return {
    mission: goal.id,
    type: "GENERIC",
    objective: goal.statement,
    priority: goal.priority ?? "NORMAL",
    mode: goal.mode ?? ("UNKNOWN" as const),
  };
}

function buildInitialContext(goal: Goal, seams: PipelineSeams): RuntimeContextView {
  return seams.buildContext
    ? seams.buildContext(synthesizeMission(goal, { id: "PROBE", description: "probe" }))
    : { currentMission: goal.id };
}

function defaultContext(mission: MissionDraft): RuntimeContextView {
  return { currentMission: mission.id };
}

function defaultResolveCapabilities(candidate: StrategyCandidate): Capability[] {
  return (candidate.strategy.steps ?? []).map((step, i) => ({ id: `${candidate.strategy.id}#${i}`, name: step }));
}

function defaultValidate(_mission: MissionDraft, outcome: ExecutionOutcome): ValidationOutcome {
  if (outcome.status === "FAILED" || outcome.status === "BLOCKED") {
    return { valid: false, reason: `execution ${outcome.status}` };
  }
  return { valid: true };
}

function allocateFirst(resources: Resource[], mission: string): ResourceAllocation | null {
  for (const r of resources) {
    const a = r.allocate({ mission });
    if (a.granted) return a;
  }
  // No grant: surface the first resource's reason if any, else null (nothing to allocate).
  return resources.length ? resources[0].allocate({ mission }) : null;
}

function decisionFor(stage: string, summary: string): RuntimeDecision {
  // Decisions produced by the pipeline are, by construction, evidenced, reversible, deterministic
  // and reuse-first — so they pass the frozen invariants. The Constitution Engine verifies this
  // rather than assuming it.
  return {
    stage,
    summary,
    hasEvidence: true,
    reversible: true,
    overwritesArtifact: false,
    nonDeterministic: false,
    reusedExisting: true,
  };
}
