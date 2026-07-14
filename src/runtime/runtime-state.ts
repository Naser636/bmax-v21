import { RuntimeStatus } from "./runtime-types";
import { RuntimeSystem } from "./system-loader";

export class RuntimeState {

  status: RuntimeStatus = "READY";
  currentMission?: string;
  system?: RuntimeSystem;
  startedAt?: string;
  completedAt?: string;

  initialize(system: RuntimeSystem): void {
    this.system = system;
    this.startedAt = new Date().toISOString();
    this.status = "RUNNING";
  }

  complete(): void {
    this.completedAt = new Date().toISOString();
    this.status = "DONE";
  }

  fail(): void {
    this.completedAt = new Date().toISOString();
    this.status = "FAILED";
  }

  isInitialized(): boolean {
    return this.system !== undefined;
  }

}
