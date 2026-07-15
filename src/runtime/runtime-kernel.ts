import { MissionEngine } from "./mission-engine";
import { RuntimeExecutor } from "./runtime-executor";
import { RuntimeContext } from "./runtime-context";

export class RuntimeKernel {
  private readonly engine = new MissionEngine();
  private readonly executor = new RuntimeExecutor();
  private readonly context = RuntimeContext.get();

  execute(id: string, name: string) {
    this.engine.bootstrap();

    this.context.state.currentMission = id;
    const result = this.executor.execute(id, name);

    return {
      runtimeState: this.context.state,      ...result
    };
  }
}
