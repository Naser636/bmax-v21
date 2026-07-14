import {
  MissionOrchestrator,
  ExecutionPlan
} from "./mission-orchestrator";
import { AutonomousPlanner } from "./autonomous-planner";

export interface TechnicalStep {
  id: string;
  capability: string;
  plugin: string | null;
  status: "READY";
}

export interface TechnicalPlan {
  execution: ExecutionPlan;
  planning: ReturnType<AutonomousPlanner["build"]>;
  steps: TechnicalStep[];
}

export class ExecutionPlanner {

  constructor(
    private readonly orchestrator = new MissionOrchestrator(),
    private readonly autonomous = new AutonomousPlanner()
  ) {}

  create(id: string, name: string): TechnicalPlan {

    const execution = this.orchestrator.buildPlan(id, name);
    const planning = this.autonomous.build();

    const steps: TechnicalStep[] = [];

    for (const step of execution.steps) {
      steps.push({
        id: step.id,
        capability: step.name,
        plugin: null,
        status: "READY"
      });
    }

    for (const objective of execution.objectives) {
      steps.push({
        id: `BRAIN_${steps.length + 1}`,
        capability: objective,
        plugin: null,
        status: "READY"
      });
    }

    return {
      execution,
      planning,
      steps
    };
  }

}
