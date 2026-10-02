/*
 * Local mission runner (UNIFY_RUNTIME_EXECUTION, OBJ-002).
 *
 * Executes a migrated local mission entirely inside the TypeScript Runtime. The mission
 * is planned through MissionOrchestrator (the single entry point, OBJ-001) and then run
 * by the existing RuntimeKernel — no provider call, no mse fallback.
 */

import { MissionOrchestrator, ExecutionPlan } from "./mission-orchestrator";
import { RuntimeKernel } from "./runtime-kernel";
import { createMissionIntent } from "./mission-intent";
import { LedgerRecorder, recordMissionToLedger } from "./ledger-record-adapter";

export interface LocalMissionResult {
  mission: string;
  ok: boolean;
  plan?: ExecutionPlan;
  execution?: ReturnType<RuntimeKernel["execute"]>;
  /** Honest verdict derived from the RuntimeReporter proof gate (ROOT CAUSE #2). */
  validated?: boolean;
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
      return { mission: id, ok: true, plan, execution, validated };
    } catch (e) {
      return { mission: id, ok: false, error: (e as Error).message };
    }
  }
}
