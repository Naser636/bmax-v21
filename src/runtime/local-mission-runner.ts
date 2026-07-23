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

export interface LocalMissionResult {
  mission: string;
  ok: boolean;
  plan?: ExecutionPlan;
  execution?: ReturnType<RuntimeKernel["execute"]>;
  error?: string;
}

export class LocalMissionRunner {
  constructor(
    private readonly orchestrator = new MissionOrchestrator(),
    private readonly kernel = new RuntimeKernel(),
  ) {}

  run(id: string, name: string = id): LocalMissionResult {
    try {
      const intent = createMissionIntent(id);
      // OBJ-001: the orchestrator is the single entry point for every mission.
      const plan = this.orchestrator.buildPlan(id, name, intent);
      // OBJ-002: the mission is executed by src/runtime, not the mse fallback.
      const execution = this.kernel.execute(id, name);
      return { mission: id, ok: true, plan, execution };
    } catch (e) {
      return { mission: id, ok: false, error: (e as Error).message };
    }
  }
}
