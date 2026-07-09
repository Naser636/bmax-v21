import { getDefaultGoal } from "@/core/goal-engine";
import { addGoal } from "@/core/goal-registry";

export function initializeGoal() {
  const goal = getDefaultGoal();
  addGoal(goal);
  return goal;
}
