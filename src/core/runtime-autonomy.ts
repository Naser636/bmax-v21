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
  type PipelineFailure,
  type PipelineOutcome,
  type RuntimeAutonomyDescription,
} from "@/contracts/runtime-autonomy";
import {
  RELEASE_CONTRACT_VERSION,
  type ReleaseInputs,
  type ReleaseRecord,
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
    // D2/S4 (review N4 remediation): a mission the Release Manager refuses (NO_RELEASE) must NOT livelock
    // and must NOT be force-advanced by an autonomous commit (see D1). It is ESCALATED and DEFERRED so the
    // loop can CONTINUE to the next realizable mission; the run halts only when selection genuinely exhausts.
    // `completed` still holds ONLY true RELEASE records — an escalated mission never counts as released.
    const escalations: { mission: string; record: ReleaseRecord }[] = [];
    const deferred = new Set<string>();
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

      const mission = selectNextMission({
        ...plan,
        // Enrich selectNextMission's INPUT with the deferred (escalated) ids — the same technique the
        // adapter already uses for corrective ids — so an escalated mission is skipped and the loop
        // advances to the next realizable one. The frozen selectNextMission FUNCTION is untouched.
        completedMissions: [
          ...(Array.isArray(plan.completedMissions) ? plan.completedMissions : []),
          ...deferred,
        ],
      });
      if (mission === null) {
        // Selection exhausted: PLAN_COMPLETE when nothing was escalated; otherwise an HONEST escalation
        // terminal that never claims RELEASE (D2/S4).
        return this.concludeRun(completed, cycles, escalations);
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
      let pipeline: PipelineOutcome;
      try {
        pipeline = ports.runPipeline(mission);
      } catch (err) {
        return this.result(
          "EXECUTION_FAILED",
          completed,
          cycles,
          this.haltPipeline(mission, {
            stage: "runPipeline",
            reason: "EXCEPTION",
            message: `runPipeline threw: ${msg(err)}`,
            exception: msg(err),
          }),
        );
      }
      if (!pipeline || pipeline.pipelineOk !== true) {
        // Never re-emit an opaque `{ pipelineOk: false }`: carry the structured diagnostics the
        // pipeline seam produced (provider classification, exit code, stderr, blocker, …) into the
        // halt, or synthesize a minimal one if a port returned failure without diagnostics.
        const failure: PipelineFailure = pipeline?.diagnostics ?? {
          stage: "runPipeline",
          reason: "UNKNOWN",
          message: pipeline
            ? "Pipeline reported failure without diagnostics."
            : "runPipeline returned no outcome.",
        };
        return this.result(
          "EXECUTION_FAILED",
          completed,
          cycles,
          this.haltPipeline(mission, failure),
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
        // D2/S4: do NOT halt the whole plan here and do NOT force-advance by committing (D1). ESCALATE
        // the certified refusal and DEFER the mission so the loop continues to the next realizable one;
        // the honest terminal is computed once selection exhausts (concludeRun). An escalated mission is
        // never added to `completed` — it did not RELEASE. rollbackRef stays preserved in the record.
        escalations.push({ mission, record: decision.record });
        deferred.add(mission);
        continue;
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

  /**
   * Build an EXECUTION_FAILED halt from structured pipeline diagnostics. The `message` is rendered
   * self-explanatory (stage / reason / exit code / provider / captured streams), and the raw
   * structured object is attached as `pipeline` for programmatic consumers — so the Runtime never
   * again surfaces a bare `{ pipelineOk: false }`.
   */
  private haltPipeline(mission: string, failure: PipelineFailure): AutonomyHalt {
    return {
      mission,
      reason: "EXECUTION_FAILED",
      message: this.renderPipelineFailure(failure),
      pipeline: failure,
    };
  }

  /** Render pipeline diagnostics into a human-readable, multi-line detail. Only present fields shown. */
  private renderPipelineFailure(f: PipelineFailure): string {
    const lines: string[] = [];
    lines.push(`Pipeline failed at stage "${f.stage}" (${f.reason}): ${f.message}`);
    if (f.provider) lines.push(`  provider   : ${f.provider}`);
    if (f.exitCode !== undefined) lines.push(`  exitCode   : ${f.exitCode}`);
    if (f.blocker) lines.push(`  blocker    : ${f.blocker}`);
    if (f.unauthorizedChanges && f.unauthorizedChanges.length > 0) {
      lines.push(`  unauthorized: ${f.unauthorizedChanges.join(", ")}`);
    }
    if (f.exception) lines.push(`  exception  : ${f.exception}`);
    if (f.stderr) lines.push(`  stderr     :\n${indent(f.stderr)}`);
    if (f.stdout) lines.push(`  stdout     :\n${indent(f.stdout)}`);
    return lines.join("\n");
  }

  /**
   * Terminal classification when selectNextMission exhausts (D2/S4). PLAN_COMPLETE when nothing was
   * escalated; otherwise an HONEST escalation terminal that NEVER claims RELEASE:
   *   - every escalation is VALIDATED_PENDING_COMMIT (all release gates green EXCEPT gitClean, i.e. a
   *     PROVEN deliverable whose only blocker is the uncommitted working tree) ⇒ the deliverable(s)
   *     await the HUMAN commit gate (D1 — ODG never auto-commits) ⇒ status VALIDATED_PENDING_COMMIT;
   *   - otherwise at least one genuine blocker ⇒ status BLOCKED (back-compatible terminal).
   * The halt carries the LAST escalation's certified record (data, not narrative), preserving the prior
   * NO_RELEASE halt contract (status BLOCKED, completed holds only RELEASE records, halt.record present).
   */
  private concludeRun(
    completed: CompletedCycle[],
    cycles: number,
    escalations: { mission: string; record: ReleaseRecord }[],
  ): AutonomyRunResult {
    if (escalations.length === 0) {
      return this.result("PLAN_COMPLETE", completed, cycles, null);
    }
    const isPendingCommit = (r: ReleaseRecord): boolean =>
      r.decision === "NO_RELEASE" &&
      r.gates.build === true &&
      r.gates.typescript === true &&
      r.gates.missionPipeline === true &&
      r.gates.documentationProofPresent === true &&
      r.gates.gitClean === false;
    const allPendingCommit = escalations.every((e) => isPendingCommit(e.record));
    const status: AutonomyStatus = allPendingCommit ? "VALIDATED_PENDING_COMMIT" : "BLOCKED";
    const last = escalations[escalations.length - 1];
    const pending = escalations.filter((e) => isPendingCommit(e.record)).map((e) => e.mission);
    const blockers = escalations.filter((e) => !isPendingCommit(e.record)).map((e) => e.mission);
    const message = allPendingCommit
      ? `Validated, PROVEN deliverable(s) awaiting the HUMAN commit gate (ODG never auto-commits): ${pending.join(", ")}. Review and commit, or set ODG_HUMAN_COMMIT_APPROVED=1 for a human-authorized commit, then re-run.`
      : `Release Manager returned NO_RELEASE; human decision required. Blocked: ${blockers.join(", ") || "(none)"}${pending.length ? `; pending-commit: ${pending.join(", ")}` : ""}.`;
    return this.result(status, completed, cycles, {
      mission: last.mission,
      reason: status,
      message,
      record: last.record,
    });
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

/** Indent a (possibly multi-line) captured stream so it reads as a nested block in the halt detail. */
function indent(text: string): string {
  return text
    .split(/\r?\n/)
    .map((l) => `    ${l}`)
    .join("\n");
}

export { CAPABILITY_NAME };
