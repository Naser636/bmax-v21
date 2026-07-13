import { MissionController } from "./mission-controller";

export interface RuntimeObjective {
  objective: string;
  missionId: string;
  missionName: string;
}

export class MissionRouter {
  private readonly controller = new MissionController();

  route(objective: RuntimeObjective) {
    return this.controller.execute({
      id: objective.missionId,
      name: objective.missionName
    });
  }
}
