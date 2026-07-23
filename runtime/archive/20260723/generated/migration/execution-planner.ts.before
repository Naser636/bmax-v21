import {
  MissionOrchestrator,
  ExecutionPlan
} from "./mission-orchestrator";

export interface TechnicalStep {
  id: string;
  capability: string;
  plugin: string | null;
  status: "READY";
}

export interface TechnicalPlan {
  execution: ExecutionPlan;
  steps: TechnicalStep[];
}

export class ExecutionPlanner {
  constructor(
    private readonly orchestrator = new MissionOrchestrator()
  ) {}

  create(id: string, name: string): TechnicalPlan {

    const execution =
      this.orchestrator.buildPlan(id, name);

    const steps = execution.steps.map(step => ({
      id: step.id,
      capability: step.name,
      plugin: null,
      status: "READY" as const
    }));

    return {
      execution,
      steps
    };
  }
}
