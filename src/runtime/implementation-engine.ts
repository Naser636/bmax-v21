import { ExecutionPlanner } from "./execution-planner";
import { RuntimeReporter } from "./runtime-reporter";
import { MissionIntent } from "./mission-intent";
import { RuntimeContext } from "./runtime-context";

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
  private readonly reporter = new RuntimeReporter();

  private readonly context = RuntimeContext.get();

  private plan?: ImplementationPlan;

  prepare(mission: string, intent?: MissionIntent): ImplementationPlan {

    this.plan = {
      generatedAt: new Date().toISOString(),
      mission,
      intent,
      nextCapability: "",
      roadmap: [],
      checkpoints: [],
      state: "READY"
    };

    return this.plan;
  }


  buildExecutionPlan(id: string, name: string, intent?: MissionIntent) {
    return this.planner.create(id, name, intent);
  }


  prepareExecution(id: string, name: string) {

    const plan = this.buildExecutionPlan(id, name, this.plan?.intent);

    return {
      mission: id,
      intent: this.plan?.intent,
      executionPlan: plan,
      implementation: this.plan
    };
  }


  createTechnicalPlan(id: string, name: string) {
    return this.planner.create(id, name, this.plan?.intent);
  }


  generateReport(data: {
    mission: string;
    capabilities: unknown[];
    logicalSteps: number;
    technicalSteps: number;
  }) {
    return this.reporter.report(data);
  }

  current(): ImplementationPlan | undefined {
    return this.plan;
  }

}
