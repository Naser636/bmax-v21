import { RuntimeDirector } from "./runtime-director";
import { RuntimeContext } from "./runtime-context";

export interface RuntimeGoal {
  objective: string;
  missionId: string;
  missionName: string;
}

export class RuntimeGovernor {
  private readonly director = new RuntimeDirector();
  private readonly context = RuntimeContext.get();

  execute(goal: RuntimeGoal) {
    this.context.engine.bootstrap();

    return this.director.execute({
      objective: goal.objective,
      missionId: goal.missionId,
      missionName: goal.missionName
    });
  }
}
