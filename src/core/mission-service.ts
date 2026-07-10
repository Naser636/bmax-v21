import { Goal } from "@/contracts/goal";
import { createMission } from "@/core/mission-engine";
import { addMission } from "@/core/mission-registry";

export function initializeMission(
  goal: Goal,
  title: string,
  description: string
) {
  const mission = createMission(goal, title, description);
  addMission(mission);
  return mission;
}
