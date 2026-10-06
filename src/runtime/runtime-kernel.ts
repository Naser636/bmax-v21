import { MissionEngine } from "./mission-engine";
import { RuntimeExecutor } from "./runtime-executor";
import { RuntimeContext } from "./runtime-context";
import { ExecutionPlan } from "./mission-orchestrator";

export class RuntimeKernel {
  private readonly engine = new MissionEngine();
  private readonly executor = new RuntimeExecutor();
  private readonly context = RuntimeContext.get();

  execute(id: string, name: string, plan?: ExecutionPlan) {
    this.engine.bootstrap();

    this.context.state.currentMission = id;
    // FIX_DOUBLE_RECOMPUTE_V1: thread the caller's already-built plan through to the executor so it is
    // reused rather than rebuilt. Optional — a no-plan call keeps the standalone build path.
    const result = this.executor.execute(id, name, plan);

    return {
      runtimeState: this.context.state,      ...result
    };
  }
}
