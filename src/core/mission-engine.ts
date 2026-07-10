import { Mission } from "@/contracts/mission";
import { Goal } from "@/contracts/goal";

export function createMission(
  goal: Goal,
  title: string,
  description: string
): Mission {
  return {
    id: crypto.randomUUID(),
    goalId: goal.id,
    title,
    description,
    createdAt: Date.now(),
  };
}
