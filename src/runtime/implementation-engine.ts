import { ExecutionPlanner } from "./execution-planner";
import { MissionIntent } from "./mission-intent";

export type ImplementationState =
  | "READY"
  | "PLANNING"
  | "WAITING_APPROVAL"
  | "EXECUTING"
  | "PAUSED"
  | "VALIDATING"
  | "COMPLETED";

export interface ImplementationCheckpoint {
  name: string;
  completed: boolean;
}

export interface ImplementationPlan {
  generatedAt: string;
  mission: string;
  intent?: MissionIntent;
  nextCapability: string;
  roadmap: string[];
  checkpoints: ImplementationCheckpoint[];
  state: ImplementationState;
}

export class ImplementationEngine {

  private readonly planner = new ExecutionPlanner();

  private plan?: ImplementationPlan;

  prepare(mission: string): ImplementationPlan {

    this.plan = {
      generatedAt: new Date().toISOString(),
      mission,
      nextCapability: "",
      roadmap: [],
      checkpoints: [],
      state: "READY"
    };

    return this.plan;
  }


  buildExecutionPlan(id: string, name: string) {
    return this.planner.create(id, name);
  }


  prepareExecution(id: string, name: string) {

    const plan = this.buildExecutionPlan(id, name);

    return {
      mission: id,
      executionPlan: plan,
      implementation: this.plan
    };
  }

  current(): ImplementationPlan | undefined {
    return this.plan;
  }

}
