import { Simulation } from "@/contracts/simulation";

const simulations: Simulation[] = [];

export function addSimulation(simulation: Simulation): void {
  simulations.push(simulation);
}

export function getSimulations(): readonly Simulation[] {
  return simulations;
}
