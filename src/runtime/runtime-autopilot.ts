import { RuntimeSupervisor } from "./runtime-supervisor";
import { RuntimeContext } from "./runtime-context";

export interface RuntimeObjective {
  objective: string;
  missionId: string;
  missionName: string;
}

export class RuntimeAutopilot {
  private readonly supervisor = new RuntimeSupervisor();
  private readonly context = RuntimeContext.get();

  run(objective: RuntimeObjective) {
    this.context.engine.bootstrap();

    return this.supervisor.execute({
      objective: objective.objective,
      missionId: objective.missionId,
      missionName: objective.missionName
    });
  }
}
