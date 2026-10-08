/*
 * Runtime Autonomy — Contracts
 *
 * Frozen contract surface for RUNTIME_AUTONOMY_DESIGN_v1.md (Autonomy Contract Version 1.0.0).
 * Runtime Autonomy is a Capability of the Runtime engine — NOT a new engine and NOT a new
 * foundation (design §0, §1). It is pure orchestration over existing components: it selects the
 * next mission, generates its Mission Contract, launches the EXISTING pipeline, gathers evidence
 * from EXISTING capabilities, defers the completion decision entirely to the Release Manager,
 * archives, and advances — until the Master Plan is exhausted or a blocking gate halts it.
 *
 * Founding invariant (design §0): the Autonomy Cycle never judges quality and never decides
 * completion itself. Only the Release Manager's RELEASE / NO_RELEASE decision has authority.
 *
 * These types are the ONLY coupling between the pure Autonomy core and the Runtime. All impure
 * effects (reading plan state, running the pipeline, gathering evidence, archiving) are injected
 * through the AutonomyRuntimePorts interface, so the core stays deterministic and testable.
 */

import type {
  ReleaseArtifactRef,
  ReleaseManagerError,
  ReleaseRecord,
  ReleaseSource,
  ValidationEvidence,
} from "@/contracts/release";
import type { DocumentationProof } from "@/contracts/documentation";

/** Autonomy Contract Version supported by this build of the capability (design §5). */
export const AUTONOMY_CONTRACT_VERSION = "1.0.0";

/**
 * Deterministic selection inputs, re-read every cycle so the growing Mission Ledger drives
 * termination (design §2 Stage 1, §3). Sourced from existing Runtime artifacts:
 *   - masterPlanObjectives : ordered NEXT_OBJECTIVES from runtime/brain/MASTER_PLAN.md
 *   - missingCapabilities  : capability-registry.json.missingCapabilities
 *   - completedMissions    : missions already recorded/released in mission-ledger.json
 */
export interface AutonomyPlanState {
  masterPlanObjectives: string[];
  missingCapabilities: string[];
  completedMissions: string[];
}

/**
 * A Mission Contract, conforming to the EXISTING runtime/missions/*.json schema (design §2 Stage 2).
 * Runtime Autonomy assembles it from the selected objective; it defines no new contract type.
 */
export interface MissionContract {
  mission: string;
  priority: string;
  mode: string;
  objectives: Array<{
    id: string;
    goal: string;
    done_when: string[];
  }>;
  definition_of_done: string[];
  completion: string[];
}

/**
 * Structured diagnostics for a FAILED pipeline launch (design §2 Stage 3).
 *
 * The founding rule of this seam: a failure is NEVER hidden behind a bare boolean. When
 * `pipelineOk` is false the outcome carries the real reason so the halt is self-explanatory.
 * Every field except `stage`/`reason`/`message` is optional and populated ONLY when actually
 * observed — no field is ever invented. Kept as plain data (no Error, no provider coupling) so it
 * flows unchanged from the provider seam through the pure core into the halt.
 */
export interface PipelineFailure {
  /** Which stage produced the failure — e.g. "provider-execution", "scope-enforcement", "local-pipeline". */
  stage: string;
  /** Short machine code for the failure class — e.g. the provider classification or "NON_ZERO_EXIT". */
  reason: string;
  /** Human-readable summary of what went wrong. */
  message: string;
  /** Process exit code when a process was launched (null when killed by signal / never started). */
  exitCode?: number | null;
  /** Provider / launcher identity that produced the failure (e.g. "claude-code", "odg-run.js"). */
  provider?: string;
  /** Captured standard error, when available. */
  stderr?: string;
  /** Captured standard output, when available. */
  stdout?: string;
  /** Thrown-exception message, when the failure originated from an exception. */
  exception?: string;
  /** Provider-certified blocker text, when the provider reported a BLOCKED stop. */
  blocker?: string;
  /** Working-tree paths changed outside the mission's authorized scope (contract §9). */
  unauthorizedChanges?: string[];
}

/** Result of launching the existing pipeline (design §2 Stage 3). Never modifies odg-run.js. */
export interface PipelineOutcome {
  pipelineOk: boolean;
  /**
   * Present iff `pipelineOk === false`. Carries the real, structured reason for the failure so the
   * core can build a self-explanatory halt instead of surfacing an opaque `{ pipelineOk: false }`.
   */
  diagnostics?: PipelineFailure;
}

/**
 * Evidence gathered from existing capabilities after execution (design §2 Stage 4).
 * Deliberately partial / nullable: the Release Manager is the component designed to detect and
 * report incomplete evidence, so absent pieces flow through to it and become EVIDENCE_INCOMPLETE.
 */
export interface ReleaseEvidence {
  validation: Partial<ValidationEvidence>;
  source: Partial<ReleaseSource>;
  documentationProof: DocumentationProof | null;
  artifacts: ReleaseArtifactRef[];
  previousReleaseRef: string | null;
}

/**
 * Injected effect ports — every impure operation belongs to an existing component (design Invariant 3).
 * The core calls these; a Runtime adapter implements them over the real Runtime (see
 * src/runtime/autonomy-runtime-adapter.ts). Ports may throw; the core converts throws into
 * deterministic halts (error-as-data).
 */
export interface AutonomyRuntimePorts {
  /** Stage 1 — re-read selection inputs from existing artifacts. */
  readPlanState(): AutonomyPlanState;
  /** Stage 2 — assemble the Mission Contract (reuse interpreter / intent / loader). */
  generateContract(mission: string): MissionContract;
  /** Stage 3 — launch the EXISTING pipeline (odg-run.js); business logic untouched. */
  runPipeline(mission: string): PipelineOutcome;
  /** Stage 4 — collect evidence from existing capabilities (verify / doc-proof / artifacts). */
  gatherEvidence(mission: string): ReleaseEvidence;
  /** Stage 6 — archive the released mission via the existing Mission Ledger. */
  archive(mission: string, record: ReleaseRecord): void;
}

/** Configuration for a run (design §5). */
export interface AutonomyRunConfig {
  autonomyContractVersion: string;
  /** Defensive upper bound; real termination is plan exhaustion + progress tracking (design §3). */
  maxCycles?: number;
}

/** Why the cycle stopped (design §3 termination). */
export type AutonomyStatus =
  | "PLAN_COMPLETE" // nothing left to select — clean success
  | "BLOCKED" // Release Manager returned NO_RELEASE (certified refusal)
  | "VALIDATED_PENDING_COMMIT" // proven deliverable(s) awaiting the HUMAN commit gate — ODG never auto-commits
  | "EVIDENCE_INCOMPLETE" // Release Manager returned an error (no decision possible)
  | "EXECUTION_FAILED" // the existing pipeline failed
  | "CONTRACT_INVALID" // the generated Mission Contract failed validation
  | "STALLED" // defensive: selection made no progress (halting guarantee)
  | "AUTONOMY_CONTRACT_INCOMPATIBLE" // version gate
  | "INPUTS_MALFORMED"; // ports/config structurally invalid

/** A mission that was RELEASED and archived during the run (design §3). */
export interface CompletedCycle {
  mission: string;
  record: ReleaseRecord;
}

/** Explicit, auditable halt detail — data, never a thrown narrative (design §4 Invariant 10). */
export interface AutonomyHalt {
  mission: string | null;
  reason: AutonomyStatus;
  message: string;
  /** Present when the halt was a Release Manager NO_RELEASE. */
  record?: ReleaseRecord;
  /** Present when the halt was a Release Manager error (EVIDENCE_INCOMPLETE). */
  releaseError?: ReleaseManagerError;
  /** Present when the halt was an EXECUTION_FAILED with structured pipeline diagnostics. */
  pipeline?: PipelineFailure;
}

/** Result of an autonomy run — always returned as data (design §4). */
export interface AutonomyRunResult {
  autonomyContractVersion: string;
  status: AutonomyStatus;
  planComplete: boolean;
  cycles: number;
  completed: CompletedCycle[];
  halt: AutonomyHalt | null;
}

/** Static description of the capability (design §4 Invariant 1). */
export interface RuntimeAutonomyDescription {
  name: string;
  class: "capability";
  owner: "Runtime";
  autonomyContractVersion: string;
  status: string;
}
