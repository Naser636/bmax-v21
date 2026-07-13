import { MissionEngine } from "./mission-engine";
import { RuntimeExecutor } from "./runtime-executor";
import { RuntimeState } from "./runtime-state";

export class RuntimeKernel {
  private readonly engine = new MissionEngine();
  private readonly executor = new RuntimeExecutor();
  private readonly state = new RuntimeState();

  execute(id: string, name: string) {
    this.engine.bootstrap();
    this.state.currentMission = id;
    const result = this.executor.execute(id, name);
    return { runtimeState: this.state, ...result };
  }
}
