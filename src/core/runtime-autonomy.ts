/*
 * Runtime Autonomy — Capability implementation
 *
 * Implements RUNTIME_AUTONOMY_DESIGN_v1.md (FROZEN, Autonomy Contract Version 1.0.0).
 * Classification: Capability of the Runtime engine — not an engine, not a foundation (design §0, §1).
 *
 * Founding invariant (design §0, Invariant 6): the Autonomy Cycle never judges quality and never
 * decides completion. The ONLY completion authority is the Release Manager: a mission advances iff
 * ReleaseManager.decide(...) returns ok:true with decision === "RELEASE". This is enforced
 * structurally here — the ReleaseManager is instantiated in-core and is NOT injectable, so no port
 * can fake or bypass the decision (only the raw evidence feeding it is injected).
 *
 * Single responsibility (design §1, Invariant 3): select + loop glue only. Every side effect
 * (reading plan state, running the existing pipeline, gathering evidence, archiving) is delegated
 * to injected ports backed by existing components. The core performs no I/O and never touches the
 * existing pipeline's business logic.
 */

import {
  AUTONOMY_CONTRACT_VERSION,
  type AutonomyHalt,
  type AutonomyPlanState,
  type AutonomyRunConfig,
  type AutonomyRunResult,
  type AutonomyRuntimePorts,
  type AutonomyStatus,
  type CompletedCycle,
  type MissionContract,
  type RuntimeAutonomyDescription,
} from "@/contracts/runtime-autonomy";
import {
  RELEASE_CONTRACT_VERSION,
  type ReleaseInputs,
} from "@/contracts/release";
import { ReleaseManager } from "@/core/release-manager";

const CAPABILITY_NAME = "Runtime Autonomy";
const DEFAULT_MAX_CYCLES = 1000;

interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

/**
 * Pure, total, deterministic mission selection (design §2 Stage 1).
 * Returns the FIRST Master-Plan objective, in Master-Plan order, that is still missing and not yet
 * completed — else null (Master Plan exhausted). Adds no heuristic and no ranking of its own; the
 * order is the Master Plan's own priority order (design Invariant 4, R3).
 */
export function selectNextMission(plan: AutonomyPlanState): string | null {
  if (!plan || !Array.isArray(plan.masterPlanObjectives)) {
    return null;
  }
  const missing = new Set(
    Array.isArray(plan.missingCapabilities) ? plan.missingCapabilities : [],
  );
  const completed = new Set(
    Array.isArray(plan.completedMissions) ? plan.completedMissions : [],
  );
  for (const objective of plan.masterPlanObjectives) {
    if (typeof objective !== "string") continue;
    if (missing.has(objective) && !completed.has(objective)) {
      return objective;
    }
  }
  return null;
}

export class RuntimeAutonomy {
  // Sole completion authority. NOT injectable by design (founding invariant).
  private readonly releaseManager = new ReleaseManager();

  /** Static description of the capability (design §4 Invariant 1). */
  describe(): RuntimeAutonomyDescription {
    return {
      name: CAPABILITY_NAME,
      class: "capability",
      owner: "Runtime",
      autonomyContractVersion: AUTONOMY_CONTRACT_VERSION,
      status: "READY",
    };
  }

  /** No I/O; effects are injected via ports (design §1, Invariant 3). */
  initialize(): { ready: true } {
    return { ready: true };
  }

  /**
   * Run the Autonomy Cycle (design §3). Always returns data (error-as-data, design §4).
   *
   * loop:
   *   1. select next mission           → null ⇒ PLAN_COMPLETE
   *   2. generate + validate contract  → invalid ⇒ CONTRACT_INVALID (halt for human)
   *   3. run existing pipeline         → failed ⇒ EXECUTION_FAILED (halt, evidence preserved)
   *   4. gather evidence
   *   5. Release Manager decides        → error ⇒ EVIDENCE_INCOMPLETE ; NO_RELEASE ⇒ BLOCKED
   *   6. archive + advance             → RELEASE only
   */
  run(config: AutonomyRunConfig, ports: AutonomyRuntimePorts): AutonomyRunResult {
    const completed: CompletedCycle[] = [];

    // Pre-flight: structural + version gate (design §5).
    const preflight = this.preflight(config, ports);
    if (preflight) {
      return this.result(preflight.reason, completed, 0, preflight);
    }

    const maxCycles =
      typeof config.maxCycles === "number" && config.maxCycles > 0
        ? config.maxCycles
        : DEFAULT_MAX_CYCLES;

    // Progress tracking guarantees halting even if a port fails to advance state (design §3, R2).
    const processed = new Set<string>();
    let cycles = 0;

    while (cycles < maxCycles) {
      // 1. Select (re-read plan state each cycle so the growing ledger drives termination).
      let plan: AutonomyPlanState;
      try {
        plan = ports.readPlanState();
      } catch (err) {
        return this.result(
          "INPUTS_MALFORMED",
          completed,
          cycles,
          this.halt(null, "INPUTS_MALFORMED", `readPlanState failed: ${msg(err)}`),
        );
      }

      const mission = selectNextMission(plan);
      if (mission === null) {
        return this.result("PLAN_COMPLETE", completed, cycles, null);
      }

      // Defensive: selection returned an already-processed mission ⇒ no progress ⇒ halt (R2).
      if (processed.has(mission)) {
        return this.result(
          "STALLED",
          completed,
          cycles,
          this.halt(
            mission,
            "STALLED",
            `Selection did not advance: "${mission}" already released this run but was reselected.`,
          ),
        );
      }
      processed.add(mission);
      cycles++;

      // 2. Generate + validate Mission Contract.
      let contract: MissionContract;
      try {
        contract = ports.generateContract(mission);
      } catch (err) {
        return this.result(
          "CONTRACT_INVALID",
          completed,
          cycles,
          this.halt(mission, "CONTRACT_INVALID", `generateContract failed: ${msg(err)}`),
        );
      }
      if (!this.validateContract(contract, mission)) {
        return this.result(
          "CONTRACT_INVALID",
          completed,
          cycles,
          this.halt(
            mission,
            "CONTRACT_INVALID",
            `Generated Mission Contract for "${mission}" is malformed.`,
          ),
        );
      }

      // 3. Launch the EXISTING pipeline — business logic untouched.
      let pipeline: { pipelineOk: boolean };
      try {
        pipeline = ports.runPipeline(mission);
      } catch (err) {
        return this.result(
          "EXECUTION_FAILED",
          completed,
          cycles,
          this.halt(mission, "EXECUTION_FAILED", `runPipeline threw: ${msg(err)}`),
        );
      }
      if (!pipeline || pipeline.pipelineOk !== true) {
        return this.result(
          "EXECUTION_FAILED",
          completed,
          cycles,
          this.halt(mission, "EXECUTION_FAILED", `Pipeline failed for "${mission}".`),
        );
      }

      // 4. Gather evidence from existing capabilities.
      let releaseInputs: ReleaseInputs;
      try {
        releaseInputs = this.assembleReleaseInputs(mission, ports);
      } catch (err) {
        return this.result(
          "EVIDENCE_INCOMPLETE",
          completed,
          cycles,
          this.halt(mission, "EVIDENCE_INCOMPLETE", `gatherEvidence failed: ${msg(err)}`),
        );
      }

      // 5. THE decision — Release Manager alone (founding invariant).
      const decision = this.releaseManager.decide(releaseInputs);
      if (!decision.ok) {
        return this.result("EVIDENCE_INCOMPLETE", completed, cycles, {
          mission,
          reason: "EVIDENCE_INCOMPLETE",
          message: decision.error.message,
          releaseError: decision.error,
        });
      }
      if (decision.record.decision === "NO_RELEASE") {
        return this.result("BLOCKED", completed, cycles, {
          mission,
          reason: "BLOCKED",
          message: `Release Manager returned NO_RELEASE for "${mission}"; rollbackRef preserved.`,
          record: decision.record,
        });
      }

      // 6. RELEASE ⇒ archive via existing Mission Ledger and advance.
      try {
        ports.archive(mission, decision.record);
      } catch (err) {
        return this.result(
          "EXECUTION_FAILED",
          completed,
          cycles,
          this.halt(mission, "EXECUTION_FAILED", `archive failed: ${msg(err)}`),
        );
      }
      completed.push({ mission, record: decision.record });
      // loop: next readPlanState should now exclude this mission.
    }

    // Reached the defensive bound.
    return this.result(
      "STALLED",
      completed,
      cycles,
      this.halt(null, "STALLED", `Reached maxCycles=${maxCycles} without plan completion.`),
    );
  }

  // --- Evidence assembly (design §2 Stage 5) ------------------------------
  // The Release Manager is built to detect incomplete/malformed evidence and return it as data,
  // so partial evidence is passed through deliberately rather than pre-judged here.

  private assembleReleaseInputs(
    mission: string,
    ports: AutonomyRuntimePorts,
  ): ReleaseInputs {
    const evidence = ports.gatherEvidence(mission);
    const v = evidence?.validation ?? {};
    const s = evidence?.source ?? {};
    // Cast at the boundary: nullable/partial evidence is intentional — decide() validates it.
    return {
      releaseContractVersion: RELEASE_CONTRACT_VERSION,
      requestId: mission,
      validation: {
        build: v.build,
        typescript: v.typescript,
        gitClean: v.gitClean,
        missionPipeline: v.missionPipeline,
      },
      source: { commit: s.commit, branch: s.branch },
      // Coerce absent proof (null) to undefined so the Release Manager reports it as
      // EVIDENCE_INCOMPLETE (no decision possible) rather than a structural malformation.
      documentationProof: evidence?.documentationProof ?? undefined,
      artifacts: Array.isArray(evidence?.artifacts) ? evidence.artifacts : [],
      previousReleaseRef: evidence?.previousReleaseRef ?? null,
    } as ReleaseInputs;
  }

  // --- Contract validation (design §2 Stage 2) ----------------------------

  private validateContract(
    contract: MissionContract,
    mission: string,
  ): boolean {
    return Boolean(
      contract &&
        typeof contract === "object" &&
        contract.mission === mission &&
        Array.isArray(contract.objectives) &&
        contract.objectives.length > 0 &&
        Array.isArray(contract.definition_of_done) &&
        contract.definition_of_done.length > 0 &&
        Array.isArray(contract.completion) &&
        contract.completion.length > 0,
    );
  }

  // --- Version gate + structural pre-flight (design §5) -------------------

  private preflight(
    config: AutonomyRunConfig,
    ports: AutonomyRuntimePorts,
  ): AutonomyHalt | null {
    if (!ports || typeof ports !== "object") {
      return this.halt(null, "INPUTS_MALFORMED", "AutonomyRuntimePorts is missing or not an object.");
    }
    const required: Array<keyof AutonomyRuntimePorts> = [
      "readPlanState",
      "generateContract",
      "runPipeline",
      "gatherEvidence",
      "archive",
    ];
    for (const name of required) {
      if (typeof ports[name] !== "function") {
        return this.halt(null, "INPUTS_MALFORMED", `AutonomyRuntimePorts.${name} is not a function.`);
      }
    }
    if (!config || typeof config.autonomyContractVersion !== "string") {
      return this.halt(null, "INPUTS_MALFORMED", "autonomyContractVersion is missing or not a string.");
    }
    const supported = this.parseSemVer(AUTONOMY_CONTRACT_VERSION);
    const got = this.parseSemVer(config.autonomyContractVersion);
    if (!got) {
      return this.halt(
        null,
        "INPUTS_MALFORMED",
        "autonomyContractVersion is not a valid MAJOR.MINOR.PATCH version.",
      );
    }
    if (got.major !== supported!.major) {
      return this.halt(
        null,
        "AUTONOMY_CONTRACT_INCOMPATIBLE",
        `Incompatible Autonomy Contract Version: supported ${AUTONOMY_CONTRACT_VERSION}, received ${config.autonomyContractVersion}.`,
      );
    }
    return null;
  }

  private parseSemVer(value: string): SemVer | null {
    if (typeof value !== "string") return null;
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());
    if (!match) return null;
    return {
      major: Number(match[1]),
      minor: Number(match[2]),
      patch: Number(match[3]),
    };
  }

  // --- Result / halt helpers ---------------------------------------------

  private halt(
    mission: string | null,
    reason: AutonomyStatus,
    message: string,
  ): AutonomyHalt {
    return { mission, reason, message };
  }

  private result(
    status: AutonomyStatus,
    completed: CompletedCycle[],
    cycles: number,
    halt: AutonomyHalt | null,
  ): AutonomyRunResult {
    return {
      autonomyContractVersion: AUTONOMY_CONTRACT_VERSION,
      status,
      planComplete: status === "PLAN_COMPLETE",
      cycles,
      completed,
      halt,
    };
  }
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export { CAPABILITY_NAME };
