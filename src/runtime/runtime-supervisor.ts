import { RuntimeGovernor } from "./runtime-governor";
import { RuntimeContext } from "./runtime-context";

export interface RuntimeMissionOrder {
  objective: string;
  missionId: string;
  missionName: string;
}

export class RuntimeSupervisor {
  private readonly governor = new RuntimeGovernor();
  private readonly context = RuntimeContext.get();

  execute(order: RuntimeMissionOrder) {
    this.context.engine.bootstrap();

    return this.governor.execute({
      objective: order.objective,
      missionId: order.missionId,
      missionName: order.missionName
    });
  }
}
