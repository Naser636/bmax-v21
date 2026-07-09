import { Simulation } from "@/contracts/simulation";

export function createSimulation(
  scenario: string,
  score: number
): Simulation {
  return {
    id: crypto.randomUUID(),
    scenario,
    score,
    selected: false,
    createdAt: Date.now(),
  };
}
