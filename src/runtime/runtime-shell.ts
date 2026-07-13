import { RuntimeAgent } from "./runtime-agent";

export interface ShellCommand {
  objective: string;
  missionId: string;
  missionName: string;
}

export class RuntimeShell {
  private readonly agent = new RuntimeAgent();

  execute(command: ShellCommand) {
    return this.agent.execute({
      objective: command.objective,
      missionId: command.missionId,
      missionName: command.missionName
    });
  }
}
