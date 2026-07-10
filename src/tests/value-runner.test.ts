import { initializeGoal } from "@/core/goal-service";
import { initializeMission } from "@/core/mission-service";
import { runDiscovery } from "@/core/discovery-runner";
import { runVerification } from "@/core/verification-runner";
import { runOpportunity } from "@/core/opportunity-runner";
import { runSimulation } from "@/core/simulation-runner";
import { runDecision } from "@/core/decision-runner";
import { runValue } from "@/core/value-runner";

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
const decision = runDecision(simulation);
const value = runValue(decision);

console.assert(value.decisionId === decision.id);
console.assert(value.score >= 0);

console.log("Value Runner OK");
