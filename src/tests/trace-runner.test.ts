import { initializeGoal } from "@/core/goal-service";
import { initializeMission } from "@/core/mission-service";
import { runDiscovery } from "@/core/discovery-runner";
import { runVerification } from "@/core/verification-runner";
import { runOpportunity } from "@/core/opportunity-runner";
import { runSimulation } from "@/core/simulation-runner";
import { runDecision } from "@/core/decision-runner";
import { runAudit } from "@/core/audit-runner";
import { runTrace } from "@/core/trace-runner";

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

runAudit(decision);

const trace = runTrace();

console.assert(Array.isArray(trace.decisions));
console.assert(Array.isArray(trace.audits));

console.log("Trace Runner OK");
