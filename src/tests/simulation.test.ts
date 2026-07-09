import { initializeSimulation } from "@/core/simulation-service";

const simulation = initializeSimulation(
  "Scénario A",
  95
);

console.assert(simulation.scenario === "Scénario A");
console.assert(simulation.score === 95);
console.assert(simulation.selected === false);

console.log("Simulation test OK");
