import { initializeGoal } from "@/core/goal-service";
import { initializeMission } from "@/core/mission-service";
import { runDiscovery } from "@/core/discovery-runner";
import { runVerification } from "@/core/verification-runner";
import { runOpportunity } from "@/core/opportunity-runner";
import { runSimulation } from "@/core/simulation-runner";
import { runDecision } from "@/core/decision-runner";
import { runAudit } from "@/core/audit-runner";

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

const result = runAudit(decision);

console.assert(result.audit.decisionId === decision.id);
console.assert(result.explanation.decisionId === decision.id);

console.log("Audit Runner OK");
