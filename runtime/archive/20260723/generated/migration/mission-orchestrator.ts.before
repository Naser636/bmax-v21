import { MissionLoader, RuntimeMission } from "./mission-loader";

export interface ExecutionStep {
  id: string;
  name: string;
  status: "PENDING";
}

export interface ExecutionPlan {
  mission: RuntimeMission;
  steps: ExecutionStep[];
}

export class MissionOrchestrator {
  constructor(
    private readonly loader = new MissionLoader()
  ) {}

  buildPlan(id: string, name: string): ExecutionPlan {
    const mission = this.loader.load(id, name);

    return {
      mission,
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
