import { Goal } from "@/contracts/goal";

const goals: Goal[] = [];

export function addGoal(goal: Goal): void {
  goals.push(goal);
}

export function getGoals(): readonly Goal[] {
  return goals;
}
