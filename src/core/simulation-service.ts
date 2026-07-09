import { createSimulation } from "@/core/simulation-engine";
import { addSimulation } from "@/core/simulation-registry";

export function initializeSimulation(
  scenario: string,
  score: number
) {
  const simulation = createSimulation(scenario, score);
  addSimulation(simulation);
  return simulation;
}
