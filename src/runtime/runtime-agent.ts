import { RuntimeCLI } from "./runtime-cli";

export interface RuntimeOrder {
  objective: string;
  missionId: string;
  missionName: string;
}

export class RuntimeAgent {
  private readonly cli = new RuntimeCLI();

  execute(order: RuntimeOrder) {
    return this.cli.run(
      order.objective,
      order.missionId,
      order.missionName
    );
  }
}
