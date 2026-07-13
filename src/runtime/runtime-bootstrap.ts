import { MissionRouter } from "./mission-router";
import { RuntimeContext } from "./runtime-context";

export interface RuntimeCommand {
  objective: string;
  missionId: string;
  missionName: string;
}

export class RuntimeBootstrap {
  private readonly context = RuntimeContext.get();
  private readonly router = new MissionRouter();

  run(command: RuntimeCommand) {
    this.context.engine.bootstrap();

    return this.router.route({
      objective: command.objective,
      missionId: command.missionId,
      missionName: command.missionName
    });
  }
}
