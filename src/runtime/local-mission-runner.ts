/*
 * Local mission runner (UNIFY_RUNTIME_EXECUTION, OBJ-002).
 *
 * Executes a migrated local mission entirely inside the TypeScript Runtime. The mission
 * is planned through MissionOrchestrator (the single entry point, OBJ-001) and then run
 * by the existing RuntimeKernel — no provider call, no mse fallback.
 */

import { createRequire } from "node:module";
import { MissionOrchestrator, ExecutionPlan } from "./mission-orchestrator";
import { RuntimeKernel } from "./runtime-kernel";
import { createMissionIntent } from "./mission-intent";
import { LedgerRecorder, recordMissionToLedger } from "./ledger-record-adapter";

/**
 * A mission-scoped §303 Expert Instance, as produced by the released (read-only) assembler
 * runtime/core/expert-profile-assembler.js. Declarative metadata only — see compileExpertInstance.
 */
export interface ExpertInstanceRecord {
  mission_id: string;
  role: string;
  scope: string;
  allowed_capabilities: string[];
  allowed_tools: string[];
  authority_scope: string[];
  validators: string[];
  profile_status: string;
  flags: string[];
  [k: string]: unknown;
}

export interface LocalMissionResult {
  mission: string;
  ok: boolean;
  plan?: ExecutionPlan;
  execution?: ReturnType<RuntimeKernel["execute"]>;
  /** Honest verdict derived from the RuntimeReporter proof gate (ROOT CAUSE #2). */
  validated?: boolean;
  /**
   * Declarative, mission-scoped Expert Instance surfaced from the released assembler. READ-ONLY
   * metadata: it is NOT read by the executor, kernel, verification, or ledger gate, and never
   * affects control flow (`validated` is derived solely from the reporter status above).
   */
  expertInstance?: ExpertInstanceRecord;
  error?: string;
}

export class LocalMissionRunner {
  constructor(
    private readonly orchestrator = new MissionOrchestrator(),
    private readonly kernel = new RuntimeKernel(),
    // Seam to the EXISTING ledger writer (recordMission); injectable for tests.
    private readonly recordLedger: LedgerRecorder = recordMissionToLedger,
  ) {}

  run(id: string, name: string = id): LocalMissionResult {
    try {
      const intent = createMissionIntent(id);
      // OBJ-001: the orchestrator is the single entry point for every mission.
      const plan = this.orchestrator.buildPlan(id, name, intent);
      // OBJ-002: the mission is executed by src/runtime, not the mse fallback.
      const execution = this.kernel.execute(id, name);
      // Derive the verdict from the honest reporter gate (no fabrication), then hand it to the
      // EXISTING ledger writer. recordMission's proven-only gate refuses an unvalidated result,
      // so only genuinely-validated migrated missions obtain a proven ledger entry.
      const status =
        (execution as { report?: { status?: string } })?.report?.status ?? "FAILED";
      const validated = status === "SUCCESS";
      this.recordLedger(id, validated, status);
      // Read-only §304→§303 surfacing: attach the mission-scoped Expert Instance. Never on the
      // decision path — computed AFTER the verdict, fails closed to undefined, changes nothing.
      const expertInstance = this.compileExpertInstance(plan);
      return { mission: id, ok: true, plan, execution, validated, expertInstance };
    } catch (e) {
      return { mission: id, ok: false, error: (e as Error).message };
    }
  }

  /**
   * Compile the mission-scoped Expert Instance from the released (read-only) assembler, using the
   * mission_id / objective_id / definitionOfDone already carried on the plan. Profile is selected
   * from the EXISTING FINANCIAL classifier over the objective goals (ECONOMIC when any objective is
   * financial; ENGINEERING otherwise, the default). No authority vocabulary is invented: authority
   * is the empty set, so authority_scope stays [] (§307 — never self-granted from the profile).
   * The assembler .js is required via createRequire (tsx runs this path) — the same pattern as the
   * ledger adapter; no JS MissionContext bridge, no spawn. Any failure falls back to undefined so
   * the execution path is never affected.
   */
  private compileExpertInstance(plan: ExecutionPlan): ExpertInstanceRecord | undefined {
    try {
      const require = createRequire(import.meta.url);
      const assembler = require("../../runtime/core/expert-profile-assembler.js") as {
        loadProfile: (p: string) => unknown;
        compileInstance: (
          profile: unknown,
          mission: Record<string, unknown>,
        ) => ExpertInstanceRecord;
      };
      const gateway = require("../../runtime/core/nl-objective-gateway.js") as {
        classifyObjective: (goal: string) => { externalEffect?: string };
      };
      const specs = plan.mission.brain.objectiveSpecs;
      const anyFinancial = specs.some(
        (s) => gateway.classifyObjective(s.goal)?.externalEffect === "FINANCIAL",
      );
      const profileFile = anyFinancial
        ? "runtime/profiles/economic.json"
        : "runtime/profiles/engineering.json";
      const profile = assembler.loadProfile(profileFile);
      return assembler.compileInstance(profile, {
        mission_id: plan.mission.id,
        objective_id: specs[0]?.id ?? plan.mission.brain.nextObjective ?? null,
        authority: [],
        expected_output: plan.mission.contract.definitionOfDone,
      });
    } catch {
      return undefined;
    }
  }
}
