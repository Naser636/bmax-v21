import { RuntimeOS } from "./runtime-os";

export interface RuntimeObjective {
  objective: string;
  missionId: string;
  missionName: string;
}

export class RuntimeDirector {
  private readonly runtime = new RuntimeOS();

  execute(objective: RuntimeObjective) {
    return this.runtime.run({
      objective: objective.objective,
      missionId: objective.missionId,
      missionName: objective.missionName
    });
  }
}
