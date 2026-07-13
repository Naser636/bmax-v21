import { RuntimeShell } from "./runtime-shell";

export interface RuntimeMission {
  objective: string;
  missionId: string;
  missionName: string;
}

export class RuntimeDaemon {
  private readonly shell = new RuntimeShell();

  execute(mission: RuntimeMission) {
    return this.shell.execute({
      objective: mission.objective,
      missionId: mission.missionId,
      missionName: mission.missionName
    });
  }
}
