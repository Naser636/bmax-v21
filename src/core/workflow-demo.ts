import { MissionContext } from "@/core/mission-context";
import { WorkflowEngine } from "@/core/workflow-engine";

export async function workflowDemo(): Promise<MissionContext> {
  const context: MissionContext = {
    missionId: crypto.randomUUID(),
    state: "CREATED",
    metrics: {},
    results: [],
    logs: [],
    errors: [],
  };

  const workflow = new WorkflowEngine();

  return workflow.execute(context);
}
