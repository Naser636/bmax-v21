import { RuntimeContext } from "./runtime-context";
import { RuntimeKernel } from "./runtime-kernel";

export class MissionDispatcher {
  private readonly context = RuntimeContext.get();
  private readonly kernel = new RuntimeKernel();

  dispatch(id: string, name: string) {
    this.context.state.currentMission = id;

    return this.kernel.execute(id, name);
  }
}
