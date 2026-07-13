import { RuntimeAutopilot } from "./runtime-autopilot";

export interface RuntimeRequest {
  objective: string;
  missionId: string;
  missionName: string;
}

export class RuntimeEntry {
  private readonly runtime = new RuntimeAutopilot();

  execute(request: RuntimeRequest) {
    return this.runtime.run({
      objective: request.objective,
      missionId: request.missionId,
      missionName: request.missionName
    });
  }
}
