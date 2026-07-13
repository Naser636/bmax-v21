import { RuntimeStatus } from "./runtime-types";
import { RuntimeSystem } from "./system-loader";

export class RuntimeState {
  status: RuntimeStatus = "READY";
  currentMission?: string;
  system?: RuntimeSystem;

  initialize(system: RuntimeSystem): void {
    this.system = system;
  }

  isInitialized(): boolean {
    return this.system !== undefined;
  }
}
