import { MissionLoader, RuntimeMission } from "./mission-loader";
import { MissionIntent } from "./mission-intent";

export interface ExecutionStep {
  id: string;
  name: string;
  status: "PENDING";
}

export interface ExecutionPlan {
  intent?: MissionIntent;
  mission: RuntimeMission;
  steps: ExecutionStep[];
  objectives: string[];
  nextObjective: string | null;
}

export class MissionOrchestrator {

  constructor(
    private readonly loader = new MissionLoader()
  ) {}

  buildPlan(id: string, name: string, intent?: MissionIntent): ExecutionPlan {

    const mission = this.loader.load(id, name);

    return {
      intent,
      mission,
      objectives: mission.brain.objectives,
      nextObjective: mission.brain.nextObjective,
      steps: [
        { id: "LOAD", name: "Load ProjectContext", status: "PENDING" },
        { id: "PLAN", name: "Build Execution Plan", status: "PENDING" },
        { id: "VERIFY", name: "Verify Governance", status: "PENDING" },
        { id: "EXECUTE", name: "Execute Mission", status: "PENDING" },
        { id: "REPORT", name: "Generate Report", status: "PENDING" }
      ]
    };
  }

}
