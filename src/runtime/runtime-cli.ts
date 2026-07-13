import { RuntimeBootstrap } from "./runtime-bootstrap";

export class RuntimeCLI {
  private readonly runtime = new RuntimeBootstrap();

  run(objective: string, missionId: string, missionName: string) {
    return this.runtime.run({
      objective,
      missionId,
      missionName
    });
  }
}
