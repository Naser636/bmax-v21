import { initializeGoal } from "@/core/goal-service";
import { initializeMission } from "@/core/mission-service";
import { runDiscovery } from "@/core/discovery-runner";
import { runVerification } from "@/core/verification-runner";
import { runOpportunity } from "@/core/opportunity-runner";
import { runSimulation } from "@/core/simulation-runner";
import { runDecision } from "@/core/decision-runner";
import { runKnowledge } from "@/core/knowledge-runner";

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
const knowledge = runKnowledge(decision);

console.assert(knowledge.decisionId === decision.id);
console.assert(knowledge.result === decision.recommendation);

console.log("Knowledge Runner OK");
