import { initializeGoal } from "@/core/goal-service";
import { initializeMission } from "@/core/mission-service";
import { runDiscovery } from "@/core/discovery-runner";
import { runVerification } from "@/core/verification-runner";
import { runOpportunity } from "@/core/opportunity-runner";
import { runSimulation } from "@/core/simulation-runner";

const goal = initializeGoal();

const mission = initializeMission(
  goal,
  "Trouver des appels d'offres",
  "Recherche B2B"
);

const connector = runDiscovery(mission);
const verification = runVerification(connector);
const opportunity = runOpportunity(verification);
const simulation = runSimulation(opportunity);

console.assert(simulation.scenario === opportunity.title);
console.assert(simulation.score === 0.90);

console.log("Simulation Runner OK");
