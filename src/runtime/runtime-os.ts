import { RuntimeHost } from "./runtime-host";

export interface RuntimeTask {
  objective: string;
  missionId: string;
  missionName: string;
}

export class RuntimeOS {
  private readonly host = new RuntimeHost();

  run(task: RuntimeTask) {
    return this.host.run({
      objective: task.objective,
      missionId: task.missionId,
      missionName: task.missionName
    });
  }
}
