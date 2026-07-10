import { initializeGoal } from "@/core/goal-service";
import { initializeMission } from "@/core/mission-service";

export function runOrchestrator() {
  const goal = initializeGoal();

  const mission = initializeMission(
    goal,
    "Mission par défaut",
    "Mission créée par l'Orchestrator."
  );

  return { goal, mission };
}
