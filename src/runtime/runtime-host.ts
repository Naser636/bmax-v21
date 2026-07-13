import { RuntimeDaemon } from "./runtime-daemon";

export interface RuntimeRequest {
  objective: string;
  missionId: string;
  missionName: string;
}

export class RuntimeHost {
  private readonly daemon = new RuntimeDaemon();

  run(request: RuntimeRequest) {
    return this.daemon.execute({
      objective: request.objective,
      missionId: request.missionId,
      missionName: request.missionName
    });
  }
}
