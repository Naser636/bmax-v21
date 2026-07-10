import { runOrchestrator } from "@/core/orchestrator-runner";

const result = runOrchestrator();

console.assert(result.goal.id.length > 0);
console.assert(result.mission.goalId === result.goal.id);

console.log("Orchestrator Runner OK");
