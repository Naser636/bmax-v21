import { MissionEngine } from "./mission-engine";
import { RuntimeExecutor } from "./runtime-executor";

export class RuntimeKernel {
  private readonly engine = new MissionEngine();
  private readonly executor = new RuntimeExecutor();

  execute(id: string, name: string) {
    this.engine.bootstrap();
    return this.executor.execute(id, name);
  }
}
