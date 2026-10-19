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
import { LedgerRecorder, recordMissionToLedger, AttemptRecorder, AttemptTiming, recordMissionAttempt } from "./ledger-record-adapter";

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
    // Seam to the attempt-level SLO telemetry (every outcome, incl. failures); injectable for tests.
    private readonly recordAttempt: AttemptRecorder = recordMissionAttempt,
    // Injectable monotonic-enough wall clock (ISO strings) for real start/end timestamps; injectable for tests.
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {}

  run(id: string, name: string = id): LocalMissionResult {
    // Capture the REAL start timestamp before any work; end is taken at the single recording point.
    const startedAt = this.clock();
    let recorded = false;
    // Record THIS run's attempt EXACTLY ONCE (the `recorded` guard prevents a double-record if a later
    // step throws after we already recorded). Timestamps are real and from the SAME run; duration is
    // validated downstream (both present, ordered, finite) before it becomes durationMs.
    const recordOnce = (validated: boolean, status: string, category?: string): void => {
      if (recorded) return;
      recorded = true;
      const timing: AttemptTiming = { startedAt, endedAt: this.clock() };
      if (category) timing.category = category;
      this.recordAttempt(id, validated, status, timing);
    };
    try {
      const intent = createMissionIntent(id);
      // OBJ-001: the orchestrator is the single entry point for every mission.
      const plan = this.orchestrator.buildPlan(id, name, intent);
      // OBJ-002: the mission is executed by src/runtime, not the mse fallback.
      // FIX_DOUBLE_RECOMPUTE_V1: pass the plan just built so the executor REUSES it (no second
      // load + buildPlan + ExecutionPlanner.create). result.plan is therefore the executed plan.
      const execution = this.kernel.execute(id, name, plan);
      // Derive the verdict from the honest reporter gate (no fabrication), then hand it to the
      // EXISTING ledger writer. recordMission's proven-only gate refuses an unvalidated result,
      // so only genuinely-validated migrated missions obtain a proven ledger entry.
      const status =
        (execution as { report?: { status?: string } })?.report?.status ?? "FAILED";
      const validated = status === "SUCCESS";
      this.recordLedger(id, validated, status);
      // Attempt-level SLO telemetry: record THIS run's honest outcome (success OR failure) with real
      // timing so a real success-rate denominator AND per-category latency can accumulate. Non-blocking.
      recordOnce(validated, status, this.categoryOf(plan));
      // Read-only §304→§303 surfacing: attach the mission-scoped Expert Instance. Never on the
      // decision path — computed AFTER the verdict, fails closed to undefined, changes nothing.
      const expertInstance = this.compileExpertInstance(plan);
      return { mission: id, ok: true, plan, execution, validated, expertInstance };
    } catch (e) {
      // An interruption/finalisation error is itself a terminal outcome: record it as an attempt (ERROR)
      // so hard failures are representable too (never silently dropped). The LEDGER is intentionally NOT
      // called on a throw (proven-only invariant preserved) — only the attempt log sees this failure.
      recordOnce(false, "ERROR");
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
  /**
   * Best-effort latency CATEGORY for this mission, read from the plan's mode (AUDIT/ENGINEERING/…) if present.
   * Never on the decision path; fails closed to undefined so a missing category just groups as uncategorized.
   */
  private categoryOf(plan: unknown): string | undefined {
    try {
      const p = plan as { mode?: unknown; mission?: { mode?: unknown } };
      const mode = p && (p.mode ?? (p.mission && p.mission.mode));
      return typeof mode === "string" ? mode : undefined;
    } catch {
      return undefined;
    }
  }

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
      const gateway = require("../../runtime/dist/core/nl-objective-gateway.js") as {
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
